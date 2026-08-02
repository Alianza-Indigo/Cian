import { and, count, desc, eq, gte, isNotNull, isNull, or, sql, sum } from 'drizzle-orm';
import { db } from '../client';
import {
  modelConfigs,
  planLimits,
  subscriptions,
  type ModelConfigRow,
  type SubscriptionRow,
} from '../schema/billing';
import { tenants } from '../schema/tenants';
import { usageEvents } from '../schema/usage';
import { documents } from '../schema/documents';
import { messageAttachments } from '../schema/attachments';
import { supportTeamMembers } from '../schema/team';
import { messages } from '../schema/chat';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type TenantContext,
} from '../../tenant/guard';
import { currentPeriodStart, resolveLimits } from '../../billing/limits';
import {
  grantsAccess,
  type BillingCycle,
  type ModelPurpose,
  type Plan,
  type PlanLimits,
  type SubscriptionStatus,
} from '../../billing/types';

// --- Suscripción -------------------------------------------------------------

export async function getSubscription(
  ctx: TenantContext,
): Promise<SubscriptionRow | null> {
  assertTenantContext(ctx, 'getSubscription');

  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, ctx.tenantId))
    .limit(1);

  return row ?? null;
}

/**
 * El plan vigente de un tenant.
 *
 * Cae a `free` cuando no hay suscripción o cuando la que hay ya no da acceso.
 * Nadie se queda sin aplicación por no pagar: se queda con el plan gratuito,
 * que es un plan completo.
 */
export async function getEffectivePlan(ctx: TenantContext): Promise<Plan> {
  const subscription = await getSubscription(ctx);
  if (!subscription) return 'free';
  return grantsAccess(subscription.status) ? subscription.plan : 'free';
}

/**
 * Vuelca en la base lo que Stripe acaba de decir.
 *
 * **No lleva `TenantContext` y es deliberado**: la llama el webhook, que no
 * actúa en nombre de ninguna persona. El `tenantId` viene de los metadatos que
 * nosotros mismos pusimos al crear la sesión de pago, y la ruta que la invoca
 * ya verificó la firma HMAC de Stripe. Sin esa firma no se llega hasta aquí.
 */
export async function syncSubscriptionFromStripe(input: {
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: Plan;
  cycle: BillingCycle | null;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  const values = {
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    plan: input.plan,
    cycle: input.cycle,
    status: input.status,
    seats: Math.max(1, input.seats),
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({ tenantId: input.tenantId, ...values })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: values,
      });

    // El plan del tenant es lo que lee el resto de la aplicación; se mantiene
    // en sintonía aquí para no tener dos fuentes de verdad que se separen.
    await tx
      .update(tenants)
      .set({ plan: grantsAccess(input.status) ? input.plan : 'free' })
      .where(eq(tenants.id, input.tenantId));
  });
}

/**
 * Suscripciones que tienen algo que reconciliar contra Stripe.
 *
 * Sin `TenantContext`, como `syncSubscriptionFromStripe` y por lo mismo: la
 * llama el cron, que no actúa en nombre de nadie. Devuelve solo lo mínimo para
 * consultar Stripe —el identificador de la suscripción y qué creemos que es—,
 * nunca datos de las personas.
 */
export async function listSubscriptionsToReconcile(
  limit = 500,
): Promise<
  Array<{
    tenantId: string;
    stripeSubscriptionId: string;
    plan: Plan;
    status: SubscriptionStatus;
    seats: number;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }>
