/**
 * Membresías y panel administrativo. Fase 9.
 *
 * Se prueban las dos cosas que, si fallan, fallan caro:
 *
 * - **La firma del webhook de Stripe.** Un webhook de pagos sin verificar es
 *   una puerta abierta: cualquiera que conozca la URL podría declarar que pagó
 *   y darse un plan. Aquí se comprueba que solo pasa lo firmado, con el
 *   secreto correcto y dentro de la ventana de tiempo.
 * - **Los límites de plan.** El criterio del PRD pide «un mensaje claro con la
 *   opción de mejorar plan, no un error», y eso solo se puede verificar
 *   leyendo el mensaje.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'node:crypto';

import {
  checkLimit,
  currentPeriodStart,
  effectivePlan,
  grantLimits,
  nextPlan,
  resolveLimits,
  sanitizeGrantedLimits,
  GRANT_MODES,
} from '../lib/billing/limits';
import {
  DEFAULT_PLAN_LIMITS,
  PLANS,
  SUBSCRIPTION_STATUSES,
  formatBytes,
  grantsAccess,
} from '../lib/billing/types';
import {
  SIGNATURE_TOLERANCE_SECONDS,
  encodeForm,
  tenantIdFromEvent,
  toSubscriptionStatus,
  verifyWebhookSignature,
} from '../lib/billing/stripe';
import { isSuperadminEmail, superadminEmails } from '../lib/admin/superadmin';

// ---------------------------------------------------------------------------
// Límites de plan
// ---------------------------------------------------------------------------

describe('límites de plan', () => {
  const free = DEFAULT_PLAN_LIMITS.free;

  it('deja pasar mientras quede sitio', () => {
    const verdict = checkLimit({
      resource: 'documentos',
      used: 3,
      plan: 'free',
      limits: free,
    });

    assert.equal(verdict.allowed, true);
    assert.equal(verdict.allowed === true && verdict.remaining, free.documentos! - 4);
  });

  it('deja pasar justo en el último hueco', () => {
    const verdict = checkLimit({
      resource: 'documentos',
      used: free.documentos! - 1,
      plan: 'free',
      limits: free,
    });

    assert.equal(verdict.allowed, true);
    assert.equal(verdict.allowed === true && verdict.remaining, 0);
  });

  it('corta al pasarse por uno', () => {
    const verdict = checkLimit({
      resource: 'documentos',
      used: free.documentos!,
      plan: 'free',
      limits: free,
    });

    assert.equal(verdict.allowed, false);
  });

  it('cuenta el tamaño real de un archivo, no una unidad', () => {
    const verdict = checkLimit({
      resource: 'almacenamiento',
      used: free.almacenamiento! - 1024,
      plan: 'free',
      limits: free,
      amount: 5 * 1024 * 1024,
    });

    assert.equal(verdict.allowed, false);
  });

  it('«sin límite» no es lo mismo que cero', () => {
    const verdict = checkLimit({
      resource: 'mensajes',
      used: 999_999,
      plan: 'organization',
      limits: DEFAULT_PLAN_LIMITS.organization,
    });

    assert.equal(verdict.allowed, true);
    assert.equal(verdict.allowed === true && verdict.remaining, null);
  });

  /*
   * El criterio del PRD es sobre el mensaje, no sobre el booleano: «alcanzar un
   * límite produce un mensaje claro con la opción de mejorar plan, no un
   * error».
   */
  it('el mensaje dice qué pasó, cuándo se soluciona y cómo ampliarlo', () => {
    const verdict = checkLimit({
      resource: 'mensajes',
      used: 500,
      plan: 'free',
      limits: free,
    });

    assert.equal(verdict.allowed, false);
    if (verdict.allowed) return;

    assert.match(verdict.message, /plan Gratuito/);
    assert.match(verdict.message, /se reinicia/);
    assert.match(verdict.message, /plan Personal/, 'debe ofrecer mejorar de plan');
    assert.equal(verdict.upgradeTo, 'personal');
  });

  it('el mensaje no suena a error ni a castigo', () => {
    for (const resource of ['mensajes', 'documentos', 'almacenamiento', 'equipo_de_apoyo'] as const) {
      // Cada recurso tiene su escala: pasarse de mensajes no es lo mismo que
      // pasarse de bytes, y un número fijo no desborda los cuatro.
      const verdict = checkLimit({
        resource,
        used: free[resource]! + 1,
        plan: 'free',
        limits: free,
      });

      assert.equal(verdict.allowed, false);
      if (verdict.allowed) continue;

      for (const palabra of ['error', 'prohibido', 'no puedes', 'denegado']) {
        assert.equal(
          verdict.message.toLowerCase().includes(palabra),
          false,
          `«${palabra}» no debería aparecer en: ${verdict.message}`,
        );
      }
    }
  });

  it('en el plan mayor no ofrece mejorar a ninguna parte', () => {
    const verdict = checkLimit({
      resource: 'almacenamiento',
      used: DEFAULT_PLAN_LIMITS.organization.almacenamiento!,
      plan: 'organization',
      limits: DEFAULT_PLAN_LIMITS.organization,
    });

    assert.equal(verdict.allowed, false);
    if (verdict.allowed) return;

    assert.equal(verdict.upgradeTo, null);
    assert.equal(verdict.message.includes('plan Organización amplía'), false);
  });

  it('la escalera de planes va hacia arriba y se acaba', () => {
    assert.equal(nextPlan('free'), 'personal');
    assert.equal(nextPlan('personal'), 'organization');
    assert.equal(nextPlan('organization'), null);
  });

  it('el plan gratuito es utilizable, no una demostración', () => {
    // Un límite que se agota la primera semana no es un plan gratuito.
    assert.ok(DEFAULT_PLAN_LIMITS.free.mensajes! >= 100);
    assert.ok(DEFAULT_PLAN_LIMITS.free.documentos! >= 5);
    assert.ok(DEFAULT_PLAN_LIMITS.free.equipo_de_apoyo! >= 2);
  });
});

