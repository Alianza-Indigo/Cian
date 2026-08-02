/**
 * Quién ve qué en el menú.
 *
 * ## El error que esta prueba existe para que no vuelva
 *
 * «Mi perfil profesional» salía en todas las cuentas, incluidas las de familias
 * que no van a atender a nadie. Se arregló escondiendo el bloque tras «tiene rol
 * de profesional **o administra el espacio**»… y siguió saliendo en todas.
 *
 * La razón es la que hace que este error sea fácil de repetir: al entrar por
 * primera vez, **cada persona recibe un espacio personal del que es `owner`**, y
 * `owner` pasa cualquier comprobación de admin. `hasRoleAtLeast(ctx, 'admin')`
 * no significa «lleva una organización», significa «tiene una cuenta». Cualquier
 * cosa que se esconda detrás de esa comprobación, en la práctica, no está
 * escondida.
 *
 * Es la misma familia de fallos ya anotada en NOTES: código que era correcto
 * cuando cada quien estaba solo en su espacio deja de serlo en cuanto hay más
 * de una persona o se mira desde fuera.
 *
 * ## Por qué es una comprobación de texto
 *
 * El layout es un componente de servidor que abre sesión y base de datos: no se
 * puede importar en una prueba sin infraestructura. Se lee el archivo. Basta,
 * porque lo que se vigila es una decisión escrita en una línea concreta.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const LAYOUT = 'app/(app)/layout.tsx';

const fuente = readFileSync(LAYOUT, 'utf8');

/** El código, sin comentarios: ahí sí se habla de admin, y está bien. */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/**
 * Lo que se le **pasa** a `navGroupsFor`, que es donde está la decisión.
 *
 * Se acota a la llamada a propósito: el nombre `canPractice` aparece antes, en
 * la firma de la función, y mirar ahí daría por buena cualquier cosa.
 */
function argumento(nombre: string): string {
  const llamada = codigo.indexOf('navGroupsFor({');
  assert.notEqual(llamada, -1, `no se encontró la llamada a navGroupsFor en ${LAYOUT}`);

  const inicio = codigo.indexOf(`${nombre}:`, llamada);
  assert.notEqual(inicio, -1, `no se le pasa \`${nombre}\` a navGroupsFor`);

  const fin = codigo.indexOf('\n', inicio);
  return codigo.slice(inicio, fin === -1 ? codigo.length : fin);
}

describe('el bloque de quien atiende no se enseña a todo el mundo', () => {
  it('`canPractice` no se deduce del rol de admin', () => {
    /*
     * Si esta prueba falla, lo más probable es que alguien haya vuelto a
     * escribir `hasRoleAtLeast(ctx, 'admin')` aquí pensando en el admin de una
     * organización. Es cierto para toda cuenta recién creada.
     */
    assert.equal(
      /hasRoleAtLeast/.test(argumento('canPractice')),
      false,
      'canPractice no puede depender del rol de admin: cada persona es `owner` ' +
        'de su espacio personal, así que esa comprobación es cierta para todo ' +
        'el mundo y el bloque volvería a salir en cuentas que no atienden.',
    );
  });

  it('`canPractice` se decide por el rol de profesional o por tener perfil', () => {
    const linea = argumento('canPractice');

    assert.match(linea, /professional/);
    assert.match(linea, /profile/);
  });

  it('el layout consulta de verdad el perfil profesional', () => {
    // Sin esta consulta, `profile` sería siempre `undefined` y el bloque no
    // aparecería nunca: el error contrario, igual de silencioso.
    assert.match(codigo, /getMyProfessionalProfile\(ctx\)/);
  });

  it('la membresía sí depende del rol de admin, y eso es correcto', () => {
    /*
     * El contraste importa: que un `owner` de su espacio personal vea
     * «Membresía» es lo que se quiere —es su suscripción—. No todo lo que se
     * esconde tras admin está mal; lo que estaba mal era esconder ahí algo que
     * habla de atender a otras personas.
     */
    assert.match(argumento('isSpaceAdmin'), /hasRoleAtLeast/);
  });
});
