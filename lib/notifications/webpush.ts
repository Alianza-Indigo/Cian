/**
 * Web Push con VAPID, escrito sobre `node:crypto`.
 *
 * ## Por qué está escrito a mano
 *
 * La biblioteca habitual para esto es `web-push`, que no está en la lista de
 * dependencias autorizadas del PRD (sección 2). La regla dice que cualquier
 * otra se propone antes de instalar, así que aquí está la implementación
 * mínima, sin dependencias, sobre primitivas que Node ya trae.
 *
 * No es código de andar por casa: son dos especificaciones encadenadas.
 *
 * - **RFC 8291** — cifrado del contenido: ECDH sobre P-256 contra la clave
 *   pública del navegador, HKDF con el `auth` de la suscripción, y de ahí las
 *   claves de RFC 8188.
 * - **RFC 8188** — el formato `aes128gcm`: cabecera con sal, tamaño de
 *   registro y clave efímera, seguida del registro cifrado.
 * - **RFC 8292** — VAPID: un JWT ES256 que identifica al servidor ante el
 *   servicio de push.
 *
 * ## Qué está verificado y qué no
 *
 * Las pruebas comprueban lo que se puede comprobar sin un navegador: que el
 * JWT valida contra su clave pública, que el secreto ECDH coincide en ambos
 * sentidos, que la cabecera tiene exactamente el tamaño y la disposición que
 * manda el RFC 8188, y que el contenido cifrado se descifra de vuelta con una
 * implementación de receptor escrita aparte.
 *
 * Lo que **no** está verificado: que un navegador real lo descifre. Eso exige
 * el vector de prueba oficial del RFC 8291 o un dispositivo, y ninguno de los
 * dos estaba a mano al escribirlo. Si en pruebas reales la notificación llega
 * vacía o el servicio devuelve 400, lo más probable es que falle una de las
 * cadenas `info` de aquí abajo, y sustituir este archivo por `web-push` son
 * quince líneas. Está anotado en NOTES.md.
 */
import {
  createECDH,
  createCipheriv,
  createHmac,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as signWith,
} from 'node:crypto';

export const CONTENT_ENCODING = 'aes128gcm';

/** Tamaño de registro del RFC 8188. Uno solo por mensaje: son cortos. */
const RECORD_SIZE = 4096;

/** Los servicios de push rechazan cargas mayores. */
export const MAX_PAYLOAD_BYTES = 3800;

/** Horas de validez del JWT de VAPID. El RFC 8292 permite hasta 24. */
const VAPID_TTL_HOURS = 12;

export type PushSubscriptionKeys = {
  /** Clave pública del navegador, P-256 sin comprimir, base64url. */
  p256dh: string;
  /** Secreto de autenticación de la suscripción, 16 bytes, base64url. */
  auth: string;
};

export type PushTarget = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  /** `mailto:` o `https:` de contacto. Lo exige el RFC 8292. */
  subject: string;
};

export type PushResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string; gone: boolean };

// --- base64url ---------------------------------------------------------------

export function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

// --- VAPID -------------------------------------------------------------------

/**
 * Genera un par de claves VAPID. Se usa una sola vez, a mano, y el resultado
 * se guarda en las variables de entorno: rotar la clave pública desuscribe a
 * todo el mundo.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();

  return {
    publicKey: toBase64Url(ecdh.getPublicKey()),
    privateKey: toBase64Url(ecdh.getPrivateKey()),
  };
}

/** La clave privada de VAPID viaja como 32 bytes crudos; aquí se vuelve JWK. */
function vapidPrivateKeyObject(privateKey: string, publicKey: string) {
  const publicBytes = fromBase64Url(publicKey);

  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error('La clave pública de VAPID debe ser un punto P-256 sin comprimir.');
  }

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x: toBase64Url(publicBytes.subarray(1, 33)),
      y: toBase64Url(publicBytes.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/**
 * Cabecera `Authorization` del RFC 8292.
 *
 * `nowSeconds` se recibe en vez de leerse del reloj para poder probar la
 * caducidad sin esperar doce horas.
 */
export function vapidAuthorizationHeader(
  endpoint: string,
  vapid: VapidKeys,
  nowSeconds: number,
): string {
  const audience = new URL(endpoint).origin;

  const header = toBase64Url(
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  );
  const payload = toBase64Url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: nowSeconds + VAPID_TTL_HOURS * 3600,
        sub: vapid.subject,
      }),
    ),
  );

  const signingInput = `${header}.${payload}`;

  // `ieee-p1363` da la firma cruda r||s de 64 bytes que espera JWS; el formato
  // por omisión de Node es DER y el servicio de push la rechazaría.
  const signature = signWith(
    'sha256',
    Buffer.from(signingInput),
    {
      key: vapidPrivateKeyObject(vapid.privateKey, vapid.publicKey),
      dsaEncoding: 'ieee-p1363',
    },
  );

  const token = `${signingInput}.${toBase64Url(signature)}`;

  return `vapid t=${token}, k=${vapid.publicKey}`;
}

