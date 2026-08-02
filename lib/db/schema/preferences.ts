/**
 * Preferencias de accesibilidad y presentacion.
 *
 * Esta tabla es la FUENTE DE VERDAD (regla 2, prohibiciones). La cookie
 * `cian_prefs` es unicamente un espejo para pintar el primer render sin
 * parpadeo; si cookie y base de datos discrepan, gana la base de datos.
 *
 * Los valores admitidos viven en `lib/preferences/types.ts` para que el
 * navegador pueda usarlos sin arrastrar el driver de base de datos.
 */
import {
  index,
  integer,
  pgEnum,
  pgTable,
  boolean,
  timestamp,
  uniqueIndex,
  uuid,
  text,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import {
  DENSITIES,
  DETAIL_LEVELS,
  SPEECH_RATE_DEFAULT,
  TEXT_SCALE_DEFAULT,
  THEMES,
} from '../../preferences/types';

/** Densidad de informacion: compacta / comoda / amplia. */
export const densityEnum = pgEnum('preference_density', DENSITIES);

export const themeEnum = pgEnum('preference_theme', THEMES);

/** Cuanto detalle da el asistente. Lo consume el orquestador en Fase 1. */
export const detailLevelEnum = pgEnum('preference_detail_level', DETAIL_LEVELS);

export const userPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    density: densityEnum('density').notNull().default('comfortable'),
    textScale: integer('text_scale').notNull().default(TEXT_SCALE_DEFAULT),
    reducedMotion: boolean('reduced_motion').notNull().default(false),
    theme: themeEnum('theme').notNull().default('system'),
    detailLevel: detailLevelEnum('detail_level').notNull().default('balanced'),
    speechRate: integer('speech_rate').notNull().default(SPEECH_RATE_DEFAULT),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_preferences_tenant_id_idx').on(table.tenantId),
    uniqueIndex('user_preferences_tenant_user_uq').on(table.tenantId, table.userId),
  ],
);

export type UserPreferencesRow = typeof userPreferences.$inferSelect;
