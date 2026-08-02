import { tool } from 'ai';
import { z } from 'zod';
import {
  createReminder,
  deleteReminder,
  getNotificationPreferences,
  listPushSubscriptions,
  listReminders,
  setReminderActive,
} from '../../db/repositories/notifications';
import { describeSchedule, normalizeSchedule } from '../../notifications/schedule';
import {
  CHANNELS,
  DEFAULT_TIME_ZONE,
  REMINDER_KINDS,
  REMINDER_KIND_LABELS,
  WEEKDAY_NAMES,
} from '../../notifications/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * Tools de recordatorios. Fase 8.
 *
 * «Recuérdame la rutina de la mañana a las 7» tiene que producir una fila, no
 * una promesa en prosa. Por eso el esquema exige hora y minuto.
 *
 * La zona horaria no se le pide al modelo: sale de las preferencias de la
 * persona. Un modelo que adivina zonas horarias produce recordatorios con seis
 * horas de desfase, y quien los recibe deja de confiar en la aplicación.
 */
export function buildReminderTools({ ctx }: ToolContext): ToolRegistry {
  return {
    createReminder: tool({
      description:
        'Crea un recordatorio a una hora fija. Úsalo ante «recuérdame…», ' +
        '«avísame…» o «quiero que me lo recuerdes todos los días».\n\n' +
        'Los días de la semana van con la convención 0 = domingo. Lista vacía ' +
        'significa todos los días.\n\n' +
        'Si la persona no tiene ningún canal de aviso encendido, díselo: el ' +
        'recordatorio se crea igual pero no llegará hasta que lo active en ' +
        'Configuración → Avisos.',
      inputSchema: z.object({
        kind: z.enum(REMINDER_KINDS).default('libre'),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe('Lo que se ve en la notificación. Corto y concreto.'),
        body: z
          .string()
          .max(500)
          .describe('Una línea más, si ayuda. Casi nunca hace falta.')
          .optional(),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59).default(0),
        days: z
          .array(z.number().int().min(0).max(6))
          .describe('0 domingo … 6 sábado. Vacío = todos los días.')
          .default([]),
        resourceId: z
          .string()
          .describe('La rutina, tarea o plan al que se refiere, si aplica.')
          .optional(),
      }),
      async execute({ kind, title, body, hour, minute, days, resourceId }) {
        const [preferences, devices] = await Promise.all([
          getNotificationPreferences(ctx),
          listPushSubscriptions(ctx),
        ]);

        const reminder = await createReminder(ctx, {
          kind,
          resourceId: resourceId ?? null,
          title,
          body,
          schedule: normalizeSchedule({
            hour,
            minute,
            days,
            timeZone: preferences.timeZone || DEFAULT_TIME_ZONE,
          }),
          channels: preferences.channels,
        });

        const noChannels = preferences.channels.length === 0;
        const pushWithoutDevice =
          preferences.channels.includes('push') && devices.length === 0;

        return {
          creado: true,
          recordatorioId: reminder.id,
          cuando: describeSchedule(reminder.schedule, WEEKDAY_NAMES),
          tipo: REMINDER_KIND_LABELS[reminder.kind],
          // El modelo tiene que poder avisar con honestidad de que no llegará.
          advertencia: noChannels
            ? 'No hay ningún canal de aviso encendido: el recordatorio no llegará hasta activarlo en Configuración → Avisos.'
            : pushWithoutDevice
              ? 'No hay ningún dispositivo conectado para recibir avisos. Se puede activar en Configuración → Avisos.'
              : null,
        };
      },
    }),

    listReminders: tool({
      description:
        'Los recordatorios de esta persona, con su horario y si están activos.',
      inputSchema: z.object({}),
      async execute() {
        const [rows, preferences] = await Promise.all([
          listReminders(ctx),
          getNotificationPreferences(ctx),
        ]);

        return {
          recordatorios: rows.map((reminder) => ({
            id: reminder.id,
            titulo: reminder.title,
            cuando: describeSchedule(reminder.schedule, WEEKDAY_NAMES),
            tipo: REMINDER_KIND_LABELS[reminder.kind],
            activo: reminder.active,
          })),
          canalesEncendidos: preferences.channels,
          horasDeSilencio: `De ${preferences.quietHours.startHour}:00 a ${preferences.quietHours.endHour}:00`,
        };
      },
    }),

    setReminderActive: tool({
      description:
        'Pausa o reactiva un recordatorio. Pausar es mejor que borrar cuando ' +
        'la persona dice «ya no me lo recuerdes por ahora».',
      inputSchema: z.object({
        reminderId: z.string(),
        active: z.boolean(),
      }),
      async execute({ reminderId, active }) {
        await setReminderActive(ctx, reminderId, active);
        return { actualizado: true, activo: active };
      },
    }),

    deleteReminder: tool({
      description: 'Elimina un recordatorio para siempre.',
      inputSchema: z.object({ reminderId: z.string() }),
      async execute({ reminderId }) {
        await deleteReminder(ctx, reminderId);
        return { eliminado: true };
      },
    }),
  };
}

/** Los canales existen como vocabulario compartido con la interfaz. */
export const REMINDER_CHANNELS = CHANNELS;
