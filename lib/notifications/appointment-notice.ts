/**
 * Avisos de cita. Cierra el pendiente de la Fase 10.
 *
 * ## Por qué no es un `reminder` normal
 *
 * La tabla `reminders` guarda cosas que se repiten: una hora, unos días de la
 * semana. Una cita ocurre una vez, en un instante concreto, y después deja de
 * existir. Meterla ahí obligaría a crear una fila, mantenerla si la cita se
 * mueve y borrarla si se cancela; tres sitios donde quedarse desincronizado con
 * la cita de verdad.
 *
 * Aquí se lee la cita directamente. Si se cancela, deja de avisar sola.
 *
 * ## Por qué avisa la víspera y la mañana, y no «una hora antes»
 *
 * Porque el barrido corre **una vez al día** —así lo pide el proyecto y así lo
 * permite el plan de Vercel—, y un aviso de «tu cita es en una hora» que sale a
 * las 7 de la mañana para una cita de las 5 de la tarde es peor que no avisar:
 * miente.
 *
 * Lo que un barrido diario sí puede dar bien es una agenda: «mañana tienes
 * consulta a las 5» y «hoy tienes consulta a las 5». Eso es cierto a la hora
 * que llegue. El mensaje lleva la hora al frente por eso mismo.
 *
 * Si algún día el barrido pasa a ser horario, esto se puede afinar sin tocar
 * nada más: la decisión vive entera en `appointmentNotice`.
 *
 * ## Sin datos de salud
 *
 * El aviso dice que hay una consulta, con quién y a qué hora. Nunca el motivo.
 * Una notificación se lee en la pantalla de bloqueo, delante de quien pase.
 */
import { localDateKey, localPartsIn } from './schedule';

export type AppointmentNoticeInput = {
  scheduledAt: Date;
  /** `cancelada` y compañía no avisan. */
  status: string;
  /** Cuándo se avisó por última vez de esta cita. */
  noticeSentAt: Date | null;
  timeZone: string;
  /** Cómo se llama la otra parte. Nunca el motivo de la consulta. */
  withWhom: string | null;
};

export type NoticeVerdict =
  | { due: false; reason: string }
  | { due: true; kind: 'vispera' | 'mismo_dia'; title: string; body: string };

/** Solo estas citas avisan. Una solicitada todavía no es una cita. */
const STATUSES_QUE_AVISAN = new Set(['confirmada']);

/** La hora local de la cita, en formato de reloj. */
function horaLocal(date: Date, timeZone: string): string {
  const parts = localPartsIn(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/**
 * Días de calendario entre dos instantes, en la zona de quien mira.
 *
 * Se compara por clave de día local y no restando milisegundos: una cita a las
 * 23:00 y un barrido a las 01:00 del día siguiente distan dos horas y son dos
 * días distintos, que es lo único que importa aquí.
 */
function diasHasta(desde: Date, hasta: Date, timeZone: string): number {
  const a = localDateKey(desde, timeZone);
  const b = localDateKey(hasta, timeZone);
  if (a === b) return 0;

  // Se avanza día a día desde `desde`. La ventana real es de dos días; el tope
  // existe para que un dato corrupto no cuelgue el barrido.
  for (let dias = 1; dias <= 30; dias += 1) {
    const cursor = new Date(desde.getTime() + dias * 86_400_000);
    if (localDateKey(cursor, timeZone) === b) return dias;
  }

  return Number.POSITIVE_INFINITY;
}

export function appointmentNotice(
  input: AppointmentNoticeInput,
  now: Date,
): NoticeVerdict {
  if (!STATUSES_QUE_AVISAN.has(input.status)) {
    return { due: false, reason: 'la cita no está confirmada' };
  }

  const tz = input.timeZone;

  // Una cita que ya pasó no avisa, aunque siga confirmada.
  if (input.scheduledAt.getTime() < now.getTime()) {
    return { due: false, reason: 'la cita ya pasó' };
  }

  const dias = diasHasta(now, input.scheduledAt, tz);
  if (dias > 1) return { due: false, reason: 'todavía falta' };

  /*
   * Un aviso por día como mucho. Sin esto, dos barridos el mismo día —un
   * reintento del cron, un despliegue— mandarían el mismo aviso dos veces, y
   * repetir avisos es exactamente lo que este módulo evita en todas partes.
   */
  if (
    input.noticeSentAt &&
    localDateKey(input.noticeSentAt, tz) === localDateKey(now, tz)
  ) {
    return { due: false, reason: 'ya se avisó hoy' };
  }

  const hora = horaLocal(input.scheduledAt, tz);
  const conQuien = input.withWhom?.trim();

  if (dias === 0) {
    return {
      due: true,
      kind: 'mismo_dia',
      title: `Hoy tienes consulta a las ${hora}`,
      body: conQuien ? `Con ${conQuien}.` : 'Puedes entrar desde Consultorio.',
    };
  }

  return {
    due: true,
    kind: 'vispera',
    title: `Mañana tienes consulta a las ${hora}`,
    body: conQuien ? `Con ${conQuien}.` : 'Puedes entrar desde Consultorio.',
  };
}
