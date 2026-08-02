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
