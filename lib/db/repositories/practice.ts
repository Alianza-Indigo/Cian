/**
 * El espacio de trabajo de quien atiende. Consultorio, lado profesional.
 *
 * ## La regla que gobierna todo este archivo
 *
 * **Un profesional ve de una persona únicamente lo que pasó por las sesiones
 * entre los dos.** Nada más.
 *
 * No sus planes, ni sus rutinas, ni su bitácora sensorial, ni su bitácora de
 * crisis, ni sus conversaciones con CIAN. Todo eso es de ella. Lo que el
 * profesional ve es: las citas que compartieron, las notas de esas sesiones
 * —las suyas propias, y las que se marcaron como compartidas—, los acuerdos que
 * salieron de ahí y los resúmenes que él mismo redactó.
 *
 * Si alguna vez hace falta que vea algo más, el camino es que la persona lo
 * **comparta** —existe `session_shares` para eso— y no que una consulta de aquí
 * se estire. Una consulta que se estira no deja rastro de la decisión; un
 * recurso compartido sí, con quién lo compartió y cuándo.
 *
 * ## Y la otra
 *
 * Todo se acota además por `tenantId`, como el resto del sistema. Un
 * profesional del espacio A no alcanza a nadie del espacio B por ninguna de
 * estas funciones, y ninguna acepta un identificador de profesional desde
 * fuera: siempre se resuelve el propio a partir de `ctx.userId`.
 */
import { and, asc, count, desc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { db } from '../client';
import {
  appointments,
  consultSessions,
  professionals,
  sessionNotes,
  sessionSummaries,
  sessionTasks,
  type AppointmentRow,
} from '../schema/consultorio';
import { users } from '../schema/auth';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

/**
 * El perfil profesional de quien llama, o `null`.
 *
 * Nunca se recibe un `professionalId` por parámetro en este módulo: se resuelve
 * el propio. Aceptarlo de fuera sería dejar que alguien pidiera la agenda de
 * otro escribiendo su identificador.
 */
async function myProfessionalId(ctx: TenantContext): Promise<string | null> {
  const [row] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.tenantId, ctx.tenantId),
        eq(professionals.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row?.id ?? null;
}

// --- Agenda ------------------------------------------------------------------

export type AgendaEntry = {
  appointment: AppointmentRow;
  clientUserId: string;
  clientName: string | null;
  /** `null` mientras la sesión no se haya abierto nunca. */
  sessionId: string | null;
};

/**
 * Las citas de quien atiende en una ventana de tiempo.
 *
 * Incluye las canceladas a propósito: una cita que se cayó es información para
 * quien organiza su día, y esconderla hace que la agenda mienta por omisión.
 * Quien la pinta decide cómo enseñarla.
 */
export async function myAgenda(
  ctx: TenantContext,
  from: Date,
  to: Date,
): Promise<AgendaEntry[]> {
  assertTenantContext(ctx, 'myAgenda');

  const professionalId = await myProfessionalId(ctx);
  if (!professionalId) return [];

  const rows = await db
    .select({
      appointment: appointments,
      clientName: users.name,
      sessionId: consultSessions.id,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clientUserId))
    .leftJoin(
      consultSessions,
      eq(consultSessions.appointmentId, appointments.id),
    )
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        gte(appointments.scheduledAt, from),
        lte(appointments.scheduledAt, to),
      ),
    )
    .orderBy(asc(appointments.scheduledAt));

  return rows.map((row) => ({
    appointment: row.appointment,
    clientUserId: row.appointment.clientUserId,
    clientName: row.clientName,
    sessionId: row.sessionId,
  }));
}

// --- Personas a las que acompaña ---------------------------------------------

export type ClientSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  sessions: number;
  lastAt: Date | null;
  nextAt: Date | null;
  /** Acuerdos que esa persona todavía no ha marcado como hechos. */
  openTasks: number;
};

/**
 * A quién acompaña esta persona.
 *
 * Sale de las citas, no de una tabla aparte: alguien es tu paciente porque le
 * atendiste, y mantener una lista sincronizada con ese hecho sería una segunda
 * verdad que se puede desincronizar de la primera.
 *
 * Cuenta solo las citas que llegaron a existir de verdad —confirmadas o
 * terminadas—. Una solicitud que se canceló antes de ocurrir no convierte a
 * nadie en paciente.
 */
