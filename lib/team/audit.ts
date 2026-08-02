/**
 * Registro de accesos a recursos compartidos.
 *
 * Criterio del PRD: «cada acceso a un recurso compartido queda registrado».
 *
 * No se puede usar `recordAudit` tal cual porque esa función exige
 * `TenantContext`, y quien accede es un invitado que no pertenece al tenant
 * del dueño. Aquí el `tenant_id` sale de la fila del `share` —ya verificada—
 * y el `user_id` de la sesión del invitado.
 *
 * La lectura de este registro sigue siendo del dueño: `listAuditLog` exige rol
 * `admin` en su propio tenant. El invitado escribe una línea y no puede leer
 * ninguna.
 *
 * Lo que se guarda es qué se abrió y quién, nunca el contenido. Un registro de
 * accesos que copiara el recurso sería otra copia de datos de salud, y la
 * regla 3.6 lo prohíbe.
 */
import { db } from '../db/client';
import { auditLog } from '../db/schema/audit';
import type { ShareableType } from './types';

export async function recordSharedAccess(input: {
  tenantId: string;
  viewerUserId: string;
  shareId: string;
  resourceType: ShareableType;
  action: 'share.view' | 'share.download' | 'share.note';
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.viewerUserId,
      action: input.action,
      entity: 'resource_share',
      entityId: input.shareId,
      metadata: { resourceType: input.resourceType },
    });
  } catch {
    // Un fallo al registrar no puede impedir que alguien lea lo que se le
    // compartió. Queda anotado como límite conocido en NOTES.md.
  }
}
