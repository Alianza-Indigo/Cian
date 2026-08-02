'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  EVENT_OUTCOME_LABELS,
  SENSITIVITY_LABELS,
  SENSITIVITY_LEVELS,
  SENSORY_DOMAINS,
  SENSORY_DOMAIN_HINTS,
  SENSORY_DOMAIN_LABELS,
  type EventOutcome,
  type SensitivityLevel,
  type SensoryDomain,
} from '@/lib/sensory/types';
import {
  MIN_EVENTS_FOR_PATTERNS,
  summarizeSensoryPatterns,
  type Tally,
} from '@/lib/sensory/patterns';
import {
  addToProfileAction,
  addToolAction,
  deleteToolAction,
  removeFromProfileAction,
  setSensitivityAction,
  setToolEffectiveAction,
} from '@/lib/sensory/actions';

type Profile = {
  domain: SensoryDomain;
  sensitivity: SensitivityLevel;
  triggers: string[];
  strategies: string[];
};

type ToolItem = {
  id: string;
  name: string;
  domain: SensoryDomain | null;
  effective: boolean | null;
};

type EventItem = {
  id: string;
  domain: SensoryDomain;
  intensity: number | null;
  context: string | null;
  strategyUsed: string | null;
  outcome: EventOutcome | null;
  occurredAt: string;
};

