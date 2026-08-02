/**
 * ESLint. Configuración plana (ESLint 9).
 *
 * ## Por qué llega ahora y no en la Fase 0
 *
 * El PRD trae una lista cerrada de dependencias autorizadas y su regla de oro
 * dice que no se instala nada fuera de ella sin preguntar. ESLint no estaba en
 * la lista, así que el proyecto se construyó con `tsc --noEmit` como única red y
 * el linter quedó anotado como pendiente hasta que se autorizó explícitamente.
 *
 * ## Qué añade sobre `tsc`
 *
 * TypeScript comprueba tipos y no ve nada de esto:
 *
 * - Dependencias mal declaradas en `useEffect` y `useMemo`, que en React 19 con
 *   Server Components producen datos rancios en pantalla sin error alguno.
 * - Accesibilidad: `alt` que falta, controles sin etiqueta, `aria-*` mal
 *   escrito. En una plataforma cuyo público incluye a personas que navegan con
 *   lector de pantalla, esto no es cosmética.
 * - `<img>` donde debería ir `next/image`, y viceversa.
 *
 * ## Lo que aquí NO se activa
 *
 * `eslint-config-next` en modo `core-web-vitals` y nada más. Ni reglas de
 * estilo —el formato ya es consistente y discutirlo con una herramienta no
 * arregla nada—, ni `typescript-eslint` con reglas que exigen información de
 * tipos: eso es otra dependencia grande y otra pasada completa del compilador
 * en cada ejecución, y `tsc --noEmit` ya cubre lo que aportaría.
 *
 * Las reglas que se apagan abajo van una a una y con su motivo. Un `rules: {}`
 * largo sin explicación es cómo un linter deja de significar algo.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      // Migraciones generadas por drizzle-kit: no se escriben a mano.
      'lib/db/migrations/**',
      'public/**',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      /*
       * Las variables sin usar avisan, no rompen. Suele ser código a medias
       * durante una edición, y frenar la ejecución entera por eso convierte al
       * linter en un estorbo que se acaba desactivando.
       *
       * El guion bajo delante marca lo deliberado: un parámetro que hay que
       * declarar para llegar al siguiente, o una desestructuración que descarta
       * campos a propósito.
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    /*
     * Las pruebas usan `any` al construir objetos que imitan respuestas de
     * terceros —Stripe, Web Push— y contextos de tenant inválidos a propósito.
     * Tipar un contexto que existe justamente para ser rechazado es tipar la
     * ausencia de tipo.
     */
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    /*
     * Los scripts de build son `.mjs` de Node, sin JSX ni React. Las reglas de
     * Next no vienen a cuento ahí.
     */
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];

export default config;
