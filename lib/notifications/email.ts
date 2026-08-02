/**
 * Correo. Fase 8.
 *
 * Dos usos: invitar al equipo de apoyo y servir de respaldo cuando el push
 * falla.
 *
 * ## Sin SDK
 *
 * Se habla con Resend por su API REST usando `fetch`. El SDK oficial no aporta
 * nada que `fetch` no haga y sería una dependencia fuera de la lista
 * autorizada del PRD. Cambiar de proveedor es reescribir `deliver()`.
 *
 * ## Degradación
 *
 * Sin `RESEND_API_KEY` la aplicación **no falla**: `sendEmail` devuelve
 * `configurado: false` y quien llama decide. En las invitaciones eso significa
 * enseñar el enlace en pantalla para copiarlo a mano, que es peor experiencia
 * pero no es un callejón sin salida. Prometer un correo que nunca sale es peor
 * que admitir que no hay correo.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Texto plano. Es lo que se manda y lo que se lee en cualquier cliente. */
  text: string;
};

export type EmailResult =
  | { ok: true }
  | { ok: false; configured: boolean; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      configured: false,
      error: 'El envío de correo no está configurado.',
    };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (response.ok) return { ok: true };

    return {
      ok: false,
      configured: true,
      error: `El servicio de correo respondió ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Fallo de red.',
    };
  }
}

// --- Plantillas --------------------------------------------------------------

/**
 * Invitación al equipo de apoyo.
 *
 * No dice de qué se trata la plataforma más allá de lo necesario, y sobre todo
 * **no dice qué se comparte**: el correo puede acabar en una bandeja
 * compartida, reenviado o en una vista previa de notificación. Que exista una
 * invitación no debe revelar nada sobre la salud de nadie.
 */
export function invitationEmail(input: {
  to: string;
  inviterName: string;
  acceptUrl: string;
}): EmailMessage {
  return {
    to: input.to,
    subject: `${input.inviterName} te invita a su equipo de apoyo en CIAN`,
    text: [
      `${input.inviterName} te invitó a su equipo de apoyo en CIAN, la plataforma de`,
      'Alianza Índigo Neurodivergente A.C.',
      '',
      'Formar parte del equipo no te da acceso a nada por sí solo. Solo verás',
      'aquello que esa persona decida compartir contigo, y puede dejar de',
      'compartirlo cuando quiera.',
      '',
      'Para aceptar, abre este enlace con la cuenta de este mismo correo:',
      input.acceptUrl,
      '',
      'La invitación caduca en dos semanas. Si no esperabas este correo, puedes',
      'ignorarlo: sin aceptar no ocurre nada.',
    ].join('\n'),
  };
}

/**
 * Invitación a **entrar a un espacio**, que no es lo mismo que la de arriba.
 *
 * La del equipo de apoyo comparte recursos sueltos; esta da un rol dentro de
 * una organización. Se distinguen en el texto a propósito: quien recibe el
 * correo tiene que saber a qué está diciendo que sí antes de abrir el enlace.
 *
 * Tampoco dice nada de la salud de nadie, por la misma razón que la otra.
 */
export function tenantInvitationEmail(input: {
  to: string;
  inviterName: string;
  acceptUrl: string;
}): EmailMessage {
  return {
    to: input.to,
    subject: `${input.inviterName} te invita a un espacio de trabajo en CIAN`,
    text: [
      `${input.inviterName} te invitó a trabajar en su espacio de CIAN, la`,
      'plataforma de Alianza Índigo Neurodivergente A.C.',
      '',
      'Esto es distinto de que alguien te comparta un plan: al aceptar formarás',
      'parte del espacio con un rol, y podrás usarlo junto con el resto del',
      'equipo. Tu cuenta y tu propio espacio siguen siendo tuyos y separados.',
      '',
      'Para aceptar, abre este enlace con la cuenta de este mismo correo:',
      input.acceptUrl,
      '',
      'La invitación caduca en dos semanas. Si no esperabas este correo, puedes',
      'ignorarlo: sin aceptar no ocurre nada.',
    ].join('\n'),
  };
}

/**
 * Respaldo de un recordatorio cuando el push no llegó.
 *
 * Lleva el título y el cuerpo que la persona escribió, nada más. Sin datos de
 * salud añadidos y sin contexto: el asunto de un correo se ve en la pantalla
 * de bloqueo de cualquiera que pase cerca.
 */
export function reminderEmail(input: {
  to: string;
  title: string;
  body: string | null;
}): EmailMessage {
  return {
    to: input.to,
    subject: input.title,
    text: [
      input.body ?? input.title,
      '',
      '—',
      'Recordatorio de CIAN. Puedes cambiar tus avisos o apagarlos en',
      'Configuración → Avisos.',
    ].join('\n'),
  };
}
