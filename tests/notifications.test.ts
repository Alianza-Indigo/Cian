/**
 * Recordatorios y notificaciones. Fase 8.
 *
 * Se prueba lo que decide si un aviso llega bien o llega mal:
 *
 * - **El horario**, que es donde viven las zonas horarias y el horario de
 *   verano. Un error aquí manda el recordatorio de las 7:00 a las 13:00.
 * - **Los silencios**, y en particular la franja que cruza la medianoche, que
 *   es el caso normal y el que se escribe mal.
 * - **La criptografía de Web Push**, que está escrita a mano sobre
 *   `node:crypto` porque `web-push` no está en la lista de dependencias
 *   autorizadas del PRD.
 *
 * ## Lo que estas pruebas NO garantizan
 *
 * Que un navegador real descifre el mensaje. Eso exige el vector de prueba
 * oficial del RFC 8291 o un dispositivo, y ninguno estaba disponible al
 * escribir esto. Lo que sí se comprueba: que el contenido cifrado se descifra
 * con una implementación de receptor escrita aparte siguiendo el RFC, que la
 * cabecera del RFC 8188 tiene la disposición exacta, y que el JWT de VAPID
 * valida contra su propia clave pública.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  hkdfSync,
  verify,
} from 'node:crypto';

import {
  describeSchedule,
  isDue,
  isQuietHour,
  localDateKey,
  localPartsIn,
  normalizeSchedule,
} from '../lib/notifications/schedule';
import {
  DEFAULT_QUIET_HOURS,
  SWEEP_HOUR_UTC,
  WEEKDAY_NAMES,
  type ReminderSchedule,
} from '../lib/notifications/types';
import { digestBody } from '../lib/notifications/dispatch';
import {
  encryptPayload,
  fromBase64Url,
  generateVapidKeys,
  toBase64Url,
  vapidAuthorizationHeader,
} from '../lib/notifications/webpush';
import { canComment, SHAREABLE_TYPES } from '../lib/team/types';
import { invitationEmail, reminderEmail } from '../lib/notifications/email';

const MEXICO = 'America/Mexico_City';

function schedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return { hour: 7, minute: 0, days: [], timeZone: MEXICO, ...overrides };
}

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------

describe('hora local', () => {
  it('convierte UTC a la hora de pared de México', () => {
    // 13:00 UTC son las 7:00 en Ciudad de México (UTC-6).
    const parts = localPartsIn(new Date('2026-08-03T13:00:00Z'), MEXICO);

    assert.equal(parts.hour, 7);
    assert.equal(parts.minute, 0);
    assert.equal(parts.weekday, 1, 'el 3 de agosto de 2026 es lunes');
  });

  it('da fechas locales, no las del servidor', () => {
    // Las 3:00 UTC del día 4 son todavía el día 3 en México.
    assert.equal(localDateKey(new Date('2026-08-04T03:00:00Z'), MEXICO), '2026-08-03');
    assert.equal(localDateKey(new Date('2026-08-04T03:00:00Z'), 'UTC'), '2026-08-04');
  });

  it('respeta zonas distintas para el mismo instante', () => {
    const instant = new Date('2026-08-03T13:00:00Z');

    assert.equal(localPartsIn(instant, MEXICO).hour, 7);
    assert.equal(localPartsIn(instant, 'America/Tijuana').hour, 6);
    assert.equal(localPartsIn(instant, 'UTC').hour, 13);
  });
});

describe('horas de silencio', () => {
  it('entiende la franja que cruza la medianoche', () => {
    const nocturno = { startHour: 22, endHour: 7 };

    assert.equal(isQuietHour(23, nocturno), true);
    assert.equal(isQuietHour(2, nocturno), true);
    assert.equal(isQuietHour(6, nocturno), true);
    assert.equal(isQuietHour(7, nocturno), false);
    assert.equal(isQuietHour(15, nocturno), false);
    assert.equal(isQuietHour(21, nocturno), false);
  });

  it('entiende también una franja normal', () => {
    const diurno = { startHour: 9, endHour: 14 };

    assert.equal(isQuietHour(10, diurno), true);
    assert.equal(isQuietHour(14, diurno), false);
    assert.equal(isQuietHour(3, diurno), false);
  });

  it('inicio igual a fin significa sin silencio', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      assert.equal(isQuietHour(hour, { startHour: 0, endHour: 0 }), false);
    }
  });

  it('el valor por omisión protege la noche', () => {
    assert.equal(isQuietHour(3, DEFAULT_QUIET_HOURS), true);
    assert.equal(isQuietHour(9, DEFAULT_QUIET_HOURS), false);
  });
});

describe('a quién le toca en el resumen del día', () => {
  const base = { schedule: schedule(), active: true, lastSentAt: null };

  /*
   * El cron corre una vez al día. Con un solo barrido no hay ventana horaria:
   * si la hubiera, solo se enviaría lo programado justo a la hora del cron y
   * todo lo demás se perdería en silencio. La regla es de día, no de hora.
   */
  it('entra sin importar a qué hora del día corra el barrido', () => {
    for (const instant of [
      '2026-08-03T13:00:00Z',
      '2026-08-03T02:00:00Z',
      '2026-08-03T23:30:00Z',
    ]) {
      assert.equal(isDue(base, new Date(instant)).due, true, instant);
    }
  });

  it('entra aunque su hora ya haya pasado en local', () => {
    // 20:00 UTC son las 14:00 en México: las 7:00 quedaron muy atrás.
    assert.equal(isDue(base, new Date('2026-08-03T20:00:00Z')).due, true);
  });

  it('no sale dos veces el mismo día local', () => {
    const verdict = isDue(
      { ...base, lastSentAt: new Date('2026-08-03T13:02:00Z') },
      new Date('2026-08-03T18:10:00Z'),
    );

    assert.equal(verdict.due, false);
    assert.equal(verdict.due === false && verdict.reason, 'ya_enviado');
  });

  it('vuelve a salir al día siguiente', () => {
    const verdict = isDue(
      { ...base, lastSentAt: new Date('2026-08-03T13:02:00Z') },
      new Date('2026-08-04T13:05:00Z'),
    );

    assert.equal(verdict.due, true);
  });

  it('el corte del duplicado usa el día local, no el del servidor', () => {
    /*
     * 2026-08-04T03:00:00Z sigue siendo el 3 de agosto en México. Si el corte
     * comparara fechas UTC, este recordatorio saldría dos veces el mismo día
     * para quien lo vive.
     */
    const verdict = isDue(
      { ...base, lastSentAt: new Date('2026-08-03T13:00:00Z') },
      new Date('2026-08-04T03:00:00Z'),
    );

    assert.equal(verdict.due, false);
    assert.equal(verdict.due === false && verdict.reason, 'ya_enviado');
  });

  it('respeta los días de la semana', () => {
    // Solo lunes, miércoles y viernes.
    const laborable = { ...base, schedule: schedule({ days: [1, 3, 5] }) };

    // 2026-08-03 es lunes; 2026-08-04, martes.
    assert.equal(isDue(laborable, new Date('2026-08-03T13:00:00Z')).due, true);

    const martes = isDue(laborable, new Date('2026-08-04T13:00:00Z'));
    assert.equal(martes.due, false);
    assert.equal(martes.due === false && martes.reason, 'otro_dia');
  });

  it('el día de la semana se decide en la zona de la persona', () => {
    /*
     * 2026-08-04T03:00:00Z es martes en UTC y lunes en México. Un recordatorio
     * de solo lunes tiene que seguir siendo de lunes para quien lo puso.
     */
    const soloLunes = { ...base, schedule: schedule({ days: [1] }) };
    assert.equal(isDue(soloLunes, new Date('2026-08-04T03:00:00Z')).due, true);
  });

  it('un recordatorio en pausa no sale nunca', () => {
    const verdict = isDue({ ...base, active: false }, new Date('2026-08-03T13:00:00Z'));
    assert.equal(verdict.due, false);
    assert.equal(verdict.due === false && verdict.reason, 'inactivo');
  });

  it('el barrido corre a una hora razonable en el centro de México', () => {
    const sweep = new Date(Date.UTC(2026, 7, 3, SWEEP_HOUR_UTC, 0, 0));
    assert.equal(localPartsIn(sweep, MEXICO).hour, 7);
  });
});

