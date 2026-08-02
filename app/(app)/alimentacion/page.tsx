import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getFoodProfile,
  getPlanForWeek,
  getShoppingListForPlan,
} from '@/lib/db/repositories/nutrition';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  WEEKDAYS,
  WEEKDAY_LABELS,
  weekStartOf,
} from '@/lib/nutrition/types';
import { Card } from '@/components/ui/card';
import { FoodProfileEditor } from './food-profile-editor';

export const metadata: Metadata = { title: 'Alimentación' };
export const dynamic = 'force-dynamic';

export default async function AlimentacionPage() {
  const ctx = await requireTenantContext();
  const week = weekStartOf(new Date());

  const [profile, plan] = await Promise.all([
    getFoodProfile(ctx),
    getPlanForWeek(ctx, week),
  ]);

  const shoppingList = plan ? await getShoppingListForPlan(ctx, plan.id) : null;

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alimentación</h1>
        <p className="mt-2 text-muted-foreground">
          Qué come, qué le cuesta y cómo organizar la semana con lo que ya
          acepta.
        </p>
      </div>

      {/*
        El descargo es parte del producto, no un adorno legal: este módulo
        colinda con territorio clínico y tiene que decirlo donde se ve.
      */}
      <Card className="border-accent/40 bg-accent-soft/40">
        <p className="text-sm">
          CIAN no da indicaciones de nutrición. No maneja cantidades, calorías
          ni metas de peso, y no sustituye a una persona profesional de la
          nutrición. Lo que sí hace es acompañar: organizar menús con lo que ya
          funciona, cuidar el entorno de la comida y respetar los tiempos de
          cada quien.
        </p>
      </Card>

      <FoodProfileEditor
        accepted={profile?.accepted ?? []}
        avoided={profile?.avoided ?? []}
        notes={profile?.notes ?? null}
      />

      <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        <h2 className="text-lg font-semibold tracking-tight">
          Menú de esta semana
        </h2>

        {plan ? (
          <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {WEEKDAYS.map((day) => {
              const meals = plan.plan[day];
              if (!meals || Object.keys(meals).length === 0) return null;

              return (
                <Card key={day}>
                  <h3 className="text-sm font-semibold">{WEEKDAY_LABELS[day]}</h3>
                  <dl className="mt-2 space-y-1.5">
                    {MEAL_SLOTS.map((slot) => {
                      const description = meals[slot];
                      if (!description) return null;
                      return (
                        <div key={slot} className="text-sm">
                          <dt className="text-xs text-muted-foreground">
                            {MEAL_SLOT_LABELS[slot]}
                          </dt>
                          <dd>{description}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </Card>
              );
            })}

            {plan.notes ? (
              <Card>
                <h3 className="text-sm font-semibold">Notas de la semana</h3>
                <p className="mt-1 text-sm whitespace-pre-wrap">{plan.notes}</p>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Todavía no hay menú para esta semana. En una conversación puedes
              pedir «organiza la alimentación de esta semana».
            </p>
          </Card>
        )}
      </section>

      {shoppingList && shoppingList.items.length > 0 ? (
        <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          <h2 className="text-lg font-semibold tracking-tight">
            Lista de compras
          </h2>
          <Card>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {shoppingList.items.map((item) => (
                <li key={item.name} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true" className="mt-1.5 text-muted-foreground">
                    •
                  </span>
                  <span>
                    {item.name}
                    {item.category ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {item.category}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Sin cantidades a propósito: quien compra sabe cuánto necesita su
              familia.
            </p>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
