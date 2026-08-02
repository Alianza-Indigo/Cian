/**
 * Consultorios virtuales. Fase 10.
 *
 * ## Dos avisos que valen para todo el archivo
 *
 * **`session_notes.visibility` no es una preferencia de interfaz.** El criterio
 * del PRD dice que las notas privadas del profesional *jamás* aparecen en
 * ninguna respuesta accesible al usuario. Esa garantía se sostiene en las
 * funciones de lectura del repositorio —que filtran por visibilidad **en el
 * `where`**, no al pintar— y está comprobada con una prueba dedicada. Cualquier
 * consulta nueva sobre esta tabla tiene que hacer lo mismo.
 *
 * **`recording_consent` guarda firmas con sello de tiempo del servidor.** No es
 * un booleano porque un booleano no responde «¿quién autorizó esto y cuándo?»,
 * que es exactamente la pregunta que se hace cuando algo sale mal.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { shareableTypeEnum } from './team';
import {
  APPOINTMENT_STATUSES,
  NOTE_VISIBILITIES,
  SESSION_TASK_STATUSES,
  SPECIALTIES,
  VERIFICATION_STATUSES,
} from '../../consultorio/types';
import type {
  RecordingConsent,
  Specialty,
  WhiteboardState,
} from '../../consultorio/types';

export const specialtyEnum = pgEnum('specialty', SPECIALTIES);
export const verificationStatusEnum = pgEnum(
  'verification_status',
  VERIFICATION_STATUSES,
);
export const appointmentStatusEnum = pgEnum(
  'appointment_status',
  APPOINTMENT_STATUSES,
);
export const noteVisibilityEnum = pgEnum('note_visibility', NOTE_VISIBILITIES);
export const sessionTaskStatusEnum = pgEnum(
  'session_task_status',
  SESSION_TASK_STATUSES,
);

/** Documento de respaldo del alta profesional. */
export type LicenseDoc = {
  filename: string;
  blobUrl: string;
  uploadedAt: string;
};

export const professionals = pgTable(
  'professionals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    specialties: jsonb('specialties').$type<Specialty[]>().notNull().default([]),
    licenseNumber: text('license_number'),
    licenseDocs: jsonb('license_docs').$type<LicenseDoc[]>().notNull().default([]),
    verificationStatus: verificationStatusEnum('verification_status')
      .notNull()
      .default('pendiente'),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    bio: text('bio'),
    /**
     * Aceptación de los términos, con sello de tiempo.
     *
     * El PRD pide términos «que declaren expresamente que la responsabilidad
     * profesional es del prestador» y que eso quede **implementado, no solo
     * escrito**. Sin esta fecha no se puede verificar a nadie.
     */
    termsAcceptedAt: timestamp('terms_accepted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    /** Qué versión de los términos aceptó, para cuando cambien. */
    termsVersion: text('terms_version'),
    /**
     * Enlace de Google Meet por omisión.
     *
     * La videollamada la pone Meet; CIAN controla quién ve este enlace y
     * cuándo, no lo que ocurre dentro de la reunión.
     */
    defaultMeetingUrl: text('default_meeting_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('professionals_tenant_id_idx').on(table.tenantId),
    index('professionals_status_idx').on(table.verificationStatus),
    uniqueIndex('professionals_tenant_user_uq').on(table.tenantId, table.userId),
  ],
);

export const availabilitySlots = pgTable(
  'availability_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    /** 0 es domingo, como `Date.getDay()`. */
    weekday: integer('weekday').notNull(),
    /** `HH:MM` en la zona del profesional, no en UTC. */
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    index('availability_slots_tenant_id_idx').on(table.tenantId),
    index('availability_slots_professional_idx').on(table.professionalId),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    professionalId: uuid('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    clientUserId: text('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: appointmentStatusEnum('status').notNull().default('solicitada'),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(50),
    /**
     * Identificador interno de la sesión. Se conserva aunque el video sea
     * externo: es la referencia estable de la cita en registros y auditoría.
     */
    roomId: text('room_id').notNull(),
    /** Enlace de Meet de esta cita. Si es null se usa el del profesional. */
    meetingUrl: text('meeting_url'),
    meetingProvider: text('meeting_provider').notNull().default('meet'),
    reason: text('reason'),
    /**
     * Quién pidió la cita.
     *
     * Hasta ahora solo se podía pedir desde el lado de la persona atendida, así
     * que confirmar era siempre del profesional. Con la agenda del profesional
     * eso deja de valer: si la propone él, quien tiene que decir que sí es la
     * otra parte. **Confirma quien no la pidió**, y esta columna es lo que
     * permite saber quién es.
     */
    requestedBy: text('requested_by').notNull().default('usuario'),
    /**
     * Cuándo se avisó por última vez de esta cita.
     *
     * Una sola columna para los dos avisos —la víspera y la mañana— porque el
     * barrido es diario: comparar el día local de esta fecha con el de hoy basta
     * para no repetir, y dos columnas serían dos cosas que mantener
     * sincronizadas para responder la misma pregunta.
     */
    noticeSentAt: timestamp('notice_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('appointments_tenant_id_idx').on(table.tenantId),
    // El barrido diario lee por aquí, cruzando tenants.
    index('appointments_notice_idx').on(table.status, table.scheduledAt),
    index('appointments_professional_time_idx').on(
      table.professionalId,
      table.scheduledAt,
    ),
    index('appointments_client_idx').on(table.clientUserId, table.scheduledAt),
  ],
);

/**
 * Sesiones de consultorio.
 *
 * **Desviación del esquema del PRD, y es obligada:** el PRD la llama
 * `sessions`, pero ese nombre ya lo ocupa Auth.js desde la Fase 0 para las
 * sesiones de inicio de sesión. Se llama `consult_sessions` en la base y
 * `consultSessions` en el código; todo lo demás del esquema es idéntico.
 */
export const consultSessions = pgTable(
  'consult_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    recordingUrl: text('recording_url'),
    recordingConsent: jsonb('recording_consent')
      .$type<RecordingConsent>()
      .notNull()
      .default({ signatures: [] }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sessions_tenant_id_idx').on(table.tenantId),
    uniqueIndex('sessions_appointment_uq').on(table.appointmentId),
  ],
);

export const sessionNotes = pgTable(
  'session_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultSessions.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `privada` por omisión: si alguien olvida elegir, no se publica. */
    visibility: noteVisibilityEnum('visibility').notNull().default('privada'),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('session_notes_tenant_id_idx').on(table.tenantId),
    // El índice incluye la visibilidad porque **todas** las lecturas filtran
    // por ella. Si alguna consulta no lo hace, es un error.
    index('session_notes_session_visibility_idx').on(
      table.sessionId,
      table.visibility,
    ),
  ],
);

export const sessionSummaries = pgTable(
  'session_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultSessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    /**
     * `false` por omisión, y solo el profesional lo cambia.
     *
     * Criterio del PRD: «el resumen de sesión no se publica sin aprobación del
     * profesional». Un resumen generado por un modelo sobre una consulta de
     * salud que se publicara solo sería exactamente el fallo que esta columna
     * existe para impedir.
     */
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('session_summaries_tenant_id_idx').on(table.tenantId),
    uniqueIndex('session_summaries_session_uq').on(table.sessionId),
  ],
);

