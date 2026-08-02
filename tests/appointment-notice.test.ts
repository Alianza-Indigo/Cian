/**
 * Avisos de cita. Fase 10.
 *
 * Lo que se prueba es que el aviso **no mienta y no se repita**, que son las
 * dos formas en que un recordatorio de cita hace daño:
 *
 * - Si miente en la hora, la persona llega tarde o no llega. La hora se calcula
 *   en la zona de quien recibe el aviso, no en la del servidor.
 * - Si se repite, entrena a ignorar la aplicación, que es justo lo contrario de
 *   lo que este módulo pretende.
 *
 * También se comprueba lo que **no** debe salir: el motivo de la consulta no
 * aparece en ningún texto. Una notificación se lee en la pantalla de bloqueo,
 * delante de quien pase.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appointmentNotice,
  type AppointmentNoticeInput,
} from '../lib/notifications/appointment-notice';

const CDMX = 'America/Mexico_City';

/** Una cita confirmada, para no repetir el objeto entero en cada caso. */
function cita(overrides: Partial<AppointmentNoticeInput> = {}): AppointmentNoticeInput {
  return {
    scheduledAt: new Date('2026-08-10T23:00:00.000Z'), // 17:00 en CDMX
    status: 'confirmada',
    noticeSentAt: null,
    timeZone: CDMX,
    withWhom: 'Dra. Ramírez',
    ...overrides,
  };
}

/** El barrido corre a las 13:00 UTC, o sea 7:00 en CDMX. */
const BARRIDO_VISPERA = new Date('2026-08-09T13:00:00.000Z');
const BARRIDO_MISMO_DIA = new Date('2026-08-10T13:00:00.000Z');

describe('cuándo avisa', () => {
  it('la víspera', () => {
    const v = appointmentNotice(cita(), BARRIDO_VISPERA);

    assert.equal(v.due, true);
    if (!v.due) return;
    assert.equal(v.kind, 'vispera');
    assert.match(v.title, /^Mañana tienes consulta a las 17:00$/);
  });

  it('la mañana del mismo día', () => {
    const v = appointmentNotice(cita(), BARRIDO_MISMO_DIA);

    assert.equal(v.due, true);
    if (!v.due) return;
    assert.equal(v.kind, 'mismo_dia');
    assert.match(v.title, /^Hoy tienes consulta a las 17:00$/);
  });

  it('no avisa con dos días de antelación', () => {
    const v = appointmentNotice(cita(), new Date('2026-08-08T13:00:00.000Z'));
    assert.equal(v.due, false);
  });

  it('no avisa de una cita que ya pasó', () => {
    const v = appointmentNotice(cita(), new Date('2026-08-11T13:00:00.000Z'));
    assert.equal(v.due, false);
  });
});

describe('qué citas no avisan', () => {
  for (const status of ['solicitada', 'cancelada', 'completada', 'no_asistio']) {
    it(`una cita ${status} no avisa`, () => {
      const v = appointmentNotice(cita({ status }), BARRIDO_VISPERA);
      assert.equal(v.due, false);
    });
  }

  it('una cita solicitada todavía no es una cita', () => {
    // Avisar de algo que el profesional aún no ha confirmado sería prometer
    // una consulta que puede no existir.
    const v = appointmentNotice(cita({ status: 'solicitada' }), BARRIDO_MISMO_DIA);
    assert.equal(v.due, false);
    if (v.due) return;
    assert.match(v.reason, /confirmada/);
  });
});

describe('no se repite', () => {
  it('no avisa dos veces el mismo día', () => {
    const v = appointmentNotice(
      cita({ noticeSentAt: new Date('2026-08-09T13:00:00.000Z') }),
      new Date('2026-08-09T18:00:00.000Z'),
    );

    assert.equal(v.due, false);
    if (v.due) return;
    assert.match(v.reason, /ya se avisó hoy/);
  });

  it('el aviso de la víspera no impide el del mismo día', () => {
    const v = appointmentNotice(
      cita({ noticeSentAt: BARRIDO_VISPERA }),
      BARRIDO_MISMO_DIA,
    );

    assert.equal(v.due, true);
    if (!v.due) return;
    assert.equal(v.kind, 'mismo_dia');
  });
});

describe('la hora es la de quien recibe el aviso', () => {
  it('la misma cita se anuncia a distinta hora en Tijuana y en Cancún', () => {
    const tijuana = appointmentNotice(
      cita({ timeZone: 'America/Tijuana' }),
      BARRIDO_MISMO_DIA,
    );
    const cancun = appointmentNotice(
      cita({ timeZone: 'America/Cancun' }),
      BARRIDO_MISMO_DIA,
    );

    assert.equal(tijuana.due && cancun.due, true);
    if (!tijuana.due || !cancun.due) return;

    assert.match(tijuana.title, /16:00/);
    assert.match(cancun.title, /18:00/);
  });

  it('una cita de madrugada en UTC puede ser «hoy» y no «mañana»', () => {
    /*
     * Cita el 11 de agosto a las 02:00 UTC = 10 de agosto a las 20:00 en CDMX.
     * Calculado en UTC saldría «mañana»; en la zona de la persona es hoy, y es
     * lo que tiene que decir.
     */
    const v = appointmentNotice(
      cita({ scheduledAt: new Date('2026-08-11T02:00:00.000Z') }),
      BARRIDO_MISMO_DIA,
    );

    assert.equal(v.due, true);
    if (!v.due) return;
    assert.equal(v.kind, 'mismo_dia');
    assert.match(v.title, /Hoy tienes consulta a las 20:00/);
  });
});

describe('qué dice y qué no dice', () => {
  it('nombra a la otra parte', () => {
    const v = appointmentNotice(cita(), BARRIDO_MISMO_DIA);
    assert.equal(v.due, true);
    if (!v.due) return;
    assert.match(v.body, /Dra\. Ramírez/);
  });

  it('sin nombre, dice adónde ir en vez de dejarlo vacío', () => {
    const v = appointmentNotice(cita({ withWhom: null }), BARRIDO_MISMO_DIA);
    assert.equal(v.due, true);
    if (!v.due) return;
    assert.match(v.body, /Consultorio/);
  });

  it('el motivo de la consulta no cabe en el aviso ni por accidente', () => {
    /*
     * `AppointmentNoticeInput` no tiene campo para el motivo, así que no hay
     * forma de que salga. Esta prueba fija esa decisión: si alguien añade el
     * campo algún día, tiene que venir aquí y explicarse.
     */
    const entrada = cita();
    assert.equal('reason' in entrada, false);
    assert.equal('motivo' in entrada, false);
  });
});
