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

const VALID: TenantContext = {
  tenantId: '3f1a2b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c',
  userId: 'usuario-1',
  role: 'owner',
};

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
