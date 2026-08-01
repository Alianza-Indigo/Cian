import { and, eq, gte, sum } from 'drizzle-orm';
import { db } from '../client';
import { usageEvents, type UsageEventRow } from '../schema/usage';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

export type RecordUsageInput = {
  kind: UsageEventRow['kind'];
  model: string;
  tokensIn?: number;
  tokensOut?: number;
};

export async function recordUsage(
  ctx: TenantContext,
  input: RecordUsageInput,
): Promise<void> {
  assertTenantContext(ctx, 'recordUsage');

  await db.insert(usageEvents).values({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    kind: input.kind,
    model: input.model,
    tokensIn: Math.max(0, Math.round(input.tokensIn ?? 0)),
    tokensOut: Math.max(0, Math.round(input.tokensOut ?? 0)),
  });
}

/** Consumo acumulado del tenant desde una fecha. Métricas de la Fase 9. */
export async function sumUsageSince(
  ctx: TenantContext,
  since: Date,
): Promise<{ tokensIn: number; tokensOut: number }> {
  assertTenantContext(ctx, 'sumUsageSince');

  const [row] = await db
    .select({
      tokensIn: sum(usageEvents.tokensIn),
      tokensOut: sum(usageEvents.tokensOut),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, ctx.tenantId),
        gte(usageEvents.createdAt, since),
      ),
    );

  return {
    tokensIn: Number(row?.tokensIn ?? 0),
    tokensOut: Number(row?.tokensOut ?? 0),
  };
}
