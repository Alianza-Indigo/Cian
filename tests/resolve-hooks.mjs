/** Gancho de resolucion: alias `@/` y extensiones implicitas. */

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json'];

let rootUrl = '';

export function initialize(data) {
  rootUrl = data.root;
}

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;

  if (target.startsWith('@/')) {
    target = new URL(target.slice(2), rootUrl).href;
  }

  const isPathLike =
    target.startsWith('.') || target.startsWith('/') || target.startsWith('file:');

  const candidates = [target];

  if (isPathLike) {
    for (const extension of EXTENSIONS) {
      candidates.push(`${target}${extension}`);
    }
    for (const extension of EXTENSIONS) {
      candidates.push(`${target}/index${extension}`);
    }
  }

  let firstError;
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context);
    } catch (error) {
      // Se conserva el error del especificador original: el de las variantes
      // inventadas aqui solo confundiria a quien lea la falla.
      firstError ??= error;
    }
  }

  throw firstError;
}