export async function myClients(ctx: TenantContext): Promise<ClientSummary[]> {
  assertTenantContext(ctx, 'myClients');

  const professionalId = await myProfessionalId(ctx);
  if (!professionalId) return [];

  const REALES = ['confirmada', 'completada', 'no_asistio'] as const;

  const rows = await db
    .select({
      userId: appointments.clientUserId,
      name: users.name,
      email: users.email,
      scheduledAt: appointments.scheduledAt,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clientUserId))
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        inArray(appointments.status, REALES),
      ),
    )
    .orderBy(desc(appointments.scheduledAt));

  if (rows.length === 0) return [];

  const ahora = Date.now();
  const porPersona = new Map<string, ClientSummary>();

  for (const row of rows) {
    const actual = porPersona.get(row.userId) ?? {
      userId: row.userId,
      name: row.name,
      email: row.email,
      sessions: 0,
      lastAt: null,
      nextAt: null,
      openTasks: 0,
    };

    actual.sessions += 1;

    if (row.scheduledAt.getTime() <= ahora) {
      if (!actual.lastAt || row.scheduledAt > actual.lastAt) {
        actual.lastAt = row.scheduledAt;
      }
    } else if (!actual.nextAt || row.scheduledAt < actual.nextAt) {
      // La próxima es la más cercana, no la más lejana.
      actual.nextAt = row.scheduledAt;
    }

    porPersona.set(row.userId, actual);
  }

  /*
   * Los acuerdos pendientes, contados en una sola consulta.
   *
   * Se cuentan **los que este profesional asignó en sus propias sesiones**, no
   * todas las tareas de la persona: las suyas propias no son asunto de nadie
   * más.
   */
  const pendientes = await db
    .select({
      userId: sessionTasks.assignedToUserId,
      total: count(),
    })
    .from(sessionTasks)
    .innerJoin(consultSessions, eq(consultSessions.id, sessionTasks.sessionId))
    .innerJoin(appointments, eq(appointments.id, consultSessions.appointmentId))
    .where(
      and(
        eq(sessionTasks.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        eq(sessionTasks.status, 'pendiente'),
      ),
    )
    .groupBy(sessionTasks.assignedToUserId);

  for (const fila of pendientes) {
    const persona = porPersona.get(fila.userId);
    if (persona) persona.openTasks = fila.total;
  }

  return [...porPersona.values()].sort((a, b) => {
    // Primero quien tiene cita próxima; después, por lo más reciente.
    if (a.nextAt && b.nextAt) return a.nextAt.getTime() - b.nextAt.getTime();
    if (a.nextAt) return -1;
    if (b.nextAt) return 1;
    return (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0);
  });
}

// --- Recorrido de una persona ------------------------------------------------

export type DossierSession = {
  appointmentId: string;
  sessionId: string | null;
  scheduledAt: Date;
  status: AppointmentRow['status'];
  reason: string | null;
  /** Las notas de esa sesión que este profesional puede ver. */
  notes: Array<{ id: string; visibility: string; content: string; mine: boolean }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  /** El resumen, si lo hay, con si llegó a publicarse. */
  summary: { content: string; published: boolean } | null;
};

export type ClientDossier = {
  userId: string;
  name: string | null;
  email: string | null;
  sessions: DossierSession[];
};

/**
 * El recorrido de una persona con **este** profesional.
 *
 * Es lo que faltaba para que esto fuera un consultorio y no una lista de citas:
 * poder abrir a alguien y ver qué se trabajó, qué se acordó y qué quedó
 * pendiente, sin ir cita por cita.
 *
 * Lo que entra está acotado por construcción: solo sesiones cuyas citas son de
 * este profesional. No hay parámetro que permita pedir las de otro.
 */