describe('el texto del aviso', () => {
  /*
   * Como el aviso no suena a la hora elegida, esa hora tiene que ir escrita:
   * es lo que convierte el aviso en agenda del día en vez de en una
   * notificación que llega cuando le da la gana.
   */
  it('lleva la hora elegida al frente', () => {
    assert.equal(
      digestBody({ body: 'Empezamos sin prisa.', schedule: { hour: 7, minute: 0 } }),
      'A las 07:00 · Empezamos sin prisa.',
    );
  });

  it('funciona sin cuerpo', () => {
    assert.equal(
      digestBody({ body: null, schedule: { hour: 20, minute: 30 } }),
      'A las 20:30',
    );
  });
});

describe('descripción del horario', () => {
  it('sin días es todos los días', () => {
    assert.equal(
      describeSchedule(schedule(), WEEKDAY_NAMES),
      'Todos los días a las 07:00',
    );
  });

  it('un solo día', () => {
    assert.equal(
      describeSchedule(schedule({ days: [1], minute: 30 }), WEEKDAY_NAMES),
      'Los lunes a las 07:30',
    );
  });

  it('varios días se enumeran con «y» al final', () => {
    assert.equal(
      describeSchedule(schedule({ days: [1, 3, 5] }), WEEKDAY_NAMES),
      'Los lunes, miércoles y viernes a las 07:00',
    );
  });
});

