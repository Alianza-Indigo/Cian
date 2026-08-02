'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  addAvailability,
  addSessionNote,
  assignSessionTask,
  deleteAvailability,
  deleteSessionNote,
  endSession,
  publishSessionSummary,
  requestAppointment,
  saveSessionSummary,
  saveWhiteboard,
  setAppointmentStatus,
  setRecordingConsent,
  setSessionTaskStatus,
  setAppointmentMeetingUrl,
  setVerificationStatus,
  upsertProfessionalProfile,
} from '../db/repositories/consultorio';
import { recordAudit } from '../db/repositories/audit';
import { generateSessionSummaryDraft } from './summary-draft';
import {
  APPOINTMENT_STATUSES,
  NOTE_VISIBILITIES,
  SESSION_TASK_STATUSES,
  SPECIALTIES,
  VERIFICATION_STATUSES,
} from './types';
import { TERMS_VERSION } from './terms';

export type ConsultorioActionResult =
  | { ok: true; message?: string; id?: string }
  | { ok: false; error: string };

const idSchema = z.uuid();

function fail(error: unknown, fallback: string): ConsultorioActionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

// --- Perfil profesional ------------------------------------------------------

const profileSchema = z.object({
  specialties: z.array(z.enum(SPECIALTIES)).min(1),
  licenseNumber: z.string().max(60).optional(),
  bio: z.string().max(2000).optional(),
  acceptTerms: z.boolean(),
  defaultMeetingUrl: z.string().max(500).optional(),
});

export async function saveProfessionalProfileAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Elige al menos una especialidad.' };
  }

  try {
    const ctx = await requireTenantContext();
    const row = await upsertProfessionalProfile(ctx, {
      ...parsed.data,
      termsVersion: TERMS_VERSION,
    });

    await recordAudit(ctx, {
      action: 'consultorio.profile_save',
      entity: 'professional',
      entityId: row.id,
      metadata: { estado: row.verificationStatus },
    });

    revalidatePath('/profesional');
    return {
      ok: true,
      message:
        row.verificationStatus === 'verificado'
          ? 'Perfil actualizado.'
          : 'Perfil guardado. Queda en revisión antes de poder recibir citas.',
    };
  } catch (error) {
    return fail(error, 'No pudimos guardar el perfil.');
  }
}

const verificationSchema = z.object({
  professionalId: z.uuid(),
  status: z.enum(VERIFICATION_STATUSES),
});

export async function setVerificationStatusAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = verificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    const ctx = await requireTenantContext();
    const row = await setVerificationStatus(
      ctx,
      parsed.data.professionalId,
      parsed.data.status,
    );

    if (!row) return { ok: false, error: 'No encontramos ese perfil.' };

    await recordAudit(ctx, {
      action: 'consultorio.verification',
      entity: 'professional',
      entityId: row.id,
      metadata: { estado: parsed.data.status },
    });

    revalidatePath('/profesional');
    return { ok: true, message: 'Estado de verificación actualizado.' };
  } catch (error) {
    return fail(error, 'No pudimos cambiar la verificación.');
  }
}

// --- Disponibilidad ----------------------------------------------------------

const availabilitySchema = z.object({
  professionalId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  timezone: z.string().min(1).max(60),
});

export async function addAvailabilityAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa las horas.' };

  try {
    const ctx = await requireTenantContext();
    await addAvailability(ctx, parsed.data);
    revalidatePath('/profesional');
    return { ok: true, message: 'Disponibilidad agregada.' };
  } catch (error) {
    return fail(error, 'No pudimos guardarla.');
  }
}

export async function deleteAvailabilityAction(
  slotId: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(slotId).success) {
    return { ok: false, error: 'No válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteAvailability(ctx, slotId);
    revalidatePath('/profesional');
    return { ok: true, message: 'Franja eliminada.' };
  } catch (error) {
    return fail(error, 'No pudimos eliminarla.');
  }
}

// --- Citas -------------------------------------------------------------------

const appointmentSchema = z.object({
  professionalId: z.uuid(),
  scheduledAt: z.string(),
  durationMinutes: z.number().int().min(15).max(240),
  reason: z.string().max(1000).optional(),
});