describe('mezcla de límites de la tabla con los del código', () => {
  it('lo que viene de la tabla manda', () => {
    const limits = resolveLimits('free', { mensajes: 999 });
    assert.equal(limits.mensajes, 999);
  });

  /*
   * Esta es la que importa: una fila a medias no puede dejar campos en
   * `undefined`, porque `undefined` no es `null` pero se comportaría como «sin
   * límite» y abriría la puerta de par en par sin que nadie se entere.
   */
  it('una fila incompleta no deja campos sin límite', () => {
    const limits = resolveLimits('free', { mensajes: 50 });

    assert.equal(limits.documentos, DEFAULT_PLAN_LIMITS.free.documentos);
    assert.equal(limits.almacenamiento, DEFAULT_PLAN_LIMITS.free.almacenamiento);
    assert.equal(limits.equipo_de_apoyo, DEFAULT_PLAN_LIMITS.free.equipo_de_apoyo);
    assert.notEqual(limits.documentos, undefined);
  });

  it('un `null` explícito sí quita el límite', () => {
    assert.equal(resolveLimits('free', { mensajes: null }).mensajes, null);
  });

  it('sin fila, los del código', () => {
    assert.deepEqual(resolveLimits('personal', null), DEFAULT_PLAN_LIMITS.personal);
  });
});

describe('ventana de los contadores', () => {
  it('empieza el día 1 del mes en UTC', () => {
    const start = currentPeriodStart(new Date('2026-08-17T23:45:00Z'));
    assert.equal(start.toISOString(), '2026-08-01T00:00:00.000Z');
  });
});

