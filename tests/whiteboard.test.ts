/**
 * Pizarra de sesión. Fase 10.
 *
 * Lo que se prueba es el fallo que tenía y que nadie veía: con dos personas
 * dibujando, el último en soltar el lápiz borraba lo del otro. Pasaba
 * desapercibido porque tampoco había forma de ver lo que dibujaba la otra parte
 * sin recargar, así que cada quien veía su propia versión.
 *
 * También se prueba lo que llega del cliente. Un trazo es un objeto que acaba
 * escribiéndose tal cual en un `<canvas>` de otra persona; aceptarlo sin mirar
 * es aceptar lo que la otra parte quiera mandar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyWhiteboardOp,
  parseStroke,
  WHITEBOARD_COLORS,
} from '../lib/consultorio/whiteboard';
import {
  MAX_WHITEBOARD_STROKES,
  type WhiteboardState,
} from '../lib/consultorio/types';

const TRAZO = {
  id: 'a',
  color: WHITEBOARD_COLORS[0],
  width: 3,
  points: [0, 0, 10, 10],
};

const OTRO = { ...TRAZO, id: 'b' };

describe('dos personas dibujando', () => {
  it('los dos trazos sobreviven', () => {
    // Es el caso que antes perdía uno de los dos.
    let estado = applyWhiteboardOp({ strokes: [] }, { kind: 'add', stroke: TRAZO });
    estado = applyWhiteboardOp(estado, { kind: 'add', stroke: OTRO });

    assert.deepEqual(
      estado.strokes.map((s) => s.id),
      ['a', 'b'],
    );
  });

  it('reenviar el mismo trazo no lo duplica', () => {
    // Un reintento de red o un doble toque no deben pintar dos veces.
    let estado = applyWhiteboardOp({ strokes: [] }, { kind: 'add', stroke: TRAZO });
    estado = applyWhiteboardOp(estado, { kind: 'add', stroke: { ...TRAZO } });

    assert.equal(estado.strokes.length, 1);
  });
});

describe('borrar todo', () => {
  it('vacía la pizarra', () => {
    const estado = applyWhiteboardOp(
      { strokes: [TRAZO, OTRO] },
      { kind: 'clear' },
    );

    assert.deepEqual(estado.strokes, []);
  });

  it('lo que se dibuja después del borrado sobrevive', () => {
    let estado = applyWhiteboardOp({ strokes: [TRAZO] }, { kind: 'clear' });
    estado = applyWhiteboardOp(estado, { kind: 'add', stroke: OTRO });

    assert.deepEqual(
      estado.strokes.map((s) => s.id),
      ['b'],
    );
  });
});

describe('techo de trazos', () => {
  it('descarta los más viejos en vez de crecer sin freno', () => {
    let estado: WhiteboardState = { strokes: [] };

    for (let i = 0; i < MAX_WHITEBOARD_STROKES + 5; i += 1) {
      estado = applyWhiteboardOp(estado, {
        kind: 'add',
        stroke: { ...TRAZO, id: `t${i}` },
      });
    }

    assert.equal(estado.strokes.length, MAX_WHITEBOARD_STROKES);
    assert.equal(estado.strokes.at(-1)?.id, `t${MAX_WHITEBOARD_STROKES + 4}`);
  });
});

describe('lo que llega del cliente no se cree', () => {
  it('acepta un trazo bien formado', () => {
    assert.deepEqual(parseStroke(TRAZO), TRAZO);
  });

  it('rechaza un color fuera de la paleta', () => {
    // El color se escribe tal cual en el canvas de la otra persona.
    assert.equal(parseStroke({ ...TRAZO, color: 'red' }), null);
    assert.equal(parseStroke({ ...TRAZO, color: 'url(javascript:0)' }), null);
  });

  it('rechaza puntos que no son números', () => {
    assert.equal(parseStroke({ ...TRAZO, points: [0, 0, 'x', 10] }), null);
    assert.equal(parseStroke({ ...TRAZO, points: [0, 0, NaN, 10] }), null);
    assert.equal(parseStroke({ ...TRAZO, points: [0, 0, Infinity, 1] }), null);
  });

  it('rechaza un trazo sin suficientes puntos para ser una línea', () => {
    assert.equal(parseStroke({ ...TRAZO, points: [0, 0] }), null);
  });

  it('rechaza lo que no es un objeto', () => {
    for (const valor of [null, undefined, 'trazo', 42, []]) {
      assert.equal(parseStroke(valor), null);
    }
  });

  it('acota el grosor en vez de rechazarlo', () => {
    assert.equal(parseStroke({ ...TRAZO, width: 900 })?.width, 24);
    assert.equal(parseStroke({ ...TRAZO, width: 0 })?.width, 1);
  });

  it('recorta un trazo desmedido', () => {
    const enorme = { ...TRAZO, points: Array.from({ length: 9000 }, () => 1) };
    assert.equal(parseStroke(enorme)?.points.length, 4000);
  });
});