> {
  const rows = await db
    .select({
      tenantId: subscriptions.tenantId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      seats: subscriptions.seats,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .where(isNotNull(subscriptions.stripeSubscriptionId))
    .limit(Math.min(Math.max(limit, 1), 1000));

  return rows.flatMap((row) =>
    row.stripeSubscriptionId
      ? [{ ...row, stripeSubscriptionId: row.stripeSubscriptionId }]
      : [],
  );
}

/** Busca el tenant a partir de identificadores de Stripe, sin metadatos. */
export async function findTenantByStripeIds(input: {
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  const conditions = [
    input.subscriptionId
      ? eq(subscriptions.stripeSubscriptionId, input.subscriptionId)
      : null,
    input.customerId ? eq(subscriptions.stripeCustomerId, input.customerId) : null,
  ].filter((condition) => condition !== null);

  if (conditions.length === 0) return null;

  const [row] = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(or(...conditions))
    .limit(1);

  return row?.tenantId ?? null;
}

// --- Límites -----------------------------------------------------------------

export async function getPlanLimits(plan: Plan): Promise<PlanLimits> {
  const [row] = await db
    .select()
    .from(planLimits)
    .where(eq(planLimits.plan, plan))
    .limit(1);

  return resolveLimits(plan, row?.limits ?? null);
}

export async function savePlanLimits(
  ctx: TenantContext,
  plan: Plan,
  limits: Partial<PlanLimits>,
): Promise<void> {
  assertRoleAtLeast(ctx, 'owner', 'savePlanLimits');

  await db
    .insert(planLimits)
    .values({ plan, limits })
    .onConflictDoUpdate({
      target: planLimits.plan,
      set: { limits, updatedAt: new Date() },
    });
}

export type UsageSnapshot = {
  mensajes: number;
  documentos: number;
  almacenamiento: number;
  equipo_de_apoyo: number;
  periodStart: Date;
};

/**
 * Cuánto lleva consumido el tenant en el periodo en curso.
 *
 * Los mensajes y los documentos se cuentan por mes natural; el almacenamiento
 * y el equipo de apoyo son totales vivos, porque no se «reinician»: ocupan
 * mientras existan.
 */
export async function getUsageSnapshot(
  ctx: TenantContext,
  now = new Date(),
): Promise<UsageSnapshot> {
  assertTenantContext(ctx, 'getUsageSnapshot');

  const periodStart = currentPeriodStart(now);

  const [mensajes, documentos, almacenamiento, equipo] = await Promise.all([
    db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, ctx.tenantId),
          eq(messages.role, 'user'),
          gte(messages.createdAt, periodStart),
        ),
      ),
    db
      .select({ total: count() })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, ctx.tenantId),
          gte(documents.createdAt, periodStart),
        ),
      ),
    db
      .select({ total: sum(messageAttachments.sizeBytes) })
      .from(messageAttachments)
      .where(eq(messageAttachments.tenantId, ctx.tenantId)),
    db
      .select({ total: count() })
      .from(supportTeamMembers)
      .where(
        and(
          eq(supportTeamMembers.tenantId, ctx.tenantId),
          eq(supportTeamMembers.ownerUserId, ctx.userId),
        ),
      ),
  ]);

  return {
    mensajes: mensajes[0]?.total ?? 0,
    documentos: documentos[0]?.total ?? 0,
    almacenamiento: Number(almacenamiento[0]?.total ?? 0),
    equipo_de_apoyo: equipo[0]?.total ?? 0,
    periodStart,
  };
}

// --- Métricas del panel ------------------------------------------------------

export type UsageMetrics = {
  periodStart: Date;
  mensajes: number;
  documentos: number;
  tokensEntrada: number;
  tokensSalida: number;
  personasActivas: number;
  porModelo: Array<{ model: string; tokensIn: number; tokensOut: number; eventos: number }>;
};

/**
 * Métricas del tenant para el panel.
 *
 * Criterio del PRD: «las métricas de uso cuadran con `usage_events`». Por eso
 * los tokens salen exclusivamente de esa tabla y no de un contador aparte que
 * podría desincronizarse.
 */
