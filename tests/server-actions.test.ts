/**
 * Un archivo `'use server'` solo puede exportar funciones asíncronas.
 *
 * ## Por qué esto merece una prueba
 *
 * Exportar una constante desde un archivo de server actions **compila sin
 * quejarse**. `tsc` no lo ve, `next build` no lo ve y el despliegue sale verde.
 * Revienta en tiempo de ejecución, al invocar cualquier acción del paquete, con
 * un 500 y este mensaje:
 *
 * > A "use server" file can only export async functions, found object.
 *
 * Y no revienta solo la acción culpable: se lleva por delante **todas las que
 * compartan paquete con ella**. Así fue como exportar `ROLE_LABELS` desde
 * `lib/tenant/actions.ts` rompió el botón de cerrar sesión, que no tiene nada
 * que ver con los roles de un espacio. El síntoma no señala a la causa por
 * ningún lado.
 *
 * ## Qué comprueba, y qué no
 *
 * Es una comprobación de texto, no un análisis del árbol sintáctico: aquí no
 * hay un parser de TypeScript y meter uno sería una dependencia nueva por un
 * problema que se detecta igual mirando las líneas que empiezan por `export`.
 *
 * Eso la hace conservadora: puede rechazar formas válidas que el proyecto
 * todavía no usa (`export const f = async () => {}`, por ejemplo). Si algún día
 * hace falta una de esas, el arreglo es ampliar la lista de formas permitidas
 * aquí, no borrar la prueba.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAICES = ['lib', 'app', 'components'];

/** Formas de export admitidas en un archivo de server actions. */
const PERMITIDAS = [
  /^export async function \w+/,
  /^export default async function/,
  // Los tipos se borran al compilar: no llegan a existir en ejecución.
  /^export type /,
  /^export interface /,
];

function archivosDeCodigo(directorio: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);

    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) {
        continue;
      }
      encontrados.push(...archivosDeCodigo(ruta));
    } else if (/\.tsx?$/.test(entrada.name)) {
      encontrados.push(ruta);
    }
  }

  return encontrados;
}

/** La directiva tiene que ir arriba del todo para que Next la reconozca. */
function esArchivoDeServerActions(contenido: string): boolean {
  const primeraLinea = contenido
    .split('\n')
    .find((linea) => linea.trim().length > 0);

  return primeraLinea?.trim().replace(/;$/, '') === "'use server'";
}

const archivos = RAICES.flatMap((raiz) => archivosDeCodigo(raiz));
const deServerActions = archivos.filter((ruta) =>
  esArchivoDeServerActions(readFileSync(ruta, 'utf8')),
);

describe('archivos de server actions', () => {
  it('el proyecto tiene alguno, o esta prueba no está mirando nada', () => {
    // Sin esto, un cambio de rutas dejaría la prueba pasando en vacío.
    assert.ok(
      deServerActions.length > 0,
      'No se encontró ningún archivo con la directiva `use server`.',
    );
  });

  for (const ruta of deServerActions) {
    it(`${ruta} solo exporta funciones asíncronas`, () => {
      const lineas = readFileSync(ruta, 'utf8').split('\n');

      const infractoras = lineas
        .map((linea, indice) => ({ linea: linea.trimEnd(), numero: indice + 1 }))
        .filter(({ linea }) => linea.startsWith('export '))
        .filter(({ linea }) => !PERMITIDAS.some((forma) => forma.test(linea)));

      assert.deepEqual(
        infractoras,
        [],
        `${ruta} exporta algo que no es una función asíncrona. Eso rompe en ` +
          'ejecución todas las server actions del paquete, no solo esta. ' +
          'Mueve la constante a un módulo aparte.',
      );
    });
  }
});
