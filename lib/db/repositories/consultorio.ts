import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../client';
import {
  appointments,
  availabilitySlots,
  consultSessions,
  professionals,
  sessionNotes,
  sessionShares,
  sessionSummaries,
  sessionTasks,
  whiteboardStates,
  type AppointmentRow,
  type AvailabilitySlotRow,
  type ProfessionalRow,
  type SessionNoteRow,
  type SessionRow,
  type LicenseDoc,
  type SessionShareRow,
  type SessionSummaryRow,
  type SessionTaskRow,
} from '../schema/consultorio';
import { users } from '../schema/auth';
import { ownsResource } from './ownership';
import { safeAttachmentPath } from '../../attachments/path';
import {
  applyWhiteboardOp,
  type WhiteboardOp,
} from '../../consultorio/whiteboard';
import type { ShareableType } from '../../team/types';
import { MAX_LICENSE_DOCS } from '../../consultorio/types';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type TenantContext,
} from '../../tenant/guard';
import {
  addSignature,
  canStartRecording,
  withdrawSignature,
} from '../../consultorio/consent';
import {
  canOpenPractice,
  requiresLicense,
  type NoteVisibility,
  type SessionTaskStatus,
  type Specialty,
  type VerificationStatus,
  type WhiteboardState,
} from '../../consultorio/types';
import { parseMeetingLink } from '../../consultorio/meeting';

// --- Perfil profesional ------------------------------------------------------

