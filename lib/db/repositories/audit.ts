import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { auditLog, type AuditLogRow } from '../schema/audit';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type TenantContext,
} from '../../tenant/guard';

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Claves que nunca deben quedar escritas en la bitacora (regla 3.6).
 * La auditoria registra QUE paso y sobre que entidad, nunca el contenido.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  'content',
  'contenido',
  'message',
  'mensaje',
  'notes',
  'notas',
  'diagnosis',
  'diagnostico',
  'symptoms',
  'sintomas',
  'medication',
  'medicacion',
  'transcript',
  'transcripcion',
  'parts',
  'body',
]);

const MAX_METADATA_VALUE_LENGTH = 200;

/**
 * Deja pasar solo valores escalares cortos y descarta cualquier clave sensible.
 * Preferimos perder detalle de auditoria antes que filtrar datos de salud.
 */
function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;

    if (typeof value === 'string') {
      if (value.length > MAX_METADATA_VALUE_LENGTH) continue;
      safe[key] = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = value;
    }
    // Objetos y arreglos se omiten a proposito: son la via facil por la que se
    // cuela contenido libre.
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

export async function recordAudit(
  ctx: TenantContext,
  entry: AuditEntry,
): Promise<void> {
  assertTenantContext(ctx, 'recordAudit');

  await db.insert(auditLog).values({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    metadata: sanitizeMetadata(entry.metadata),
  });
}

/** Consulta de auditoria del propio tenant. Solo `admin` u `owner`. */
export async function listAuditLog(
  ctx: TenantContext,
  limit = 50,
): Promise<AuditLogRow[]> {
  assertRoleAtLeast(ctx, 'admin', 'listAuditLog');

  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, ctx.tenantId))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export { sanitizeMetadata as __sanitizeMetadataForTests };
