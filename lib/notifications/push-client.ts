/**
 * Suscripción al push desde el navegador.
 *
 * ## El caso de iOS, que es el que importa
 *
 * Safari en iPhone **solo** entrega notificaciones si la aplicación está
 * instalada en la pantalla de inicio. En el navegador normal, `Notification`
 * ni siquiera existe.
 *
 * El criterio del PRD lo dice con todas sus letras:
 *
 * > En iOS sin instalar, la app explica cómo instalar en lugar de prometer
 * > notificaciones que no llegarán.
 *
 * De ahí que `pushSupport()` distinga entre «no se puede» y «hay que instalar
 * primero»: son dos mensajes distintos, y confundirlos deja a una familia
 * esperando un aviso que nunca va a sonar.
 */

export type PushSupport =
  | { estado: 'listo' }
  | { estado: 'instalar_primero' }
  | { estado: 'no_soportado'; motivo: string }
  | { estado: 'bloqueado' };

/** Si la página corre como aplicación instalada. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;

  return (
    iosStandalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;

  // iPadOS se anuncia como Mac; el táctil es lo que lo delata.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOS;
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return { estado: 'no_soportado', motivo: 'Sin navegador.' };
  }

  const hasApi =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!hasApi) {
    if (isIOS() && !isStandalone()) return { estado: 'instalar_primero' };

    return {
      estado: 'no_soportado',
      motivo: 'Este navegador no admite notificaciones.',
    };
  }

  if (isIOS() && !isStandalone()) return { estado: 'instalar_primero' };
  if (Notification.permission === 'denied') return { estado: 'bloqueado' };

  return { estado: 'listo' };
}

/** La clave pública de VAPID viaja en base64url y `subscribe` la quiere cruda. */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);

  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return buffer;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = pushSupport();
  if (support.estado !== 'listo') {
    return { ok: false, error: 'Este dispositivo todavía no puede recibir avisos.' };
  }

  const keyResponse = await fetch('/api/push/suscripcion');
  const keyPayload = (await keyResponse.json()) as {
    publicKey: string | null;
    configurado: boolean;
  };

  if (!keyPayload.configurado || !keyPayload.publicKey) {
    return {
      ok: false,
      error: 'El servidor todavía no tiene claves de notificación configuradas.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'No diste permiso para las notificaciones.' };
  }

  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    // Obligatorio en todos los navegadores actuales: solo se admiten
    // notificaciones con contenido visible para la persona.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(keyPayload.publicKey),
  });

  const json = subscription.toJSON();

  const response = await fetch('/api/push/suscripcion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });

  if (!response.ok) {
    return { ok: false, error: 'No pudimos guardar la suscripción.' };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, error: 'Este navegador no admite notificaciones.' };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return { ok: true };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await fetch('/api/push/suscripcion', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  return { ok: true };
}
