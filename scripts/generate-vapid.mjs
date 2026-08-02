/**
 * Genera el par de claves VAPID para las notificaciones push.
 *
 * Se ejecuta UNA vez y el resultado se pega en las variables de entorno de
 * Vercel. Rotar la clave publica desuscribe a todos los dispositivos, asi que
 * no conviene volver a correrlo salvo que se quiera exactamente eso.
 *
 * Uso: pnpm vapid:generate
 */
import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();

console.log('Pega esto en las variables de entorno del proyecto:\n');
console.log(`VAPID_PUBLIC_KEY="${ecdh.getPublicKey().toString('base64url')}"`);
console.log(`VAPID_PRIVATE_KEY="${ecdh.getPrivateKey().toString('base64url')}"`);
console.log('VAPID_SUBJECT="mailto:contacto@alianzaindigo.org"');
console.log(
  '\nGuardalas antes de cerrar la terminal: la clave privada no se puede recuperar.',
);
