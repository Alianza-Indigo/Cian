/**
 * La agenda es de quien la declara.
 *
 * ## El fallo que esta prueba existe para que no vuelva
 *
 * `addAvailability` y `deleteAvailability` recibían el `professionalId` desde el
 * cliente y se conformaban con que la fila fuera del mismo tenant. Cuando cada
 * persona estaba sola en su espacio, «mismo tenant» y «yo mismo» eran lo mismo.
 * Con membresías dejaron de serlo: cualquier integrante de una organización
 * podía inventarle franjas a un profesional o —peor, porque destruye— **borrarle
 * la agenda entera** pasando su identificador.
 *
 * Es la cuarta vez que aparece el mismo patrón en este proyecto, después de
 * `shareResource`, las acciones de cobro y el menú lateral. Por eso se fija por
 * escrito: **un `where` que solo filtra por tenant no comprueba pertenencia.**
 *
 * ## Por qué se comprueba leyendo el archivo
 *
 * Estas funciones abren la base de datos, así que no se pueden ejecutar en una
 * prueba sin infraestructura. Lo que se vigila es una decisión que se ve en el
 * texto: que el identificador no entre por parámetro y que el `where` del
 * borrado incluya al profesional.
 *
 * `tests/tenant-scope.test.ts` cubre lo otro —que ninguna de las dos funcione
 * sin contexto de tenant—; esto cubre que el contexto correcto no baste si el
 * dueño es otro.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const REPO = 'lib/db/repositories/consultorio.ts';
const ACTIONS = 'lib/consultorio/actions.ts';

const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const repo = sinComentarios(readFileSync(REPO, 'utf8'));
const actions = sinComentarios(readFileSync(ACTIONS, 'utf8'));

/** El cuerpo de una función exportada, hasta la siguiente. */
function cuerpo(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`export async function ${nombre}(`);
  assert.notEqual(inicio, -1, `no se encontró \`${nombre}\``);

  const siguiente = fuente.indexOf('export async function ', inicio + 10);
  return fuente.slice(inicio, siguiente === -1 ? fuente.length : siguiente);
}

describe('nadie puede tocar la agenda de otra persona', () => {
  it('`addAvailability` no acepta un `professionalId` de fuera', () => {
    const bloque = cuerpo(repo, 'addAvailability');
    const firma = bloque.slice(0, bloque.indexOf('{', bloque.indexOf(')')));

    assert.equal(
      /professionalId\s*:/.test(firma),
      false,
      'addAvailability vuelve a recibir el profesional por parámetro. Lo que ' +
        'se recibe se puede falsificar: resuélvelo desde `ctx.userId`.',
    );
  });

  it('`addAvailability` resuelve el profesional desde la sesión', () => {
    assert.match(cuerpo(repo, 'addAvailability'), /myProfessionalIdOrThrow\(ctx\)/);
  });

  it('`deleteAvailability` no borra franjas ajenas', () => {
    const bloque = cuerpo(repo, 'deleteAvailability');

    assert.match(
      bloque,
      /myProfessionalIdOrThrow\(ctx\)/,
      'deleteAvailability tiene que saber de quién es la agenda antes de borrar.',
    );
    assert.match(
      bloque,
      /eq\(availabilitySlots\.professionalId, professionalId\)/,
      'sin el profesional en el `where`, pasar el id de otra franja la borra: ' +
        'filtrar por tenant no comprueba pertenencia.',
    );
  });

  it('la acción tampoco pide el `professionalId`', () => {
    // Si volviera al esquema, la interfaz podría mandarlo y el repositorio
    // acabaría aceptándolo «porque ya viene validado».
    const esquema = actions.slice(
      actions.indexOf('const availabilitySchema'),
      actions.indexOf('export async function addAvailabilityAction'),
    );

    assert.equal(/professionalId/.test(esquema), false);
  });
});

describe('una cita no se reserva fuera del horario declarado', () => {
  it('`requestAppointment` comprueba la disponibilidad, no solo los choques', () => {
    /*
     * Antes solo miraba profesional verificado, hora futura y colisión. La
     * franja vivía únicamente en la pantalla que dibujaba los huecos.
     */
    const bloque = cuerpo(repo, 'requestAppointment');

    assert.match(bloque, /listAvailability\(ctx, input\.professionalId\)/);

    /*
     * No basta con que se llame a la función: hay que **usar** el veredicto.
     * Llamarla y no mirar el resultado dejaría la comprobación de adorno, que
     * es un fallo más difícil de ver que no tenerla.
     */
    const veredicto = /const (\w+) = fitsDeclaredAvailability\(/.exec(bloque);
    assert.ok(veredicto, 'no se guarda el resultado de fitsDeclaredAvailability');

    const nombre = veredicto[1];
    assert.match(
      bloque,
      new RegExp(`if \\(!${nombre}\\)[\\s\\S]{0,400}throw new Error`),
      `el resultado (\`${nombre}\`) tiene que cortar la reserva con un error.`,
    );
  });
});

describe('la sesión clínica no se abre por visitar una URL', () => {
  it('`ensureSession` exige cita vigente y ventana antes de crearla', () => {
    /*
     * `started_at` es `defaultNow()`: crear la sesión sella una hora. Hacerlo al
     * abrir la página dejaba expedientes con la hora en que alguien miró, sobre
     * citas que quizá nadie confirmó.
     */
    const bloque = cuerpo(repo, 'ensureSession');

    // Igual que arriba: llamarlas sin cortar nada no protege el expediente.
    assert.match(bloque, /if \(!canJoinRoom\([\s\S]{0,200}throw new Error/);
    assert.match(bloque, /joinWindow\(/);
    assert.match(bloque, /if \(!window\.open\)[\s\S]{0,200}throw new Error/);
  });

  it('las comprobaciones van antes del `insert`, no después', () => {
    const bloque = cuerpo(repo, 'ensureSession');

    const guardia = bloque.indexOf('canJoinRoom');
    const insert = bloque.indexOf('.insert(consultSessions)');

    assert.notEqual(insert, -1, 'no se encontró el insert de la sesión');
    assert.ok(
      guardia !== -1 && guardia < insert,
      'comprobar después de insertar no sirve de nada: la fila ya existe y la ' +
        'hora ya quedó sellada.',
    );

    // Y que entre la guardia y el insert haya de verdad una salida.
    const entre = bloque.slice(guardia, insert);
    assert.match(entre, /throw new Error/);
  });

  it('leer una sesión que ya existe no exige que la sala esté abierta', () => {
    /*
     * Una nota se repasa al día siguiente. Si la lectura exigiera ventana, el
     * arreglo habría roto el expediente en vez de protegerlo: por eso la salida
     * temprana con la sesión existente va antes de las comprobaciones.
     */
    const bloque = cuerpo(repo, 'ensureSession');

    const devuelveExistente = bloque.indexOf('if (existing) return existing;');
    const guardia = bloque.indexOf('canJoinRoom');

    assert.notEqual(devuelveExistente, -1);
    assert.ok(devuelveExistente < guardia);
  });
});