export async function getUsageMetrics(
  ctx: TenantContext,
  now = new Date(),
): Promise<UsageMetrics> {
  assertRoleAtLeast(ctx, 'admin', 'getUsageMetrics');

  const periodStart = currentPeriodStart(now);

  const [totals, porModelo, activas, documentos, mensajes] = await Promise.all([
    db
      .select({
        tokensIn: sum(usageEvents.tokensIn),
        tokensOut: sum(usageEvents.tokensOut),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, ctx.tenantId),
          gte(usageEvents.createdAt, periodStart),
        ),
      ),
    db
      .select({
        model: usageEvents.model,
        tokensIn: sum(usageEvents.tokensIn),
        tokensOut: sum(usageEvents.tokensOut),
        eventos: count(),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, ctx.tenantId),
          gte(usageEvents.createdAt, periodStart),
        ),
      )
      .groupBy(usageEvents.model),
    db
      .select({ total: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, ctx.tenantId),
          gte(usageEvents.createdAt, periodStart),
        ),
      ),
    db
      .select({ total: count() })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, ctx.tenantId),
          gte(documents.createdAt, periodStart),
        ),
      ),
    db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, ctx.tenantId),
          gte(messages.createdAt, periodStart),
        ),
      ),
  ]);

  return {
    periodStart,
    mensajes: mensajes[0]?.total ?? 0,
    documentos: documentos[0]?.total ?? 0,
    tokensEntrada: Number(totals[0]?.tokensIn ?? 0),
    tokensSalida: Number(totals[0]?.tokensOut ?? 0),
    personasActivas: activas[0]?.total ?? 0,
    porModelo: porModelo.map((row) => ({
      model: row.model,
      tokensIn: Number(row.tokensIn ?? 0),
      tokensOut: Number(row.tokensOut ?? 0),
      eventos: row.eventos,
    })),
  };
}

// --- Configuración de modelos ------------------------------------------------

/**
 * El modelo configurado para un propósito.
 *
 * Primero mira la fila del tenant; si no hay, la global; si tampoco, devuelve
 * `null` y quien llama usa el valor del entorno. Ese orden es lo que permite
 * cambiar el modelo de toda la plataforma desde el panel y afinarlo para un
 * tenant concreto sin tocar a los demás.
 */
export async function getModelConfig(
  tenantId: string | null,
  purpose: ModelPurpose,
): Promise<ModelConfigRow | null> {
  const rows = await db
    .select()
    .from(modelConfigs)
    .where(
      and(
        eq(modelConfigs.purpose, purpose),
        eq(modelConfigs.active, true),
        tenantId
          ? or(eq(modelConfigs.tenantId, tenantId), isNull(modelConfigs.tenantId))
          : isNull(modelConfigs.tenantId),
      ),
    );

  // El del tenant gana sobre el global.
  return rows.find((row) => row.tenantId !== null) ?? rows[0] ?? null;
}

export async function listModelConfigs(
  ctx: TenantContext,
): Promise<ModelConfigRow[]> {
  assertRoleAtLeast(ctx, 'admin', 'listModelConfigs');

  return db
    .select()
    .from(modelConfigs)
    .where(
      or(eq(modelConfigs.tenantId, ctx.tenantId), isNull(modelConfigs.tenantId)),
    )
    .orderBy(desc(modelConfigs.updatedAt));
}

export async function saveModelConfig(
  ctx: TenantContext,
  input: {
    purpose: ModelPurpose;
    provider: string;
    model: string;
    params?: Record<string, unknown>;
    active?: boolean;
    /** `true` guarda el valor global de la plataforma. Solo superadmin. */
    global?: boolean;
  },
): Promise<ModelConfigRow> {
  assertRoleAtLeast(ctx, 'admin', 'saveModelConfig');

  const tenantId = input.global ? null : ctx.tenantId;

  const values = {
    provider: input.provider.trim().slice(0, 60),
    model: input.model.trim().slice(0, 120),
    params: input.params ?? {},
    active: input.active ?? true,
    updatedAt: new Date(),
  };

  if (values.model.length === 0) {
    throw new Error('Falta el identificador del modelo.');
  }

  const [row] = await db
    .insert(modelConfigs)
    .values({ tenantId, purpose: input.purpose, ...values })
    .onConflictDoUpdate({
      target: tenantId
        ? [modelConfigs.tenantId, modelConfigs.purpose]
        : [modelConfigs.purpose],
      ...(tenantId ? {} : { targetWhere: isNull(modelConfigs.tenantId) }),
      set: values,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar la configuración del modelo.');
  return row;
}

export async function deleteModelConfig(
  ctx: TenantContext,
  configId: string,
): Promise<void> {
  assertRoleAtLeast(ctx, 'admin', 'deleteModelConfig');

  // Solo las propias: la global la borra el superadmin desde su propia vista.
  await db
    .delete(modelConfigs)
    .where(
      and(eq(modelConfigs.id, configId), eq(modelConfigs.tenantId, ctx.tenantId)),
    );
}