// --- Cifrado del contenido (RFC 8291 sobre RFC 8188) -------------------------

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
}

/** `label || 0x00` — así construyen su `info` los dos RFC. */
function infoString(label: string): Buffer {
  return Buffer.concat([Buffer.from(label, 'ascii'), Buffer.from([0])]);
}

export type EncryptedPush = {
  body: Buffer;
  salt: Buffer;
  serverPublicKey: Buffer;
};

/**
 * Cifra el contenido para una suscripción.
 *
 * `salt` y `serverKeys` se pueden inyectar: sin eso no hay forma de escribir
 * una prueba determinista de algo que por definición es aleatorio.
 */
export function encryptPayload(
  payload: string,
  keys: PushSubscriptionKeys,
  options: { salt?: Buffer; serverPrivateKey?: Buffer } = {},
): EncryptedPush {
  const plaintext = Buffer.from(payload, 'utf8');
  if (plaintext.length > MAX_PAYLOAD_BYTES) {
    throw new Error('El contenido de la notificación es demasiado grande.');
  }

  const clientPublicKey = fromBase64Url(keys.p256dh);
  const authSecret = fromBase64Url(keys.auth);

  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 0x04) {
    throw new Error('La clave p256dh de la suscripción no es válida.');
  }

  const ecdh = createECDH('prime256v1');
  if (options.serverPrivateKey) ecdh.setPrivateKey(options.serverPrivateKey);
  else ecdh.generateKeys();

  const serverPublicKey = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublicKey);
  const salt = options.salt ?? randomBytes(16);

  /*
   * RFC 8291 §3.3. El `auth` de la suscripción es la sal de esta extracción, y
   * el `info` amarra el material de clave a las dos partes concretas: si el
   * mensaje se reenviara a otra suscripción, no se descifraría.
   */
  const prk = createHmac('sha256', authSecret).update(sharedSecret).digest();
  const keyInfo = Buffer.concat([
    infoString('WebPush: info'),
    clientPublicKey,
    serverPublicKey,
  ]);
  const ikm = createHmac('sha256', prk)
    .update(Buffer.concat([keyInfo, Buffer.from([1])]))
    .digest();

  // RFC 8188 §2.2.
  const contentKey = hkdf(salt, ikm, infoString(`Content-Encoding: ${CONTENT_ENCODING}`), 16);
  const nonce = hkdf(salt, ikm, infoString('Content-Encoding: nonce'), 12);

  /*
   * El 0x02 es el delimitador de «último registro» del RFC 8188. Va dentro del
   * texto cifrado, no fuera: por eso se concatena antes de cifrar.
   */
  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // Cabecera: salt(16) | rs(4, big endian) | idlen(1) | keyid(65).
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(RECORD_SIZE, 0);

  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublicKey.length]),
    serverPublicKey,
  ]);

  return {
    body: Buffer.concat([header, ciphertext]),
    salt,
    serverPublicKey,
  };
}

// --- Envío -------------------------------------------------------------------

/**
 * Códigos que significan «esta suscripción ya no existe».
 *
 * Se tratan aparte porque la respuesta correcta no es reintentar sino borrar
 * la fila: un dispositivo que desinstaló la aplicación devolvería 410 para
 * siempre, y reintentarlo cada quince minutos es gastar cuota en nada.
 */
const GONE_STATUSES = new Set([404, 410]);

export async function sendPush(
  target: PushTarget,
  payload: string,
  vapid: VapidKeys,
  options: { ttlSeconds?: number; nowSeconds?: number } = {},
): Promise<PushResult> {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  let encrypted: EncryptedPush;
  try {
    encrypted = encryptPayload(payload, target.keys);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'No se pudo cifrar.',
      gone: false,
    };
  }

  try {
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorizationHeader(target.endpoint, vapid, nowSeconds),
        'Content-Encoding': CONTENT_ENCODING,
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttlSeconds ?? 3600),
      },
      body: new Uint8Array(encrypted.body),
    });

    if (response.ok) return { ok: true, status: response.status };

    return {
      ok: false,
      status: response.status,
      // El cuerpo del error no se guarda entero: puede traer identificadores
      // del dispositivo, y la regla 3.6 pide que no acaben en un registro.
      error: `El servicio de push respondió ${response.status}.`,
      gone: GONE_STATUSES.has(response.status),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Fallo de red.',
      gone: false,
    };
  }
}

/** Lee las claves VAPID del entorno. `null` cuando no están configuradas. */
export function vapidFromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;

  return { publicKey, privateKey, subject };
}
