/**
 * Criterio de aceptacion de Fase 0:
 * "Existe un test que verifica que las funciones de repositorio fallan si no
 *  reciben tenantId".
 *
 * Cada funcion de repositorio que toca datos de personas se ejecuta aqui con
 * contextos invalidos. Ninguna llega a la base: si alguna lo hiciera, la
 * prueba fallaria por falta de conexion en lugar de por TenantScopeError, y
 * eso tambien delataria el problema.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TenantScopeError,
  assertTenantContext,
  assertRoleAtLeast,
  hasRoleAtLeast,
  requireTenantContext,
  TenantPermissionError,
  type TenantContext,
} from '../lib/tenant/guard';

import {
  getPreferences,
  getEffectivePreferences,
  upsertPreferences,
} from '../lib/db/repositories/preferences';
import {
  getCurrentTenant,
  listTenantMembers,
  renameTenant,
} from '../lib/db/repositories/tenants';
import {
  listAuditLog,
  recordAudit,
  __sanitizeMetadataForTests as sanitizeMetadata,
} from '../lib/db/repositories/audit';
import {
  activatePromptVersion,
  listPromptVersions,
} from '../lib/db/repositories/prompts';
import {
  countMessages,
  deleteConversation,
  ensureConversation,
  getConversation,
  listConversations,
  renameConversation,
  setAutoTitle,
  setConversationStatus,
  touchConversation,
} from '../lib/db/repositories/conversations';
import {
  appendMessage,
  deleteFromMessage,
  deleteMessages,
  getMessage,
  listMessages,
} from '../lib/db/repositories/messages';
import {
  deleteAllMemories,
  deleteMemory,
  listMemories,
  saveMemory,
  searchMemories,
  updateMemory,
} from '../lib/db/repositories/memories';
import { recordUsage, sumUsageSince } from '../lib/db/repositories/usage';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocumentJobs,
  listDocuments,
  markDocumentFailed,
  markDocumentReady,
  renameDocument,
  startRegeneration,
} from '../lib/db/repositories/documents';
import {
  addPlanObjective,
  addStrategy,
  createPlan,
  deleteObjective,
  deletePlan,
  deleteStrategy,
  getPlan,
  listPlanProgress,
  listPlans,
  logPlanProgress,
  updateObjective,
  updatePlan,
} from '../lib/db/repositories/plans';
import {
  addRoutineStep,
  createRoutine,
  deleteRoutine,
  deleteRoutineStep,
  getRoutine,
  listRoutineLogs,
  listRoutines,
  logRoutineCompletion,
  reorderRoutineSteps,
  updateRoutine,
  updateRoutineStep,
} from '../lib/db/repositories/routines';
import {
  attachToMessage,
  createAttachment,
  deleteAttachment,
  getAttachment,
  getAttachments,
  listAttachmentsForMessages,
  listOrphanAttachments,
} from '../lib/db/repositories/attachments';
import {
  addSensoryTool,
  deleteSensoryTool,
  getSensoryProfile,
  listSensoryEvents,
  listSensoryProfiles,
  listSensoryTools,
  logSensoryEvent,
  removeFromSensoryProfile,
  setToolEffective,
  updateSensoryProfile,
} from '../lib/db/repositories/sensory';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  prioritizeTasks,
  replaceSubtasks,
  updateTask,
} from '../lib/db/repositories/tasks';
import {
  getFoodProfile,
  getPlanForWeek,
  getShoppingListForPlan,
  listMealPlans,
  logAcceptedFood,
  savePlanForWeek,
  saveShoppingList,
  updateFoodProfile,
} from '../lib/db/repositories/nutrition';
import {
  getResourceBySlug,
  listLibraryResources,
  searchLibrary,
  searchLibraryByText,
} from '../lib/db/repositories/library';
import {
  createEducationItem,
  deleteEducationItem,
  getEducationItem,
  linkEducationDocument,
  listEducationItems,
} from '../lib/db/repositories/education';
import {
  closeCrisisEvent,
  deleteCrisisEvent,
  deleteCrisisProtocol,
  getCrisisEvent,
  getOpenCrisisEvent,
  linkPostPlan,
  listCrisisEvents,
  listCrisisProtocols,
  recordEscalation,
  saveCrisisProtocol,
  setProtocolActive,
  startCrisisEvent,
} from '../lib/db/repositories/crisis';
import {
  countNotesByShare,
  deleteMember,
  getTeamMember,
  inviteMember,
  listSharesByOwner,
  listTeamMembers,
  revokeMember,
  revokeShare,
  shareResource,
} from '../lib/db/repositories/team';
import {
  createReminder,
  deletePushSubscription,
  deleteReminder,
  getNotificationPreferences,
  listDeliveries,
  listPushSubscriptions,
  listReminders,
  saveNotificationPreferences,
  savePushSubscription,
  setReminderActive,
} from '../lib/db/repositories/notifications';
import {
  getSubscription,
  getUsageMetrics,
  getUsageSnapshot,
  listModelConfigs,
  saveModelConfig,
  savePlanLimits,
  deleteModelConfig,
} from '../lib/db/repositories/billing';
import {
  createPromptVersion,
  listPromptKeys,
} from '../lib/db/repositories/prompts';
import { listTenantMembersWithUsers } from '../lib/db/repositories/tenants';
import {
  cancelInvitation,
  changeMemberRole,
  countActiveMembers,
  inviteToTenant,
  listInvitations,
  removeMember,
} from '../lib/db/repositories/memberships';
import {
  addAvailability,
  addSessionNote,
  busyIntervals,
  deleteAvailability,
  deleteSessionNote,
  ensureSession,
  getAppointmentForParticipant,
  getMyProfessionalProfile,
  getSessionForParticipant,
  getWhiteboard,
  listAvailability,
  listMyAppointments,
  listProfessionals,
  listSessionNotes,
  listSessionTasks,
  requestAppointment,
  saveWhiteboard,
  sessionNotesQuery,
  setAppointmentMeetingUrl,
  setAppointmentStatus,
  setSessionTaskStatus,
  setVerificationStatus,
  upsertProfessionalProfile,
  shareInSession,
  listSessionShares,
  revokeSessionShare,
  addLicenseDoc,
  removeLicenseDoc,
} from '../lib/db/repositories/consultorio';
import { ownsResource } from '../lib/db/repositories/ownership';

const VALID: TenantContext = {
  tenantId: '3f1a2b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c',
  userId: 'usuario-1',
  role: 'owner',
};

/** Identificadores de prueba. Nunca llegan a la base: el guardián corta antes. */
const CONV = '11111111-2222-4333-8444-555555555555';
const MSG = '66666666-7777-4888-8999-aaaaaaaaaaaa';