export async function clientDossier(
  ctx: TenantContext,
  clientUserId: string,
): Promise<ClientDossier | null> {
  assertTenantContext(ctx, 'clientDossier');

  const professionalId = await myProfessionalId(ctx);
  if (!professionalId) return null;

  const [persona] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, clientUserId))
    .limit(1);

  if (!persona) return null;

  const citas = await db
    .select({ appointment: appointments, sessionId: consultSessions.id })
    .from(appointments)
    .leftJoin(
      consultSessions,
      eq(consultSessions.appointmentId, appointments.id),
    )
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        eq(appointments.clientUserId, clientUserId),
      ),
    )
    .orderBy(desc(appointments.scheduledAt));

  // Sin ninguna cita en común, esta persona no es paciente suya y no hay
  // expediente que enseñar. Devolver `null` y no una ficha vacía: una ficha
  // vacía confirmaría que la persona existe.
  if (citas.length === 0) return null;

  const sessionIds = citas
    .map((cita) => cita.sessionId)
    .filter((id): id is string => id !== null);

  const [notas, tareas, resumenes] =
    sessionIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select()
            .from(sessionNotes)
            .where(
              and(
                eq(sessionNotes.tenantId, ctx.tenantId),
                inArray(sessionNotes.sessionId, sessionIds),
                /*
                 * Las propias, y las compartidas de quien sea. Una nota privada
                 * de OTRO profesional que hubiera atendido la misma sesión no
                 * se ve: privada quiere decir privada, no «privada para el
                 * paciente».
                 */
                or(
                  eq(sessionNotes.authorUserId, ctx.userId),
                  eq(sessionNotes.visibility, 'compartida'),
                ),
              ),
            )
            .orderBy(asc(sessionNotes.createdAt)),
          db
            .select()
            .from(sessionTasks)
            .where(
              and(
                eq(sessionTasks.tenantId, ctx.tenantId),
                inArray(sessionTasks.sessionId, sessionIds),
              ),
            )
            .orderBy(asc(sessionTasks.createdAt)),
          db
            .select()
            .from(sessionSummaries)
            .where(
              and(
                eq(sessionSummaries.tenantId, ctx.tenantId),
                inArray(sessionSummaries.sessionId, sessionIds),
              ),
            ),
        ]);

  return {
    userId: persona.id,
    name: persona.name,
    email: persona.email,
    sessions: citas.map((cita) => {
      const id = cita.sessionId;

      return {
        appointmentId: cita.appointment.id,
        sessionId: id,
        scheduledAt: cita.appointment.scheduledAt,
        status: cita.appointment.status,
        reason: cita.appointment.reason,
        notes: notas
          .filter((nota) => nota.sessionId === id)
          .map((nota) => ({
            id: nota.id,
            visibility: nota.visibility,
            content: nota.content,
            mine: nota.authorUserId === ctx.userId,
          })),
        tasks: tareas
          .filter((tarea) => tarea.sessionId === id)
          .map((tarea) => ({
            id: tarea.id,
            title: tarea.title,
            status: tarea.status,
          })),
        summary: (() => {
          const resumen = resumenes.find((fila) => fila.sessionId === id);
          return resumen
            ? { content: resumen.content, published: resumen.published }
            : null;
        })(),
      };
    }),
  };
}

// --- Proponer una cita -------------------------------------------------------

/**
 * El profesional propone una cita a alguien a quien ya atiende.
 *
 * **Solo a quien ya atiende**, y es deliberado: sin ese límite, cualquiera con
 * perfil profesional podría meter citas en la agenda de cualquier miembro del
 * espacio. La primera cita la sigue pidiendo la persona; a partir de ahí, la
 * continuidad la puede llevar quien acompaña, que es como funciona un
 * acompañamiento de verdad.
 *
 * Nace como `solicitada`, no confirmada: proponer no es agendar. La otra parte
 * confirma, y `setAppointmentStatus` lo impide al revés.
 */
export async function proposeAppointment(
  ctx: TenantContext,
  input: {
    clientUserId: string;
    scheduledAt: Date;
    durationMinutes: number;
    reason?: string | null;
  },
): Promise<AppointmentRow> {
  assertTenantContext(ctx, 'proposeAppointment');

  const professionalId = await myProfessionalId(ctx);
  if (!professionalId) {
    throw new Error('No tienes perfil profesional en este espacio.');
  }

  if (input.scheduledAt.getTime() < Date.now()) {
    throw new Error('Esa fecha ya pasó.');
  }

  const [previa] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.professionalId, professionalId),
        eq(appointments.clientUserId, input.clientUserId),
        inArray(appointments.status, ['confirmada', 'completada', 'no_asistio']),
      ),
    )
    .limit(1);

  if (!previa) {
    throw new Error(
      'Solo puedes proponer citas a personas a las que ya has atendido. La ' +
        'primera la pide siempre quien busca la consulta.',
    );
  }

  const [row] = await db
    .insert(appointments)
    .values({
      tenantId: ctx.tenantId,
      professionalId,
      clientUserId: input.clientUserId,
      status: 'solicitada',
      requestedBy: 'profesional',
      scheduledAt: input.scheduledAt,
      durationMinutes: Math.min(240, Math.max(15, input.durationMinutes)),
      roomId: crypto.randomUUID(),
      reason: input.reason?.trim().slice(0, 500) || null,
    })
    .returning();

  if (!row) throw new Error('No se pudo proponer la cita.');
  return row;
}

/** Citas propuestas por un profesional que esta persona aún no ha contestado. */
export async function proposalsForMe(
  ctx: TenantContext,
): Promise<Array<{ appointment: AppointmentRow; professionalName: string | null }>> {
  assertTenantContext(ctx, 'proposalsForMe');

  const rows = await db
    .select({ appointment: appointments, professionalName: users.name })
    .from(appointments)
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(users, eq(users.id, professionals.userId))
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        eq(appointments.clientUserId, ctx.userId),
        eq(appointments.status, 'solicitada'),
        eq(appointments.requestedBy, 'profesional'),
        gte(appointments.scheduledAt, new Date()),
      ),
    )
    .orderBy(asc(appointments.scheduledAt));

  return rows;
}
