/**
 * Consentimiento de grabación. Fase 10.
 *
 * El criterio del PRD lo escribe en negativo:
 *
 * > La grabación es **imposible de iniciar** sin consentimiento registrado de
 * > ambas partes.
 *
 * ## Hasta dónde llega esto, con honestidad
 *
 * La videollamada ocurre en Google Meet, y **CIAN no puede impedir
 * técnicamente que alguien grabe dentro de Meet**. Quien controla eso es
 * Google y quien maneja la reunión.
 *
 * Así que este módulo hace lo que sí puede hacer, y no finge lo demás:
 *
 * - Registra el acuerdo de ambas partes con **sello de tiempo del servidor**,
 *   de modo que después se pueda responder «¿quién autorizó esto y cuándo?».
 * - Exige las **dos** firmas: ni el profesional puede grabar «porque es su
 *   consulta» ni la persona puede hacerlo sin que el profesional lo sepa.
 * - Permite **retirar** la autorización, y basta con una para que el acuerdo
 *   deje de existir.
 * - Si algún día la videollamada vuelve a un servidor de medios propio, esta
 *   misma función es la que decidiría el permiso técnico. La pieza está lista;
 *   lo que falta es el servidor.
 *
 * La interfaz dice esto mismo con `RECORDING_NOTICE`. Prometer «imposible» en
 * una consulta de salud cuando solo es «acordado» sería una mentira con
 * consecuencias.
 */
import type { ConsentSignature, RecordingConsent } from './types';

export type ConsentVerdict =
  | { allowed: true; signedAt: string }
  | { allowed: false; missing: Array<'profesional' | 'usuario'>; reason: string };

const EMPTY: RecordingConsent = { signatures: [] };

export function emptyConsent(): RecordingConsent {
  return { signatures: [] };
}

/**
 * Añade una firma.
 *
 * `at` lo pasa quien llama con la hora del **servidor**. Una marca de tiempo
 * que envía el navegador no prueba nada: el reloj del cliente lo controla el
 * cliente.
 *
 * Firmar dos veces desde el mismo rol no duplica: se conserva la primera, que
 * es el momento en que la persona consintió de verdad.
 */
export function addSignature(
  consent: RecordingConsent | null | undefined,
  signature: ConsentSignature,
): RecordingConsent {
  const current = consent?.signatures ?? EMPTY.signatures;

  if (current.some((entry) => entry.role === signature.role)) {
    return { signatures: current };
  }

  return { signatures: [...current, signature] };
}

/** Retira el consentimiento de un rol. Basta con uno para que no se grabe. */
export function withdrawSignature(
  consent: RecordingConsent | null | undefined,
  role: 'profesional' | 'usuario',
): RecordingConsent {
  return {
    signatures: (consent?.signatures ?? []).filter((entry) => entry.role !== role),
  };
}

export function hasSigned(
  consent: RecordingConsent | null | undefined,
  role: 'profesional' | 'usuario',
): boolean {
  return (consent?.signatures ?? []).some((entry) => entry.role === role);
}

/**
 * Si se puede grabar.
 *
 * Exige **las dos** firmas. No hay caso en que una sola baste: ni el
 * profesional puede grabar «porque es su consulta» ni la persona puede grabar
 * sin que el profesional lo sepa.
 */
export function canStartRecording(
  consent: RecordingConsent | null | undefined,
): ConsentVerdict {
  const signatures = consent?.signatures ?? [];

  const missing: Array<'profesional' | 'usuario'> = [];
  if (!signatures.some((entry) => entry.role === 'profesional')) {
    missing.push('profesional');
  }
  if (!signatures.some((entry) => entry.role === 'usuario')) {
    missing.push('usuario');
  }

  if (missing.length > 0) {
    return {
      allowed: false,
      missing,
      reason:
        missing.length === 2
          ? 'Nadie ha autorizado la grabación todavía.'
          : missing[0] === 'profesional'
            ? 'Falta la autorización del profesional.'
            : 'Falta la autorización de la persona atendida.',
    };
  }

  // La más tardía: hasta ese instante no había consentimiento completo.
  const signedAt = signatures
    .map((entry) => entry.at)
    .sort()
    .at(-1)!;

  return { allowed: true, signedAt };
}

/** Texto para mostrar en la sesión y para el registro posterior. */
export function describeConsent(
  consent: RecordingConsent | null | undefined,
): string {
  const verdict = canStartRecording(consent);

  if (!verdict.allowed) return verdict.reason;

  return `Ambas partes autorizaron la grabación. Última firma: ${new Date(
    verdict.signedAt,
  ).toLocaleString('es-MX')}.`;
}
