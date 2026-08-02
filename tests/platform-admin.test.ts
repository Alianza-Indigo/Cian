/**
 * La línea de la administración de plataforma.
 *
 * ## Qué se decidió
 *
 * Quien administra CIAN tiene **control total de la operación** —espacios,
 * miembros, roles, verificaciones, actividad, planes, auditoría— y **ningún
 * acceso al contenido clínico privado** de nadie.
 *
 * Esa segunda mitad es fácil de escribir en un comentario y fácil de romper sin
 * querer: basta con que alguien, seis meses después, añada un `select` a
 * `session_notes` en `lib/admin/platform.ts` para «poder ayudar mejor». No
 * habría error, no habría aviso, y el día que se notara sería porque alguien
 * leyó las notas de una consulta ajena.
 *
 * Esta prueba lee el archivo y falla si aparece una consulta contra cualquiera
 * de las tablas prohibidas. Es una comprobación de texto, no un análisis
 * semántico, y basta: para cruzar la línea hay que escribir el nombre de la
 * tabla, y si alguien quiere cruzarla tendrá que borrar esta prueba a mano.
 * Entonces al menos quedará constancia de que fue una decisión.
 *
 * ## Por qué estas tablas y no otras
 *
 * Son las que guardan lo que una persona le cuenta a CIAN o a quien le atiende,
 * no lo que hace falta para operar la plataforma. Un correo o un rol identifican
 * a alguien; una nota de sesión o una bitácora de crisis dicen lo que le pasa.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const PLATFORM = 'lib/admin/platform.ts';

/**
 * Tablas cuyo contenido no puede leer quien administra la plataforma.
 *
 * Se listan por su nombre en el código —el identificador de Drizzle— porque es
 * lo que aparecería en una consulta.
 */
const PROHIBIDAS = [
  // Lo que se le cuenta a CIAN.
  'messages',
  'conversations',
  'memories',
  // Lo que ocurre en una consulta.
  'sessionNotes',
  'sessionSummaries',
  'sharedNotes',
  // Bitácoras de salud.
  'crisisEvents',
  'crisisProtocols',
  'sensoryEvents',
  'sensoryProfiles',
  'foodProfiles',
  'mealPlans',
  // Producciones propias de cada persona.
  'plans',
  'routines',
  'documents',
  'tasks',
  'educationItems',
] as const;

const fuente = readFileSync(PLATFORM, 'utf8');

/** El código, sin comentarios: aquí sí se nombran algunas tablas, y está bien. */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('la administración de plataforma no lee contenido privado', () => {
  it('el archivo existe y tiene código, no está vacío', () => {
    // Sin esto, borrar el módulo dejaría la prueba pasando en verde.
    assert.ok(codigo.includes('assertSuperadmin'));
    assert.ok(codigo.length > 500);
  });

  for (const tabla of PROHIBIDAS) {
    it(`no consulta \`${tabla}\``, () => {
      const usada = new RegExp(`\\b${tabla}\\b`).test(codigo);

      assert.equal(
        usada,
        false,
        `${PLATFORM} nombra \`${tabla}\`. Esa tabla guarda contenido privado de ` +
          'una persona, y la administración de plataforma se detiene antes de ' +
          'eso: puede operar la plataforma entera, no leer lo que alguien le ' +
          'cuenta a CIAN ni lo que se habla en una consulta.',
      );
    });
  }
});

/** Nombre y cuerpo de cada función exportada del módulo. */
function exportadas(): Array<{ nombre: string; cuerpo: string }> {
  const marcas = [...codigo.matchAll(/export async function (\w+)\(/g)];

  return marcas.map((marca, indice) => {
    const inicio = marca.index;
    const fin = marcas[indice + 1]?.index ?? codigo.length;
    return { nombre: marca[1] as string, cuerpo: codigo.slice(inicio, fin) };
  });
}

/**
 * Funciones que solo leen y por eso no dejan rastro.
 *
 * La lista es explícita a propósito: cualquier función nueva se considera de
 * escritura hasta que alguien la ponga aquí, y ponerla aquí se ve en el diff.
 * Al revés —detectar la escritura sola— fallaría en abierto el día que alguien
 * mutara a través de un repositorio que este archivo no conoce.
 */
const SOLO_LEEN = ['listSpaces', 'spaceDetail', 'platformAuditTrail'];

describe('todo lo que escribe en un espacio ajeno queda registrado', () => {
  /*
   * Poder hacerlo todo y que no quede rastro es lo peligroso. Poder hacerlo
   * todo y que quede, es administrar.
   */
  it('ninguna operación de escritura se salta la bitácora', () => {
    const mudas = exportadas()
      .filter((fn) => !SOLO_LEEN.includes(fn.nombre))
      .filter((fn) => !fn.cuerpo.includes('registrarEnEspacio'))
      .map((fn) => fn.nombre);

    assert.deepEqual(
      mudas,
      [],
      'estas operaciones cambian algo en un espacio ajeno sin dejar constancia: ' +
        mudas.join(', ') +
        '. Si de verdad solo leen, añádelas a SOLO_LEEN y que se vea.',
    );
  });

  it('la bitácora se escribe en el espacio afectado, no en el propio', () => {
    // Que quien administra ese espacio lo vea en su propia bitácora, y no se
    // entere por otro lado —o no se entere—.
    const helper = codigo.slice(codigo.indexOf('async function registrarEnEspacio'));

    assert.match(helper, /auditLog/);
    assert.match(helper, /tenantId,\s*\n\s*userId: adminUserId/);
  });

  it('la acción queda marcada como venida de plataforma', () => {
    const helper = codigo.slice(codigo.indexOf('async function registrarEnEspacio'));
    assert.match(helper, /porPlataforma: true/);
  });
});

describe('toda función de plataforma comprueba que quien llama sea superadmin', () => {
  it('ninguna se salta `assertSuperadmin`', () => {
    const funciones = exportadas();
    assert.ok(funciones.length > 0, 'no se encontró ninguna función exportada');

    const sinGuardia = funciones
      .filter((fn) => !fn.cuerpo.includes('assertSuperadmin'))
      .map((fn) => fn.nombre);

    assert.deepEqual(
      sinGuardia,
      [],
      'estas funciones de plataforma no comprueban el permiso: ' +
        sinGuardia.join(', '),
    );
  });
});
