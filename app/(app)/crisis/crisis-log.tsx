'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Check,
  LifeBuoy,
  NotebookPen,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CRISIS_OUTCOMES,
  CRISIS_OUTCOME_LABELS,
  CRISIS_SEVERITIES,
  CRISIS_SEVERITY_HINTS,
  CRISIS_SEVERITY_LABELS,
  type CrisisAction,
  type CrisisOutcome,
  type CrisisSeverity,
  type CrisisStep,
} from '@/lib/crisis/types';
import { EMERGENCY_NUMBER } from '@/lib/crisis/escalation';
import {
  MIN_EPISODES_FOR_PATTERNS,
  TIME_BAND_LABELS,
  WEEKDAY_LABELS,
  summarizeCrisisPatterns,
  type Tally,
  type TimeBand,
} from '@/lib/crisis/patterns';
import {
  deleteCrisisEventAction,
  deleteCrisisProtocolAction,
  logCrisisEpisodeAction,
  setProtocolActiveAction,
} from '@/lib/crisis/actions';

type EventItem = {
  id: string;
  severity: CrisisSeverity;
  summary: string | null;
  triggers: string[];
  actionsTaken: CrisisAction[];
  outcome: CrisisOutcome | null;
  escalated: boolean;
  postPlanId: string | null;
  startedAt: string;
};