export async function getMyProfessionalProfile(
  ctx: TenantContext,
): Promise<ProfessionalRow | null> {
  assertTenantContext(ctx, 'getMyProfessionalProfile');

  const [row] = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.tenantId, ctx.tenantId),
        eq(professionals.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export type ProfessionalProfileInput = {
  specialties: Specialty[];
  licenseNumber?: string | null;
  bio?: string | null;
  acceptTerms: boolean;
  termsVersion: string;
  /** Enlace de Google Meet donde atiende. Se valida antes de guardarlo. */
  defaultMeetingUrl?: string | null;
};

/**
 * Alta o actualización del perfil profesional.
 *
 * Dos comprobaciones que no son de formulario sino de fondo:
 *
 * 1. **Los términos son obligatorios.** El PRD pide que la responsabilidad
 *    profesional del prestador quede «implementada, no solo escrita»: sin
 *    `terms_accepted_at` no hay perfil.
 * 2. **La cédula se exige donde toca.** Las especialidades sanitarias la
 *    necesitan; el coaching o los grupos de apoyo, no. Pedirla a todo el mundo
 *    dejaría fuera a media plataforma; no pedirla nunca sería peor.
 *
 * Editar el perfil **devuelve la verificación a «pendiente»** si cambian las
 * especialidades o la cédula. Verificar a alguien como psicólogo y que después
 * se añada «psiquiatría» sin revisión sería exactamente el agujero que la
 * verificación existe para tapar.
 */
export async function upsertProfessionalProfile(
  ctx: TenantContext,
  input: ProfessionalProfileInput,
): Promise<ProfessionalRow> {
  assertTenantContext(ctx, 'upsertProfessionalProfile');

  if (input.specialties.length === 0) {
    throw new Error('Elige al menos una especialidad.');
  }

  if (!input.acceptTerms) {
    throw new Error(
      'Hace falta aceptar los términos: la responsabilidad profesional de la ' +
        'atención que prestes es tuya, no de CIAN.',
    );
  }

  const license = input.licenseNumber?.trim() || null;
  if (requiresLicense(input.specialties) && !license) {
    throw new Error(
      'Las especialidades sanitarias que elegiste requieren cédula profesional.',
    );
  }

  const existing = await getMyProfessionalProfile(ctx);

  const changedCredentials =
    existing !== null &&
    (existing.licenseNumber !== license ||
      existing.specialties.slice().sort().join(',') !==
        input.specialties.slice().sort().join(','));

  /*
   * El enlace se valida aquí y no solo en el formulario: un campo de URL libre
   * que después se pinta como enlace, dentro de una plataforma de salud, es una
   * vía de phishing.
   */
  let meetingUrl: string | null = null;
  if (input.defaultMeetingUrl?.trim()) {
    const verdict = parseMeetingLink(input.defaultMeetingUrl);
    if (!verdict.valid) throw new Error(verdict.reason);
    meetingUrl = verdict.link.url;
  }

  const values = {
    specialties: input.specialties,
    licenseNumber: license,
    defaultMeetingUrl: meetingUrl,
    bio: input.bio?.trim().slice(0, 2000) || null,
    termsAcceptedAt: new Date(),
    termsVersion: input.termsVersion,
    ...(changedCredentials
      ? { verificationStatus: 'pendiente' as const, verifiedAt: null }
      : {}),
  };

  const [row] = await db
    .insert(professionals)
    .values({ tenantId: ctx.tenantId, userId: ctx.userId, ...values })
    .onConflictDoUpdate({
      target: [professionals.tenantId, professionals.userId],
      set: values,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el perfil profesional.');
  return row;
}

/**
 * Añade un documento de cédula al perfil.
 *
 * La columna `license_docs` existía desde el principio y no había forma de
 * escribirla: se pedía el número de cédula y no se podía adjuntar nada que lo
 * respaldara, con lo que verificar significaba creerle a un campo de texto.
 *
 * El archivo va por `/api/adjuntos`, el mismo camino que todo lo demás: queda
 * en almacenamiento privado tras una ruta que comprueba el tenant. Un documento
 * de identidad profesional no puede acabar en una URL pública.
 *
 * **No devuelve la verificación a pendiente.** Adjuntar evidencia de lo que ya
 * se declaró no cambia lo declarado; lo que sí lo hace —cambiar el número o las
 * especialidades— ya está cubierto en `upsertProfessionalProfile`. Penalizar a
 * quien aporta más pruebas sería justo al revés.
 */
export async function addLicenseDoc(
  ctx: TenantContext,
  input: { filename: string; url: string },
): Promise<ProfessionalRow> {
  assertTenantContext(ctx, 'addLicenseDoc');

  const url = safeAttachmentPath(input.url);
  if (!url) throw new Error('Ese archivo no es válido.');

  const existing = await getMyProfessionalProfile(ctx);
  if (!existing) throw new Error('Primero guarda tu perfil profesional.');

  if (existing.licenseDocs.length >= MAX_LICENSE_DOCS) {
    throw new Error(
      `Puedes adjuntar hasta ${MAX_LICENSE_DOCS} documentos. Retira alguno primero.`,
    );
  }

  const docs: LicenseDoc[] = [
    ...existing.licenseDocs,
    {
      filename: input.filename.trim().slice(0, 200) || 'Documento',
      blobUrl: url,
      uploadedAt: new Date().toISOString(),
    },
  ];

  const [row] = await db
    .update(professionals)
    .set({ licenseDocs: docs })
    .where(
      and(
        eq(professionals.tenantId, ctx.tenantId),
        eq(professionals.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se pudo adjuntar el documento.');
  return row;
}

/**
 * Retira un documento del propio perfil.
 *
 * Esto **sí** devuelve la verificación a pendiente si estaba verificado: quitar
 * la evidencia sobre la que alguien verificó deja esa verificación sin sostén.
 */
export async function removeLicenseDoc(
  ctx: TenantContext,
  blobUrl: string,
): Promise<ProfessionalRow> {
  assertTenantContext(ctx, 'removeLicenseDoc');

  const existing = await getMyProfessionalProfile(ctx);
  if (!existing) throw new Error('No encontramos tu perfil profesional.');

  const docs = existing.licenseDocs.filter((doc) => doc.blobUrl !== blobUrl);
  if (docs.length === existing.licenseDocs.length) return existing;

  const [row] = await db
    .update(professionals)
    .set({
      licenseDocs: docs,
      ...(existing.verificationStatus === 'verificado'
        ? { verificationStatus: 'pendiente' as const, verifiedAt: null }
        : {}),
    })
    .where(
      and(
        eq(professionals.tenantId, ctx.tenantId),
        eq(professionals.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se pudo retirar el documento.');
  return row;
}

/**
 * Cambia el estado de verificación. Solo `admin` u `owner` del tenant.
 *
 * Aquí no hay atajo posible: verificar es un acto humano de comprobar una
 * cédula contra un registro público, y lo único que el código puede garantizar
 * es que solo alguien con permiso lo declare y que quede constancia.
 */
export async function setVerificationStatus(
  ctx: TenantContext,
  professionalId: string,
  status: VerificationStatus,
): Promise<ProfessionalRow | null> {
  assertRoleAtLeast(ctx, 'admin', 'setVerificationStatus');

  const [existing] = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!existing) return null;

  // Sin términos aceptados no se verifica a nadie, aunque sea admin.
  if (status === 'verificado' && !existing.termsAcceptedAt) {
    throw new Error(
      'No se puede verificar a alguien que no ha aceptado los términos.',
    );
  }

  const [row] = await db
    .update(professionals)
    .set({
      verificationStatus: status,
      verifiedAt: status === 'verificado' ? new Date() : null,
    })
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  return row ?? null;
}

export async function listProfessionals(
  ctx: TenantContext,
  onlyVerified = true,
): Promise<Array<ProfessionalRow & { name: string | null; email: string | null }>> {
  assertTenantContext(ctx, 'listProfessionals');

  const rows = await db
    .select({ professional: professionals, name: users.name, email: users.email })
    .from(professionals)
    .innerJoin(users, eq(users.id, professionals.userId))
    .where(
      and(
        eq(professionals.tenantId, ctx.tenantId),
        ...(onlyVerified
          ? [eq(professionals.verificationStatus, 'verificado')]
          : []),
      ),
    )
    .orderBy(professionals.createdAt);

  return rows.map((row) => ({
    ...row.professional,
    name: row.name,
    email: row.email,
  }));
}

// --- Disponibilidad ----------------------------------------------------------

export async function listAvailability(
  ctx: TenantContext,
  professionalId: string,
): Promise<AvailabilitySlotRow[]> {
  assertTenantContext(ctx, 'listAvailability');

  return db
    .select()
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.tenantId, ctx.tenantId),
        eq(availabilitySlots.professionalId, professionalId),
      ),
    )
    .orderBy(asc(availabilitySlots.weekday), asc(availabilitySlots.startTime));
}

export async function addAvailability(
  ctx: TenantContext,
  input: {
    professionalId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    timezone: string;
  },
): Promise<AvailabilitySlotRow> {
  assertTenantContext(ctx, 'addAvailability');

  const [row] = await db
    .insert(availabilitySlots)
    .values({
      tenantId: ctx.tenantId,
      professionalId: input.professionalId,
      weekday: Math.min(6, Math.max(0, Math.round(input.weekday))),
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar la disponibilidad.');
  return row;
}

export async function deleteAvailability(
  ctx: TenantContext,
  slotId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteAvailability');

  await db
    .delete(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.id, slotId),
        eq(availabilitySlots.tenantId, ctx.tenantId),
      ),
    );
}

// --- Citas -------------------------------------------------------------------

/** Citas que ocupan hueco en la agenda de un profesional. */
export async function busyIntervals(
  ctx: TenantContext,
  professionalId: string,
  from: Date,
  to: Date,
): Promise<Array<{ start: Date; end: Date }>> {
  assertTenantContext(ctx, 'busyIntervals');

  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        // Una cita cancelada libera el hueco.
        inArray(appointments.status, ['solicitada', 'confirmada']),
        gte(appointments.scheduledAt, from),
        lte(appointments.scheduledAt, to),
      ),
    );

  return rows.map((row) => ({
    start: row.scheduledAt,
    end: new Date(row.scheduledAt.getTime() + row.durationMinutes * 60_000),
  }));
}

/**
 * Reserva una cita.
 *
 * Criterio del PRD: «un profesional no verificado no puede abrir consultorio
 * **ni recibir citas**». La comprobación está aquí, en el camino por el que
 * pasa toda reserva, y no en la pantalla que lista profesionales.
 */
export async function requestAppointment(
  ctx: TenantContext,
  input: {
    professionalId: string;
    scheduledAt: Date;
    durationMinutes: number;
    reason?: string | null;
  },
): Promise<AppointmentRow> {
  assertTenantContext(ctx, 'requestAppointment');

  const [professional] = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.id, input.professionalId),
        eq(professionals.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!professional) throw new Error('No encontramos a ese profesional.');

  if (!canOpenPractice(professional.verificationStatus)) {
    throw new Error(
      'Ese profesional todavía no está verificado, así que no puede recibir citas.',
    );
  }

  if (input.scheduledAt.getTime() <= Date.now()) {
    throw new Error('Esa hora ya pasó.');
  }

  const duration = Math.min(240, Math.max(15, input.durationMinutes));

  // Se vuelve a comprobar el hueco al reservar: entre que se pintó la agenda y
  // se pulsó el botón, alguien pudo tomar esa hora.
  const busy = await busyIntervals(
    ctx,
    input.professionalId,
    new Date(input.scheduledAt.getTime() - 4 * 3_600_000),
    new Date(input.scheduledAt.getTime() + 4 * 3_600_000),
  );

  const end = new Date(input.scheduledAt.getTime() + duration * 60_000);
  const collides = busy.some(
    (interval) => input.scheduledAt < interval.end && interval.start < end,
  );

  if (collides) {
    throw new Error('Alguien tomó esa hora hace un momento. Elige otra.');
  }

  const id = crypto.randomUUID();

  const [row] = await db
    .insert(appointments)
    .values({
      id,
      tenantId: ctx.tenantId,
      professionalId: input.professionalId,
      clientUserId: ctx.userId,
      scheduledAt: input.scheduledAt,
      durationMinutes: duration,
      // Referencia interna de la sesión, derivada por el servidor.
      roomId: `cian-${ctx.tenantId}-${id}`,
      reason: input.reason?.trim().slice(0, 1000) || null,
    })
    .returning();

  if (!row) throw new Error('No se pudo reservar la cita.');
  return row;
}

/**
 * Una cita, si esta persona es parte de ella.
 *
 * El filtro por tenant **y** por participación es lo que sostiene el criterio
 * «un profesional del tenant A no puede ver pacientes del tenant B»: no hay
 * ninguna lectura de cita que no pase por aquí.
 */
export async function getAppointmentForParticipant(
  ctx: TenantContext,
  appointmentId: string,
): Promise<{ appointment: AppointmentRow; role: 'profesional' | 'usuario' } | null> {
  assertTenantContext(ctx, 'getAppointmentForParticipant');

  const [row] = await db
    .select({ appointment: appointments, professionalUserId: professionals.userId })
    .from(appointments)
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.tenantId, ctx.tenantId),
        or(
          eq(appointments.clientUserId, ctx.userId),
          eq(professionals.userId, ctx.userId),
        ),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    appointment: row.appointment,
    role: row.professionalUserId === ctx.userId ? 'profesional' : 'usuario',
  };
}

