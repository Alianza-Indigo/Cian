/**
 * Tokens de acceso a la sala de LiveKit. Fase 10.
 *
 * El PRD lo pide con estas palabras: «el token se emite desde una API route, el
 * WebRTC vive en el navegador». Esto es la primera mitad.
 *
 * ## Sin `livekit-server-sdk`
 *
 * Un token de LiveKit es un JWT firmado con HS256: cabecera, reclamaciones y
 * HMAC-SHA256 con el secreto de la API. `node:crypto` lo hace, y el SDK de
 * servidor no está en la lista de dependencias autorizadas del PRD.
 *
 * La **segunda mitad** —el cliente WebRTC del navegador— sí necesita
 * `livekit-client`, y eso no se puede escribir a mano de forma razonable:
 * señalización, ICE, publicación de pistas y recuperación de red son un
 * protocolo entero. Está anotado en NOTES.md como la única dependencia que esta
 * fase no puede evitar.
 *
 * ## Los permisos no son decorativos
 *
 * `roomRecord` se concede **solo** cuando `lib/consultorio/consent.ts` dice que
 * ambas partes firmaron. Esa es la capa que hace imposible grabar sin
 * consentimiento aunque alguien manipule el cliente: sin el permiso en el
 * token, el servidor de medios rechaza la grabación.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Cuánto vive un token. Corto: se pide uno nuevo al entrar a la sala. */
export const TOKEN_TTL_SECONDS = 60 * 60 * 4;

export type RoomRole = 'profesional' | 'usuario';

export type TokenGrants = {
  room: string;
  identity: string;
  name: string;
  role: RoomRole;
  /** Solo `true` si el consentimiento de ambas partes está registrado. */
  canRecord: boolean;
};

export function livekitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.NEXT_PUBLIC_LIVEKIT_URL,
  );
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

/**
 * Nombre de la sala.
 *
 * Se deriva de la cita y del tenant, y **nunca lo elige el cliente**. Si el
 * navegador pudiera pedir un nombre de sala arbitrario, cualquiera podría
 * entrar a la consulta de otra persona con solo adivinarlo.
 */
export function roomNameFor(tenantId: string, appointmentId: string): string {
  return `cian-${tenantId}-${appointmentId}`;
}

export type SignedToken = { token: string; url: string; expiresAt: string };

export function createAccessToken(
  grants: TokenGrants,
  nowSeconds: number,
): SignedToken | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) return null;

  const expiresAt = nowSeconds + TOKEN_TTL_SECONDS;

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: apiKey,
      sub: grants.identity,
      // `nbf` un poco antes: los relojes de los servidores no van sincronizados
      // al segundo y un token «del futuro» se rechaza sin explicación útil.
      nbf: nowSeconds - 10,
      exp: expiresAt,
      name: grants.name,
      metadata: JSON.stringify({ role: grants.role }),
      video: {
        room: grants.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        // Datos: el chat de la sesión y la pizarra viajan por aquí.
        canPublishData: true,
        // La pieza que hace imposible grabar sin consentimiento.
        roomRecord: grants.canRecord,
      },
    }),
  );

  const signature = createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return {
    token: `${header}.${payload}.${signature}`,
    url,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export type TokenClaims = {
  iss: string;
  sub: string;
  exp: number;
  nbf: number;
  video: {
    room: string;
    roomJoin: boolean;
    roomRecord: boolean;
    canPublish: boolean;
  };
};

/**
 * Verifica y lee un token. Existe para las pruebas y para depurar.
 *
 * LiveKit valida por su cuenta; esto no está en el camino de ninguna petición.
 * Pero un emisor de tokens sin forma de comprobar lo que emite es un emisor que
 * nadie puede auditar.
 */
export function verifyAccessToken(
  token: string,
  apiSecret: string,
  nowSeconds: number,
): { valid: true; claims: TokenClaims } | { valid: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'Formato no válido.' };

  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac('sha256', apiSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');

  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { valid: false, reason: 'La firma no coincide.' };
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Reclamaciones ilegibles.' };
  }

  if (nowSeconds >= claims.exp) return { valid: false, reason: 'Token caducado.' };
  if (nowSeconds < claims.nbf) return { valid: false, reason: 'Token todavía no válido.' };

  return { valid: true, claims };
}
