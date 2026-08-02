'use client';

import type { UIMessage } from 'ai';
import { LifeBuoy, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EMERGENCY_NUMBER } from '@/lib/crisis/escalation';
import type { CrisisStep } from '@/lib/crisis/types';

/**
 * Modo simplificado de crisis. Punto 2 del alcance de la Fase 7.
 *
 * > Modo de interfaz simplificado al activarse: menos texto, pasos cortos,
 * > botones grandes, sin distracciones.
 *
 * Y el criterio que lo define de verdad:
 *
 * > El modo simplificado es usable con una sola mano en teléfono.
 *
 * De ahí salen todas las decisiones de este archivo. Quien lo usa tiene el
 * teléfono en una mano y a una persona en crisis en la otra, así que:
 *
 * - **Un paso a la vez.** El paso actual se ve grande; los demás esperan
 *   debajo, atenuados. Leer una lista de seis cosas en ese momento no ocurre.
 * - **Todo lo pulsable abajo.** El pulgar de una mano alcanza el tercio
 *   inferior de la pantalla y poco más. Arriba solo hay texto.
 * - **Objetivos táctiles grandes**, muy por encima del mínimo, porque la mano
 *   que sostiene el teléfono está temblando.
 * - **Respuestas rápidas en vez de teclado.** Escribir con una mano en plena
 *   crisis no es realista; los tres estados que importan —mejoró, sigue
 *   igual, empeoró— son botones.
 * - **Sin animaciones, sin colores de alarma.** La pantalla no debe sumarse
 *   al ruido.
 *
 * El 911 está siempre visible, no escondido detrás de un paso. Si la
 * situación cambia mientras se acompaña, el número tiene que estar ahí.
 */

type ActivationOutput = {
  modoCrisis?: boolean;
  crisisEventId?: string;
  pasos?: CrisisStep[];
};

export type CrisisState = {
  steps: CrisisStep[];
  crisisEventId: string | null;
  /** Índice del mensaje que encendió el modo, para no repetir su texto. */
  messageIndex: number;
};

/**
 * Lee el estado de crisis de la conversación.
 *
 * El AI SDK expone cada llamada a tool como una parte `tool-<nombre>`. Se toma
 * la activación más reciente que ya tenga salida: mientras la tool está en
 * curso todavía no hay pasos que mostrar.
 */
export function crisisStateOf(messages: UIMessage[]): CrisisState | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    for (const part of message.parts) {
      if (part.type !== 'tool-activateCrisisSupport') continue;

      const output = (part as { output?: unknown }).output;
      if (!output || typeof output !== 'object') continue;

      const candidate = output as ActivationOutput;
      if (!candidate.modoCrisis || !Array.isArray(candidate.pasos)) continue;

      const steps = candidate.pasos.filter(
        (step): step is CrisisStep =>
          Boolean(step) && typeof step.title === 'string',
      );
      if (steps.length === 0) continue;

      return {
        steps,
        crisisEventId: candidate.crisisEventId ?? null,
        messageIndex: index,
      };
    }
  }

  return null;
}

const QUICK_REPLIES = [
  { label: 'Ya está más tranquilo', text: 'Ya está más tranquilo.' },
  { label: 'Sigue igual', text: 'Sigue igual, no cambia nada.' },
  { label: 'Se puso peor', text: 'Se puso peor.' },
  { label: 'Ya pasó, quiero registrarlo', text: 'Ya pasó. Quiero registrar lo que ocurrió.' },
];

type CrisisModeProps = {
  state: CrisisState;
  /** Texto de la última respuesta, si llegó después de encender el modo. */
  latestText: string | null;
  busy: boolean;
  onQuickReply: (text: string) => void;
  onExit: () => void;
};

export function CrisisMode({
  state,
  latestText,
  busy,
  onQuickReply,
  onExit,
}: CrisisModeProps) {
  const [first, ...rest] = state.steps;

  return (
    <section
      aria-label="Modo crisis"
      className="flex flex-1 flex-col"
      style={{ gap: 'var(--cian-section-gap)' }}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LifeBuoy aria-hidden="true" className="size-4 shrink-0" />
        <span>Modo crisis. Solo lo necesario.</span>
      </div>

      {/* El paso de ahora. Grande, solo, sin nada que compita con él. */}
      {first ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ahora
          </p>
          <p className="mt-2 text-xl font-semibold leading-snug">{first.title}</p>
          {first.detail ? (
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {first.detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <ol className="space-y-2" aria-label="Después">
          {rest.map((step, index) => (
            <li
              key={`${step.title}-${index}`}
              className="flex gap-3 rounded-lg border border-border/60 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="text-base font-semibold text-muted-foreground"
              >
                {index + 2}
              </span>
              <div>
                <p className="text-base leading-snug">{step.title}</p>
                {step.detail ? (
                  <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {latestText ? (
        <div
          role="log"
          aria-live="polite"
          aria-label="Respuesta de CIAN"
          className="rounded-lg border border-border bg-card px-4 py-3 text-base leading-relaxed"
        >
          <p className="whitespace-pre-wrap break-words">{latestText}</p>
        </div>
      ) : null}

      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          CIAN está pensando…
        </p>
      ) : null}

      {/* Todo lo pulsable, abajo, al alcance del pulgar. */}
      <div className="mt-auto" style={{ display: 'grid', gap: '0.5rem' }}>
        {QUICK_REPLIES.map((reply) => (
          <Button
            key={reply.label}
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start"
            style={{ minHeight: '3.25rem' }}
            disabled={busy}
            onClick={() => onQuickReply(reply.text)}
          >
            {reply.label}
          </Button>
        ))}

        <a
          href={`tel:${EMERGENCY_NUMBER}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 text-base font-medium text-foreground hover:bg-danger/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ minHeight: '3.25rem' }}
        >
          <Phone aria-hidden="true" className="size-4 shrink-0" />
          Llamar al {EMERGENCY_NUMBER}
        </a>

        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={onExit}
        >
          Salir del modo simplificado
        </Button>
      </div>
    </section>
  );
}