describe('normalización del horario', () => {
  it('recorta horas y minutos fuera de rango', () => {
    const result = normalizeSchedule({
      hour: 99,
      minute: -5,
      days: [],
      timeZone: MEXICO,
    });

    assert.equal(result.hour, 23);
    assert.equal(result.minute, 0);
  });

  it('quita días repetidos e inválidos, y los ordena', () => {
    const result = normalizeSchedule({
      hour: 8,
      minute: 0,
      days: [5, 1, 1, 9, -2, 3],
      timeZone: MEXICO,
    });

    assert.deepEqual(result.days, [1, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

const info = (label: string) =>
  Buffer.concat([Buffer.from(label, 'ascii'), Buffer.from([0])]);

/**
 * Descifrado del lado del navegador, escrito aparte siguiendo los RFC 8188 y
 * 8291.
 *
 * Es código de prueba a propósito duplicado: si compartiera implementación con
 * el emisor, la prueba solo demostraría que el archivo es consistente consigo
 * mismo.
 */
function decryptAsBrowser(
  body: Buffer,
  uaPrivate: Buffer,
  uaPublic: Buffer,
  authSecret: Buffer,
): { text: string; recordSize: number; keyIdLength: number; delimiter: number } {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const keyIdLength = body[20] ?? 0;
  const serverPublic = body.subarray(21, 21 + keyIdLength);
  const ciphertext = body.subarray(21 + keyIdLength);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(serverPublic);

  const prk = createHmac('sha256', authSecret).update(shared).digest();
  const keyInfo = Buffer.concat([info('WebPush: info'), uaPublic, serverPublic]);
  const ikm = createHmac('sha256', prk)
    .update(Buffer.concat([keyInfo, Buffer.from([1])]))
    .digest();

  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, info('Content-Encoding: aes128gcm'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, info('Content-Encoding: nonce'), 12),
  );

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);

  return {
    text: plain.subarray(0, -1).toString('utf8'),
    recordSize,
    keyIdLength,
    delimiter: plain[plain.length - 1] ?? 0,
  };
}

function fakeSubscription() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.from('0123456789abcdef');

  return {
    keys: { p256dh: toBase64Url(ua.getPublicKey()), auth: toBase64Url(auth) },
    privateKey: ua.getPrivateKey(),
    publicKey: ua.getPublicKey(),
    authSecret: auth,
  };
}

describe('cifrado de Web Push', () => {
  it('un receptor independiente recupera el mensaje', () => {
    const subscription = fakeSubscription();
    const message = JSON.stringify({
      title: 'Rutina de la mañana',
      body: 'Empezamos sin prisa.',
    });

    const encrypted = encryptPayload(message, subscription.keys);
    const decrypted = decryptAsBrowser(
      encrypted.body,
      subscription.privateKey,
      subscription.publicKey,
      subscription.authSecret,
    );

    assert.equal(decrypted.text, message);
  });

  it('conserva los acentos', () => {
    const subscription = fakeSubscription();
    const message = 'Es hora de la sesión. ¿Todo bien por ahí?';

    const encrypted = encryptPayload(message, subscription.keys);
    const decrypted = decryptAsBrowser(
      encrypted.body,
      subscription.privateKey,
      subscription.publicKey,
      subscription.authSecret,
    );

    assert.equal(decrypted.text, message);
  });

  it('la cabecera tiene la disposición del RFC 8188', () => {
    const subscription = fakeSubscription();
    const encrypted = encryptPayload('hola', subscription.keys);

    // salt(16) + rs(4) + idlen(1) + clave efímera(65) = 86 bytes.
    assert.equal(encrypted.salt.length, 16);
    assert.equal(encrypted.serverPublicKey.length, 65);
    assert.equal(encrypted.body[20], 65, 'idlen debe declarar 65');
    assert.ok(encrypted.body.length > 86);

    const decrypted = decryptAsBrowser(
      encrypted.body,
      subscription.privateKey,
      subscription.publicKey,
      subscription.authSecret,
    );

    assert.equal(decrypted.recordSize, 4096);
    assert.equal(decrypted.keyIdLength, 65);
    assert.equal(decrypted.delimiter, 2, 'el último registro se marca con 0x02');
  });

  it('un mensaje no se puede descifrar con otra suscripción', () => {
    const mine = fakeSubscription();
    const other = fakeSubscription();

    const encrypted = encryptPayload('secreto', mine.keys);

    assert.throws(() =>
      decryptAsBrowser(
        encrypted.body,
        other.privateKey,
        other.publicKey,
        other.authSecret,
      ),
    );
  });

  it('cada envío usa sal y clave efímera nuevas', () => {
    const subscription = fakeSubscription();

    const first = encryptPayload('hola', subscription.keys);
    const second = encryptPayload('hola', subscription.keys);

    assert.equal(first.salt.equals(second.salt), false);
    assert.equal(first.serverPublicKey.equals(second.serverPublicKey), false);
    assert.equal(first.body.equals(second.body), false);
  });

  it('rechaza una clave p256dh que no es un punto válido', () => {
    assert.throws(() =>
      encryptPayload('hola', { p256dh: toBase64Url(Buffer.alloc(10)), auth: 'AAAA' }),
    );
  });

  it('rechaza un contenido demasiado grande', () => {
    const subscription = fakeSubscription();
    assert.throws(() => encryptPayload('x'.repeat(5000), subscription.keys));
  });
});

describe('VAPID', () => {
  const vapid = { ...generateVapidKeys(), subject: 'mailto:contacto@amecrec.org' };
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
  const header = vapidAuthorizationHeader(endpoint, vapid, 1_000_000);

  it('el JWT valida contra su propia clave pública', () => {
    const token = header.match(/t=([^,]+)/)?.[1] ?? '';
    const [headerPart, payloadPart, signaturePart] = token.split('.');

    const publicBytes = fromBase64Url(vapid.publicKey);
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: toBase64Url(publicBytes.subarray(1, 33)),
        y: toBase64Url(publicBytes.subarray(33, 65)),
      },
      format: 'jwk',
    });

    assert.ok(
      verify(
        'sha256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        { key, dsaEncoding: 'ieee-p1363' },
        fromBase64Url(signaturePart ?? ''),
      ),
    );
  });

  it('la audiencia es el origen del endpoint, no la URL completa', () => {
    const token = header.match(/t=([^,]+)/)?.[1] ?? '';
    const payload = JSON.parse(fromBase64Url(token.split('.')[1] ?? '').toString());

    assert.equal(payload.aud, 'https://fcm.googleapis.com');
    assert.equal(payload.sub, 'mailto:contacto@amecrec.org');
  });

  it('la caducidad no pasa de las 24 horas que permite el RFC 8292', () => {
    const token = header.match(/t=([^,]+)/)?.[1] ?? '';
    const payload = JSON.parse(fromBase64Url(token.split('.')[1] ?? '').toString());

    assert.ok(payload.exp > 1_000_000);
    assert.ok(payload.exp - 1_000_000 <= 24 * 3600);
  });

  it('lleva la clave pública en el parámetro k', () => {
    assert.ok(header.startsWith('vapid t='));
    assert.ok(header.includes(`k=${vapid.publicKey}`));
  });

  it('genera pares distintos cada vez', () => {
    assert.notEqual(generateVapidKeys().publicKey, generateVapidKeys().publicKey);
  });
});

