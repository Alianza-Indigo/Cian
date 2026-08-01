/**
 * Pruebas de la lógica pura de la capa de IA.
 *
 * No hay llamadas al modelo aquí: se prueba lo que decide qué se le manda
 * (el recorte de contexto) y lo que se hace con lo que devuelve (el título).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { UIMessage } from 'ai';

import {
  estimateTokens,
  estimateMessageTokens,
  trimToBudget,
} from '../lib/ai/context-window';
import { __tidyTitleForTests as tidyTitle } from '../lib/ai/title';
import { __normalizeMemoryKeyForTests as normalizeKey } from '../lib/db/repositories/memories';
import { humanizeChatError } from '../lib/ai/client-errors';

function message(role: 'user' | 'assistant', text: string, id: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] } as UIMessage;
}

describe('recorte de la ventana de conversación', () => {
  it('deja intacta una conversación que cabe en el presupuesto', () => {
    const conversation = [
      message('user', 'hola', 'm1'),
      message('assistant', 'qué tal', 'm2'),
      message('user', 'bien', 'm3'),
    ];

    assert.deepEqual(trimToBudget(conversation, 10_000), conversation);
  });

  it('conserva los mensajes más recientes cuando no cabe todo', () => {
    const conversation = Array.from({ length: 40 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(400), `m${index}`),
    );

    const trimmed = trimToBudget(conversation, 500);

    assert.ok(trimmed.length < conversation.length);
    // El último turno siempre sobrevive: es al que hay que responder.
    assert.equal(trimmed.at(-1)?.id, 'm39');
  });

  it('mantiene el orden original', () => {
    const conversation = Array.from({ length: 10 }, (_, index) =>
      message('user', 'y'.repeat(200), `m${index}`),
    );

    const trimmed = trimToBudget(conversation, 300);
    const ids = trimmed.map((item) => item.id);

    assert.deepEqual(ids, [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  });

  it('nunca devuelve vacío, aunque el presupuesto sea absurdo', () => {
    const conversation = [
      message('user', 'x'.repeat(10_000), 'm1'),
      message('assistant', 'y'.repeat(10_000), 'm2'),
      message('user', 'z'.repeat(10_000), 'm3'),
    ];

    const trimmed = trimToBudget(conversation, 1);

    assert.ok(trimmed.length >= 2);
    assert.equal(trimmed.at(-1)?.id, 'm3');
  });

  it('estima tokens de forma monótona', () => {
    assert.ok(estimateTokens('hola') < estimateTokens('hola hola hola'));
    assert.ok(estimateMessageTokens(message('user', '', 'm1')) > 0);
  });
});

describe('título de conversación', () => {
  it('quita comillas y puntuación de los extremos', () => {
    assert.equal(tidyTitle('"Rutina matutina."'), 'Rutina matutina');
    assert.equal(tidyTitle('«Reunión con la maestra»'), 'Reunión con la maestra');
  });

  it('colapsa espacios', () => {
    assert.equal(tidyTitle('  Plan   de   apoyo  '), 'Plan de apoyo');
  });

  it('recorta sin partir palabras', () => {
    const title = tidyTitle('palabra '.repeat(20));
    assert.ok(title.length <= 60);
    assert.ok(title.endsWith('…'));
    assert.ok(!title.includes('palab…'));
  });
});

describe('normalización de claves de memoria', () => {
  it('unifica mayúsculas y espacios', () => {
    assert.equal(normalizeKey('Ruidos Fuertes'), 'ruidos_fuertes');
    assert.equal(normalizeKey('  ruidos   fuertes  '), 'ruidos_fuertes');
  });

  it('conserva acentos y descarta puntuación', () => {
    assert.equal(normalizeKey('Rutina matutina!'), 'rutina_matutina');
    assert.equal(normalizeKey('año escolar'), 'año_escolar');
  });

  it('acota la longitud', () => {
    assert.ok(normalizeKey('a'.repeat(200)).length <= 80);
  });
});

describe('presentación de errores del chat', () => {
  it('extrae el mensaje de nuestro JSON de error', () => {
    const error = new Error('{"error":"Necesitas iniciar sesión para escribir."}');
    assert.equal(
      humanizeChatError(error),
      'Necesitas iniciar sesión para escribir.',
    );
  });

  it('no deja pasar llaves ni comillas a la pantalla', () => {
    const error = new Error('{"error":"Algo pasó"}');
    const shown = humanizeChatError(error);
    assert.ok(!shown.includes('{'));
    assert.ok(!shown.includes('"error"'));
  });

  it('traduce los fallos de red', () => {
    assert.match(
      humanizeChatError(new Error('Failed to fetch')),
      /conexión/i,
    );
  });

  it('sobrevive a un JSON malformado y a la ausencia de error', () => {
    assert.equal(typeof humanizeChatError(new Error('{roto')), 'string');
    assert.ok(humanizeChatError(undefined).length > 0);
    assert.ok(humanizeChatError(new Error('')).length > 0);
  });
});
