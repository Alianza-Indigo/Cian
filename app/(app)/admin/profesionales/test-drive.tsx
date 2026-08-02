'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Play, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  createTestAppointmentAction,
  deleteTestAppointmentsAction,
} from '@/lib/consultorio/practice-actions';

export type Readiness = {
  hasProfile: boolean;
  isVerified: boolean;
  hasMeetingUrl: boolean;
  availabilitySlots: number;
  ready: boolean;
};

export type TestAppointment = { id: string; scheduledAt: string };

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Probar el consultorio sin montar dos cuentas.
 *
 * ## Qué hace y qué no
 *
 * Crea una cita **contigo a los dos lados**, ya confirmada y a la hora actual
 * para que la sala esté abierta. Con eso se recorre el enlace de video, las
 * notas, los acuerdos, la pizarra y el resumen.
 *
 * Lo que **no** hace, y conviene decirlo antes de que alguien lo espere: no
 * abre la sesión de nadie más. `clientUserId` es siempre quien pulsa, y no es
 * un parámetro que se pueda cambiar. Un modo de prueba que llegue a la agenda
 * ajena deja de ser un modo de prueba.
 *
 * Lo único que no se puede ver así es la sesión desde los dos lados a la vez:
 * para eso hacen falta dos cuentas de verdad, porque el rol se resuelve de
 * quién eres.
 */
export function TestDrive({
  readiness,
  tests,
}: {
  readiness: Readiness;
  tests: TestAppointment[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const pasos = [
    {
      done: readiness.hasProfile,
      label: 'Tienes perfil profesional',
      falta: 'Rellena tu perfil en Tu consulta → Mi perfil.',
      href: '/profesional/perfil',
    },
    {
      done: readiness.isVerified,
      label: 'Tu perfil está verificado',
      falta: 'Verifícate en la lista de arriba: puedes hacerlo tú mismo.',
      href: null,
    },
    {
      done: readiness.hasMeetingUrl,
      label: 'Tienes enlace de videollamada',
      falta: 'Pon tu enlace de Google Meet en Mi perfil.',
      href: '/profesional/perfil',
    },
    {
      done: readiness.availabilitySlots > 0,
      label: 'Tienes horarios publicados',
      falta: 'Publica al menos una franja en Mi perfil.',
      href: '/profesional/perfil',
    },
  ];

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      setStatus(
        result.ok
          ? (result.message ?? 'Listo.')
          : (result.error ?? 'Algo salió mal.'),
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="probar">
      <h2 id="probar" className="text-lg font-semibold tracking-tight">
        Probar el consultorio
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Crea una cita contigo a los dos lados para recorrerlo entero sin citar a
        nadie. No abre la sesión de ninguna otra persona: la prueba siempre es
        contigo.
      </p>

      <Card className="mt-3">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {isPending ? 'Un momento…' : status}
        </p>

        <ul className="mt-2 space-y-2">
          {pasos.map((paso) => (
            <li key={paso.label} className="flex items-start gap-2 text-sm">
              {paso.done ? (
                <Check
                  aria-label="Listo"
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
              ) : (
                <X
                  aria-label="Falta"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              )}
              <span className={paso.done ? '' : 'text-muted-foreground'}>
                {paso.label}
                {!paso.done ? (
                  <>
                    {' — '}
                    {paso.href ? (
                      <Link href={paso.href} className="underline underline-offset-4">
                        {paso.falta}
                      </Link>
                    ) : (
                      paso.falta
                    )}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isPending || !readiness.hasProfile}
            onClick={() => run(createTestAppointmentAction)}
          >
            <Play aria-hidden="true" />
            Crear cita de prueba
          </Button>

          {tests.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => run(deleteTestAppointmentsAction)}
            >
              <Trash2 aria-hidden="true" />
              Borrar las pruebas
            </Button>
          ) : null}
        </div>

        {!readiness.ready && readiness.hasProfile ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Puedes crear la cita igualmente y ver la sala, las notas y la
            pizarra. Lo que no funcionará hasta completar la lista es el botón
            de la videollamada.
          </p>
        ) : null}

        {tests.length > 0 ? (
          <ul className="mt-4" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {tests.map((test) => (
              <li
                key={test.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="text-sm">
                  Prueba del {fecha.format(new Date(test.scheduledAt))}
                </span>
                <Link
                  href={`/consultorio/${test.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  Entrar a la prueba
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}