// ---------------------------------------------------------------------------
// Correo y permisos
// ---------------------------------------------------------------------------

describe('plantillas de correo', () => {
  it('la invitación no revela qué se comparte', () => {
    const message = invitationEmail({
      to: 'maestra@escuela.mx',
      inviterName: 'Ana',
      acceptUrl: 'https://cian.mx/invitacion/abc',
    });

    assert.ok(message.text.includes('https://cian.mx/invitacion/abc'));
    // Un correo puede acabar en una bandeja compartida o en una vista previa.
    for (const filtrado of ['plan', 'rutina', 'crisis', 'diagnóstico']) {
      assert.equal(
        message.text.toLowerCase().includes(filtrado),
        false,
        `la invitación no debe mencionar «${filtrado}»`,
      );
    }
  });

  it('la invitación explica que pertenecer no da acceso', () => {
    const message = invitationEmail({
      to: 'a@b.mx',
      inviterName: 'Ana',
      acceptUrl: 'https://cian.mx/invitacion/x',
    });

    assert.ok(message.text.includes('no te da acceso a nada por sí solo'));
  });

  it('el recordatorio lleva solo lo que la persona escribió', () => {
    const message = reminderEmail({
      to: 'a@b.mx',
      title: 'Rutina de la mañana',
      body: 'Empezamos sin prisa.',
    });

    assert.equal(message.subject, 'Rutina de la mañana');
    assert.ok(message.text.includes('Empezamos sin prisa.'));
  });
});

describe('permisos de lo compartido', () => {
  it('solo el permiso de comentario permite escribir', () => {
    assert.equal(canComment('comentario'), true);
    assert.equal(canComment('lectura'), false);
  });

  it('la bitácora de crisis no se puede compartir', () => {
    // El PRD la usa como ejemplo de lo que alguien puede querer no compartir.
    for (const forbidden of ['crisis', 'chat', 'conversacion', 'memoria']) {
      assert.equal(
        (SHAREABLE_TYPES as readonly string[]).includes(forbidden),
        false,
        `«${forbidden}» no debe ser compartible`,
      );
    }
  });
});
