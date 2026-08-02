/**
 * Repositorio de alimentación.
 *
 * **Leer `lib/nutrition/guardrail.ts` antes de tocar este archivo.**
 *
 * Todo texto que venga del modelo pasa por el barandal antes de guardarse. No
 * se sanea en silencio: se lanza, para que el modelo reescriba. Guardar un menú
 * al que se le borraron las cifras dejaría un texto incoherente, y guardar uno
 * con cifras incumpliría la regla 3.6.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  foodProfiles,
  mealPlans,
  shoppingLists,
  type FoodProfileRow,
  type MealPlanRow,
  type ShoppingListRow,
} from '../schema/daily-life';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import { assertSafeNutritionContent } from '../../nutrition/guardrail';
import type {
  FoodTextureNote,
  MealPlanContent,
  ShoppingItem,
} from '../../nutrition/types';

function cleanList(values: string[] | undefined, max = 100): string[] | undefined {
  if (!values) return undefined;
  return [
    ...new Set(
      values
        .map((value) => value.trim().slice(0, 200))
        .filter((value) => value.length > 0),
    ),
  ].slice(0, max);
}

export async function getFoodProfile(
  ctx: TenantContext,
): Promise<FoodProfileRow | null> {
  assertTenantContext(ctx, 'getFoodProfile');

  const [row] = await db
    .select()
    .from(foodProfiles)
    .where(
      and(
        eq(foodProfiles.tenantId, ctx.tenantId),
        eq(foodProfiles.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export type UpdateFoodProfileInput = {
  accepted?: string[];
  avoided?: string[];
  textures?: FoodTextureNote[];
  notes?: string | null;
};

export async function updateFoodProfile(
  ctx: TenantContext,
  input: UpdateFoodProfileInput,
): Promise<FoodProfileRow> {
  assertTenantContext(ctx, 'updateFoodProfile');

  // Barandal: nada de lo que se guarde puede traer cifras ni restricciones.
  assertSafeNutritionContent([
    ...(input.accepted ?? []),
    ...(input.avoided ?? []),
    ...(input.textures ?? []).map((texture) => texture.texture),
    input.notes,
  ]);

  const existing = await getFoodProfile(ctx);

  // Las listas se acumulan: lo que ya se sabía no se pierde porque una
  // conversación mencione solo una parte.
  const accepted = input.accepted
    ? cleanList([...(existing?.accepted ?? []), ...input.accepted])
    : existing?.accepted;
  const avoided = input.avoided
    ? cleanList([...(existing?.avoided ?? []), ...input.avoided])
    : existing?.avoided;

  const [row] = await db
    .insert(foodProfiles)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      accepted: accepted ?? [],
      avoided: avoided ?? [],
      textures: input.textures ?? [],
      notes: input.notes?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [foodProfiles.tenantId, foodProfiles.userId],
      set: {
        ...(accepted ? { accepted } : {}),
        ...(avoided ? { avoided } : {}),
        ...(input.textures ? { textures: input.textures } : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el perfil de alimentación.');
  return row;
}

/** Registra un alimento que la persona aceptó. Es la métrica que sí importa. */
export async function logAcceptedFood(
  ctx: TenantContext,
  food: string,
): Promise<FoodProfileRow> {
  assertTenantContext(ctx, 'logAcceptedFood');
  return updateFoodProfile(ctx, { accepted: [food] });
}

export async function savePlanForWeek(
  ctx: TenantContext,
  weekStart: string,
  plan: MealPlanContent,
  notes?: string | null,
): Promise<MealPlanRow> {
  assertTenantContext(ctx, 'savePlanForWeek');

  // Todo el contenido del menú pasa por el barandal.
  const texts = Object.values(plan).flatMap((day) =>
    day ? Object.values(day) : [],
  );
  assertSafeNutritionContent([...texts, notes]);

  const [row] = await db
    .insert(mealPlans)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      weekStart,
      plan,
      notes: notes?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [mealPlans.tenantId, mealPlans.userId, mealPlans.weekStart],
      set: { plan, notes: notes?.trim() || null },
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el menú.');
  return row;
}

export async function getPlanForWeek(
  ctx: TenantContext,
  weekStart: string,
): Promise<MealPlanRow | null> {
  assertTenantContext(ctx, 'getPlanForWeek');

  const [row] = await db
    .select()
    .from(mealPlans)
    .where(
      and(
        eq(mealPlans.tenantId, ctx.tenantId),
        eq(mealPlans.userId, ctx.userId),
        eq(mealPlans.weekStart, weekStart),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listMealPlans(
  ctx: TenantContext,
  limit = 12,
): Promise<MealPlanRow[]> {
  assertTenantContext(ctx, 'listMealPlans');

  return db
    .select()
    .from(mealPlans)
    .where(
      and(
        eq(mealPlans.tenantId, ctx.tenantId),
        eq(mealPlans.userId, ctx.userId),
      ),
    )
    .orderBy(desc(mealPlans.weekStart))
    .limit(Math.min(Math.max(limit, 1), 60));
}

export async function saveShoppingList(
  ctx: TenantContext,
  mealPlanId: string,
  items: ShoppingItem[],
): Promise<ShoppingListRow> {
  assertTenantContext(ctx, 'saveShoppingList');

  // El barandal también aquí: es la vía más fácil de colar cantidades.
  assertSafeNutritionContent(items.flatMap((item) => [item.name, item.category]));

  const cleaned = items
    .map((item) => ({
      name: item.name.trim().slice(0, 200),
      ...(item.category ? { category: item.category.trim().slice(0, 80) } : {}),
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 200);

  const [row] = await db
    .insert(shoppingLists)
    .values({ tenantId: ctx.tenantId, mealPlanId, items: cleaned })
    .returning();

  if (!row) throw new Error('No se pudo guardar la lista de compras.');
  return row;
}

export async function getShoppingListForPlan(
  ctx: TenantContext,
  mealPlanId: string,
): Promise<ShoppingListRow | null> {
  assertTenantContext(ctx, 'getShoppingListForPlan');

  const [row] = await db
    .select()
    .from(shoppingLists)
    .where(
      and(
        eq(shoppingLists.tenantId, ctx.tenantId),
        eq(shoppingLists.mealPlanId, mealPlanId),
      ),
    )
    .orderBy(desc(shoppingLists.createdAt))
    .limit(1);

  return row ?? null;
}
