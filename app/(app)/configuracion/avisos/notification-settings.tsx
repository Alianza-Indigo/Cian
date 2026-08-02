'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff, BellRing, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  CHANNELS,
  CHANNEL_LABELS,
  DEFAULT_TIME_ZONE,
  DELIVERY_STATUS_LABELS,
  REMINDER_KINDS,
  REMINDER_KIND_LABELS,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  type Channel,
  type DeliveryStatus,
  type NotificationPreferences,
  type ReminderKind,
  type ReminderSchedule,
} from '@/lib/notifications/types';
import { describeSchedule } from '@/lib/notifications/schedule';
import {
  pushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupport,
} from '@/lib/notifications/push-client';
import {
  createReminderAction,
  deleteReminderAction,
  saveNotificationPreferencesAction,
  setReminderActiveAction,
} from '@/lib/notifications/actions';

type Reminder = {
  id: string;
  kind: ReminderKind;
  title: string;
  body: string | null;
  schedule: ReminderSchedule;
  channels: Channel[];
  active: boolean;
  lastSentAt: string | null;
};

type Device = {
  endpoint: string;
  userAgent: string | null;
  lastSuccessAt: string | null;
};

type Delivery = {
  id: string;
  channel: Channel;
  status: DeliveryStatus;
  error: string | null;
  sentAt: string;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Instrucciones de instalación en iOS.
 *
 * Se muestran en vez del botón de activar cuando el dispositivo no puede
 * recibir nada todavía. Es literalmente el criterio del PRD: explicar cómo
 * instalar en lugar de prometer notificaciones que no van a llegar.
 */
function IosGuidance() {
  return (
    <Card>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone aria-hidden="true" className="size-4" />
        En iPhone hay que instalar CIAN primero
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Safari solo entrega notificaciones cuando la aplicación está en la
        pantalla de inicio. Mientras CIAN se abra dentro del navegador, no
        llegará ningún aviso, y preferimos decírtelo a que te quedes esperando.
      </p>
      <ol className="mt-3 space-y-1 text-sm">
        <li>
          <span className="text-muted-foreground">1.</span> Abre CIAN en Safari
          (no en Chrome ni dentro de otra aplicación).
        </li>
        <li>
          <span className="text-muted-foreground">2.</span> Toca el botón de
          compartir, el cuadrado con la flecha hacia arriba.
        </li>
        <li>
          <span className="text-muted-foreground">3.</span> Elige «Agregar a
          inicio».
        </li>
        <li>
          <span className="text-muted-foreground">4.</span> Abre CIAN desde el
          icono nuevo y vuelve a esta pantalla.
        </li>
      </ol>
    </Card>
  );
}

export function NotificationSettings({
  preferences,
  reminders,
  devices,
  deliveries,
}: {
  preferences: NotificationPreferences;
  reminders: Reminder[];
  devices: Device[];
  deliveries: Delivery[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [support, setSupport] = useState<PushSupport | null>(null);

  const [channels, setChannels] = useState<Channel[]>(preferences.channels);
  const [quietStart, setQuietStart] = useState(preferences.quietHours.startHour);
  const [quietEnd, setQuietEnd] = useState(preferences.quietHours.endHour);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<ReminderKind>('rutina');
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([]);

  // El soporte solo se puede saber en el navegador: `window` no existe al
  // renderizar en el servidor.
  useEffect(() => {
    setSupport(pushSupport());
  }, []);

  const timeZone =
    preferences.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    DEFAULT_TIME_ZONE;

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) router.refresh();
    });
  }

  function savePreferences(nextChannels: Channel[], start: number, end: number) {
    run(() =>
      saveNotificationPreferencesAction({
        channels: nextChannels,
        quietHours: { startHour: start, endHour: end },
        timeZone,
      }),
    );
  }

  function toggleChannel(channel: Channel, on: boolean) {
    const next = on
      ? [...new Set([...channels, channel])]
      : channels.filter((value) => value !== channel);
    setChannels(next);
    savePreferences(next, quietStart, quietEnd);
  }

  function submitReminder(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length === 0) return;

    run(async () => {
      const result = await createReminderAction({
        kind,
        title: title.trim(),
        body: body.trim() || undefined,
        hour,
        minute,
        days,
        timeZone,
        channels,
      });
      if (result.ok) {
        setTitle('');
        setBody('');
        setDays([]);
        setShowForm(false);
      }
      return result;
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {/* --- Dispositivo --------------------------------------------------- */}
      <section aria-labelledby="dispositivo">
        <h2 id="dispositivo" className="text-lg font-semibold tracking-tight">
          Este dispositivo
        </h2>

        <div className="mt-3">
          {support === null ? (
            <Card>
              <p className="text-sm text-muted-foreground">Comprobando…</p>
            </Card>
          ) : support.estado === 'instalar_primero' ? (
            <IosGuidance />
          ) : support.estado === 'no_soportado' ? (
            <Card>
              <p className="text-sm text-muted-foreground">{support.motivo}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Puedes activar el correo más abajo y recibir los recordatorios
                por ahí.
              </p>
            </Card>
          ) : support.estado === 'bloqueado' ? (
            <Card>
              <p className="text-sm">
                Bloqueaste las notificaciones para este sitio. Hay que
                permitirlas desde la configuración del navegador; desde aquí no
                se puede volver a pedir.
              </p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted-foreground">
                Este dispositivo puede recibir avisos. Se te pedirá permiso al
                activarlo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run(async () => {
                      const result = await subscribeToPush();
                      return result.ok
                        ? { ok: true, message: 'Este dispositivo ya recibe avisos.' }
                        : { ok: false, error: result.error };
                    })
                  }
                >
                  <BellRing aria-hidden="true" />
                  Activar en este dispositivo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run(async () => {
                      const result = await unsubscribeFromPush();
                      return result.ok
                        ? { ok: true, message: 'Este dispositivo ya no recibe avisos.' }
                        : { ok: false, error: result.error };
                    })
                  }
                >
                  <BellOff aria-hidden="true" />
                  Desactivar aquí
                </Button>
              </div>
            </Card>
          )}
        </div>

        {devices.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {devices.length === 1
              ? 'Hay 1 dispositivo conectado a tu cuenta.'
              : `Hay ${devices.length} dispositivos conectados a tu cuenta.`}
          </p>
        ) : null}
      </section>

      {/* --- Canales y silencios ------------------------------------------- */}
      <section aria-labelledby="canales">
        <h2 id="canales" className="text-lg font-semibold tracking-tight">
          Por dónde y cuándo
        </h2>

        <Card className="mt-3">
          <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {CHANNELS.map((channel) => (
              <ToggleField
                key={channel}
                label={CHANNEL_LABELS[channel]}
                hint={
                  channel === 'correo'
                    ? 'Se usa como respaldo cuando el aviso en el dispositivo no llega.'
                    : 'Llega al teléfono o al escritorio, si lo activaste arriba.'
                }
                checked={channels.includes(channel)}
                onChange={(next) => toggleChannel(channel, next)}
                disabled={isPending}
              />
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Horas de silencio</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dentro de esta franja no llega nada, y lo que caiga ahí no se
              acumula para después.
            </p>

            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="silencio-inicio" className="text-xs text-muted-foreground">
                  Desde
                </label>
                <select
                  id="silencio-inicio"
                  value={quietStart}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setQuietStart(next);
                    savePreferences(channels, next, quietEnd);
                  }}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                >
                  {HOURS.map((value) => (
                    <option key={value} value={value}>
                      {String(value).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="silencio-fin" className="text-xs text-muted-foreground">
                  Hasta
                </label>
                <select
                  id="silencio-fin"
                  value={quietEnd}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setQuietEnd(next);
                    savePreferences(channels, quietStart, next);
                  }}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                >
                  {HOURS.map((value) => (
                    <option key={value} value={value}>
                      {String(value).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Zona horaria: {timeZone}
            </p>
          </div>
        </Card>
      </section>

      {/* --- Recordatorios -------------------------------------------------- */}
      <section aria-labelledby="recordatorios">
        <h2 id="recordatorios" className="text-lg font-semibold tracking-tight">
          Recordatorios
        </h2>

        {reminders.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              No tienes recordatorios. También puedes pedírselos a CIAN en una
              conversación: «recuérdame la rutina de la mañana a las 7».
            </p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {reminders.map((reminder) => (
              <li key={reminder.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">{reminder.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {REMINDER_KIND_LABELS[reminder.kind]} ·{' '}
                        {describeSchedule(reminder.schedule, WEEKDAY_NAMES)}
                        {reminder.active ? '' : ' · en pausa'}
                      </p>
                      {reminder.body ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {reminder.body}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            setReminderActiveAction(reminder.id, !reminder.active),
                          )
                        }
                      >
                        {reminder.active ? 'Pausar' : 'Activar'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar "${reminder.title}"`}
                        disabled={isPending}
                        onClick={() => run(() => deleteReminderAction(reminder.id))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {showForm ? (
          <Card className="mt-3">
            <form onSubmit={submitReminder} style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
              <div>
                <label htmlFor="rec-titulo" className="text-sm font-medium">
                  Qué recordar
                </label>
                <input
                  id="rec-titulo"
                  type="text"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                  placeholder="Rutina de la mañana"
                />
              </div>

              <div>
                <label htmlFor="rec-cuerpo" className="text-sm font-medium">
                  Texto del aviso <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="rec-cuerpo"
                  type="text"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                  placeholder="Empezamos sin prisa."
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="rec-tipo" className="text-xs text-muted-foreground">
                    Tipo
                  </label>
                  <select
                    id="rec-tipo"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as ReminderKind)}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                  >
                    {REMINDER_KINDS.map((value) => (
                      <option key={value} value={value}>
                        {REMINDER_KIND_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rec-hora" className="text-xs text-muted-foreground">
                    Hora
                  </label>
                  <select
                    id="rec-hora"
                    value={hour}
                    onChange={(event) => setHour(Number(event.target.value))}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                  >
                    {HOURS.map((value) => (
                      <option key={value} value={value}>
                        {String(value).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rec-minuto" className="text-xs text-muted-foreground">
                    Minuto
                  </label>
                  <select
                    id="rec-minuto"
                    value={minute}
                    onChange={(event) => setMinute(Number(event.target.value))}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                  >
                    {[0, 15, 30, 45].map((value) => (
                      <option key={value} value={value}>
                        {String(value).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className="text-sm font-medium">
                  Días <span className="text-muted-foreground">(ninguno = todos)</span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAY_SHORT.map((letter, index) => {
                    const on = days.includes(index);
                    return (
                      <Button
                        key={`${letter}-${index}`}
                        type="button"
                        variant={on ? 'primary' : 'outline'}
                        size="sm"
                        aria-pressed={on}
                        aria-label={WEEKDAY_NAMES[index]}
                        onClick={() =>
                          setDays(
                            on
                              ? days.filter((day) => day !== index)
                              : [...days, index].sort((a, b) => a - b),
                          )
                        }
                      >
                        {letter}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>

              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no tienes ningún canal encendido, así que este
                  recordatorio no llegará a ningún lado hasta que actives uno
                  arriba.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isPending}>
                  Crear recordatorio
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setShowForm(true)}
          >
            <Plus aria-hidden="true" />
            Nuevo recordatorio
          </Button>
        )}
      </section>

      {/* --- Historial ------------------------------------------------------ */}
      {deliveries.length > 0 ? (
        <section aria-labelledby="historial">
          <h2 id="historial" className="text-lg font-semibold tracking-tight">
            Últimos envíos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para poder responder «¿por qué no me avisó?».
          </p>

          <Card className="mt-3">
            <ul className="space-y-1">
              {deliveries.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="text-muted-foreground">
                    {new Intl.DateTimeFormat('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(entry.sentAt))}
                  </span>{' '}
                  · {CHANNEL_LABELS[entry.channel]} ·{' '}
                  {DELIVERY_STATUS_LABELS[entry.status]}
                  {entry.error ? (
                    <span className="block text-xs text-muted-foreground">
                      {entry.error}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