describe('estados de suscripción', () => {
  it('un pago que falló no corta el acceso', () => {
    // Stripe reintenta durante días; cortar al primer fallo dejaría a una
    // familia sin herramientas por una tarjeta vencida.
    assert.equal(grantsAccess('pago_pendiente'), true);
  });

  it('cancelada e incompleta no dan acceso', () => {
    assert.equal(grantsAccess('cancelada'), false);
    assert.equal(grantsAccess('incompleta'), false);
  });

  it('traduce los estados de Stripe', () => {
    assert.equal(toSubscriptionStatus('active'), 'activa');
    assert.equal(toSubscriptionStatus('trialing'), 'periodo_de_prueba');
    assert.equal(toSubscriptionStatus('past_due'), 'pago_pendiente');
    assert.equal(toSubscriptionStatus('unpaid'), 'pago_pendiente');
    assert.equal(toSubscriptionStatus('canceled'), 'cancelada');
  });

  it('un estado desconocido cae del lado que NO da acceso', () => {
    // Ante algo que no sabemos leer, la respuesta segura es no conceder nada.
    assert.equal(toSubscriptionStatus('algo_nuevo_de_stripe'), 'incompleta');
    assert.equal(grantsAccess(toSubscriptionStatus('algo_nuevo_de_stripe')), false);
  });

  it('los valores de enum son identificadores limpios de Postgres', () => {
    for (const value of [...PLANS, ...SUBSCRIPTION_STATUSES]) {
      assert.match(value, /^[a-z_]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Firma del webhook de Stripe
// ---------------------------------------------------------------------------

const SECRET = 'whsec_prueba_1234567890';
const NOW = 1_800_000_000;

function signedHeader(payload: string, timestamp = NOW, secret = SECRET): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

describe('firma del webhook de Stripe', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });

  it('acepta una firma legítima', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: signedHeader(payload),
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, true);
  });

  it('rechaza si falta la cabecera', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: null,
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  it('rechaza una firma de otro secreto', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: signedHeader(payload, NOW, 'whsec_otro'),
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  /*
   * El caso que de verdad importa: alguien intercepta un webhook legítimo y
   * cambia el cuerpo para darse un plan mejor, conservando la firma.
   */
  it('rechaza un cuerpo alterado con la firma original', () => {
    const header = signedHeader(payload);
    const alterado = payload.replace('evt_1', 'evt_2');

    const verdict = verifyWebhookSignature({
      payload: alterado,
      header,
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  it('rechaza una firma vieja aunque sea auténtica', () => {
    const viejo = NOW - SIGNATURE_TOLERANCE_SECONDS - 1;

    const verdict = verifyWebhookSignature({
      payload,
      header: signedHeader(payload, viejo),
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  it('acepta justo dentro de la ventana', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: signedHeader(payload, NOW - SIGNATURE_TOLERANCE_SECONDS),
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, true);
  });

  it('rechaza una cabecera sin marca de tiempo', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: 'v1=abcdef',
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  it('rechaza una cabecera sin ninguna firma v1', () => {
    const verdict = verifyWebhookSignature({
      payload,
      header: `t=${NOW}`,
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, false);
  });

  /** Stripe manda varias firmas durante una rotación de secreto. */
  it('acepta si una de varias firmas coincide', () => {
    const buena = signedHeader(payload).split('v1=')[1];
    const verdict = verifyWebhookSignature({
      payload,
      header: `t=${NOW},v1=deadbeef,v1=${buena}`,
      secret: SECRET,
      nowSeconds: NOW,
    });

    assert.equal(verdict.valid, true);
  });
});

describe('lectura de los eventos', () => {
  it('encuentra el tenant en los metadatos', () => {
    assert.equal(
      tenantIdFromEvent({ metadata: { tenant_id: 'abc-123' } }),
      'abc-123',
    );
  });

  it('devuelve null cuando no hay metadatos', () => {
    assert.equal(tenantIdFromEvent({}), null);
    assert.equal(tenantIdFromEvent({ metadata: {} }), null);
    assert.equal(tenantIdFromEvent({ metadata: { tenant_id: '' } }), null);
  });
});

describe('codificación de formularios para Stripe', () => {
  it('anida con corchetes, que es lo que Stripe entiende', () => {
    const encoded = encodeForm({
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 2 }],
    });

    assert.ok(encoded.includes('mode=subscription'));
    assert.ok(encoded.includes(encodeURIComponent('line_items[0][price]')));
    assert.ok(encoded.includes('price_1'));
  });

  it('escapa lo que hay que escapar', () => {
    const encoded = encodeForm({ success_url: 'https://cian.mx/a?b=c&d=e' });
    assert.equal(encoded.includes('&d=e'), false, 'el & del valor no puede quedar suelto');
  });

  it('omite lo que no tiene valor', () => {
    assert.equal(encodeForm({ a: null, b: undefined }), '');
  });
});

// ---------------------------------------------------------------------------
// Acceso al panel
// ---------------------------------------------------------------------------

describe('superadmin de plataforma', () => {
  const original = process.env.CIAN_SUPERADMIN_EMALS;

  it('sin variable, no hay superadmin', () => {
    delete process.env.CIAN_SUPERADMIN_EMAILS;
    assert.deepEqual(superadminEmails(), []);
    assert.equal(isSuperadminEmail('quien@sea.mx'), false);
  });

  it('compara sin distinguir mayúsculas ni espacios', () => {
    process.env.CIAN_SUPERADMIN_EMAILS = ' Contacto@Alianzaindigo.org , otra@ejemplo.mx ';

    assert.equal(isSuperadminEmail('contacto@alianzaindigo.org'), true);
    assert.equal(isSuperadminEmail('CONTACTO@ALIANZAINDIGO.ORG'), true);
    assert.equal(isSuperadminEmail('otra@ejemplo.mx'), true);
    assert.equal(isSuperadminEmail('intruso@ejemplo.mx'), false);

    delete process.env.CIAN_SUPERADMIN_EMAILS;
    void original;
  });

  it('un correo vacío nunca es superadmin', () => {
    process.env.CIAN_SUPERADMIN_EMAILS = 'contacto@alianzaindigo.org';

    assert.equal(isSuperadminEmail(null), false);
    assert.equal(isSuperadminEmail(undefined), false);
    assert.equal(isSuperadminEmail(''), false);

    delete process.env.CIAN_SUPERADMIN_EMAILS;
  });
});

describe('formato de tamaños', () => {
  it('usa la unidad que se lee mejor', () => {
    assert.equal(formatBytes(200 * 1024 * 1024), '200 MB');
    assert.equal(formatBytes(2048 * 1024 * 1024), '2 GB');
    assert.equal(formatBytes(500 * 1024), '500 KB');
  });
});

/**
 * Concesiones de plataforma.
 *
 * La regla que se prueba aquí es la que hace que la pantalla de administración
 * de plataforma no pueda hacer daño: **una concesión solo suma**. Si alguien se
 * equivoca de espacio, o de campo, o se le va un cero hacia abajo, nadie pierde
 * lo que está pagando.
 *
 * Es una regla fácil de romper al refactorizar —basta con cambiar un `>` por un
 * `>=` mal puesto, o con aplicar el `Partial` encima sin comparar— y el daño
 * sería silencioso: un espacio que de pronto no puede escribir, sin ningún
 * error que lo explique.
 */
describe('una concesión de plataforma solo suma', () => {
  it('sube el plan cuando lo concedido es mayor', () => {
    assert.equal(effectivePlan('free', 'organization'), 'organization');
    assert.equal(effectivePlan('free', 'personal'), 'personal');
  });

  it('no baja el plan de quien paga más de lo que se le concede', () => {
    // El caso que importa: conceder `personal` a quien paga `organization`
    // no puede quitarle lo que compró.
    assert.equal(effectivePlan('organization', 'personal'), 'organization');
    assert.equal(effectivePlan('personal', 'free'), 'personal');
  });

  it('sin concesión, manda lo que se paga', () => {
    for (const plan of PLANS) {
      assert.equal(effectivePlan(plan, null), plan);
    }
  });

  it('sube un límite puntual y deja el resto como está', () => {
    const base = DEFAULT_PLAN_LIMITS.free;
    const limits = grantLimits(base, { mensajes: 5000 });

    assert.equal(limits.mensajes, 5000);
    assert.equal(limits.documentos, base.documentos);
    assert.equal(limits.almacenamiento, base.almacenamiento);
    assert.equal(limits.asientos, base.asientos);
  });

  it('no baja un límite por debajo del que da el plan', () => {
    const base = DEFAULT_PLAN_LIMITS.personal;
    const limits = grantLimits(base, { mensajes: 10, asientos: 0 });

    assert.equal(limits.mensajes, base.mensajes);
    assert.equal(limits.asientos, base.asientos);
  });

  it('«sin límite» gana a cualquier número', () => {
    const limits = grantLimits(DEFAULT_PLAN_LIMITS.free, { mensajes: null });
    assert.equal(limits.mensajes, null);
  });

  it('un número no le quita el «sin límite» que ya daba el plan', () => {
    // `organization` no limita mensajes. Conceder 10 no puede ponerle un tope.
    const limits = grantLimits(DEFAULT_PLAN_LIMITS.organization, {
      mensajes: 10,
    });

    assert.equal(limits.mensajes, null);
  });

  it('sin concesión devuelve los límites del plan tal cual', () => {
    const base = DEFAULT_PLAN_LIMITS.personal;
    assert.deepEqual(grantLimits(base, null), base);
    assert.deepEqual(grantLimits(base, undefined), base);
    assert.deepEqual(grantLimits(base, {}), base);
  });
});

describe('una concesión se sanea antes de guardarse', () => {
  it('un número absurdo se recorta en vez de guardarse tal cual', () => {
    // Un cero de más en un formulario no debería llegar a la base.
    const limits = sanitizeGrantedLimits({ mensajes: 99_999_999_999 });
    assert.ok(limits);
    assert.ok(limits.mensajes !== null && limits.mensajes! <= 1_000_000);
  });

  it('cero asientos no deja un espacio donde no cabe nadie', () => {
    assert.equal(sanitizeGrantedLimits({ asientos: 0 })?.asientos, 1);
  });

  it('lo que no es un número se descarta, no se guarda como NaN', () => {
    const limits = sanitizeGrantedLimits({
      mensajes: Number.NaN,
      documentos: 50,
    });

    assert.deepEqual(limits, { documentos: 50 });
  });

  it('«sin límite» se conserva', () => {
    assert.deepEqual(sanitizeGrantedLimits({ mensajes: null }), { mensajes: null });
  });

  it('retirar la concesión deja `null`, no un objeto vacío', () => {
    // Un `{}` guardado se leería después como «hay algo concedido».
    assert.equal(sanitizeGrantedLimits({}), null);
    assert.equal(sanitizeGrantedLimits(null), null);
  });

  it('un negativo no se convierte en un tope imposible de cumplir', () => {
    assert.equal(sanitizeGrantedLimits({ documentos: -5 })?.documentos, 0);
  });
});

/**
 * El modo `sustituye`.
 *
 * Es el único control de toda la administración de plataforma que puede dejar a
 * un espacio con **menos** de lo que tenía. Existe a propósito —la plataforma
 * tiene que poder contener un espacio que hace daño sin esperar a que se
 * cancele un cobro en Stripe— y por eso mismo conviene que su comportamiento
 * esté clavado: si un día `suma` empezara a comportarse como `sustituye`, el
 * daño llegaría en silencio a espacios que no lo pidieron.
 */
describe('el modo sustituye sí puede bajar', () => {
  it('baja el plan por debajo de lo que se paga', () => {
    assert.equal(effectivePlan('organization', 'free', 'sustituye'), 'free');
    assert.equal(effectivePlan('personal', 'free', 'sustituye'), 'free');
  });

  it('sin concesión no baja nada, ni en este modo', () => {
    // Que el modo esté activo no significa nada si no hay nada concedido.
    for (const plan of PLANS) {
      assert.equal(effectivePlan(plan, null, 'sustituye'), plan);
    }
  });

  it('baja un límite por debajo del que da el plan', () => {
    const limits = grantLimits(
      DEFAULT_PLAN_LIMITS.personal,
      { mensajes: 10 },
      'sustituye',
    );

    assert.equal(limits.mensajes, 10);
  });

  it('le pone tope a un plan que no lo tenía', () => {
    const limits = grantLimits(
      DEFAULT_PLAN_LIMITS.organization,
      { mensajes: 100 },
      'sustituye',
    );

    assert.equal(limits.mensajes, 100);
  });

  it('lo que la concesión no menciona sigue viniendo del plan', () => {
    // Sustituir lo escrito, no borrar todo lo demás. Un campo en `undefined`
    // se comportaría como «sin límite» y abriría la puerta sin que nadie lo
    // pidiera.
    const base = DEFAULT_PLAN_LIMITS.personal;
    const limits = grantLimits(base, { mensajes: 10 }, 'sustituye');

    assert.equal(limits.documentos, base.documentos);
    assert.equal(limits.almacenamiento, base.almacenamiento);
    assert.equal(limits.equipo_de_apoyo, base.equipo_de_apoyo);
    assert.equal(limits.asientos, base.asientos);
    assert.notEqual(limits.documentos, undefined);
  });

  it('el modo por omisión sigue siendo el que no puede quitar', () => {
    // Llamar sin modo tiene que comportarse como `suma`. Si un día el valor
    // por omisión cambiara, todas las concesiones existentes empezarían a
    // poder bajar sin que nadie tocara nada.
    assert.equal(effectivePlan('organization', 'free'), 'organization');
    assert.equal(
      grantLimits(DEFAULT_PLAN_LIMITS.personal, { mensajes: 10 }).mensajes,
      DEFAULT_PLAN_LIMITS.personal.mensajes,
    );
  });

  it('solo hay dos modos y `suma` es uno de ellos', () => {
    assert.deepEqual([...GRANT_MODES], ['suma', 'sustituye']);
  });
});
