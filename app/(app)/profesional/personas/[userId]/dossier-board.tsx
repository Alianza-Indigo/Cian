'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Lock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  APPOINTMENT_STATUS_LABELS,
  canJoinRoom,
  type AppointmentStatus,
} from '@/lib/consultorio/types';
import { proposeAppointmentAction } from '@/lib/consultorio/practice-actions';

type SessionEntry = {
  appointmentId: string;
  sessionId: string | null;
  scheduledAt: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: Array<{ id: string; visibility: string; content: string; mine: boolean }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  summary: { content: string; published: boolean } | null;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** El día local de hoy, para el mínimo del selector de fecha. */
function hoyLocal(): string {
  const now = new Date();
  const mes = `${now.getMonth() + 1}`.padStart(2, '0');
  const dia = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${mes}-${dia}`;
}

/**
 * El recorrido de una persona, sesión a sesión.
 *
 * ## Qué se ve aquí y qué no
 *
 * Solo lo que pasó por las sesiones entre las dos partes: las notas de quien
 * atiende, las que se marcaron como compartidas, los acuerdos y los resúmenes.
 *
 * **No** los planes de la persona, ni sus rutinas, ni su bitácora sensorial, ni
 * su bitácora de crisis, ni sus conversaciones con CIAN. Eso es suyo. Si en
 * algún momento quiere enseñar algo de eso, lo comparte dentro de una sesión y
 * queda constancia de que lo hizo.
 *
 * Las notas privadas se marcan como tales en pantalla: quien las escribió tiene
 * que poder distinguir de un vistazo lo que la otra persona ve de lo que no,
 * porque de eso depende cómo lo escribe.
 */
export function DossierBoard({
  userId,
  name,
  sessions,
}: {
  userId: string;
  name: string;
  sessions: SessionEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [proponiendo, setProponiendo] = useState(false);
  const [fecha, setFecha] = useState('');
  const [horaTexto, setHoraTexto] = useState('10:00');
  const [duracion, setDuracion] = useState(50);
  const [motivo, setMotivo] = useState('');

  const pendientes = sessions.flatMap((session) =>
    session.tasks.filter((task) => task.status === 'pendiente'),
  );

  function proponer() {
    if (!fecha) {
      setStatus('Elige una fecha.');
      return;
    }

    const [year, month, day] = fecha.split('-').map(Number);
    const [h, m] = horaTexto.split(':').map(Number);
    if (!year || !month || !day) return;

    /*
     * El instante se arma con la hora local de quien agenda. Mandar «2026-09-01
     * 10:00» sin más obligaría al servidor a elegir un huso, y el suyo no es el
     * de nadie.
     */
    const scheduledAt = new Date(year, month - 1, day, h ?? 0, m ?? 0).toISOString();

    startTransition(async () => {
      const result = await proposeAppointmentAction({
        clientUserId: userId,
        scheduledAt,
        durationMinutes: duracion,
        reason: motivo.trim() || undefined,
      });

      setStatus(result.ok ? (result.message ?? 'Listo.') : result.error);

      if (result.ok) {
        setProponiendo(false);
        setMotivo('');
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Un momento…' : status}
      </p>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {sessions.length} {sessions.length === 1 ? 'cita' : 'citas'} contigo.
          Aquí solo aparece lo que pasó en vuestras sesiones: lo demás de esta
          persona es suyo y no se ve desde aquí.
        </p>
      </div>

      {/* --- Acuerdos abiertos ------------------------------------------------ */}
      {pendientes.length > 0 ? (
        <section aria-labelledby="pendientes">
          <h3 id="pendientes" className="text-lg font-semibold tracking-tight">
            Acuerdos sin cerrar
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo primero que conviene mirar antes de la siguiente sesión.
          </p>

          <Card className="mt-3">
            <ul className="space-y-1">
              {pendientes.map((task) => (
                <li key={task.id} className="text-sm">
                  {task.title}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/* --- Proponer una cita ------------------------------------------------ */}
      <section aria-labelledby="proponer">
        <h3 id="proponer" className="text-lg font-semibold tracking-tight">
          Proponer una cita
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Queda como propuesta hasta que esta persona la confirme. No se agenda
          nada en su calendario sin que diga que sí.
        </p>

        {!proponiendo ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setProponiendo(true)}
          >
            <CalendarPlus aria-hidden="true" />
            Proponer
          </Button>
        ) : (
          <Card className="mt-3">
            <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
              <div className="flex flex-wrap gap-3">
                <div>
                  <label htmlFor="cita-fecha" className="text-sm font-medium">
                    Día
                  </label>
                  <input
                    id="cita-fecha"
                    type="date"
                    min={hoyLocal()}
                    value={fecha}
                    onChange={(event) => setFecha(event.target.value)}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  />
                </div>

                <div>
                  <label htmlFor="cita-hora" className="text-sm font-medium">
                    Hora
                  </label>
                  <input
                    id="cita-hora"
                    type="time"
                    value={horaTexto}
                    onChange={(event) => setHoraTexto(event.target.value)}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  />
                </div>

                <div>
                  <label htmlFor="cita-duracion" className="text-sm font-medium">
                    Minutos
                  </label>
                  <input
                    id="cita-duracion"
                    type="number"
                    min={15}
                    max={240}
                    step={5}
                    value={duracion}
                    onChange={(event) => setDuracion(Number(event.target.value))}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cita-motivo" className="text-sm font-medium">
                  Para qué <span className="text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="cita-motivo"
                  type="text"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                  placeholder="Seguimiento"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lo va a leer esta persona en su consultorio.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={isPending} onClick={proponer}>
                  Enviar propuesta
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setProponiendo(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        )}
      </section>

      {/* --- Recorrido -------------------------------------------------------- */}
      <section aria-labelledby="recorrido">
        <h3 id="recorrido" className="text-lg font-semibold tracking-tight">
          Recorrido
        </h3>

        <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {sessions.map((session) => (
            <li key={session.appointmentId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold first-letter:uppercase">
                      {fechaLarga.format(new Date(session.scheduledAt))}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {APPOINTMENT_STATUS_LABELS[session.status]}
                      {session.reason ? ` · ${session.reason}` : ''}
                    </p>
                  </div>

                  {canJoinRoom(session.status) ? (
                    <Link
                      href={`/consultorio/${session.appointmentId}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                      style={{ minHeight: 'var(--cian-control-height)' }}
                    >
                      <Video aria-hidden="true" className="size-4" />
                      Abrir sesión
                    </Link>
                  ) : null}
                </div>

                {session.notes.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-l-2 border-border pl-3">
                    {session.notes.map((note) => (
                      <li key={note.id} className="text-sm">
                        {/*
                          * Marcar lo privado importa: de saber si la otra parte
                          * lo lee depende cómo se escribe una nota.
                          */}
                        {note.visibility === 'privada' ? (
                          <span className="mr-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock aria-hidden="true" className="size-3" />
                            Privada
                          </span>
                        ) : null}
                        <span className="whitespace-pre-wrap">{note.content}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {session.tasks.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Acuerdos
                    </p>
                    <ul className="mt-1 space-y-1">
                      {session.tasks.map((task) => (
                        <li key={task.id} className="text-sm">
                          {task.status === 'hecha' ? '✓ ' : '· '}
                          <span
                            className={
                              task.status === 'hecha'
                                ? 'text-muted-foreground line-through'
                                : ''
                            }
                          >
                            {task.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {session.summary ? (
                  <div className="mt-3 rounded-lg bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Resumen{' '}
                      {session.summary.published
                        ? '· publicado'
                        : '· sin publicar, solo lo ves tú'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {session.summary.content}
                    </p>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
