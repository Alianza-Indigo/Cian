'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/plans/types';
import { logCompletionAction } from '@/lib/plans/routine-actions';

type Step = {
  id: string;
  title: string;
  durationSeconds: number | null;
  icon: string | null;
  note: string | null;
};

/**
 * Secuencia visual: un paso a la vez, en grande.
 *
 * Decisiones deliberadas, todas de la regla 3.7:
 *   - **El avance es manual.** No hay temporizador que corra solo ni paso que
 *     cambie sin que alguien lo pida. Un cambio inesperado en pantalla, para
 *     quien está en medio de una rutina, es una interrupción.
 *   - **La duración se muestra como referencia**, nunca como cuenta regresiva:
 *     un cronómetro convierte la rutina en una carrera.
 *   - **Botones grandes y separados**, alcanzables con una sola mano en
 *     teléfono, y todo operable por teclado.
 */
export function SequenceRunner({
  routineId,
  title,
  steps,
}: {
  routineId: string;
  title: string;
  steps: Step[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Al cambiar de paso se mueve el foco al encabezado: quien navega con
  // teclado o lector de pantalla aterriza en el paso nuevo, no al principio.
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  function advance(markDone: boolean) {
    if (!step) return;

    const nextCompleted = markDone ? [...completed, step.id] : completed;
    setCompleted(nextCompleted);

    if (isLast) {
      setFinished(true);
      startTransition(async () => {
        await logCompletionAction(routineId, nextCompleted);
        router.refresh();
      });
      return;
    }

    setIndex((current) => current + 1);
  }

  if (finished) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
        <div
          aria-hidden="true"
          className="flex size-20 items-center justify-center rounded-full bg-primary-soft text-3xl"
        >
          <Check className="size-10 text-primary" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Rutina terminada
        </h1>
        <p className="mt-2 text-muted-foreground">
          Completaste {completed.length} de {steps.length}{' '}
          {steps.length === 1 ? 'paso' : 'pasos'}.
        </p>
        <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
          {isPending ? 'Guardando…' : 'Queda registrado en la constancia.'}
        </p>

        <Link
          href={`/rutinas/${routineId}`}
          className="mt-8 inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-base font-medium"
          style={{ minHeight: 'calc(var(--cian-control-height) * 1.2)' }}
        >
          <ArrowLeft aria-hidden="true" />
          Volver a la rutina
        </Link>
      </div>
    );
  }

  if (!step) return null;

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Paso {index + 1} de {steps.length}
        </p>
        <Link
          href={`/rutinas/${routineId}`}
          aria-label="Salir de la rutina"
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <X aria-hidden="true" className="size-4" />
          Salir
        </Link>
      </div>

      {/* Barra de avance, sin animación: solo posición. */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        aria-label="Avance de la rutina"
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        {step.icon ? (
          <span aria-hidden="true" className="text-6xl">
            {step.icon}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-20 items-center justify-center rounded-2xl bg-primary-soft text-3xl font-semibold"
          >
            {index + 1}
          </span>
        )}

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 max-w-lg text-3xl font-semibold tracking-tight outline-none"
        >
          {step.title}
        </h1>

        {formatDuration(step.durationSeconds) ? (
          <p className="mt-3 text-base text-muted-foreground">
            Suele tomar {formatDuration(step.durationSeconds)}
          </p>
        ) : null}

        {step.note ? (
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            {step.note}
          </p>
        ) : null}
      </div>

      {/* Los controles viven abajo, al alcance del pulgar. */}
      <div className="sticky bottom-0 bg-background pb-4 pt-2">
        <Button
          type="button"
          size="lg"
          className="w-full text-base"
          style={{ minHeight: 'calc(var(--cian-control-height) * 1.4)' }}
          onClick={() => advance(true)}
        >
          <Check aria-hidden="true" className="size-5" />
          {isLast ? 'Listo, terminar' : 'Hecho, siguiente'}
        </Button>

        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            <ArrowLeft aria-hidden="true" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => advance(false)}
          >
            <SkipForward aria-hidden="true" />
            Saltar
          </Button>
        </div>
      </div>
    </div>
  );
}
