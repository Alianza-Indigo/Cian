/**
 * La URL pública de la petición en curso.
 *
 * Se prefiere la cabecera `host` a una variable de entorno, y no es un atajo:
 * en una vista previa de Vercel el dominio no es el de producción, y un enlace
 * de invitación que apunta al sitio equivocado no se puede aceptar. Quien lo
 * recibe ve un enlace roto y no tiene forma de arreglarlo.
 *
 * Vive aquí, y no dentro de un `'use server'`, porque lo usan dos sitios que
 * mandan invitaciones —las de un espacio y las de plataforma— y tenerlo dos
 * veces significaría arreglar un día uno y no el otro.
 */
import { headers } from 'next/headers';

export async function requestBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return host ? `${protocol}://${host}` : (process.env.AUTH_URL ?? '');
}