export async function requestAppointmentAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Elige un horario válido.' };

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: 'Esa fecha no se entiende.' };
  }

  try {
    const ctx = await requireTenantContext();
    const row = await requestAppointment(ctx, { ...parsed.data, scheduledAt });

    await recordAudit(ctx, {
      action: 'consultorio.appointment_request',
      entity: 'appointment',
      entityId: row.id,
    });

    revalidatePath('/consultorio');
    return { ok: true, id: row.id, message: 'Cita solicitada.' };
  } catch (error) {
    return fail(error, 'No pudimos reservar la cita.');
  }
}

const statusSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(APPOINTMENT_STATUSES),
});

export async function setAppointmentStatusAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    const ctx = await requireTenantContext();
    const row = await setAppointmentStatus(
      ctx,
      parsed.data.appointmentId,
      parsed.data.status,
    );

    if (!row) return { ok: false, error: 'No encontramos esa cita.' };

    revalidatePath('/consultorio');
    return { ok: true, message: 'Cita actualizada.' };
  } catch (error) {
    return fail(error, 'No pudimos actualizarla.');
  }
}

// --- Sesión ------------------------------------------------------------------

export async function setRecordingConsentAction(
  sessionId: string,
  consented: boolean,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: 'Sesión no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    const row = await setRecordingConsent(ctx, sessionId, consented);
    if (!row) return { ok: false, error: 'No encontramos esa sesión.' };

    // Queda constancia de quién autorizó y cuándo, que es la pregunta que se
    // hace después si algo sale mal.
    await recordAudit(ctx, {
      action: consented
        ? 'consultorio.recording_consent'
        : 'consultorio.recording_withdraw',
      entity: 'consult_session',
      entityId: sessionId,
    });

    revalidatePath(`/consultorio/${sessionId}`);
    return {
      ok: true,
      message: consented
        ? 'Autorización registrada.'
        : 'Retiraste tu autorización. Ya no se puede grabar.',
    };
  } catch (error) {
    return fail(error, 'No pudimos registrar tu decisión.');
  }
}

export async function endSessionAction(
  sessionId: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: 'Sesión no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await endSession(ctx, sessionId);
    revalidatePath(`/consultorio/${sessionId}`);
    return { ok: true, message: 'Sesión cerrada.' };
  } catch (error) {
    return fail(error, 'No pudimos cerrarla.');
  }
}

// --- Notas -------------------------------------------------------------------

const noteSchema = z.object({
  sessionId: z.uuid(),
  visibility: z.enum(NOTE_VISIBILITIES),
  content: z.string().min(1).max(20_000),
});

export async function addSessionNoteAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'La nota está vacía.' };

  try {
    const ctx = await requireTenantContext();
    const row = await addSessionNote(ctx, parsed.data);

    revalidatePath(`/consultorio/${parsed.data.sessionId}`);
    return {
      ok: true,
      message:
        row.visibility === 'privada'
          ? 'Nota guardada. Solo tú la ves.'
          : 'Nota guardada y compartida.',
    };
  } catch (error) {
    return fail(error, 'No pudimos guardar la nota.');
  }
}

export async function deleteSessionNoteAction(
  noteId: string,
  sessionId: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(noteId).success) {
    return { ok: false, error: 'Nota no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteSessionNote(ctx, noteId);
    revalidatePath(`/consultorio/${sessionId}`);
    return { ok: true, message: 'Nota eliminada.' };
  } catch (error) {
    return fail(error, 'No pudimos eliminarla.');
  }
}

// --- Resumen -----------------------------------------------------------------

/**
 * Pide al modelo un borrador del resumen.
 *
 * **Solo lo alimentan las notas compartidas.** Las privadas del profesional no
 * entran ni como contexto: resumir un texto deja rastro de él, y este resumen
 * lo va a leer la persona atendida. El filtro está en `selectSummarySources`,
 * en código, no en el prompt.
 *
 * Lo que guarda queda **sin publicar**, como cualquier otro guardado. El
 * criterio del PRD —«el resumen no se publica sin aprobación del
 * profesional»— vale igual para un borrador escrito por un modelo, y más.
 */
