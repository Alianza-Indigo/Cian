'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  createReminder,
  deleteReminder,
  saveNotificationPreferences,
  setReminderActive,
} from '../db/repositories/notifications';
import { normalizeSchedule } from './schedule';
import { CHANNELS, REMINDER_KINDS } from './types';

export type NotificationActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const idSchema = z.uuid();

const preferencesSchema = z.object({
  channels: z.array(z.enum(CHANNELS)),
  quietHours: z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
  }),
  timeZone: z.string().min(1).max(60),
});

export async function saveNotificationPreferencesAction(
  input: unknown,
): Promise<NotificationActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Revisa los horarios.' };
  }

  try {
    const ctx = await requireTenantContext();
    await saveNotificationPreferences(ctx, {
      channels: [...new Set(parsed.data.channels)],
      quietHours: parsed.data.quietHours,
      timeZone: parsed.data.timeZone,
    });

    revalidatePath('/configuracion/avisos');
    return { ok: true, message: 'Guardado.' };
  } catch {
    return { ok: false, error: 'No pudimos guardar tus preferencias.' };
  }
}

const reminderSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  resourceId: z.uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  days: z.array(z.number().int().min(0).max(6)),
  timeZone: z.string().min(1).max(60),
  channels: z.array(z.enum(CHANNELS)),
});

export async function createReminderAction(
  input: unknown,
): Promise<NotificationActionResult> {
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Revisa el título y la hora.' };
  }

  try {
    const ctx = await requireTenantContext();

    await createReminder(ctx, {
      kind: parsed.data.kind,
      resourceId: parsed.data.resourceId ?? null,
      title: parsed.data.title,
      body: parsed.data.body,
      schedule: normalizeSchedule(parsed.data),
      channels: parsed.data.channels,
    });

    revalidatePath('/configuracion/avisos');
    return { ok: true, message: 'Recordatorio creado.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos crearlo.',
    };
  }
}

export async function setReminderActiveAction(
  reminderId: string,
  active: boolean,
): Promise<NotificationActionResult> {
  if (!idSchema.safeParse(reminderId).success) {
    return { ok: false, error: 'Recordatorio no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await setReminderActive(ctx, reminderId, active);
    revalidatePath('/configuracion/avisos');
    return { ok: true, message: active ? 'Activado.' : 'En pausa.' };
  } catch {
    return { ok: false, error: 'No pudimos cambiarlo.' };
  }
}

export async function deleteReminderAction(
  reminderId: string,
): Promise<NotificationActionResult> {
  if (!idSchema.safeParse(reminderId).success) {
    return { ok: false, error: 'Recordatorio no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteReminder(ctx, reminderId);
    revalidatePath('/configuracion/avisos');
    return { ok: true, message: 'Recordatorio eliminado.' };
  } catch {
    return { ok: false, error: 'No pudimos eliminarlo.' };
  }
}
