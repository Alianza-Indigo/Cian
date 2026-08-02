'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ImagePlus, Play, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  ROUTINE_TYPE_LABELS,
  formatDuration,
  totalDuration,
  type RoutineType,
} from '@/lib/plans/types';
import { summarizeStreak } from '@/lib/plans/streaks';
import { uploadAttachments } from '@/lib/attachments/client';
import {
  addStepAction,
  deleteRoutineAction,
  deleteStepAction,
  reorderStepsAction,
  setStepImageAction,
  updateRoutineAction,
} from '@/lib/plans/routine-actions';

type Step = {
  id: string;
  title: string;
  durationSeconds: number | null;
  icon: string | null;
  imageUrl: string | null;
  note: string | null;
};

type RoutineView = {
  id: string;
  title: string;
  description: string | null;
  type: RoutineType;
  active: boolean;
  steps: Step[];
};

type LogEntry = { id: string; completedAt: string };

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function describeLastDone(daysAgo: number | null): string {
  if (daysAgo === null) return 'Todavía no la has completado ninguna vez.';
  if (daysAgo === 0) return 'La última vez fue hoy.';
  if (daysAgo === 1) return 'La última vez fue ayer.';
  return `La última vez fue hace ${daysAgo} días.`;
}

export function RoutineDetail({
  routine,
  logs,
}: {
  routine: RoutineView;
  logs: LogEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(routine.title);
  const [uploadingStep, setUploadingStep] = useState<string | null>(null);

  /*
   * La constancia se calcula aquí, en el navegador, y no en el servidor: «hoy»
   * y «ayer» dependen del huso de quien mira. En un servidor en UTC, una rutina
   * hecha a las nueve de la noche en Ciudad de México cae en el día siguiente y
   * rompería la racha sin que haya pasado nada.
   */
  const streak = useMemo(
    () =>
      summarizeStreak(
        logs.map((log) => new Date(log.completedAt)),
        new Date(),
      ),
    [logs],
  );
  const [newStep, setNewStep] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? done : (result.error ?? 'No se pudo completar.'));
      if (result.ok) router.refresh();
    });
  }

  /**
   * Mover un paso arriba o abajo.
   *
   * Criterio de aceptación: «reordenar pasos funciona por teclado, no solo
   * arrastrando». Con botones, el teclado y el lector de pantalla funcionan
   * sin trabajo extra, y en teléfono es más preciso que arrastrar.
   */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= routine.steps.length) return;

    const ordered = routine.steps.map((step) => step.id);
    const moved = ordered[index];
    const displaced = ordered[target];
    if (!moved || !displaced) return;

    ordered[index] = displaced;
    ordered[target] = moved;

    run(
      () => reorderStepsAction(routine.id, ordered),
      `Paso movido ${direction === -1 ? 'arriba' : 'abajo'}.`,
    );
  }

  /**
   * Sube una imagen y la deja pegada al paso.
   *
   * Pasa por `/api/adjuntos`, el mismo camino que los adjuntos del chat: queda
   * en almacenamiento privado y se sirve por una ruta que comprueba el tenant.
   * La foto de la cocina de una familia no es contenido público.
   */
  async function attachImage(stepId: string, file: File) {
    setUploadingStep(stepId);
    setStatus('Subiendo la imagen…');

    const upload = await uploadAttachments([file]);
    setUploadingStep(null);

    if (!upload.ok) {
      setStatus(upload.error);
      return;
    }

    const attachment = upload.attachments[0];
    if (!attachment) {
      setStatus('No pudimos subir la imagen.');
      return;
    }

    run(
      () => setStepImageAction(routine.id, stepId, attachment.url),
      'Imagen guardada.',
    );
  }

  const total = totalDuration(routine.steps);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {ROUTINE_TYPE_LABELS[routine.type]}
          {formatDuration(total) ? ` · ${formatDuration(total)} en total` : ''}
        </p>

        <label htmlFor="titulo-rutina" className="sr-only">
          Título de la rutina
        </label>
        <input
          id="titulo-rutina"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onBlur={() => {
            if (title.trim() && title !== routine.title) {
              run(
                () => updateRoutineAction(routine.id, { title }),
                'Título actualizado.',
              );
            }
          }}
          className="mt-1 w-full rounded-lg border border-transparent bg-transparent text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-border"
        />

        {routine.description ? (
          <p className="mt-2 text-muted-foreground">{routine.description}</p>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {routine.steps.length > 0 ? (
        <Link
          href={`/rutinas/${routine.id}/secuencia`}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          style={{ minHeight: 'calc(var(--cian-control-height) * 1.3)' }}
        >
          <Play aria-hidden="true" className="size-5" />
          Empezar la rutina
        </Link>
      ) : null}

      {/* --- Pasos --- */}
      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">Pasos</h2>

        {routine.steps.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Esta rutina todavía no tiene pasos.
            </p>
          </Card>
        ) : (
          <ol style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {routine.steps.map((step, index) => (
              <li key={step.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold"
                    >
                      {step.icon ?? index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      {formatDuration(step.durationSeconds) ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDuration(step.durationSeconds)}
                        </p>
                      ) : null}
                      {step.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {step.note}
                        </p>
                      ) : null}

                      {step.imageUrl ? (
                        <div className="mt-2 flex items-start gap-2">
                          {/*
                            * Sin `next/image`: la ruta es privada y pasa por
                            * `/api/adjuntos`, que comprueba el tenant en cada
                            * petición. El optimizador la volvería a pedir desde
                            * el servidor, sin sesión, y no la obtendría.
                            */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={step.imageUrl}
                            alt={`Apoyo visual de "${step.title}"`}
                            className="h-24 w-24 rounded-lg border border-border object-cover"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar la imagen de "${step.title}"`}
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () =>
                                  setStepImageAction(routine.id, step.id, null),
                                'Imagen quitada.',
                              )
                            }
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <label
                          className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                          style={{ minHeight: 'var(--cian-control-height)' }}
                        >
                          <ImagePlus aria-hidden="true" className="size-4" />
                          Agregar una imagen
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={isPending || uploadingStep !== null}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              if (file) void attachImage(step.id, file);
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Mover "${step.title}" antes`}
                        disabled={isPending || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Mover "${step.title}" después`}
                        disabled={isPending || index === routine.steps.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar "${step.title}"`}
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => deleteStepAction(routine.id, step.id),
                            'Paso eliminado.',
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}

        <Card>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = newStep.trim();
              if (!value) return;
              const minutes = Number.parseFloat(newMinutes);
              run(
                () =>
                  addStepAction(routine.id, {
                    title: value,
                    durationMinutes: Number.isFinite(minutes) ? minutes : undefined,
                  }),
                'Paso agregado.',
              );
              setNewStep('');
              setNewMinutes('');
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="nuevo-paso" className="sr-only">
                Nuevo paso
              </label>
              <input
                id="nuevo-paso"
                value={newStep}
                onChange={(event) => setNewStep(event.currentTarget.value)}
                placeholder="Agregar un paso…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="w-28">
              <label htmlFor="nuevo-paso-minutos" className="sr-only">
                Duración en minutos
              </label>
              <input
                id="nuevo-paso-minutos"
                type="number"
                min="0"
                max="60"
                value={newMinutes}
                onChange={(event) => setNewMinutes(event.currentTarget.value)}
                placeholder="min"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>
            <Button type="submit" disabled={isPending}>
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          </form>
        </Card>
      </section>

      {/* --- Constancia --- */}
      {logs.length > 0 ? (
        <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          <h2 className="text-lg font-semibold tracking-tight">Constancia</h2>
          <Card>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {streak.currentStreak}
                </p>
                <p className="text-xs text-muted-foreground">
                  {streak.currentStreak === 1 ? 'día seguido' : 'días seguidos'}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {streak.totalDays}
                </p>
                <p className="text-xs text-muted-foreground">
                  {streak.totalDays === 1 ? 'día en total' : 'días en total'}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {streak.longestStreak}
                </p>
                <p className="text-xs text-muted-foreground">
                  la racha más larga
                </p>
              </div>
            </div>

            {/*
              * La tira de cuatro semanas. Los días sin hacer se ven en gris
              * suave y no en rojo: es un registro, no una boleta.
              */}
            <ul
              className="mt-4 flex flex-wrap gap-1"
              aria-label="Últimas cuatro semanas"
            >
              {streak.recentDays.map((day) => (
                <li
                  key={day.key}
                  title={`${dayFormat.format(day.date)}: ${
                    day.done ? 'hecha' : 'sin registrar'
                  }`}
                  aria-label={`${dayFormat.format(day.date)}: ${
                    day.done ? 'hecha' : 'sin registrar'
                  }`}
                  className={
                    day.done
                      ? 'size-5 rounded-sm bg-primary'
                      : 'size-5 rounded-sm bg-muted'
                  }
                />
              ))}
            </ul>

            <p className="mt-3 text-sm text-muted-foreground">
              {describeLastDone(streak.lastDoneDaysAgo)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un día sin hacerla no borra los anteriores. Esto está para que
              veas lo que sí ha pasado, no para llevarte la cuenta de lo que no.
            </p>
          </Card>
        </section>
      ) : null}

      <Card>
        <ToggleField
          label="Rutina activa"
          hint="Las rutinas en pausa siguen guardadas, pero quedan fuera del día a día."
          checked={routine.active}
          onChange={(active) =>
            run(
              () => updateRoutineAction(routine.id, { active }),
              active ? 'Rutina activada.' : 'Rutina en pausa.',
            )
          }
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteRoutineAction(routine.id);
                  })
                }
              >
                Sí, eliminar la rutina
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 aria-hidden="true" />
              Eliminar rutina
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
