/**
 * Conversaciones y mensajes.
 *
 * Los mensajes se guardan como `parts jsonb` en el formato del AI SDK, no como
 * texto plano. Es lo que permitirá adjuntos (Fase 4) y llamadas a tools sin
 * migrar la tabla: una parte más en el arreglo, no una columna nueva.
 */
import {
  index,
  jsonb,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';

export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    status: conversationStatusEnum('status').notNull().default('active'),
    lastMessageAt: timestamp('last_message_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('conversations_tenant_id_idx').on(table.tenantId),
    // El orden del historial en la barra lateral sale de este índice.
    index('conversations_tenant_user_recent_idx').on(
      table.tenantId,
      table.userId,
      table.lastMessageAt,
    ),
  ],
);

/**
 * Partes de un mensaje en el formato del AI SDK. Se guarda tal cual llega para
 * no perder información al reconstruir la conversación en el cliente.
 */
export type MessagePart = {
  type: string;
  [key: string]: unknown;
};

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    parts: jsonb('parts').$type<MessagePart[]>().notNull(),
    model: text('model'),
    tokenInput: integer('token_input'),
    tokenOutput: integer('token_output'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('messages_tenant_id_idx').on(table.tenantId),
    index('messages_conversation_idx').on(
      table.tenantId,
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MessageRole = MessageRow['role'];
