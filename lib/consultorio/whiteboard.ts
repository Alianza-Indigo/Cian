/**
 * Pizarra: operaciones en vez de estados completos. Fase 10.
 *
 * ## Qué estaba mal
 *
 * Antes el cliente mandaba **la pizarra entera** en cada trazo y el servidor la
 * reemplazaba. Con una sola persona dibujando funciona; con dos, el último en
 * soltar el lápiz borra lo que el otro acababa de dibujar, sin aviso.
 *
 * Y no había forma de que la otra parte lo viera sin recargar, así que el fallo
 * ni siquiera se notaba: cada quien veía su propia versión hasta que alguien
 * refrescaba y descubría que faltaba la mitad.
 *
 * ## Qué se manda ahora
 *
 * Una operación, no un estado:
 *
 * - `add`: añade un trazo. Los trazos ya traían identificador propio, así que
 *   añadir dos veces el mismo no lo duplica.
 * - `clear`: vacía la pizarra.
 *
 * Con eso, dos personas dibujando a la vez conservan los dos trazos, que es lo
 * que cualquiera espera. Y «borrar todo» sigue significando borrar todo: gana
 * sobre lo que había, y lo que se dibuje después de él sobrevive.
 *
 * No es un CRDT ni pretende serlo. Es lo que hace falta para una pizarra de dos
 * personas en una consulta, y se puede razonar entero de un vistazo.
 *
 * ## Sobre «tiempo real»
 *
 * La otra parte se entera consultando cada pocos segundos, no por un canal
 * abierto. Un canal vivo en este despliegue exigiría mantener una función
 * abierta por sesión, y para dos personas dibujando en una consulta el sondeo
 * cuesta menos y no se cae. Está anotado en NOTES.md con lo que costaría
 * cambiarlo.
 */
import { MAX_WHITEBOARD_STROKES, type WhiteboardState, type WhiteboardStroke } from './types';

export type WhiteboardOp =
  | { kind: 'add'; stroke: WhiteboardStroke }
  | { kind: 'clear' };

/** Aplica una operación. Pura: el mismo estado y la misma op dan lo mismo. */
export function applyWhiteboardOp(
  state: WhiteboardState,
  op: WhiteboardOp,
): WhiteboardState {
  if (op.kind === 'clear') return { strokes: [] };

  // Reenviar el mismo trazo —un reintento de red, un doble toque— no lo pinta
  // dos veces.
  if (state.strokes.some((stroke) => stroke.id === op.stroke.id)) return state;

  return {
    strokes: [...state.strokes, op.stroke].slice(-MAX_WHITEBOARD_STROKES),
  };
}

/** Un trazo con forma válida, o `null`. Lo que llega del cliente no se cree. */
export function parseStroke(value: unknown): WhiteboardStroke | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Partial<WhiteboardStroke>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null;
  if (typeof candidate.color !== 'string') return null;
  if (typeof candidate.width !== 'number' || !Number.isFinite(candidate.width)) {
    return null;
  }
  if (!Array.isArray(candidate.points) || candidate.points.length < 4) return null;

  /*
   * El color se acota a la paleta de la pizarra en vez de aceptar cualquier
   * cadena: un color es un valor que se escribe tal cual en un `<canvas>`, y no
   * hay razón para admitir texto arbitrario de la otra parte.
   */
  if (!WHITEBOARD_COLORS.includes(candidate.color as WhiteboardColor)) return null;

  const points = candidate.points.filter(
    (point): point is number => typeof point === 'number' && Number.isFinite(point),
  );
  if (points.length < 4 || points.length !== candidate.points.length) return null;

  return {
    id: candidate.id.slice(0, 64),
    color: candidate.color,
    width: Math.min(24, Math.max(1, Math.round(candidate.width))),
    // Un trazo desmedido no rompe nada, pero llena el `jsonb` de una sesión.
    points: points.slice(0, 4000),
  };
}

export const WHITEBOARD_COLORS = [
  '#1B1F5A',
  '#C9A227',
  '#1f7a5a',
  '#8a2b2b',
] as const;

export type WhiteboardColor = (typeof WHITEBOARD_COLORS)[number];