/** Contextos que ninguna funcion de repositorio debe aceptar. */
const INVALID_CONTEXTS: Array<[string, unknown]> = [
  ['sin tenantId', { userId: 'usuario-1', role: 'owner' }],
  ['tenantId vacio', { tenantId: '', userId: 'usuario-1', role: 'owner' }],
  ['tenantId en blanco', { tenantId: '   ', userId: 'usuario-1', role: 'owner' }],
  [
    'tenantId que no es UUID',
    { tenantId: 'tenant-a', userId: 'usuario-1', role: 'owner' },
  ],
  ['sin userId', { tenantId: VALID.tenantId, role: 'owner' }],
  [
    'rol desconocido',
    { tenantId: VALID.tenantId, userId: 'usuario-1', role: 'superadmin' },
  ],
  ['objeto vacio', {}],
  ['undefined', undefined],
  ['null', null],
];

/**
 * Toda funcion de repositorio con ambito de tenant. Agregar una funcion nueva
 * a un repositorio y no agregarla aqui deberia considerarse trabajo a medias.
 */
const SCOPED_REPOSITORY_FUNCTIONS: Array<[string, (ctx: unknown) => Promise<unknown>]> =
  [
    ['getPreferences', (ctx) => getPreferences(ctx as TenantContext)],
    [
      'getEffectivePreferences',
      (ctx) => getEffectivePreferences(ctx as TenantContext),
    ],
    [
      'upsertPreferences',
      (ctx) => upsertPreferences(ctx as TenantContext, { density: 'compact' }),
    ],
    ['getCurrentTenant', (ctx) => getCurrentTenant(ctx as TenantContext)],
    ['listTenantMembers', (ctx) => listTenantMembers(ctx as TenantContext)],
    ['renameTenant', (ctx) => renameTenant(ctx as TenantContext, 'Otro nombre')],
    [
      'recordAudit',
      (ctx) =>
        recordAudit(ctx as TenantContext, { action: 'prueba', entity: 'prueba' }),
    ],
    ['listAuditLog', (ctx) => listAuditLog(ctx as TenantContext)],
    [
      'listPromptVersions',
      (ctx) => listPromptVersions(ctx as TenantContext, 'orchestrator.system'),
    ],
    [
      'activatePromptVersion',
      (ctx) =>
        activatePromptVersion(ctx as TenantContext, 'orchestrator.system', 1),
    ],

    // --- Fase 1: conversaciones, mensajes, memoria y consumo ---------------
    ['ensureConversation', (ctx) => ensureConversation(ctx as TenantContext, CONV)],
    ['getConversation', (ctx) => getConversation(ctx as TenantContext, CONV)],
    ['listConversations', (ctx) => listConversations(ctx as TenantContext)],
    [
      'renameConversation',
      (ctx) => renameConversation(ctx as TenantContext, CONV, 'Otro título'),
    ],
    ['setAutoTitle', (ctx) => setAutoTitle(ctx as TenantContext, CONV, 'Título')],
    [
      'setConversationStatus',
      (ctx) => setConversationStatus(ctx as TenantContext, CONV, 'archived'),
    ],
    ['deleteConversation', (ctx) => deleteConversation(ctx as TenantContext, CONV)],
    ['touchConversation', (ctx) => touchConversation(ctx as TenantContext, CONV)],
    ['countMessages', (ctx) => countMessages(ctx as TenantContext, CONV)],

    [
      'appendMessage',
      (ctx) =>
        appendMessage(ctx as TenantContext, {
          conversationId: CONV,
          role: 'user',
          parts: [{ type: 'text', text: 'hola' }],
        }),
    ],
    ['getMessage', (ctx) => getMessage(ctx as TenantContext, MSG)],
    ['listMessages', (ctx) => listMessages(ctx as TenantContext, CONV)],
    [
      'deleteFromMessage',
      (ctx) => deleteFromMessage(ctx as TenantContext, CONV, MSG),
    ],
    ['deleteMessages', (ctx) => deleteMessages(ctx as TenantContext, [MSG])],

    [
      'saveMemory',
      (ctx) =>
        saveMemory(ctx as TenantContext, { key: 'ruidos', value: 'le molestan' }),
    ],
    ['listMemories', (ctx) => listMemories(ctx as TenantContext)],
    ['searchMemories', (ctx) => searchMemories(ctx as TenantContext, 'ruido')],
    ['updateMemory', (ctx) => updateMemory(ctx as TenantContext, MSG, 'otro')],
    ['deleteMemory', (ctx) => deleteMemory(ctx as TenantContext, MSG)],
    ['deleteAllMemories', (ctx) => deleteAllMemories(ctx as TenantContext)],

    [
      'recordUsage',
      (ctx) =>
        recordUsage(ctx as TenantContext, { kind: 'chat', model: 'prueba' }),
    ],
    ['sumUsageSince', (ctx) => sumUsageSince(ctx as TenantContext, new Date(0))],

    // --- Fase 2: documentos ------------------------------------------------
    [
      'createDocument',
      (ctx) =>
        createDocument(ctx as TenantContext, {
          type: 'carta',
          title: 'Carta',
          format: 'pdf',
          sourceContent: 'contenido',
        }),
    ],
    ['getDocument', (ctx) => getDocument(ctx as TenantContext, CONV)],
    ['listDocuments', (ctx) => listDocuments(ctx as TenantContext)],
    [
      'markDocumentReady',
      (ctx) =>
        markDocumentReady(ctx as TenantContext, CONV, {
          blobUrl: 'https://ejemplo',
          blobPathname: 'ruta',
          sizeBytes: 1,
        }),
    ],
    [
      'markDocumentFailed',
      (ctx) => markDocumentFailed(ctx as TenantContext, CONV, 'error'),
    ],
    [
      'renameDocument',
      (ctx) => renameDocument(ctx as TenantContext, CONV, 'Otro nombre'),
    ],
    ['deleteDocument', (ctx) => deleteDocument(ctx as TenantContext, CONV)],
    [
      'startRegeneration',
      (ctx) => startRegeneration(ctx as TenantContext, CONV, 'más breve'),
    ],
    ['listDocumentJobs', (ctx) => listDocumentJobs(ctx as TenantContext, CONV)],

    // --- Fase 3: planes y rutinas ------------------------------------------
    [
      'createPlan',
      (ctx) =>
        createPlan(ctx as TenantContext, {
          type: 'escolar',
          title: 'Plan',
          objectives: [{ title: 'Objetivo', strategies: ['Estrategia'] }],
        }),
    ],
    ['getPlan', (ctx) => getPlan(ctx as TenantContext, CONV)],
    ['listPlans', (ctx) => listPlans(ctx as TenantContext)],
    ['updatePlan', (ctx) => updatePlan(ctx as TenantContext, CONV, { title: 'X' })],
    ['deletePlan', (ctx) => deletePlan(ctx as TenantContext, CONV)],
    [
      'addPlanObjective',
      (ctx) => addPlanObjective(ctx as TenantContext, CONV, { title: 'Objetivo' }),
    ],
    [
      'updateObjective',
      (ctx) => updateObjective(ctx as TenantContext, CONV, { title: 'X' }),
    ],
    ['deleteObjective', (ctx) => deleteObjective(ctx as TenantContext, CONV)],
    ['addStrategy', (ctx) => addStrategy(ctx as TenantContext, CONV, 'texto')],
    ['deleteStrategy', (ctx) => deleteStrategy(ctx as TenantContext, CONV)],
    [
      'logPlanProgress',
      (ctx) => logPlanProgress(ctx as TenantContext, CONV, { note: 'nota' }),
    ],
    ['listPlanProgress', (ctx) => listPlanProgress(ctx as TenantContext, CONV)],

    [
      'createRoutine',
      (ctx) =>
        createRoutine(ctx as TenantContext, {
          type: 'matutina',
          title: 'Rutina',
          steps: [{ title: 'Paso' }],
        }),
    ],
    ['getRoutine', (ctx) => getRoutine(ctx as TenantContext, CONV)],
    ['listRoutines', (ctx) => listRoutines(ctx as TenantContext)],
    [
      'updateRoutine',
      (ctx) => updateRoutine(ctx as TenantContext, CONV, { title: 'X' }),
    ],
    ['deleteRoutine', (ctx) => deleteRoutine(ctx as TenantContext, CONV)],
    [
      'addRoutineStep',
      (ctx) => addRoutineStep(ctx as TenantContext, CONV, { title: 'Paso' }),
    ],
    [
      'updateRoutineStep',
      (ctx) => updateRoutineStep(ctx as TenantContext, CONV, { title: 'X' }),
    ],
    ['deleteRoutineStep', (ctx) => deleteRoutineStep(ctx as TenantContext, CONV)],
    [
      'reorderRoutineSteps',
      (ctx) => reorderRoutineSteps(ctx as TenantContext, CONV, [MSG]),
    ],
    [
      'logRoutineCompletion',
      (ctx) =>
        logRoutineCompletion(ctx as TenantContext, CONV, { completedStepIds: [] }),
    ],
    ['listRoutineLogs', (ctx) => listRoutineLogs(ctx as TenantContext, CONV)],

    // --- Fase 4: adjuntos ---------------------------------------------------
    [
      'createAttachment',
      (ctx) =>
        createAttachment(ctx as TenantContext, {
          kind: 'image',
          filename: 'foto.png',
          mime: 'image/png',
          sizeBytes: 10,
          blobUrl: 'https://ejemplo',
          blobPathname: 'ruta',
        }),
    ],
    ['getAttachment', (ctx) => getAttachment(ctx as TenantContext, CONV)],
    ['getAttachments', (ctx) => getAttachments(ctx as TenantContext, [CONV])],
    [
      'attachToMessage',
      (ctx) => attachToMessage(ctx as TenantContext, MSG, [CONV]),
    ],
    [
      'listAttachmentsForMessages',
      (ctx) => listAttachmentsForMessages(ctx as TenantContext, [MSG]),
    ],
    ['deleteAttachment', (ctx) => deleteAttachment(ctx as TenantContext, CONV)],
    [
      'listOrphanAttachments',
      (ctx) => listOrphanAttachments(ctx as TenantContext, new Date(0)),
    ],

    // --- Fase 5: sensorialidad, tareas y alimentación -----------------------
    ['listSensoryProfiles', (ctx) => listSensoryProfiles(ctx as TenantContext)],
    [
      'getSensoryProfile',
      (ctx) => getSensoryProfile(ctx as TenantContext, 'sonidos'),
    ],
    [
      'updateSensoryProfile',
      (ctx) =>
        updateSensoryProfile(ctx as TenantContext, {
          domain: 'sonidos',
          triggers: ['ruido'],
        }),
    ],
    [
      'removeFromSensoryProfile',
      (ctx) =>
        removeFromSensoryProfile(ctx as TenantContext, 'sonidos', 'triggers', 'x'),
    ],
    [
      'logSensoryEvent',
      (ctx) => logSensoryEvent(ctx as TenantContext, { domain: 'sonidos' }),
    ],
    ['listSensoryEvents', (ctx) => listSensoryEvents(ctx as TenantContext)],
    [
      'addSensoryTool',
      (ctx) => addSensoryTool(ctx as TenantContext, { name: 'audifonos' }),
    ],
    ['listSensoryTools', (ctx) => listSensoryTools(ctx as TenantContext)],
    ['setToolEffective', (ctx) => setToolEffective(ctx as TenantContext, CONV, true)],
    ['deleteSensoryTool', (ctx) => deleteSensoryTool(ctx as TenantContext, CONV)],

    [
      'createTask',
      (ctx) => createTask(ctx as TenantContext, { title: 'Limpiar' }),
    ],
    ['getTask', (ctx) => getTask(ctx as TenantContext, CONV)],
    ['listTasks', (ctx) => listTasks(ctx as TenantContext)],
    [
      'replaceSubtasks',
      (ctx) => replaceSubtasks(ctx as TenantContext, CONV, [{ title: 'Paso' }]),
    ],
    ['updateTask', (ctx) => updateTask(ctx as TenantContext, CONV, { title: 'X' })],
    ['completeTask', (ctx) => completeTask(ctx as TenantContext, CONV)],
    ['deleteTask', (ctx) => deleteTask(ctx as TenantContext, CONV)],
    ['prioritizeTasks', (ctx) => prioritizeTasks(ctx as TenantContext, [CONV])],

    ['getFoodProfile', (ctx) => getFoodProfile(ctx as TenantContext)],
    [
      'updateFoodProfile',
      (ctx) => updateFoodProfile(ctx as TenantContext, { accepted: ['manzana'] }),
    ],
    ['logAcceptedFood', (ctx) => logAcceptedFood(ctx as TenantContext, 'pera')],
    [
      'savePlanForWeek',
      (ctx) =>
        savePlanForWeek(ctx as TenantContext, '2026-08-03', {
          lunes: { desayuno: 'fruta' },
        }),
    ],
    [
      'getPlanForWeek',
      (ctx) => getPlanForWeek(ctx as TenantContext, '2026-08-03'),
    ],
    ['listMealPlans', (ctx) => listMealPlans(ctx as TenantContext)],
    [
      'saveShoppingList',
      (ctx) => saveShoppingList(ctx as TenantContext, CONV, [{ name: 'avena' }]),
    ],
    [
      'getShoppingListForPlan',
      (ctx) => getShoppingListForPlan(ctx as TenantContext, CONV),
    ],

    // --- Fase 6: biblioteca y educación -------------------------------------
    ['searchLibrary', (ctx) => searchLibrary(ctx as TenantContext, 'ruido')],
    [
      'searchLibraryByText',
      (ctx) => searchLibraryByText(ctx as TenantContext, 'ruido'),
    ],
    ['listLibraryResources', (ctx) => listLibraryResources(ctx as TenantContext)],
    ['getResourceBySlug', (ctx) => getResourceBySlug(ctx as TenantContext, 'x')],
    [
      'createEducationItem',
      (ctx) =>
        createEducationItem(ctx as TenantContext, {
          kind: 'adaptacion',
          title: 'Adaptación',
          payload: {},
        }),
    ],
    ['getEducationItem', (ctx) => getEducationItem(ctx as TenantContext, CONV)],
    ['listEducationItems', (ctx) => listEducationItems(ctx as TenantContext)],
    [
      'linkEducationDocument',
      (ctx) => linkEducationDocument(ctx as TenantContext, CONV, CONV),
    ],
    ['deleteEducationItem', (ctx) => deleteEducationItem(ctx as TenantContext, CONV)],

    // --- Fase 7: crisis -----------------------------------------------------
    [
      'startCrisisEvent',
      (ctx) => startCrisisEvent(ctx as TenantContext, { severity: 'moderada' }),
    ],
    [
      'recordEscalation',
      (ctx) => recordEscalation(ctx as TenantContext, { categories: ['x'] }),
    ],
    ['getOpenCrisisEvent', (ctx) => getOpenCrisisEvent(ctx as TenantContext)],
    ['closeCrisisEvent', (ctx) => closeCrisisEvent(ctx as TenantContext, {})],
    ['getCrisisEvent', (ctx) => getCrisisEvent(ctx as TenantContext, CONV)],
    ['listCrisisEvents', (ctx) => listCrisisEvents(ctx as TenantContext)],
    ['linkPostPlan', (ctx) => linkPostPlan(ctx as TenantContext, CONV, CONV)],
    ['deleteCrisisEvent', (ctx) => deleteCrisisEvent(ctx as TenantContext, CONV)],
    [
      'saveCrisisProtocol',
      (ctx) =>
        saveCrisisProtocol(ctx as TenantContext, {
          title: 'Protocolo',
          steps: [{ title: 'Baja las luces' }],
        }),
    ],
    ['listCrisisProtocols', (ctx) => listCrisisProtocols(ctx as TenantContext)],
    ['setProtocolActive', (ctx) => setProtocolActive(ctx as TenantContext, CONV, false)],
    ['deleteCrisisProtocol', (ctx) => deleteCrisisProtocol(ctx as TenantContext, CONV)],

    // --- Fase 8: equipo de apoyo -------------------------------------------
    [
      'inviteMember',
      (ctx) =>
        inviteMember(ctx as TenantContext, {
          email: 'alguien@ejemplo.mx',
          relationship: 'familiar',
        }),
    ],
    ['listTeamMembers', (ctx) => listTeamMembers(ctx as TenantContext)],
    ['getTeamMember', (ctx) => getTeamMember(ctx as TenantContext, CONV)],
    ['revokeMember', (ctx) => revokeMember(ctx as TenantContext, CONV)],
    ['deleteMember', (ctx) => deleteMember(ctx as TenantContext, CONV)],
    [
      'shareResource',
      (ctx) =>
        shareResource(ctx as TenantContext, {
          memberId: CONV,
          resourceType: 'plan',
          resourceId: CONV,
          resourceTitle: 'Un plan',
          permission: 'lectura',
        }),
    ],
    ['revokeShare', (ctx) => revokeShare(ctx as TenantContext, CONV)],
    ['listSharesByOwner', (ctx) => listSharesByOwner(ctx as TenantContext)],
    ['countNotesByShare', (ctx) => countNotesByShare(ctx as TenantContext)],

    // --- Fase 8: recordatorios ---------------------------------------------
    [
      'savePushSubscription',
      (ctx) =>
        savePushSubscription(ctx as TenantContext, {
          endpoint: 'https://push.example/abc',
          keys: { p256dh: 'x', auth: 'y' },
        }),
    ],
    ['listPushSubscriptions', (ctx) => listPushSubscriptions(ctx as TenantContext)],
    [
      'deletePushSubscription',
      (ctx) => deletePushSubscription(ctx as TenantContext, 'https://push.example/abc'),
    ],
    [
      'createReminder',
      (ctx) =>
        createReminder(ctx as TenantContext, {
          kind: 'rutina',
          title: 'Rutina',
          schedule: { hour: 7, minute: 0, days: [], timeZone: 'America/Mexico_City' },
          channels: [],
        }),
    ],
    ['listReminders', (ctx) => listReminders(ctx as TenantContext)],
    ['setReminderActive', (ctx) => setReminderActive(ctx as TenantContext, CONV, false)],
    ['deleteReminder', (ctx) => deleteReminder(ctx as TenantContext, CONV)],
    ['listDeliveries', (ctx) => listDeliveries(ctx as TenantContext)],
    [
      'getNotificationPreferences',
      (ctx) => getNotificationPreferences(ctx as TenantContext),
    ],
    [
      'saveNotificationPreferences',
      (ctx) =>
        saveNotificationPreferences(ctx as TenantContext, {
          channels: [],
          quietHours: { startHour: 22, endHour: 7 },
          timeZone: 'America/Mexico_City',
        }),
    ],

    // --- Fase 9: membresías y panel ----------------------------------------
    ['getSubscription', (ctx) => getSubscription(ctx as TenantContext)],
    ['getUsageSnapshot', (ctx) => getUsageSnapshot(ctx as TenantContext)],
    ['getUsageMetrics', (ctx) => getUsageMetrics(ctx as TenantContext)],
    ['listModelConfigs', (ctx) => listModelConfigs(ctx as TenantContext)],
    [
      'saveModelConfig',
      (ctx) =>
        saveModelConfig(ctx as TenantContext, {
          purpose: 'chat',
          provider: 'google',
          model: 'gemini-3.1-flash-lite',
        }),
    ],
    ['deleteModelConfig', (ctx) => deleteModelConfig(ctx as TenantContext, CONV)],
    [
      'savePlanLimits',
      (ctx) => savePlanLimits(ctx as TenantContext, 'free', { mensajes: 10 }),
    ],
    ['listPromptKeys', (ctx) => listPromptKeys(ctx as TenantContext)],
    [
      'createPromptVersion',
      (ctx) =>
        createPromptVersion(ctx as TenantContext, 'orchestrator.system', 'Hola'),
    ],
    [
      'listTenantMembersWithUsers',
      (ctx) => listTenantMembersWithUsers(ctx as TenantContext),
    ],

    // --- Membresías e invitaciones a un espacio ------------------------------
    [
      'countActiveMembers',
      (ctx) => countActiveMembers(ctx as TenantContext),
    ],
    [
      'changeMemberRole',
      (ctx) => changeMemberRole(ctx as TenantContext, 'usuario-2', 'member'),
    ],
    ['removeMember', (ctx) => removeMember(ctx as TenantContext, 'usuario-2')],
    [
      'inviteToTenant',
      (ctx) =>
        inviteToTenant(ctx as TenantContext, {
          email: 'alguien@ejemplo.mx',
          role: 'member',
        }),
    ],
    ['listInvitations', (ctx) => listInvitations(ctx as TenantContext)],
    [
      'cancelInvitation',
      (ctx) => cancelInvitation(ctx as TenantContext, CONV),
    ],

    // --- Fase 10: consultorios ----------------------------------------------
    [
      'getMyProfessionalProfile',
      (ctx) => getMyProfessionalProfile(ctx as TenantContext),
    ],
    [
      'upsertProfessionalProfile',
      (ctx) =>
        upsertProfessionalProfile(ctx as TenantContext, {
          specialties: ['coaching'],
          acceptTerms: true,
          termsVersion: 'x',
        }),
    ],
    [
      'setVerificationStatus',
      (ctx) => setVerificationStatus(ctx as TenantContext, CONV, 'verificado'),
    ],
    ['listProfessionals', (ctx) => listProfessionals(ctx as TenantContext)],
    ['listAvailability', (ctx) => listAvailability(ctx as TenantContext, CONV)],
    [
      'addAvailability',
      (ctx) =>
        addAvailability(ctx as TenantContext, {
          professionalId: CONV,
          weekday: 2,
          startTime: '09:00',
          endTime: '14:00',
          timezone: 'America/Mexico_City',
        }),
    ],
    ['deleteAvailability', (ctx) => deleteAvailability(ctx as TenantContext, CONV)],
    [
      'busyIntervals',
      (ctx) => busyIntervals(ctx as TenantContext, CONV, new Date(0), new Date(1)),
    ],
    [
      'requestAppointment',
      (ctx) =>
        requestAppointment(ctx as TenantContext, {
          professionalId: CONV,
          scheduledAt: new Date(Date.now() + 86_400_000),
          durationMinutes: 50,
        }),
    ],
    [
      'getAppointmentForParticipant',
      (ctx) => getAppointmentForParticipant(ctx as TenantContext, CONV),
    ],
    ['listMyAppointments', (ctx) => listMyAppointments(ctx as TenantContext)],
    [
      'setAppointmentStatus',
      (ctx) => setAppointmentStatus(ctx as TenantContext, CONV, 'cancelada'),
    ],
    ['ensureSession', (ctx) => ensureSession(ctx as TenantContext, CONV)],
    [
      'getSessionForParticipant',
      (ctx) => getSessionForParticipant(ctx as TenantContext, CONV),
    ],
    [
      'addSessionNote',
      (ctx) =>
        addSessionNote(ctx as TenantContext, {
          sessionId: CONV,
          visibility: 'privada',
          content: 'Hola',
        }),
    ],
    ['listSessionNotes', (ctx) => listSessionNotes(ctx as TenantContext, CONV)],
    ['deleteSessionNote', (ctx) => deleteSessionNote(ctx as TenantContext, CONV)],
    [
      'sessionNotesQuery',
      async (ctx) => sessionNotesQuery(ctx as TenantContext, CONV, 'usuario'),
    ],
    ['listSessionTasks', (ctx) => listSessionTasks(ctx as TenantContext, CONV)],
    [
      'setSessionTaskStatus',
      (ctx) => setSessionTaskStatus(ctx as TenantContext, CONV, 'hecha'),
    ],
    ['getWhiteboard', (ctx) => getWhiteboard(ctx as TenantContext, CONV)],
    [
      'saveWhiteboard',
      (ctx) => saveWhiteboard(ctx as TenantContext, CONV, { strokes: [] }),
    ],
    [
      'shareInSession',
      (ctx) =>
        shareInSession(ctx as TenantContext, CONV, {
          resourceType: 'plan',
          resourceId: CONV,
          resourceTitle: 'Un plan',
        }),
    ],
    ['listSessionShares', (ctx) => listSessionShares(ctx as TenantContext, CONV)],
    [
      'revokeSessionShare',
      (ctx) => revokeSessionShare(ctx as TenantContext, CONV),
    ],
    [
      'addLicenseDoc',
      (ctx) =>
        addLicenseDoc(ctx as TenantContext, {
          filename: 'cedula.pdf',
          url: `/api/adjuntos/${CONV}`,
        }),
    ],
    ['removeLicenseDoc', (ctx) => removeLicenseDoc(ctx as TenantContext, 'x')],
    ['ownsResource', (ctx) => ownsResource(ctx as TenantContext, 'plan', CONV)],
    [
      'setAppointmentMeetingUrl',
      (ctx) =>
        setAppointmentMeetingUrl(
          ctx as TenantContext,
          CONV,
          'https://meet.google.com/abc-defg-hij',
        ),
    ],
  ];