export async function listMyAppointments(
  ctx: TenantContext,
  limit = 50,
): Promise<
  Array<{
    appointment: AppointmentRow;
    role: 'profesional' | 'usuario';
    otherName: string | null;
  }>
> {
  assertTenantContext(ctx, 'listMyAppointments');

  const rows = await db
    .select({
      appointment: appointments,
      professionalUserId: professionals.userId,
      professionalName: users.name,
    })
    .from(appointments)
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(users, eq(users.id, professionals.userId))
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        or(
          eq(appointments.clientUserId, ctx.userId),
          eq(professionals.userId, ctx.userId),
        ),
      ),
    )
    .orderBy(desc(appointments.scheduledAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => ({
    appointment: row.appointment,
    role:
      row.professionalUserId === ctx.userId
        ? ('profesional' as const)
        : ('usuario' as const),
    otherName: row.professionalName,
  }));
}

export async function setAppointmentStatus(
  ctx: TenantContext,
  appointmentId: string,
  status: AppointmentRow['status'],
): Promise<AppointmentRow | null> {
  assertTenantContext(ctx, 'setAppointmentStatus');

  const found = await getAppointmentForParticipant(ctx, appointmentId);
  if (!found) return null;

  // Confirmar es del profesional; cancelar puede cualquiera de los dos.
  if (status === 'confirmada' && found.role !== 'profesional') {
    throw new Error('Solo el profesional confirma una cita.');
  }

  const [row] = await db
    .update(appointments)
    .set({ status })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  return row ?? null;
}

