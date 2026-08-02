import type { Metadata } from 'next';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { requireTenantContext } from '@/lib/tenant/context';
import { myAgenda } from '@/lib/db/repositories/practice';
import { APPOINTMENT_STATUS_LABELS, canJoinRoom } from '@/lib/consultorio/types';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Agenda' };
export const dynamic = 'force-dynamic';

/** Cuánto de la agenda se enseña por delante. Dos semanas de vista. */
const DIAS_ADELANTE = 14;

/** Y cuánto por detrás: lo de ayer todavía es trabajo pendiente de cerrar. */
const DIAS_ATRAS = 2;

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const hora = new Intl.DateTimeFormat('es-MX', {
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * La agenda de quien atiende.
 *
 * Es la pantalla de inicio de la consulta y no el perfil: el perfil se rellena
 * una vez, la agenda se mira todos los días.
 *
 * Las horas se pintan en el navegador con `Intl`, así que cada quien las ve en
 * su propia zona. Un profesional en Ciudad de México y una familia en Tijuana
 * ven la misma cita a la hora que les toca sin convertir nada de cabeza.
 */
export default async function AgendaPage() {
  const ctx = await requireTenantContext();

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DIAS_ATRAS * 86_400_000);
  const hasta = new Date(ahora.getTime() + DIAS_ADELANTE * 86_400_000);

  const agenda = await myAgenda(ctx, desde, hasta);

  // Agrupadas por día local. Una agenda es una lista de días, no de citas.
  const porDia = new Map<string, typeof agenda>();
  for (const entrada of agenda) {
    const clave = entrada.appointment.scheduledAt.toDateString();
    porDia.set(clave, [...(porDia.get(clave) ?? []), entrada]);
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      {agenda.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No tienes citas en las próximas dos semanas.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Para que alguien pueda reservarte hacen falta tres cosas: que tu
            perfil esté verificado, que hayas publicado horarios y que tengas
            puesto tu enlace de videollamada. Las tres están en Mi perfil.
          </p>
        </Card>
      ) : null}

      {[...porDia.entries()].map(([dia, citas]) => (
        <section key={dia} aria-label={fechaLarga.format(new Date(dia))}>
          <h2 className="text-lg font-semibold tracking-tight first-letter:uppercase">
            {fechaLarga.format(new Date(dia))}
          </h2>

          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {citas.map(({ appointment, clientName, clientUserId }) => {
              const cancelada = appointment.status === 'cancelada';

              return (
                <li key={appointment.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold tabular-nums">
                          {hora.format(appointment.scheduledAt)}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {appointment.durationMinutes} min
                          </span>
                        </p>

                        {/*
                          * El nombre enlaza a su recorrido: llegar a lo que se
                          * trabajó la vez pasada no debería costar más que un
                          * toque justo antes de entrar.
                          */}
                        <Link
                          href={`/profesional/personas/${clientUserId}`}
                          className="mt-1 inline-block text-sm underline underline-offset-4"
                        >
                          {clientName ?? 'Sin nombre'}
                        </Link>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {APPOINTMENT_STATUS_LABELS[appointment.status]}
                          {appointment.requestedBy === 'profesional' &&
                          appointment.status === 'solicitada'
                            ? ' · la propusiste tú, falta que la confirme'
                            : ''}
                        </p>

                        {appointment.reason ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {appointment.reason}
                          </p>
                        ) : null}
                      </div>

                      {canJoinRoom(appointment.status) && !cancelada ? (
                        <Link
                          href={`/consultorio/${appointment.id}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          style={{ minHeight: 'var(--cian-control-height)' }}
                        >
                          <Video aria-hidden="true" className="size-4" />
                          Entrar
                        </Link>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
