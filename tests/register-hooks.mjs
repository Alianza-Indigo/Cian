/**
 * Habilita en Node los mismos atajos de importacion que usa TypeScript:
 * el alias `@/` y las rutas sin extension.
 *
 * Se hace con los ganchos nativos de `node:module` para no sumar una
 * dependencia de ejecucion de pruebas al proyecto. Node 22 ya entiende
 * TypeScript por si mismo, asi que no hace falta transpilar.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./resolve-hooks.mjs', import.meta.url, {
  data: { root: pathToFileURL(`${process.cwd()}/`).href },
});