export async function draftSessionSummaryAction(
  sessionId: string,
): Promise<ConsultorioActionResult & { content?: string }> {
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: 'Sesión no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    const result = await generateSessionSummaryDraft(ctx, sessionId);

    if (!result.ok) return { ok: false, error: result.reason };

    await recordAudit(ctx, {
      action: 'consultorio.summary_draft',
      entity: 'session_summary',
      entityId: sessionId,
    });

    revalidatePath(`/consultorio/${sessionId}`);
    return {
      ok: true,
      message:
        'Borrador generado con las notas compartidas. Revísalo antes de ' +
        'publicarlo: sigue sin publicar.',
      content: result.content,
    };
  } catch (error) {
    return fail(error, 'No pudimos generar el borrador.');
  }
}

export async function saveSessionSummaryAction(
  sessionId: string,
  content: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: 'Sesión no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await saveSessionSummary(ctx, sessionId, content);
    revalidatePath(`/consultorio/${sessionId}`);
    return {
      ok: true,
      message: 'Borrador guardado. Sin publicar: la persona todavía no lo ve.',
    };
  } catch (error) {
    return fail(error, 'No pudimos guardar el resumen.');
  }
}

export async function publishSessionSummaryAction(
  sessionId: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(sessionId).success) {
    return { ok: false, error: 'Sesión no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    const row = await publishSessionSummary(ctx, sessionId);
    if (!row) return { ok: false, error: 'Solo el profesional publica el resumen.' };

    await recordAudit(ctx, {
      action: 'consultorio.summary_publish',
      entity: 'session_summary',
      entityId: row.id,
    });

    revalidatePath(`/consultorio/${sessionId}`);
    return { ok: true, message: 'Resumen publicado. Ya lo puede ver la persona.' };
  } catch (error) {
    return fail(error, 'No pudimos publicarlo.');
  }
}

// --- Tareas ------------------------------------------------------------------

const taskSchema = z.object({
  sessionId: z.uuid(),
  assignedToUserId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  dueAt: z.string().optional(),
});

export async function assignSessionTaskAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa el título.' };

  try {
    const ctx = await requireTenantContext();
    await assignSessionTask(ctx, {
      ...parsed.data,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    });

    revalidatePath(`/consultorio/${parsed.data.sessionId}`);
    return { ok: true, message: 'Tarea asignada.' };
  } catch (error) {
    return fail(error, 'No pudimos asignarla.');
  }
}

export async function setSessionTaskStatusAction(
  taskId: string,
  status: (typeof SESSION_TASK_STATUSES)[number],
  sessionId: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(taskId).success) {
    return { ok: false, error: 'Tarea no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await setSessionTaskStatus(ctx, taskId, status);
    revalidatePath(`/consultorio/${sessionId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'No pudimos actualizarla.');
  }
}

// --- Pizarra -----------------------------------------------------------------

const whiteboardSchema = z.object({
  sessionId: z.uuid(),
  strokes: z
    .array(
      z.object({
        id: z.string().max(60),
        color: z.string().max(20),
        width: z.number().min(1).max(40),
        points: z.array(z.number()).max(4000),
      }),
    )
    .max(2000),
});

export async function saveWhiteboardAction(
  input: unknown,
): Promise<ConsultorioActionResult> {
  const parsed = whiteboardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Pizarra no válida.' };

  try {
    const ctx = await requireTenantContext();
    await saveWhiteboard(ctx, parsed.data.sessionId, {
      strokes: parsed.data.strokes,
    });
    return { ok: true };
  } catch (error) {
    return fail(error, 'No pudimos guardar la pizarra.');
  }
}

/** El profesional fija un enlace distinto para una cita concreta. */
export async function setAppointmentMeetingUrlAction(
  appointmentId: string,
  url: string,
): Promise<ConsultorioActionResult> {
  if (!idSchema.safeParse(appointmentId).success) {
    return { ok: false, error: 'Cita no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await setAppointmentMeetingUrl(ctx, appointmentId, url);
    revalidatePath('/consultorio');
    return { ok: true, message: 'Enlace actualizado.' };
  } catch (error) {
    return fail(error, 'No pudimos guardar el enlace.');
  }
}
