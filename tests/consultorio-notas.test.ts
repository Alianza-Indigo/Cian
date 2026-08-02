/**
 * Notas privadas del profesional. Fase 10.
 *
 * Criterio de aceptación, con la mayúscula del PRD:
 *
 * > Las notas privadas del profesional **jamás** aparecen en ninguna respuesta
 * > de API accesible al usuario — verificado con prueba explícita.
 *
 * Esta es esa prueba.
 *
 * ## Por qué se inspecciona el SQL y no el resultado
 *
 * Lo tentador sería sembrar dos notas en una base de prueba y comprobar que la
 * lectura devuelve una. Eso probaría el caso feliz y **no probaría el fallo que
 * importa**: que alguien filtre las notas al pintar en vez de en la consulta.
 * Con un filtro en la interfaz, la prueba de datos pasaría igual —la pantalla
 * no las dibuja— mientras las notas privadas viajan en la respuesta de red,
 * donde cualquiera las lee abriendo las herramientas del navegador.
 *
 * Así que lo que se comprueba es el SQL compilado: que la condición de
 * visibilidad está **en el `WHERE`** cuando quien lee es la persona atendida.
 * Es una prueba sobre la forma de la consulta porque el criterio es sobre la
 * forma de la consulta.
 *
 * Se comprueba también lo contrario —que al profesional no se le filtra— para
 * que la prueba no se pueda satisfacer filtrando siempre.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sessionNotesQuery } from '../lib/db/repositories/consultorio';
import type { TenantContext } from '../lib/tenant/guard';

const CTX: TenantContext = {
  tenantId: '3f1a2b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c',
  userId: 'usuario-1',
  role: 'member',
};

const SESSION = '11111111-2222-4333-8444-555555555555';

/** El SQL que Drizzle enviaría, con sus parámetros. */
function compile(role: 'profesional' | 'usuario') {
  return sessionNotesQuery(CTX, SESSION, role).toSQL();
}

describe('las notas privadas nunca salen hacia la persona atendida', () => {
  it('la consulta del usuario filtra por visibilidad en el WHERE', () => {
    const { sql, params } = compile('usuario');

    assert.match(sql, /where/i);
    assert.match(
      sql,
      /visibility/i,
      'la visibilidad tiene que estar en la consulta, no en la interfaz',
    );
    assert.ok(
      params.includes('compartida'),
      `se esperaba el parámetro «compartida» y llegaron: ${JSON.stringify(params)}`,
    );
  });

  it('nunca pide notas privadas para el usuario', () => {
    const { params } = compile('usuario');

    assert.equal(
      params.includes('privada'),
      false,
      'la consulta del usuario no debe mencionar la visibilidad privada',
    );
  });

  it('la consulta del profesional NO filtra por visibilidad', () => {
    // Sin esto, la prueba de arriba se podría satisfacer filtrando siempre, y
    // el profesional se quedaría sin ver sus propias notas.
    const { params } = compile('profesional');

    assert.equal(params.includes('compartida'), false);
    assert.equal(params.includes('privada'), false);
  });

  it('las dos consultas acotan por tenant y por sesión', () => {
    for (const role of ['profesional', 'usuario'] as const) {
      const { params } = compile(role);

      assert.ok(
        params.includes(CTX.tenantId),
        `la consulta de ${role} debe acotar por tenant`,
      );
      assert.ok(
        params.includes(SESSION),
        `la consulta de ${role} debe acotar por sesión`,
      );
    }
  });

  it('la consulta del usuario tiene una condición más que la del profesional', () => {
    // Contar los parámetros es la forma más directa de comprobar que se añadió
    // una restricción y no que se reescribió la consulta entera.
    assert.equal(compile('usuario').params.length, compile('profesional').params.length + 1);
  });

  it('sin contexto de tenant válido, la consulta ni se construye', () => {
    for (const invalid of [
      { userId: 'u', role: 'member' },
      { tenantId: '', userId: 'u', role: 'member' },
      {},
      null,
      undefined,
    ]) {
      assert.throws(
        () => sessionNotesQuery(invalid as never, SESSION, 'usuario'),
        `debió rechazar: ${JSON.stringify(invalid)}`,
      );
    }
  });
});