// --- Sesión ------------------------------------------------------------------

export async function ensureSession(
  ctx: TenantContext,
  appointmentId: string,
): Promise<SessionRow> {
  assertTenantContext(ctx, 'ensureSession');

  const found = await getAppointmentForParticipant(ctx, appointmentId);
  if (!found) throw new Error('No encontramos esa cita.');

  const [existing] = await db
    .select()
    .from(consultSessions)
    .where(
      and(
        eq(consultSessions.appointmentId, appointmentId),
        eq(consultSessions.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const [row] = await db
    .insert(consultSessions)
    .values({ tenantId: ctx.tenantId, appointmentId })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  const [again] = await db
    .select()
    .from(consultSessions)
    .where(
      and(
        eq(consultSessions.appointmentId, appointmentId),
        eq(consultSessions.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!again) throw new Error('No se pudo abrir la sesión.');
  return again;
}

export async function getSessionForParticipant(
  ctx: TenantContext,
  sessionId: string,
): Promise<{ session: SessionRow; role: 'profesional' | 'usuario' } | null> {
  assertTenantContext(ctx, 'getSessionForParticipant');

  const [row] = await db
    .select({ session: consultSessions, appointmentId: consultSessions.appointmentId })
    .from(consultSessions)
    .where(
      and(
        eq(consultSessions.id, sessionId),
        eq(consultSessions.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const found = await getAppointmentForParticipant(ctx, row.appointmentId);
  if (!found) return null;

  return { session: row.session, role: found.role };
}

export async function endSession(
  ctx: TenantContext,
  sessionId: string,
): Promise<void> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return;

  await db
    .update(consultSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(consultSessions.id, sessionId),
        eq(consultSessions.tenantId, ctx.tenantId),
      ),
    );
}

/**
 * Firma o retira el consentimiento de grabación.
 *
 * El sello de tiempo lo pone el servidor. Una marca que envíe el navegador no
 * prueba nada, porque el reloj del cliente lo controla el cliente.
 */
export async function setRecordingConsent(
  ctx: TenantContext,
  sessionId: string,
  consented: boolean,
): Promise<SessionRow | null> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return null;

  const next = consented
    ? addSignature(found.session.recordingConsent, {
        userId: ctx.userId,
        role: found.role,
        at: new Date().toISOString(),
      })
    : withdrawSignature(found.session.recordingConsent, found.role);

  const [row] = await db
    .update(consultSessions)
    .set({ recordingConsent: next })
    .where(
      and(
        eq(consultSessions.id, sessionId),
        eq(consultSessions.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  return row ?? null;
}

/** Si la sesión puede grabarse ahora mismo, según lo guardado. */
export async function recordingAllowed(
  ctx: TenantContext,
  sessionId: string,
): Promise<boolean> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return false;

  return canStartRecording(found.session.recordingConsent).allowed;
}

// --- Notas -------------------------------------------------------------------

export async function addSessionNote(
  ctx: TenantContext,
  input: { sessionId: string; visibility: NoteVisibility; content: string },
): Promise<SessionNoteRow> {
  const found = await getSessionForParticipant(ctx, input.sessionId);
  if (!found) throw new Error('No encontramos esa sesión.');

  const content = input.content.trim().slice(0, 20_000);
  if (content.length === 0) throw new Error('La nota está vacía.');

  // Solo el profesional escribe notas privadas: una nota «privada» de la
  // persona atendida no tendría a quién ocultarse y confundiría el modelo.
  const visibility: NoteVisibility =
    found.role === 'profesional' ? input.visibility : 'compartida';

  const [row] = await db
    .insert(sessionNotes)
    .values({
      tenantId: ctx.tenantId,
      sessionId: input.sessionId,
      authorUserId: ctx.userId,
      visibility,
      content,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar la nota.');
  return row;
}

/**
 * Las notas que esta persona puede ver. **Esta es la función del criterio.**
 *
 * > Las notas privadas del profesional **jamás** aparecen en ninguna respuesta
 * > de API accesible al usuario — verificado con prueba explícita.
 *
 * El filtro por visibilidad va **en el `where`**, no después. La diferencia no
 * es de estilo: filtrar al pintar deja los datos viajando hasta el navegador,
 * donde cualquiera los ve en la respuesta de red aunque la pantalla no los
 * dibuje. Esa es exactamente la forma en que este criterio se incumple sin que
 * nadie lo note.
 *
 * `tests/consultorio-notas.test.ts` comprueba que la condición está en la
 * consulta compilada.
 */
export function sessionNotesQuery(
  ctx: TenantContext,
  sessionId: string,
  role: 'profesional' | 'usuario',
) {
  assertTenantContext(ctx, 'sessionNotesQuery');

  return db
    .select()
    .from(sessionNotes)
    .where(
      and(
        eq(sessionNotes.tenantId, ctx.tenantId),
        eq(sessionNotes.sessionId, sessionId),
        // El profesional ve todo lo suyo; la persona atendida, solo lo
        // compartido. Nunca hay un camino que devuelva `privada` a un usuario.
        role === 'profesional'
          ? undefined
          : eq(sessionNotes.visibility, 'compartida'),
      ),
    )
    .orderBy(asc(sessionNotes.createdAt));
}

export async function listSessionNotes(
  ctx: TenantContext,
  sessionId: string,
): Promise<SessionNoteRow[]> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return [];

  return sessionNotesQuery(ctx, sessionId, found.role);
}

export async function deleteSessionNote(
  ctx: TenantContext,
  noteId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteSessionNote');

  // Cada quien borra lo suyo.
  await db
    .delete(sessionNotes)
    .where(
      and(
        eq(sessionNotes.id, noteId),
        eq(sessionNotes.tenantId, ctx.tenantId),
        eq(sessionNotes.authorUserId, ctx.userId),
      ),
    );
}

// --- Resumen -----------------------------------------------------------------

export async function saveSessionSummary(
  ctx: TenantContext,
  sessionId: string,
  content: string,
): Promise<SessionSummaryRow> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) throw new Error('No encontramos esa sesión.');

  if (found.role !== 'profesional') {
    throw new Error('El resumen lo genera y aprueba el profesional.');
  }

  const values = {
    content: content.trim().slice(0, 20_000),
    // Guardar un resumen nuevo lo deja SIN publicar, siempre. Regenerarlo no
    // puede heredar una aprobación que era para otro texto.
    published: false,
    approvedBy: null,
    approvedAt: null,
  };

  const [row] = await db
    .insert(sessionSummaries)
    .values({ tenantId: ctx.tenantId, sessionId, ...values })
    .onConflictDoUpdate({ target: sessionSummaries.sessionId, set: values })
    .returning();

  if (!row) throw new Error('No se pudo guardar el resumen.');
  return row;
}

/**
 * Publica el resumen. Criterio: «no se publica sin aprobación del profesional».
 *
 * Solo el profesional de esa sesión puede llamar a esto con efecto, y queda
 * quién aprobó y cuándo.
 */
export async function publishSessionSummary(
  ctx: TenantContext,
  sessionId: string,
): Promise<SessionSummaryRow | null> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found || found.role !== 'profesional') return null;

  const [row] = await db
    .update(sessionSummaries)
    .set({ published: true, approvedBy: ctx.userId, approvedAt: new Date() })
    .where(
      and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  return row ?? null;
}

/** El resumen que esta persona puede ver. Sin publicar, la persona no lo ve. */
export async function getSessionSummary(
  ctx: TenantContext,
  sessionId: string,
): Promise<SessionSummaryRow | null> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return null;

  const [row] = await db
    .select()
    .from(sessionSummaries)
    .where(
      and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.tenantId, ctx.tenantId),
        // Misma regla que con las notas: el filtro va en la consulta.
        found.role === 'profesional'
          ? undefined
          : eq(sessionSummaries.published, true),
      ),
    )
    .limit(1);

  return row ?? null;
}

// --- Tareas ------------------------------------------------------------------

export async function assignSessionTask(
  ctx: TenantContext,
  input: {
    sessionId: string;
    assignedToUserId: string;
    title: string;
    description?: string | null;
    dueAt?: Date | null;
  },
): Promise<SessionTaskRow> {
  const found = await getSessionForParticipant(ctx, input.sessionId);
  if (!found) throw new Error('No encontramos esa sesión.');
  if (found.role !== 'profesional') {
    throw new Error('Las tareas de sesión las asigna el profesional.');
  }

  const title = input.title.trim().slice(0, 300);
  if (title.length === 0) throw new Error('La tarea necesita un título.');

  const [row] = await db
    .insert(sessionTasks)
    .values({
      tenantId: ctx.tenantId,
      sessionId: input.sessionId,
      assignedToUserId: input.assignedToUserId,
      title,
      description: input.description?.trim().slice(0, 2000) || null,
      dueAt: input.dueAt ?? null,
    })
    .returning();

  if (!row) throw new Error('No se pudo asignar la tarea.');
  return row;
}

export async function listSessionTasks(
  ctx: TenantContext,
  sessionId: string,
): Promise<SessionTaskRow[]> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return [];

  return db
    .select()
    .from(sessionTasks)
    .where(
      and(
        eq(sessionTasks.tenantId, ctx.tenantId),
        eq(sessionTasks.sessionId, sessionId),
      ),
    )
    .orderBy(asc(sessionTasks.createdAt));
}

export async function setSessionTaskStatus(
  ctx: TenantContext,
  taskId: string,
  status: SessionTaskStatus,
): Promise<void> {
  assertTenantContext(ctx, 'setSessionTaskStatus');

  // La marca como hecha quien la tiene asignada.
  await db
    .update(sessionTasks)
    .set({ status })
    .where(
      and(
        eq(sessionTasks.id, taskId),
        eq(sessionTasks.tenantId, ctx.tenantId),
        eq(sessionTasks.assignedToUserId, ctx.userId),
      ),
    );
}

// --- Pizarra -----------------------------------------------------------------

/**
 * Aplica una operación de pizarra y devuelve el estado resultante.
 *
 * Antes esto recibía la pizarra entera y la reemplazaba, y con dos personas
 * dibujando el último en soltar el lápiz borraba lo del otro. Ahora recibe qué
 * hacer —añadir un trazo, o borrar todo— y lo aplica sobre lo que hay en la
 * base en ese momento.
 *
 * La lectura y la escritura van en una transacción: entre leer el estado y
 * escribirlo, la otra parte puede haber dibujado.
 */
export async function applyWhiteboard(
  ctx: TenantContext,
  sessionId: string,
  op: WhiteboardOp,
): Promise<{ state: WhiteboardState; revision: number }> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) throw new Error('No encontramos esa sesión.');

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(whiteboardStates)
      .where(
        and(
          eq(whiteboardStates.sessionId, sessionId),
          eq(whiteboardStates.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    const state = applyWhiteboardOp(current?.state ?? { strokes: [] }, op);
    const revision = (current?.revision ?? 0) + 1;

    await tx
      .insert(whiteboardStates)
      .values({ tenantId: ctx.tenantId, sessionId, state, revision })
      .onConflictDoUpdate({
        target: whiteboardStates.sessionId,
        set: { state, revision, updatedAt: new Date() },
      });

    return { state, revision };
  });
}

