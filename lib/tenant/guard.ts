/**
 * Guardian de aislamiento multi-tenant. Regla 3.1 del PRD.
 *
 * Este modulo es deliberadamente puro: no importa la base de datos, ni Next,
 * ni la sesion. Asi puede ejecutarse en pruebas sin infraestructura y no hay
 * forma de que una funcion de repositorio lo esquive por accidente.
 *
 * Contrato: toda funcion de repositorio recibe un `TenantContext` como primer
 * parametro y lo valida ANTES de tocar la base. Si una funcion no puede armar
 * su `where` sin `tenantId`, esta mal escrita.
 */

export const MEMBER_ROLES = ['owner', 'admin', 'professional', 'member'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: MemberRole;
};

/**
 * Se lanza cuando una operacion intenta tocar datos sin un contexto de tenant
 * valido. Nunca se debe atrapar y continuar: significa que hay un error de
 * programacion, no una condicion esperable en tiempo de ejecucion.
 */
export class TenantScopeError extends Error {
  override readonly name = 'TenantScopeError';

  constructor(message: string) {
    super(message);
  }
}

/** Se lanza cuando el contexto es valido pero el rol no alcanza. */
export class TenantPermissionError extends Error {
  override readonly name = 'TenantPermissionError';

  constructor(message: string) {
    super(message);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valida el contexto y lo devuelve estrechado. Lanza `TenantScopeError` si
 * falta `tenantId`, falta `userId`, el rol es desconocido o el `tenantId` no
 * tiene forma de UUID.
 */
export function assertTenantContext(
  ctx: unknown,
  operation = 'operacion de repositorio',
): asserts ctx is TenantContext {
  if (ctx === null || typeof ctx !== 'object') {
    throw new TenantScopeError(
      `${operation}: se requiere un TenantContext y se recibio ${ctx === null ? 'null' : typeof ctx}.`,
    );
  }

  const candidate = ctx as Partial<TenantContext>;

  if (!isNonEmptyString(candidate.tenantId)) {
    throw new TenantScopeError(
      `${operation}: falta tenantId en el TenantContext. Ninguna consulta puede ejecutarse sin ambito de tenant.`,
    );
  }

  if (!UUID_PATTERN.test(candidate.tenantId)) {
    throw new TenantScopeError(
      `${operation}: tenantId no tiene formato de UUID valido.`,
    );
  }

  if (!isNonEmptyString(candidate.userId)) {
    throw new TenantScopeError(
      `${operation}: falta userId en el TenantContext.`,
    );
  }

  if (!MEMBER_ROLES.includes(candidate.role as MemberRole)) {
    throw new TenantScopeError(
      `${operation}: rol invalido en el TenantContext (${String(candidate.role)}).`,
    );
  }
}

/**
 * Igual que `assertTenantContext`, pero devuelve el contexto para poder
 * encadenarlo: `const { tenantId } = requireTenantContext(ctx, 'listPrompts')`.
 */
export function requireTenantContext(
  ctx: unknown,
  operation?: string,
): TenantContext {
  assertTenantContext(ctx, operation);
  return ctx;
}

const ROLE_RANK: Record<MemberRole, number> = {
  member: 0,
  professional: 1,
  admin: 2,
  owner: 3,
};

/** Verdadero si el rol del contexto es al menos `minimum`. */
export function hasRoleAtLeast(ctx: TenantContext, minimum: MemberRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minimum];
}

/** Lanza `TenantPermissionError` si el rol del contexto no alcanza. */
export function assertRoleAtLeast(
  ctx: TenantContext,
  minimum: MemberRole,
  operation = 'operacion',
): void {
  assertTenantContext(ctx, operation);
  if (!hasRoleAtLeast(ctx, minimum)) {
    throw new TenantPermissionError(
      `${operation}: se requiere rol ${minimum} o superior; el usuario tiene ${ctx.role}.`,
    );
  }
}
