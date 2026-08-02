/**
 * ¿Este recurso es de quien dice que es suyo?
 *
 * ## Por qué aparece ahora
 *
 * Hasta que existieron las membresías de espacio, cada persona estaba sola en
 * el suyo y `tenant_id` bastaba: dentro de un espacio no había nadie más de
 * quien proteger nada. Al poder invitar gente a un espacio, eso dejó de ser
 * cierto, y `shareResource` de la Fase 8 se quedó comprobando solo el tenant.
 *
 * El agujero que abría: en un espacio con varias personas, cualquier miembro
 * podía compartir el plan de otro con un contacto suyo de fuera. Hace falta
 * conocer el identificador del recurso, así que no es trivial de explotar, pero
 * «difícil de adivinar» no es un control de acceso.
 *
 * ## Por qué vive aquí y no en cada repositorio
 *
 * Porque lo necesitan dos sitios —el equipo de apoyo y el consultorio— y
 * duplicarlo garantiza que algún día solo uno de los dos se corrija.
 *
 * Cada tipo compartible se comprueba contra su tabla, por `id`, `tenant_id` y
 * `user_id`. Un tipo que no esté en la tabla de abajo devuelve `false`: si
 * mañana se añade un tipo compartible y nadie lo registra aquí, deja de poder
 * compartirse, que es el fallo seguro.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { plans } from '../schema/plans';
import { routines } from '../schema/routines';
import { documents } from '../schema/documents';
import { educationItems } from '../schema/library';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import type { ShareableType } from '../../team/types';

/** Tabla y columnas donde vive cada tipo compartible. */
const TABLAS = {
  plan: { tabla: plans, id: plans.id, tenant: plans.tenantId, user: plans.userId },
  rutina: {
    tabla: routines,
    id: routines.id,
    tenant: routines.tenantId,
    user: routines.userId,
  },
  documento: {
    tabla: documents,
    id: documents.id,
    tenant: documents.tenantId,
    user: documents.userId,
  },
  material_educativo: {
    tabla: educationItems,
    id: educationItems.id,
    tenant: educationItems.tenantId,
    user: educationItems.userId,
  },
} as const;

export async function ownsResource(
  ctx: TenantContext,
  resourceType: ShareableType,
  resourceId: string,
): Promise<boolean> {
  assertTenantContext(ctx, 'ownsResource');

  const entrada = TABLAS[resourceType];
  if (!entrada) return false;

  const [row] = await db
    .select({ id: entrada.id })
    .from(entrada.tabla)
    .where(
      and(
        eq(entrada.id, resourceId),
        eq(entrada.tenant, ctx.tenantId),
        eq(entrada.user, ctx.userId),
      ),
    )
    .limit(1);

  return row !== undefined;
}

/** Los tipos que este módulo sabe comprobar. Para que las pruebas lo vean. */
export const OWNERSHIP_CHECKED_TYPES = Object.keys(TABLAS) as ShareableType[];