type ProtocolItem = {
  id: string;
  title: string;
  steps: CrisisStep[];
  active: boolean;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Una fila de conteo. Sin porcentajes: con pocos datos engañan. */
function TallyList({ items, empty }: { items: Tally[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="space-y-1">
      {items.slice(0, 6).map((item) => (
        <li key={item.label} className="flex items-baseline justify-between gap-3 text-sm">
          <span>{item.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {item.count} {item.count === 1 ? 'vez' : 'veces'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CrisisLog({
  events,
  protocols,
}: {
  events: EventItem[];
  protocols: ProtocolItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [logging, setLogging] = useState(false);
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<CrisisSeverity>('moderada');
  const [triggers, setTriggers] = useState('');
  const [outcome, setOutcome] = useState<CrisisOutcome | ''>('');

  /*
   * Los patrones se calculan aquí, en el navegador, y no en el servidor.
   *
   * No es un capricho de arquitectura: las franjas horarias y los días de la
   * semana dependen de la zona horaria de quien mira, y el servidor vive en
   * UTC. Decirle a una familia de Ciudad de México que sus crisis pasan «de
   * madrugada» cuando pasan por la tarde no es un dato con ruido, es un dato
   * falso.
   */
  const patterns = useMemo(
    () =>
      summarizeCrisisPatterns(
        events.map((event) => ({
          occurredAt: new Date(event.startedAt),
          severity: event.severity,
          triggers: event.triggers,
          actionsTaken: event.actionsTaken,
          outcome: event.outcome,
          escalated: event.escalated,
        })),
      ),
    [events],
  );

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? done : result.error ?? 'Algo salió mal.');
      if (result.ok) router.refresh();
    });
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Trabajando…' : status}
      </p>

      {/*
        Lo primero de la pantalla, y a propósito.

        La bitácora se mira en frío; este botón se busca en caliente, con una
        mano y sin leer. Si estuviera al final, debajo de los patrones, no
        serviría para lo único que tiene que servir.
      */}
      <Card>
        <h2 className="text-sm font-semibold">¿Está pasando ahora?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CIAN te acompaña paso a paso con lo que ya sabe que le funciona a esta
          persona. No hace falta que expliques nada primero.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/?crisis=1"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ minHeight: '3.25rem' }}
          >
            <LifeBuoy aria-hidden="true" className="size-5" />
            Necesito ayuda ahora
          </Link>

          <a
            href={`tel:${EMERGENCY_NUMBER}`}
            className="inline-flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-5 text-base font-medium text-foreground hover:bg-danger/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ minHeight: '3.25rem' }}
          >
            Llamar al {EMERGENCY_NUMBER}
          </a>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Si hay riesgo de vida, lesión grave o una emergencia médica, llama al{' '}
          {EMERGENCY_NUMBER}. CIAN no es un servicio de urgencias.
        </p>
      </Card>

      {/* --- Registrar a mano ---------------------------------------------- */}
      {logging ? (
        <Card>
          <h2 className="text-sm font-semibold">Registrar un episodio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para anotarlo sin tener que contarlo en una conversación.
          </p>

          <div className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            <div>
              <label htmlFor="crisis-resumen" className="text-sm font-medium">
                Qué pasó
              </label>
              <textarea
                id="crisis-resumen"
                rows={4}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                placeholder="Llegó de la escuela y no paraba de llorar. Nos fuimos al cuarto y bajamos la luz."
              />
            </div>

            <div>
              <label htmlFor="crisis-intensidad" className="text-sm font-medium">
                Intensidad
              </label>
              <select
                id="crisis-intensidad"
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as CrisisSeverity)
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                {CRISIS_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {CRISIS_SEVERITY_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {CRISIS_SEVERITY_HINTS[severity]}
              </p>
            </div>

            <div>
              <label htmlFor="crisis-disparadores" className="text-sm font-medium">
                Qué lo disparó{' '}
                <span className="text-muted-foreground">(separado por comas)</span>
              </label>
              <input
                id="crisis-disparadores"
                type="text"
                value={triggers}
                onChange={(event) => setTriggers(event.target.value)}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="ruido del comedor, cambio de rutina"
              />
            </div>

            <div>
              <label htmlFor="crisis-final" className="text-sm font-medium">
                Cómo terminó
              </label>
              <select
                id="crisis-final"
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as CrisisOutcome | '')
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                <option value="">Prefiero no anotarlo</option>
                {CRISIS_OUTCOMES.filter((value) => value !== 'se_derivo').map(
                  (value) => (
                    <option key={value} value={value}>
                      {CRISIS_OUTCOME_LABELS[value]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={isPending || summary.trim().length === 0}
                onClick={() =>
                  run(async () => {
                    const result = await logCrisisEpisodeAction({
                      summary,
                      severity,
                      triggers: triggers
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                      actionsTaken: [],
                      outcome: outcome || null,
                    });

                    if (result.ok) {
                      setSummary('');
                      setTriggers('');
                      setOutcome('');
                      setLogging(false);
                    }
                    return result;
                  }, 'Episodio registrado.')
                }
              >
                Guardar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLogging(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => setLogging(true)}
        >
          <NotebookPen aria-hidden="true" />
          Registrar un episodio
        </Button>
      )}

      {/* --- Patrones ------------------------------------------------------ */}
      <section aria-labelledby="patrones">
        <h2 id="patrones" className="text-lg font-semibold tracking-tight">
          Patrones
        </h2>

        {!patterns.enoughData ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              {patterns.total === 0
                ? 'Todavía no hay episodios registrados. Después de una crisis, CIAN te ofrece registrarla en la conversación.'
                : `Con ${patterns.total} ${
                    patterns.total === 1 ? 'episodio' : 'episodios'
                  } todavía no se pueden ver patrones. A partir de ${MIN_EPISODES_FOR_PATTERNS} empiezan a significar algo; antes, cualquier coincidencia parece una regla.`}
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
              <h3 className="text-sm font-medium">Qué las dispara</h3>
              <div className="mt-2">
                <TallyList
                  items={patterns.triggers}
                  empty="No se han anotado disparadores."
                />
              </div>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ThumbsUp aria-hidden="true" className="size-4 text-muted-foreground" />
                Qué ha servido
              </h3>
              <div className="mt-2">
                <TallyList items={patterns.helped} empty="Todavía nada anotado." />
              </div>
            </Card>

            <Card>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ThumbsDown aria-hidden="true" className="size-4 text-muted-foreground" />
                Qué no ha servido
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vale tanto como lo anterior: ahorra intentarlo de nuevo.
              </p>
              <div className="mt-2">
                <TallyList items={patterns.didNotHelp} empty="Todavía nada anotado." />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">A qué hora</h3>
              <div className="mt-2">
                <TallyList
                  items={patterns.byTimeBand.map((entry) => ({
                    ...entry,
                    label: TIME_BAND_LABELS[entry.label as TimeBand] ?? entry.label,
                  }))}
                  empty="Sin datos."
                />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">Qué día</h3>
              <div className="mt-2">
                <TallyList
                  items={patterns.byWeekday.map((entry) => ({
                    ...entry,
                    label: WEEKDAY_LABELS[Number(entry.label)] ?? entry.label,
                  }))}
                  empty="Sin datos."
                />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium">Cómo terminaron</h3>
              <div className="mt-2">
                <TallyList
                  items={patterns.byOutcome.map((entry) => ({
                    ...entry,
                    label:
                      CRISIS_OUTCOME_LABELS[entry.label as CrisisOutcome] ??
                      entry.label,
                  }))}
                  empty="Sin registrar."
                />
              </div>
            </Card>
          </div>
        )}
      </section>

      {/* --- Protocolos ---------------------------------------------------- */}
      {protocols.length > 0 ? (
        <section aria-labelledby="protocolos">
          <h2 id="protocolos" className="text-lg font-semibold tracking-tight">
            Protocolos guardados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Los pasos que ya funcionaron, listos para la próxima vez. CIAN los
            consulta al acompañar una crisis.
          </p>

          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {protocols.map((protocol) => (
              <li key={protocol.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">{protocol.title}</h3>
                      {!protocol.active ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Guardado, pero fuera de uso.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={
                          protocol.active
                            ? `Dejar de usar "${protocol.title}"`
                            : `Volver a usar "${protocol.title}"`
                        }
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () =>
                              setProtocolActiveAction(protocol.id, !protocol.active),
                            protocol.active
                              ? 'Protocolo fuera de uso.'
                              : 'Protocolo activo otra vez.',
                          )
                        }
                      >
                        {protocol.active ? (
                          <X aria-hidden="true" />
                        ) : (
                          <Check aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Borrar "${protocol.title}"`}
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => deleteCrisisProtocolAction(protocol.id),
                            'Protocolo borrado.',
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <ol className="mt-3 space-y-1">
                    {protocol.steps.map((step, index) => (
                      <li key={`${protocol.id}-${index}`} className="text-sm">
                        <span className="text-muted-foreground">{index + 1}.</span>{' '}
                        {step.title}
                        {step.detail ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {step.detail}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Bitácora ------------------------------------------------------ */}
      <section aria-labelledby="bitacora">
        <h2 id="bitacora" className="text-lg font-semibold tracking-tight">
          Bitácora
        </h2>

        {events.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              Aquí van a aparecer los episodios que registres. Nada se guarda sin
              que tú lo decidas.
            </p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {events.map((event) => (
              <li key={event.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(event.startedAt)}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {event.escalated
                          ? 'Derivación a servicios de emergencia'
                          : `Crisis ${CRISIS_SEVERITY_LABELS[
                              event.severity
                            ].toLowerCase()}`}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar el episodio del ${formatDate(event.startedAt)}`}
                      disabled={isPending}
                      onClick={() =>
                        run(
                          () => deleteCrisisEventAction(event.id),
                          'Episodio borrado.',
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>

                  {event.escalated ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      CIAN se detuvo y dirigió a servicios de emergencia. No se
                      guardó lo que escribiste, solo que ocurrió.
                    </p>
                  ) : null}

                  {event.summary ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{event.summary}</p>
                  ) : null}

                  {event.triggers.length > 0 ? (
                    <p className="mt-2 text-sm">
                      <span className="text-muted-foreground">Disparadores: </span>
                      {event.triggers.join(', ')}
                    </p>
                  ) : null}

                  {event.actionsTaken.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {event.actionsTaken.map((entry, index) => (
                        <li
                          key={`${event.id}-accion-${index}`}
                          className="flex items-start gap-2 text-sm"
                        >
                          {entry.helped === true ? (
                            <ThumbsUp
                              aria-label="Sirvió"
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                            />
                          ) : entry.helped === false ? (
                            <ThumbsDown
                              aria-label="No sirvió"
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="mt-0.5 text-muted-foreground"
                            >
                              •
                            </span>
                          )}
                          <span>{entry.action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {event.outcome ? (
                      <span className="text-xs text-muted-foreground">
                        {CRISIS_OUTCOME_LABELS[event.outcome]}
                      </span>
                    ) : null}

                    {event.postPlanId ? (
                      <Link
                        href={`/planes/${event.postPlanId}`}
                        className="inline-flex items-center gap-1.5 text-xs underline decoration-muted-foreground underline-offset-2"
                      >
                        <Target aria-hidden="true" className="size-3" />
                        Plan posterior
                      </Link>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