/** La pizarra con su revisión, para que quien sondea sepa si cambió. */
export async function readWhiteboard(
  ctx: TenantContext,
  sessionId: string,
): Promise<{ state: WhiteboardState; revision: number }> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return { state: { strokes: [] }, revision: 0 };

  const [row] = await db
    .select()
    .from(whiteboardStates)
    .where(
      and(
        eq(whiteboardStates.sessionId, sessionId),
        eq(whiteboardStates.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  return { state: row?.state ?? { strokes: [] }, revision: row?.revision ?? 0 };
}

export async function meetingUrlForAppointment(
  tenantId: string,
  appointmentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      own: appointments.meetingUrl,
      fallback: professionals.defaultMeetingUrl,
    })
    .from(appointments)
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(
      and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)),
    )
    .limit(1);

  return row?.own ?? row?.fallback ?? null;
}

/** El profesional puede fijar un enlace distinto para una cita concreta. */
export async function setAppointmentMeetingUrl(
  ctx: TenantContext,
  appointmentId: string,
  rawUrl: string,
): Promise<void> {
  const found = await getAppointmentForParticipant(ctx, appointmentId);
  if (!found) throw new Error('No encontramos esa cita.');
  if (found.role !== 'profesional') {
    throw new Error('El enlace de la videollamada lo pone el profesional.');
  }

  const verdict = parseMeetingLink(rawUrl);
  if (!verdict.valid) throw new Error(verdict.reason);

  await db
    .update(appointments)
    .set({ meetingUrl: verdict.link.url })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.tenantId, ctx.tenantId),
      ),
    );
}

