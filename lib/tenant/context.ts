/**
 * Construccion del `TenantContext` del lado del servidor.
 *
 * Solo se usa en componentes de servidor, server actions y route handlers.
 * El middleware propone que tenant se quiere usar; aqui se COMPRUEBA contra la
 * base de datos. Una cookie manipulada no alcanza para entrar a otro espacio:
 * si no hay membresia activa, no hay contexto.
 */
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../auth';
import {
  findActiveMembership,
  listMembershipsForUser,
} from '../db/repositories/tenants';
import type { TenantContext } from './guard';

export const TENANT_COOKIE = 'cian_tenant';
export const TENANT_HEADER = 'x-cian-tenant';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTenantId(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Contexto de la peticion actual, o `null` si no hay sesion o la persona no
 * pertenece a ningun espacio. Memoizado por peticion con `cache` para no
 * repetir la consulta de membresia en cada componente del arbol.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const requested =
    headerStore.get(TENANT_HEADER) ?? cookieStore.get(TENANT_COOKIE)?.value;

  if (isTenantId(requested)) {
    const membership = await findActiveMembership(requested, userId);
    if (membership) {
      return {
        tenantId: membership.tenant.id,
        userId,
        role: membership.role,
      };
    }
    // Cookie que apunta a un espacio ajeno o revocado: se ignora en silencio
    // y se cae al espacio propio. Nunca se responde con datos de ese tenant.
  }

  const memberships = await listMembershipsForUser(userId);
  const first = memberships[0];

  if (!first) return null;

  return { tenantId: first.tenant.id, userId, role: first.role };
});

/**
 * Igual que `getTenantContext`, pero manda a iniciar sesion si no hay
 * contexto. Es lo que usan las paginas autenticadas.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    redirect('/login');
  }
  return ctx;
}
