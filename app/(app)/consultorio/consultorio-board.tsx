'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus, Check, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  APPOINTMENT_STATUS_LABELS,
  SPECIALTY_LABELS,
  canJoinRoom,
  type AppointmentStatus,
  type Specialty,
} from '@/lib/consultorio/types';
import { CLIENT_NOTICE } from '@/lib/consultorio/terms';
import {
  requestAppointmentAction,
  setAppointmentStatusAction,
} from '@/lib/consultorio/actions';

type ProfessionalCard = {
  id: string;
  name: string;
  specialties: Specialty[];
  bio: string | null;
  /** Instantes ISO. Se pintan en la zona horaria de quien mira. */
  slots: string[];
};

type Appointment = {
  id: string;
  status: AppointmentStatus;
  scheduledAt: string;
  durationMinutes: number;
  role: 'profesional' | 'usuario';
  otherName: string | null;
  reason: string | null;
};

/**
 * Los huecos llegan como instantes absolutos y se pintan aquí.
 *
 * Es lo que hace que un profesional en Ciudad de México y una familia en
 * Tijuana vean la misma cita a su hora, sin que ninguno tenga que convertir
 * nada mentalmente.
 */
function formatSlot(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatFull(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function ConsultorioBoard({
  professionals,
  appointments,
  durationMinutes,
}: {
  professionals: ProfessionalCard[];
  appointments: Appointment[];
  durationMinutes: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) {
        setOpenFor(null);
        setReason('');
        router.refresh();
      }
    });
  }

  const upcoming = appointments.filter(
    (appointment) =>
      new Date(appointment.scheduledAt).getTime() > Date.now() - 3_600_000 &&
      appointment.status !== 'cancelada',
  );
  const past = appointments.filter((appointment) => !upcoming.includes(appointment));

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Un momento…' : status}
      </p>

      {/* --- Citas próximas --------------------------------------------------- */}
      <section aria-labelledby="proximas">
        <h2 id="proximas" className="text-lg font-semibold tracking-tight">
          Próximas
        </h2>

        {upcoming.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">No tienes citas próximas.</p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {upcoming.map((appointment) => (
              <li key={appointment.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {formatFull(appointment.scheduledAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {appointment.durationMinutes} minutos ·{' '}
                        {APPOINTMENT_STATUS_LABELS[appointment.status]}
                        {appointment.role === 'usuario' && appointment.otherName
                          ? ` · con ${appointment.otherName}`
                          : ''}
                      </p>
                      {appointment.reason ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {appointment.reason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canJoinRoom(appointment.status) ? (
                        <Link
                          href={`/consultorio/${appointment.id}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          style={{ minHeight: 'var(--cian-control-height)' }}
                        >
                          <Video aria-hidden="true" className="size-4" />
                          Entrar
                        </Link>
                      ) : null}

                      {appointment.role === 'profesional' &&
                      appointment.status === 'solicitada' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              setAppointmentStatusAction({
                                appointmentId: appointment.id,
                                status: 'confirmada',
                              }),
                            )
                          }
                        >
                          <Check aria-hidden="true" />
                          Confirmar
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            setAppointmentStatusAction({
                              appointmentId: appointment.id,
                              status: 'cancelada',
                            }),
                          )
                        }
                      >
                        <X aria-hidden="true" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Reservar --------------------------------------------------------- */}
      <section aria-labelledby="reservar">
        <h2 id="reservar" className="text-lg font-semibold tracking-tight">
          Reservar una sesión
        </h2>

        {professionals.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              Todavía no hay profesionales verificados en este espacio. Un perfil
              sin verificar no aparece aquí y no puede recibir citas.
            </p>
          </Card>
        ) : (
          <>
            <Card className="mt-3">
              <ul className="space-y-1.5">
                {CLIENT_NOTICE.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
              {professionals.map((professional) => (
                <li key={professional.id}>
                  <Card>
                    <h3 className="text-sm font-semibold">{professional.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {professional.specialties
                        .map((specialty) => SPECIALTY_LABELS[specialty])
                        .join(' · ')}
                    </p>
                    {professional.bio ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {professional.bio}
                      </p>
                    ) : null}

                    {professional.slots.length === 0 ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Sin horarios libres por ahora.
                      </p>
                    ) : openFor === professional.id ? (
                      <div className="mt-3">
                        <label
                          htmlFor={`motivo-${professional.id}`}
                          className="text-sm font-medium"
                        >
                          Qué te gustaría trabajar{' '}
                          <span className="text-muted-foreground">(opcional)</span>
                        </label>
                        <textarea
                          id={`motivo-${professional.id}`}
                          rows={2}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />

                        <div className="mt-2 flex flex-wrap gap-2">
                          {professional.slots.map((slot) => (
                            <Button
                              key={slot}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() =>
                                run(() =>
                                  requestAppointmentAction({
                                    professionalId: professional.id,
                                    scheduledAt: slot,
                                    durationMinutes,
                                    reason: reason || undefined,
                                  }),
                                )
                              }
                            >
                              {formatSlot(slot)}
                            </Button>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => setOpenFor(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setOpenFor(professional.id);
                          setReason('');
                        }}
                      >
                        <CalendarPlus aria-hidden="true" />
                        Ver horarios ({professional.slots.length})
                      </Button>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* --- Historial -------------------------------------------------------- */}
      {past.length > 0 ? (
        <section aria-labelledby="historial">
          <h2 id="historial" className="text-lg font-semibold tracking-tight">
            Historial
          </h2>

          <ul className="mt-3" style={{ display: 'grid', gap: '0.5rem' }}>
            {past.map((appointment) => (
              <li key={appointment.id}>
                <Link
                  href={`/consultorio/${appointment.id}`}
                  className="block rounded-xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Card className="transition-colors hover:bg-muted">
                    <p className="text-sm">{formatFull(appointment.scheduledAt)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                      {appointment.role === 'usuario' && appointment.otherName
                        ? ` · con ${appointment.otherName}`
                        : ''}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
