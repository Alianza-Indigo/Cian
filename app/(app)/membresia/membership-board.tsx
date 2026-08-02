'use client';

import { useState, useTransition } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  LIMITED_RESOURCES,
  LIMITED_RESOURCE_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  formatBytes,
  type BillingCycle,
  type LimitedResource,
  type Plan,
  type PlanLimits,
  type SubscriptionStatus,
} from '@/lib/billing/types';
import { nextPlan } from '@/lib/billing/limits';
import {
  openBillingPortalAction,
  startCheckoutAction,
} from '@/lib/billing/actions';

type Subscription = {
  status: SubscriptionStatus;
  cycle: BillingCycle | null;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
};

function formatUsed(resource: LimitedResource, value: number): string {
  return resource === 'almacenamiento' ? formatBytes(value) : String(value);
}

function formatLimit(resource: LimitedResource, value: number | null): string {
  if (value === null) return 'sin límite';
  return resource === 'almacenamiento' ? formatBytes(value) : String(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function MembershipBoard({
  plan,
  limits,
  usage,
  subscription,
  paymentsReady,
  checkoutState,
}: {
  plan: Plan;
  limits: PlanLimits;
  usage: Record<LimitedResource, number>;
  subscription: Subscription | null;
  paymentsReady: boolean;
  checkoutState: string | null;
}) {
  const [cycle, setCycle] = useState<BillingCycle>('mensual');
  const [status, setStatus] = useState(
    checkoutState === 'listo'
      ? 'Pago recibido. Puede tardar unos segundos en reflejarse aquí.'
      : checkoutState === 'cancelado'
        ? 'No se cobró nada. Sigues en tu plan de siempre.'
        : '',
  );
  const [isPending, startTransition] = useTransition();

  const upgrade = nextPlan(plan);

  function go(action: () => Promise<{ ok: boolean; url?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setStatus(result.error ?? 'Algo salió mal.');
        return;
      }

      if (result.url) window.location.href = result.url;
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Un momento…' : status}
      </p>

      {/* --- Plan actual --------------------------------------------------- */}
      <Card>
        <h2 className="text-sm font-semibold">
          Plan {PLAN_LABELS[plan]}
          {subscription && subscription.status !== 'activa' ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {PLAN_DESCRIPTIONS[plan]}
        </p>

        {subscription?.status === 'pago_pendiente' ? (
          <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            Hay un cobro que no pasó. Tu plan sigue activo mientras se reintenta;
            puedes actualizar la tarjeta desde el portal de facturación.
          </p>
        ) : null}

        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
          <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
            Tu plan termina el {formatDate(subscription.currentPeriodEnd)}. Hasta
            entonces no cambia nada, y después pasas al plan gratuito sin perder
            lo que ya creaste.
          </p>
        ) : subscription?.currentPeriodEnd ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Se renueva el {formatDate(subscription.currentPeriodEnd)}
            {subscription.cycle ? ` · ${BILLING_CYCLE_LABELS[subscription.cycle]}` : ''}
          </p>
        ) : null}

        {subscription?.hasCustomer ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={isPending}
            onClick={() => go(openBillingPortalAction)}
          >
            <ExternalLink aria-hidden="true" />
            Facturas y método de pago
          </Button>
        ) : null}
      </Card>

      {/* --- Consumo -------------------------------------------------------- */}
      <section aria-labelledby="consumo">
        <h2 id="consumo" className="text-lg font-semibold tracking-tight">
          Lo que llevas usado
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Los mensajes y los documentos se reinician el día 1 de cada mes.
        </p>

        <Card className="mt-3">
          <ul className="space-y-3">
            {LIMITED_RESOURCES.map((resource) => {
              const limit = limits[resource];
              const used = usage[resource];
              const pct =
                limit === null || limit === 0
                  ? 0
                  : Math.min(100, Math.round((used / limit) * 100));

              return (
                <li key={resource}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{LIMITED_RESOURCE_LABELS[resource]}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatUsed(resource, used)} de {formatLimit(resource, limit)}
                    </span>
                  </div>

                  {limit !== null ? (
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={LIMITED_RESOURCE_LABELS[resource]}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {/* --- Mejorar de plan ------------------------------------------------ */}
      {upgrade ? (
        <section aria-labelledby="mejorar">
          <h2 id="mejorar" className="text-lg font-semibold tracking-tight">
            Plan {PLAN_LABELS[upgrade]}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {PLAN_DESCRIPTIONS[upgrade]}
          </p>

          <Card className="mt-3">
            {!paymentsReady ? (
              <p className="text-sm text-muted-foreground">
                Los pagos todavía no están configurados en esta instalación.
                Mientras tanto, el plan gratuito sigue funcionando completo.
              </p>
            ) : (
              <>
                <fieldset>
                  <legend className="text-sm font-medium">Cómo prefieres pagarlo</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BILLING_CYCLES.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={cycle === value ? 'primary' : 'outline'}
                        size="sm"
                        aria-pressed={cycle === value}
                        onClick={() => setCycle(value)}
                      >
                        {BILLING_CYCLE_LABELS[value]}
                      </Button>
                    ))}
                  </div>
                </fieldset>

                <Button
                  type="button"
                  className="mt-4"
                  disabled={isPending}
                  onClick={() =>
                    go(() =>
                      startCheckoutAction({ plan: upgrade, cycle, seats: 1 }),
                    )
                  }
                >
                  <CreditCard aria-hidden="true" />
                  Pasar al plan {PLAN_LABELS[upgrade]}
                </Button>

                <p className="mt-3 text-xs text-muted-foreground">
                  El pago se procesa en Stripe. CIAN no guarda ni ve tu tarjeta.
                </p>
              </>
            )}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
