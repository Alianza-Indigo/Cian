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

describe('todo lo que escribe en un espacio ajeno queda registrado', () => {
  it('la verificación desde plataforma escribe en la auditoría', () => {
    /*
     * Poder hacerlo todo y que no quede rastro es lo peligroso. Poder hacerlo
     * todo y que quede, es administrar.
     */
    const bloque = codigo.slice(codigo.indexOf('setVerificationAnywhere'));
    assert.match(bloque, /auditLog/);
    assert.match(bloque, /plataforma\./);
  });

  it('la auditoría se escribe en el espacio afectado, no en el propio', () => {
    // Que quien administra ese espacio lo vea en su propia bitácora.
    const bloque = codigo.slice(codigo.indexOf('setVerificationAnywhere'));
    assert.match(bloque, /tenantId,\s*\n\s*userId: admin\.ctx\.userId/);
  });
});

describe('toda función de plataforma comprueba que quien llama sea superadmin', () => {
  it('ninguna se salta `assertSuperadmin`', () => {
    const exportadas = [...codigo.matchAll(/export async function (\w+)\(/g)].map(
      (match) => match[1],
    );

    assert.ok(exportadas.length > 0, 'no se encontró ninguna función exportada');

    const sinGuardia = exportadas.filter((nombre) => {
      const inicio = codigo.indexOf(`export async function ${nombre}(`);
      const siguiente = codigo.indexOf('export async function ', inicio + 10);
      const cuerpo = codigo.slice(
        inicio,
        siguiente === -1 ? codigo.length : siguiente,
      );
      return !cuerpo.includes('assertSuperadmin');
    });

    assert.deepEqual(
      sinGuardia,
      [],
      'estas funciones de plataforma no comprueban el permiso: ' +
        sinGuardia.join(', '),
    );
  });
});
