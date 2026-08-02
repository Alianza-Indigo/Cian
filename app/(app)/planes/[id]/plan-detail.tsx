'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileDown, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OptionGroup } from '@/components/ui/option-group';
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_LABELS,
  PLAN_STATUSES,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  type ObjectiveStatus,
  type PlanStatus,
  type PlanType,
} from '@/lib/plans/types';
import {
  addObjectiveAction,
  addStrategyAction,
  deleteObjectiveAction,
  deletePlanAction,
  deleteStrategyAction,
  exportPlanAction,
  logProgressAction,
  updateObjectiveAction,
  updatePlanAction,
} from '@/lib/plans/actions';

type Strategy = { id: string; content: string };
type Objective = {
  id: string;
  title: string;
  status: ObjectiveStatus;
  strategies: Strategy[];
};

type PlanView = {
  id: string;
  title: string;
  description: string | null;
  type: PlanType;
  status: PlanStatus;
  objectives: Objective[];
};

type ProgressEntry = {
  id: string;
  objectiveId: string | null;
  note: string | null;
  rating: number | null;
  loggedAt: string;
};

const STATUS_OPTIONS = PLAN_STATUSES.map((value) => ({
  value,
  label: PLAN_STATUS_LABELS[value],
}));

const OBJECTIVE_STATUS_OPTIONS = OBJECTIVE_STATUSES.map((value) => ({
  value,
  label: OBJECTIVE_STATUS_LABELS[value],
}));

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function PlanDetail({
  plan,
  progress,
}: {
  plan: PlanView;
  progress: ProgressEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(plan.title);
  const [newObjective, setNewObjective] = useState('');
  const [strategyDrafts, setStrategyDrafts] = useState<Record<string, string>>({});
  const [progressNote, setProgressNote] = useState('');
  const [progressObjective, setProgressObjective] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? done : (result.error ?? 'No se pudo completar.'));
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {PLAN_TYPE_LABELS[plan.type]}
        </p>

        <label htmlFor="titulo-plan" className="sr-only">
          Título del plan
        </label>
        <input
          id="titulo-plan"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onBlur={() => {
            if (title.trim() && title !== plan.title) {
              run(
                () => updatePlanAction(plan.id, { title }),
                'Título actualizado.',
              );
            }
          }}
          className="mt-1 w-full rounded-lg border border-transparent bg-transparent text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-border"
        />

        {plan.description ? (
          <p className="mt-2 text-muted-foreground">{plan.description}</p>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <Card>
        <OptionGroup
          legend="Estado del plan"
          name="plan-status"
          value={plan.status}
          options={STATUS_OPTIONS}
          onChange={(value) =>
            run(
              () => updatePlanAction(plan.id, { status: value }),
              'Estado actualizado.',
            )
          }
        />
      </Card>

      {/* --- Objetivos --- */}
      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">Objetivos</h2>

        {plan.objectives.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Este plan todavía no tiene objetivos.
            </p>
          </Card>
        ) : null}

        {plan.objectives.map((objective, index) => (
          <Card key={objective.id}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {index + 1}. {objective.title}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Eliminar objetivo "${objective.title}"`}
                disabled={isPending}
                onClick={() =>
                  run(
                    () => deleteObjectiveAction(plan.id, objective.id),
                    'Objetivo eliminado.',
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-3">
              <OptionGroup
                legend="Cómo va este objetivo"
                name={`obj-${objective.id}`}
                value={objective.status}
                options={OBJECTIVE_STATUS_OPTIONS}
                onChange={(value) =>
                  run(
                    () =>
                      updateObjectiveAction(plan.id, objective.id, {
                        status: value,
                      }),
                    'Objetivo actualizado.',
                  )
                }
              />
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-medium text-muted-foreground">
                Estrategias
              </h4>
              <ul className="mt-2 space-y-1">
                {objective.strategies.map((strategy) => (
                  <li key={strategy.id} className="flex items-start gap-2 text-sm">
                    <span aria-hidden="true" className="mt-1.5 text-muted-foreground">
                      •
                    </span>
                    <span className="min-w-0 flex-1">{strategy.content}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar estrategia"
                      disabled={isPending}
                      onClick={() =>
                        run(
                          () => deleteStrategyAction(plan.id, strategy.id),
                          'Estrategia eliminada.',
                        )
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>

              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const content = strategyDrafts[objective.id]?.trim();
                  if (!content) return;
                  run(
                    () => addStrategyAction(plan.id, objective.id, content),
                    'Estrategia agregada.',
                  );
                  setStrategyDrafts((drafts) => ({ ...drafts, [objective.id]: '' }));
                }}
              >
                <label htmlFor={`estrategia-${objective.id}`} className="sr-only">
                  Nueva estrategia
                </label>
                <input
                  id={`estrategia-${objective.id}`}
                  value={strategyDrafts[objective.id] ?? ''}
                  onChange={(event) =>
                    setStrategyDrafts((drafts) => ({
                      ...drafts,
                      [objective.id]: event.currentTarget.value,
                    }))
                  }
                  placeholder="Agregar una estrategia…"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                />
                <Button type="submit" variant="outline" size="sm" disabled={isPending}>
                  <Plus aria-hidden="true" />
                  Agregar
                </Button>
              </form>
            </div>
          </Card>
        ))}

        <Card>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = newObjective.trim();
              if (!value) return;
              run(
                () => addObjectiveAction(plan.id, value),
                'Objetivo agregado.',
              );
              setNewObjective('');
            }}
          >
            <label htmlFor="nuevo-objetivo" className="sr-only">
              Nuevo objetivo
            </label>
            <input
              id="nuevo-objetivo"
              value={newObjective}
              onChange={(event) => setNewObjective(event.currentTarget.value)}
              placeholder="Agregar un objetivo…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <Button type="submit" disabled={isPending}>
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          </form>
        </Card>
      </section>

      {/* --- Seguimiento --- */}
      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">Seguimiento</h2>

        <Card>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const note = progressNote.trim();
              if (!note) return;
              run(
                () =>
                  logProgressAction(plan.id, {
                    note,
                    objectiveId: progressObjective || undefined,
                  }),
                'Avance registrado.',
              );
              setProgressNote('');
            }}
          >
            <label htmlFor="avance" className="text-sm font-medium">
              ¿Cómo va?
            </label>
            <textarea
              id="avance"
              rows={3}
              value={progressNote}
              onChange={(event) => setProgressNote(event.currentTarget.value)}
              placeholder="Qué se intentó, qué funcionó y qué no."
              className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none"
            />

            {plan.objectives.length > 0 ? (
              <div className="mt-2">
                <label htmlFor="avance-objetivo" className="text-xs text-muted-foreground">
                  ¿De qué objetivo? (opcional)
                </label>
                <select
                  id="avance-objetivo"
                  value={progressObjective}
                  onChange={(event) => setProgressObjective(event.currentTarget.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="">Todo el plan</option>
                  {plan.objectives.map((objective) => (
                    <option key={objective.id} value={objective.id}>
                      {objective.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <Button type="submit" className="mt-3" disabled={isPending}>
              <Check aria-hidden="true" />
              Registrar
            </Button>
          </form>
        </Card>

        {progress.length > 0 ? (
          <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {progress.map((entry) => {
              const objective = plan.objectives.find(
                (candidate) => candidate.id === entry.objectiveId,
              );
              return (
                <li key={entry.id}>
                  <Card>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.loggedAt)}
                      {objective ? ` · ${objective.title}` : ''}
                    </p>
                    {entry.note ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{entry.note}</p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* --- Acciones --- */}
      <Card>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await exportPlanAction(plan.id);
                setStatus(
                  result.ok
                    ? 'Plan exportado. Lo encuentras en Documentos.'
                    : (result.error ?? 'No se pudo exportar.'),
                );
                if (result.ok) router.refresh();
              })
            }
          >
            <FileDown aria-hidden="true" />
            Exportar a PDF
          </Button>

          {confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deletePlanAction(plan.id);
                  })
                }
              >
                Sí, eliminar el plan
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
              Eliminar plan
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
