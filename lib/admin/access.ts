/**
 * Quién entra al panel. Fase 9.
 *
 * Hay dos niveles y no se pueden confundir:
 *
 * - **Admin de tenant** (`admin` u `owner`): ve y administra **lo suyo** —sus
 *   métricas, sus miembros, su auditoría, sus modelos—. El criterio del PRD lo
 *   dice sin ambigüedad: «un admin de tenant no puede ver datos de otro
 *   tenant». Eso ya lo garantiza la capa de repositorios, que filtra por
 *   `ctx.tenantId` en cada consulta; el panel no abre ninguna puerta nueva.
 *
 * - **Superadmin de plataforma**: además administra lo que es **global a
 *   CIAN** —los prompts del asistente, la biblioteca curada, los límites de
 *   los planes y el modelo por omisión—. Eso no pertenece a ningún tenant.
 *
 * Cómo se decide quién es superadmin vive en `./superadmin`, que es puro y por
 * eso se puede probar; este módulo toca sesión y contexto de tenant.
 */
import { auth } from '../auth';
import { requireTenantContext } from '../tenant/context';
import { assertRoleAtLeast, hasRoleAtLeast, type TenantContext } from '../tenant/guard';
import { isSuperadminEmail } from './superadmin';

export { isSuperadminEmail, superadminEmails } from './superadmin';

export type AdminContext = {
  ctx: TenantContext;
  /** Puede tocar prompts, biblioteca global, planes y modelo por omisión. */
  isSuperadmin: boolean;
  email: string | null;
  name: string | null;
};

/**
 * Contexto del panel, o `null` si esta persona no debe estar aquí.
 *
 * Devuelve `null` en vez de lanzar para que la página pueda decidir entre
 * `notFound()` —lo preferible: no confirmar que el panel existe— y un mensaje.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const [ctx, session] = await Promise.all([requireTenantContext(), auth()]);

  const email = session?.user?.email ?? null;
  const superadmin = isSuperadminEmail(email);

  // El superadmin entra aunque su rol en su propio tenant no fuera admin.
  if (!superadmin && !hasRoleAtLeast(ctx, 'admin')) return null;

  return {
    ctx,
    isSuperadmin: superadmin,
    email,
    name: session?.user?.name ?? null,
  };
}

/**
 * Para las acciones que tocan datos globales de la plataforma.
 *
 * Lanza en vez de devolver `null`: una acción de escritura que llega hasta
 * aquí sin permiso es un intento, no una navegación despistada.
 */
export async function assertSuperadmin(operation: string): Promise<AdminContext> {
  const admin = await getAdminContext();

  if (!admin?.isSuperadmin) {
    throw new Error(
      `${operation}: esta operación es de administración de la plataforma.`,
    );
  }

  return admin;
}

/** Para las acciones que tocan datos del propio tenant. */
export async function assertTenantAdmin(operation: string): Promise<AdminContext> {
  const admin = await getAdminContext();
  if (!admin) throw new Error(`${operation}: hace falta ser administrador.`);

  // El superadmin no se salta esto: sobre su propio tenant actúa como admin.
  if (!admin.isSuperadmin) assertRoleAtLeast(admin.ctx, 'admin', operation);

  return admin;
}