/** Una fila de conteo. Sin porcentajes: con pocos datos engañan. */
function TallyList({ items, empty }: { items: Tally[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="space-y-1">
      {items.slice(0, 6).map((item) => (
        <li
          key={item.label}
          className="flex items-baseline justify-between gap-3 text-sm"
        >
          <span>{item.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {item.count} {item.count === 1 ? 'vez' : 'veces'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export function SensoryBoard({
  profiles,
  tools,
  events,
}: {
  profiles: Profile[];
  tools: ToolItem[];
  events: EventItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newTool, setNewTool] = useState('');

  /*
   * Los patrones se calculan aquí, en el navegador, y no en el servidor. Las
   * franjas horarias y los días de la semana dependen de la zona horaria de
   * quien mira, y el servidor vive en UTC: decirle a alguien de Ciudad de
   * México que el ruido le pesa «de madrugada» cuando le pesa por la tarde no
   * es un dato con ruido, es un dato falso.
   */
  const patterns = useMemo(
    () =>
      summarizeSensoryPatterns(
        events.map((event) => ({
          occurredAt: new Date(event.occurredAt),
          domain: event.domain,
          intensity: event.intensity,
          strategyUsed: event.strategyUsed,
          outcome: event.outcome,
        })),
      ),
    [events],
  );

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? done : (result.error ?? 'No se pudo completar.'));
      if (result.ok) router.refresh();
    });
  }

  const byDomain = new Map(profiles.map((profile) => [profile.domain, profile]));

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">Perfil por sentido</h2>

        {SENSORY_DOMAINS.map((domain) => {
          const profile = byDomain.get(domain);
          const triggerKey = `${domain}:triggers`;
          const strategyKey = `${domain}:strategies`;

          return (
            <Card key={domain}>
              <h3 className="text-sm font-semibold">
                {SENSORY_DOMAIN_LABELS[domain]}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {SENSORY_DOMAIN_HINTS[domain]}
              </p>

              <div className="mt-3">
                <label
                  htmlFor={`sensibilidad-${domain}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  ¿Cómo le afecta?
                </label>
                <select
                  id={`sensibilidad-${domain}`}
                  value={profile?.sensitivity ?? 'sin_dificultad'}
                  disabled={isPending}
                  onChange={(event) =>
                    run(
                      () =>
                        setSensitivityAction(domain, event.target.value),
                      'Perfil actualizado.',
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                >
                  {SENSITIVITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {SENSITIVITY_LABELS[level]}
                    </option>
                  ))}
                </select>
              </div>

              {(
                [
                  ['triggers', 'Qué lo dispara', triggerKey] as const,
                  ['strategies', 'Qué ayuda', strategyKey] as const,
                ]
              ).map(([field, label, key]) => (
                <div key={field} className="mt-4">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    {label}
                  </h4>

                  {(profile?.[field] ?? []).length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {(profile?.[field] ?? []).map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                        >
                          {item}
                          <button
                            type="button"
                            aria-label={`Quitar "${item}"`}
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () => removeFromProfileAction(domain, field, item),
                                'Se quitó.',
                              )
                            }
                            className="rounded p-0.5 hover:bg-background"
                          >
                            <X aria-hidden="true" className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = drafts[key]?.trim();
                      if (!value) return;
                      run(
                        () => addToProfileAction(domain, field, value),
                        'Se agregó.',
                      );
                      setDrafts((current) => ({ ...current, [key]: '' }));
                    }}
                  >
                    <label htmlFor={`campo-${key}`} className="sr-only">
                      {label}
                    </label>
                    <input
                      id={`campo-${key}`}
                      value={drafts[key] ?? ''}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [key]: event.currentTarget.value,
                        }))
                      }
                      placeholder={
                        field === 'triggers'
                          ? 'Ej.: el ruido del comedor'
                          : 'Ej.: audífonos en el recreo'
                      }
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                    />
                    <Button type="submit" variant="outline" size="sm" disabled={isPending}>
                      <Plus aria-hidden="true" />
                    </Button>
                  </form>
                </div>
              ))}
            </Card>
          );
        })}
      </section>

      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">
          Herramientas y ambientes seguros
        </h2>

        <Card>
          {tools.length > 0 ? (
            <ul className="space-y-2">
              {tools.map((tool) => (
                <li key={tool.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {tool.name}
                    {tool.domain ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {SENSORY_DOMAIN_LABELS[tool.domain]}
                      </span>
                    ) : null}
                  </span>

                  <Button
                    type="button"
                    variant={tool.effective === true ? 'primary' : 'ghost'}
                    size="icon"
                    aria-label={`Marcar que "${tool.name}" sí funciona`}
                    aria-pressed={tool.effective === true}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          setToolEffectiveAction(
                            tool.id,
                            tool.effective === true ? null : true,
                          ),
                        'Guardado.',
                      )
                    }
                  >
                    <ThumbsUp aria-hidden="true" />
                  </Button>

                  <Button
                    type="button"
                    variant={tool.effective === false ? 'danger' : 'ghost'}
                    size="icon"
                    aria-label={`Marcar que "${tool.name}" no funciona`}
                    aria-pressed={tool.effective === false}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () =>
                          setToolEffectiveAction(
                            tool.id,
                            tool.effective === false ? null : false,
                          ),
                        'Guardado.',
                      )
                    }
                  >
                    <ThumbsDown aria-hidden="true" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar "${tool.name}"`}
                    disabled={isPending}
                    onClick={() =>
                      run(() => deleteToolAction(tool.id), 'Eliminada.')
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay herramientas guardadas. Audífonos, una cobija con
              peso, un rincón tranquilo: lo que sirva.
            </p>
          )}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = newTool.trim();
              if (!value) return;
              run(() => addToolAction(value), 'Herramienta guardada.');
              setNewTool('');
            }}
          >
            <label htmlFor="nueva-herramienta" className="sr-only">
              Nueva herramienta
            </label>
            <input
              id="nueva-herramienta"
              value={newTool}
              onChange={(event) => setNewTool(event.currentTarget.value)}
              placeholder="Agregar una herramienta…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <Button type="submit" disabled={isPending}>
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          </form>
        </Card>
      </section>

      {/* --- Patrones ------------------------------------------------------- */}
      <section aria-labelledby="patrones-sensoriales">
        <h2
          id="patrones-sensoriales"
          className="text-lg font-semibold tracking-tight"
        >
          Lo que se repite
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuentas, no conclusiones. CIAN no interpreta por qué pasa lo que pasa;
          eso lo pones tú, o quien te acompaña.
        </p>

        {!patterns.enoughData ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              {patterns.total === 0
                ? 'Todavía no hay momentos registrados. Puedes anotarlos arriba o contárselos a CIAN en una conversación.'
                : `Con ${patterns.total} ${
                    patterns.total === 1 ? 'momento' : 'momentos'
                  } todavía no se pueden ver patrones. A partir de ${MIN_EVENTS_FOR_PATTERNS} empiezan a significar algo; antes, cualquier coincidencia parece una regla.`}
            </p>
          </Card>
        ) : (
          <div
            className="mt-3"
            style={{
              display: 'grid',
              gap: 'var(--cian-gap)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
            }}
          >
            <Card>
              <h3 className="text-sm font-medium">Qué sentido aparece más</h3>
              <div className="mt-2">
                <TallyList items={patterns.byDomain} empty="Sin datos." />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">A qué hora</h3>
              <div className="mt-2">
                <TallyList items={patterns.byTimeBand} empty="Sin datos." />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">Qué día</h3>
              <div className="mt-2">
                <TallyList items={patterns.byWeekday} empty="Sin datos." />
              </div>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ThumbsUp
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Qué ha ayudado
              </h3>
              <div className="mt-2">
                <TallyList
                  items={patterns.helped}
                  empty="Todavía no se ha anotado ninguna estrategia con resultado."
                />
              </div>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ThumbsDown
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Qué no ha ayudado
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vale tanto como lo anterior: ahorra intentarlo de nuevo.
              </p>
              <div className="mt-2">
                <TallyList items={patterns.didNotHelp} empty="Nada anotado." />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">Cómo se vivió</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Cuántas veces cada nivel. Sin promedios: la intensidad es cómo
                se vivió algo, no una calificación que haya que bajar.
              </p>
              <div className="mt-2">
                <TallyList items={patterns.byIntensity} empty="Sin datos." />
              </div>
            </Card>
          </div>
        )}
      </section>

      {events.length > 0 ? (
        <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          <h2 className="text-lg font-semibold tracking-tight">
            Momentos registrados
          </h2>
          <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {/* Los últimos quince. El resto sigue contando en los patrones. */}
            {events.slice(0, 15).map((event) => (
              <li key={event.id}>
                <Card>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(event.occurredAt)} ·{' '}
                    {SENSORY_DOMAIN_LABELS[event.domain]}
                    {event.intensity ? ` · intensidad ${event.intensity} de 5` : ''}
                    {event.outcome
                      ? ` · ${EVENT_OUTCOME_LABELS[event.outcome]}`
                      : ''}
                  </p>
                  {event.context ? (
                    <p className="mt-1 text-sm">{event.context}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          También puedes contarle todo esto a CIAN en una conversación. No hace
          falta llenar esta pantalla.
        </p>
      </Card>
    </div>
  );
}
