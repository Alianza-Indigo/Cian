/**
 * Invitaciones a un espacio. Cierra el hueco de las Fases 0, 9 y 10.
 *
 * ## Qué faltaba, y por qué importaba tanto
 *
 * Hasta ahora la **única** línea de todo el código que creaba una membresía
 * estaba en `lib/auth/provisioning.ts`: al entrar por primera vez, cada persona
 * recibía su espacio personal como `owner`. No había forma de meter a nadie más
 * en un espacio.
 *
 * Eso dejaba tres cosas rotas a la vez, y no se veía porque cada una parecía
 * una limitación aislada:
 *
 * - **El consultorio de la Fase 10** solo listaba profesionales del propio
 *   espacio, así que un médico que se registraba caía en el suyo y nadie podía
 *   reservarle.
 * - **Los asientos de organización de la Fase 9** estaban definidos, cobrados
 *   en el checkout y sin aplicar, porque no había dónde aplicarlos.
 * - **El selector de espacios de la Fase 0** no tenía sentido: nadie pertenecía
 *   a más de uno.
 *
 * ## No se confunde con el equipo de apoyo
 *
 * `support_team_members` (Fase 8) comparte **recursos sueltos** con gente de
 * fuera, y pertenecer a él no da acceso a nada por sí solo. Esto es lo
 * contrario: entrar a un espacio es trabajar dentro de él con un rol. Son dos
 * mecanismos distintos a propósito y conviene no fundirlos: mezclar «te
 * comparto este plan» con «trabajas en mi organización» acaba dando a alguien
 * más de lo que se le quiso dar.
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, memberRoleEnum } from './tenants';
import { users } from './auth';

export const tenantInvitations = pgTable(
  'tenant_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Quién invitó. Para poder reconstruir quién dejó entrar a quién. */
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    /**
     * Rol que tendrá al aceptar.
     *
     * `owner` no se puede invitar: se transfiere desde dentro. Una invitación
     * por correo que conceda la propiedad del espacio es demasiado poder
     * viajando en un enlace.
     */
    role: memberRoleEnum('role').notNull().default('member'),
    /** SHA-256 del token, nunca el token. Igual que en la Fase 8. */
    inviteTokenHash: text('invite_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('tenant_invitations_tenant_idx').on(table.tenantId),
    uniqueIndex('tenant_invitations_token_uq').on(table.inviteTokenHash),
    // Una invitación viva por correo y espacio: reinvitar renueva, no duplica.
    uniqueIndex('tenant_invitations_tenant_email_uq').on(
      table.tenantId,
      table.email,
    ),
  ],
);

export type TenantInvitationRow = typeof tenantInvitations.$inferSelect;