// --- Compartir en sesión -----------------------------------------------------

/**
 * Enseña un recurso propio a la otra parte, dentro de esta sesión.
 *
 * Dos comprobaciones, y ninguna sobra:
 *
 * 1. Quien comparte tiene que ser participante de la sesión. Lo garantiza
 *    `getSessionForParticipant`, que ya resuelve el rol.
 * 2. El recurso tiene que ser **suyo**. Sin esto, un miembro del espacio podría
 *    enseñar el plan de otro en su propia consulta.
 */
export async function shareInSession(
  ctx: TenantContext,
  sessionId: string,
  input: {
    resourceType: ShareableType;
    resourceId: string;
    resourceTitle: string;
  },
): Promise<SessionShareRow> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) throw new Error('No encontramos esa sesión.');

  if (!(await ownsResource(ctx, input.resourceType, input.resourceId))) {
    throw new Error('Solo puedes compartir lo que es tuyo.');
  }

  const values = {
    sharedByUserId: ctx.userId,
    resourceTitle: input.resourceTitle.trim().slice(0, 300) || 'Sin título',
    // Volver a compartir algo retirado lo reactiva, en vez de dejar una fila
    // muerta que impide compartirlo otra vez.
    revokedAt: null,
  };

  const [row] = await db
    .insert(sessionShares)
    .values({
      tenantId: ctx.tenantId,
      sessionId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        sessionShares.sessionId,
        sessionShares.resourceType,
        sessionShares.resourceId,
      ],
      set: values,
    })
    .returning();

  if (!row) throw new Error('No se pudo compartir.');
  return row;
}

/** Lo compartido y vivo en esta sesión. Lo ven las dos partes. */
export async function listSessionShares(
  ctx: TenantContext,
  sessionId: string,
): Promise<SessionShareRow[]> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return [];

  return db
    .select()
    .from(sessionShares)
    .where(
      and(
        eq(sessionShares.tenantId, ctx.tenantId),
        eq(sessionShares.sessionId, sessionId),
        isNull(sessionShares.revokedAt),
      ),
    )
    .orderBy(asc(sessionShares.createdAt));
}

/**
 * Deja de enseñarlo. Solo quien lo compartió.
 *
 * No se borra la fila: queda `revoked_at`, para poder responder qué se enseñó
 * en una consulta y cuándo se retiró. Un registro clínico que se puede borrar
 * sin rastro no sirve para responder nada.
 */
export async function revokeSessionShare(
  ctx: TenantContext,
  shareId: string,
): Promise<void> {
  assertTenantContext(ctx, 'revokeSessionShare');

  await db
    .update(sessionShares)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessionShares.id, shareId),
        eq(sessionShares.tenantId, ctx.tenantId),
        eq(sessionShares.sharedByUserId, ctx.userId),
      ),
    );
}