export const sessionTasks = pgTable(
  'session_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultSessions.id, { onDelete: 'cascade' }),
    assignedToUserId: text('assigned_to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    status: sessionTaskStatusEnum('status').notNull().default('pendiente'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('session_tasks_tenant_id_idx').on(table.tenantId),
    index('session_tasks_assignee_idx').on(table.assignedToUserId, table.status),
  ],
);

/**
 * Recursos que una parte enseña a la otra **dentro de una sesión**.
 *
 * Cierra el pendiente de compartir documentos, planes y rutinas en consulta.
 *
 * ## Por qué no se reutilizó `resource_shares` de la Fase 8
 *
 * Aquella tabla comparte con un `support_team_member`, que es un contacto de
 * fuera identificado por su correo. El profesional de una consulta no es eso:
 * es un miembro del mismo espacio, con su rol. Para reutilizarla habría que
 * meter al profesional también en el equipo de apoyo de la persona, que es
 * darle un acceso permanente y de otra naturaleza para resolver un problema de
 * una hora.
 *
 * ## El alcance es la sesión, y por eso está aquí
 *
 * Compartir un plan en una consulta es enseñarlo en esa consulta. Se revoca
 * solo con `revoked_at`, y quien lo compartió puede retirarlo sin que eso toque
 * nada de lo que haya compartido en otra parte.
 *
 * **Siempre de lectura**, como en la Fase 8 y por la misma razón: nadie edita
 * lo que no es suyo. No hay columna de permiso porque no hay decisión que
 * tomar.
 */
export const sessionShares = pgTable(
  'session_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultSessions.id, { onDelete: 'cascade' }),
    sharedByUserId: text('shared_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resourceType: shareableTypeEnum('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    /** Copia del título: la otra parte ve algo aunque después se renombre. */
    resourceTitle: text('resource_title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('session_shares_tenant_id_idx').on(table.tenantId),
    index('session_shares_session_idx').on(table.sessionId),
    // Compartir dos veces lo mismo en la misma sesión renueva, no duplica.
    uniqueIndex('session_shares_session_resource_uq').on(
      table.sessionId,
      table.resourceType,
      table.resourceId,
    ),
  ],
);

export const whiteboardStates = pgTable(
  'whiteboard_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => consultSessions.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<WhiteboardState>().notNull().default({ strokes: [] }),
    /**
     * Sube en cada operación.
     *
     * Es lo que deja preguntar «¿cambió algo?» sin traerse la pizarra entera en
     * cada sondeo. Un entero y no `updated_at` porque dos trazos en el mismo
     * milisegundo darían la misma marca de tiempo y uno de los dos se perdería
     * para quien está mirando.
     */
    revision: integer('revision').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('whiteboard_states_tenant_id_idx').on(table.tenantId),
    uniqueIndex('whiteboard_states_session_uq').on(table.sessionId),
  ],
);

export type ProfessionalRow = typeof professionals.$inferSelect;
export type AvailabilitySlotRow = typeof availabilitySlots.$inferSelect;
export type AppointmentRow = typeof appointments.$inferSelect;
export type SessionRow = typeof consultSessions.$inferSelect;
export type SessionNoteRow = typeof sessionNotes.$inferSelect;
export type SessionSummaryRow = typeof sessionSummaries.$inferSelect;
export type SessionTaskRow = typeof sessionTasks.$inferSelect;
export type WhiteboardStateRow = typeof whiteboardStates.$inferSelect;
export type SessionShareRow = typeof sessionShares.$inferSelect;