describe('assertTenantContext', () => {
  it('acepta un contexto completo', () => {
    assert.doesNotThrow(() => assertTenantContext(VALID));
    assert.deepEqual(requireTenantContext(VALID), VALID);
  });

  for (const [description, ctx] of INVALID_CONTEXTS) {
    it(`rechaza un contexto ${description}`, () => {
      assert.throws(() => assertTenantContext(ctx), TenantScopeError);
    });
  }

  it('nombra la operacion en el mensaje de error', () => {
    assert.throws(
      () => assertTenantContext({}, 'listPlans'),
      (error: unknown) =>
        error instanceof TenantScopeError && error.message.includes('listPlans'),
    );
  });
});

describe('funciones de repositorio con ambito de tenant', () => {
  for (const [name, call] of SCOPED_REPOSITORY_FUNCTIONS) {
    for (const [description, ctx] of INVALID_CONTEXTS) {
      it(`${name} falla con un contexto ${description}`, async () => {
        await assert.rejects(() => call(ctx), TenantScopeError);
      });
    }
  }
});

describe('jerarquia de roles', () => {
  it('ordena los roles de menor a mayor alcance', () => {
    assert.equal(hasRoleAtLeast({ ...VALID, role: 'member' }, 'admin'), false);
    assert.equal(hasRoleAtLeast({ ...VALID, role: 'admin' }, 'admin'), true);
    assert.equal(hasRoleAtLeast({ ...VALID, role: 'owner' }, 'admin'), true);
    assert.equal(
      hasRoleAtLeast({ ...VALID, role: 'professional' }, 'member'),
      true,
    );
  });

  it('distingue falta de contexto de falta de permiso', () => {
    assert.throws(
      () => assertRoleAtLeast({ ...VALID, role: 'member' }, 'admin'),
      TenantPermissionError,
    );
    assert.throws(
      () => assertRoleAtLeast({} as TenantContext, 'admin'),
      TenantScopeError,
    );
  });

  it('rechaza a un miembro que intenta renombrar el espacio', async () => {
    await assert.rejects(
      () => renameTenant({ ...VALID, role: 'member' }, 'Nombre nuevo'),
      TenantPermissionError,
    );
  });
});

describe('saneado de la bitacora de auditoria', () => {
  it('descarta las claves con contenido sensible', () => {
    const result = sanitizeMetadata({
      planId: 'abc',
      contenido: 'texto de una conversacion',
      diagnostico: 'nada de esto debe guardarse',
      medicacion: 'tampoco',
      activo: true,
    });

    assert.deepEqual(result, { planId: 'abc', activo: true });
  });

  it('descarta objetos, arreglos y textos largos', () => {
    const result = sanitizeMetadata({
      anidado: { a: 1 },
      lista: [1, 2, 3],
      largo: 'x'.repeat(500),
      corto: 'ok',
    });

    assert.deepEqual(result, { corto: 'ok' });
  });

  it('devuelve null cuando no queda nada seguro que guardar', () => {
    assert.equal(sanitizeMetadata({ notas: 'algo' }), null);
    assert.equal(sanitizeMetadata(undefined), null);
  });
});
