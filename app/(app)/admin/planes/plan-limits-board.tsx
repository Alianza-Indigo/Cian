'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  LIMITED_RESOURCES,
  LIMITED_RESOURCE_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_LABELS,
  formatBytes,
  type Plan,
  type PlanLimits,
} from '@/lib/billing/types';
import { savePlanLimitsAction } from '@/lib/billing/actions';

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Límites por plan, editables sin desplegar.
 *
 * Dos cosas que la pantalla tiene que dejar claras, porque el modelo de datos
 * las distingue y la interfaz las confundiría con facilidad:
 *
 * - **Vacío significa «sin límite»**, y no cero. Un cero real bloquearía el
 *   recurso por completo, que casi nunca es lo que alguien quiere escribir.
 * - **El almacenamiento se escribe en megabytes** y se guarda en bytes. Pedir
 *   bytes en un formulario es pedir errores de tres ceros.
 */
export function PlanLimitsBoard({
  plans,
}: {
  plans: Array<{ plan: Plan; limits: PlanLimits }>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      plans.map(({ plan, limits }) => [
        plan,
        {
          mensajes: limits.mensajes === null ? '' : String(limits.mensajes),
          documentos: limits.documentos === null ? '' : String(limits.documentos),
          almacenamiento:
            limits.almacenamiento === null
              ? ''
              : String(Math.round(limits.almacenamiento / (1024 * 1024))),
          equipo_de_apoyo:
            limits.equipo_de_apoyo === null ? '' : String(limits.equipo_de_apoyo),
          asientos: String(limits.asientos),
        },
      ]),
    ),
  );

  function set(plan: Plan, field: string, value: string) {
    setDrafts({ ...drafts, [plan]: { ...drafts[plan], [field]: value } });
  }

  function save(plan: Plan) {
    const draft = drafts[plan] ?? {};

    const toLimit = (value: string | undefined): number | null => {
      const trimmed = (value ?? '').trim();
      if (trimmed.length === 0) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
    };

    const megabytes = toLimit(draft.almacenamiento);

    startTransition(async () => {
      const result = await savePlanLimitsAction({
        plan,
        limits: {
          mensajes: toLimit(draft.mensajes),
          documentos: toLimit(draft.documentos),
          almacenamiento: megabytes === null ? null : megabytes * 1024 * 1024,
          equipo_de_apoyo: toLimit(draft.equipo_de_apoyo),
          asientos: Math.max(1, toLimit(draft.asientos) ?? 1),
        },
      });

      setStatus(result.ok ? result.message ?? 'Guardado.' : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <p className="text-sm text-muted-foreground">
        Deja un campo vacío para que ese recurso no tenga límite. El
        almacenamiento se escribe en megabytes.
      </p>

      <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        {plans.map(({ plan, limits }) => (
          <li key={plan}>
            <Card>
              <h2 className="text-sm font-semibold">Plan {PLAN_LABELS[plan]}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {PLAN_DESCRIPTIONS[plan]}
              </p>

              <div
                className="mt-3"
                style={{
                  display: 'grid',
                  gap: 'var(--cian-gap)',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
                }}
              >
                {LIMITED_RESOURCES.map((resource) => (
                  <div key={resource}>
                    <label
                      htmlFor={`${plan}-${resource}`}
                      className="text-xs text-muted-foreground"
                    >
                      {LIMITED_RESOURCE_LABELS[resource]}
                      {resource === 'almacenamiento' ? ' (MB)' : ''}
                    </label>
                    <input
                      id={`${plan}-${resource}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={drafts[plan]?.[resource] ?? ''}
                      onChange={(event) => set(plan, resource, event.target.value)}
                      className={`mt-1 ${inputClass}`}
                      style={{ minHeight: 'var(--cian-control-height)' }}
                      placeholder="sin límite"
                    />
                  </div>
                ))}

                <div>
                  <label
                    htmlFor={`${plan}-asientos`}
                    className="text-xs text-muted-foreground"
                  >
                    Asientos
                  </label>
                  <input
                    id={`${plan}-asientos`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={drafts[plan]?.asientos ?? '1'}
                    onChange={(event) => set(plan, 'asientos', event.target.value)}
                    className={`mt-1 ${inputClass}`}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() => save(plan)}
                >
                  <Save aria-hidden="true" />
                  Guardar
                </Button>
                <p className="text-xs text-muted-foreground">
                  Ahora:{' '}
                  {limits.almacenamiento === null
                    ? 'almacenamiento sin límite'
                    : formatBytes(limits.almacenamiento)}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
