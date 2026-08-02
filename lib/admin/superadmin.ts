/**
 * Quién es superadmin de la plataforma.
 *
 * Va en su propio módulo, sin importar nada de Next ni de la base, por la
 * misma razón que el resto de módulos puros de CIAN: para poder probarlo. Su
 * hermano `access.ts` sí toca sesión y contexto de tenant, y eso lo hace
 * imposible de cargar fuera del servidor de Next.
 *
 * ## Por qué una variable de entorno y no una columna
 *
 * Podría ser un campo en `users`. Se descartó: una fila que concede poder sobre
 * toda la plataforma es una fila que alguien puede escribir desde una
 * inyección, un `UPDATE` mal hecho o un volcado restaurado. Una variable de
 * entorno solo la cambia quien tiene acceso al proyecto en Vercel, y ese es
 * exactamente el conjunto de personas que debería poder concederlo.
 */

/** Correos con poder sobre toda la plataforma, separados por comas. */
export function superadminEmails(): string[] {
  return (process.env.CIAN_SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** El correo se compara normalizado: nadie recuerda cómo lo escribió. */
export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superadminEmails().includes(email.trim().toLowerCase());
}
