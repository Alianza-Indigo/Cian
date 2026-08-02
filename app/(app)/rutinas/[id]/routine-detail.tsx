'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  ROUTINE_TYPE_LABELS,
  formatDuration,
  totalDuration,
  type RoutineType,
} from '@/lib/plans/types';
import {
  addStepAction,
  deleteRoutineAction,
  deleteStepAction,
  reorderStepsAction,
  updateRoutineAction,
} from '@/lib/plans/routine-actions';

type Step = {
  id: string;
  title: string;
  durationSeconds: number | null;
  icon: string | null;
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

type LogEntry = { id: string; completedSteps: number; completedAt: string };

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
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
            <p className="text-sm text-muted-foreground">
              La has completado {logs.length}{' '}
              {logs.length === 1 ? 'vez' : 'veces'}. Última:{' '}
              {formatDate(logs[0]?.completedAt ?? '')}.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-md bg-primary-soft px-2 py-1 text-xs"
                  title={`${log.completedSteps} pasos`}
                >
                  {formatDate(log.completedAt)}
                </li>
              ))}
            </ul>
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
