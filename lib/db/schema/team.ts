/**
 * Equipo de apoyo y recursos compartidos. Fase 8.
 *
 * ## La decisión que ordena estas tres tablas
 *
 * Pertenecer al equipo de apoyo **no da acceso a nada**. `support_team_members`
 * dice quién es quién y cómo se le contacta; `resource_shares` dice qué se
 * compartió, y es la única tabla que concede lectura. Un docente aceptado en
 * el equipo sin un solo `resource_share` ve exactamente lo mismo que un
 * desconocido: nada.
 *
 * Podría haberse modelado con un rol de invitado en `tenant_members`, que es
 * más corto de escribir. Se descartó: un rol es una puerta que se abre una vez
 * y después nadie revisa. El PRD pide permisos granulares por recurso y
 * revocación con efecto inmediato, y eso solo se sostiene si cada lectura
 * consulta una fila viva.
 *
 * ## Sobre `revoked_at`
 *
 * Revocar es poner una fecha, no borrar la fila. Así queda constancia de que
 * el acceso existió, que es lo que permite responder «¿quién pudo ver esto en
 * marzo?». La comprobación de lectura exige `revoked_at IS NULL`, así que el
 * efecto es inmediato aunque la sesión del invitado siga abierta: no hay
 * ningún permiso guardado en la cookie ni en el token.
 */
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import {
  MEMBER_STATUSES,
  RELATIONSHIPS,
  SHAREABLE_TYPES,
  SHARE_PERMISSIONS,
} from '../../team/types';

export const relationshipEnum = pgEnum('team_relationship', RELATIONSHIPS);
export const teamMemberStatusEnum = pgEnum('team_member_status', MEMBER_STATUSES);
export const shareableTypeEnum = pgEnum('shareable_type', SHAREABLE_TYPES);
export const sharePermissionEnum = pgEnum('share_permission', SHARE_PERMISSIONS);

export const supportTeamMembers = pgTable(
  'support_team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Se llena al aceptar. Antes es null: se invita a un correo, no a una
     * cuenta, porque quien recibe la invitación puede no tener cuenta todavía.
     */
    memberUserId: text('member_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    email: text('email').notNull(),
    /** Cómo la nombra quien invita. Puede diferir del nombre de la cuenta. */
    displayName: text('display_name'),
    relationship: relationshipEnum('relationship').notNull().default('otro'),
    status: teamMemberStatusEnum('status').notNull().default('invitado'),
    /**
     * SHA-256 del token, nunca el token.
     *
     * Quien lea la base no debe poder aceptar invitaciones ajenas, y un
     * volcado de tabla es una de las formas más comunes de fuga.
     */
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('support_team_members_tenant_id_idx').on(table.tenantId),
    index('support_team_members_member_idx').on(table.memberUserId),
    // Una invitación viva por correo y por persona que invita.
    uniqueIndex('support_team_members_owner_email_uq').on(
      table.tenantId,
      table.ownerUserId,
      table.email,
    ),
    uniqueIndex('support_team_members_token_uq').on(table.inviteTokenHash),
  ],
);

export const resourceShares = pgTable(
  'resource_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Quién compartió. Sirve para reconstruir quién concedió qué. */
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => supportTeamMembers.id, { onDelete: 'cascade' }),
    resourceType: shareableTypeEnum('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    /** Copia del título al compartir: el invitado ve algo aunque se renombre. */
    resourceTitle: text('resource_title').notNull(),
    permission: sharePermissionEnum('permission').notNull().default('lectura'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('resource_shares_tenant_id_idx').on(table.tenantId),
    index('resource_shares_member_idx').on(table.memberId),
    index('resource_shares_resource_idx').on(table.resourceType, table.resourceId),
    uniqueIndex('resource_shares_member_resource_uq').on(
      table.memberId,
      table.resourceType,
      table.resourceId,
    ),
  ],
);

export const sharedNotes = pgTable(
  'shared_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourceShareId: uuid('resource_share_id')
      .notNull()
      .references(() => resourceShares.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('shared_notes_tenant_id_idx').on(table.tenantId),
    index('shared_notes_share_idx').on(table.resourceShareId, table.createdAt),
  ],
);

export type SupportTeamMemberRow = typeof supportTeamMembers.$inferSelect;
export type ResourceShareRow = typeof resourceShares.$inferSelect;
export type SharedNoteRow = typeof sharedNotes.$inferSelect;
