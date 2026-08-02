/**
 * Consultorios virtuales. Fase 10.
 *
 * Se prueban las tres cosas que el PRD escribe en negativo o con mayúsculas,
 * que son las que no pueden fallar:
 *
 * > Un profesional no verificado **no puede** abrir consultorio ni recibir
 * > citas.
 *
 * > La grabación es **imposible de iniciar** sin consentimiento registrado de
 * > ambas partes.
 *
 * De este segundo, lo que se prueba es lo que CIAN puede sostener: que el
 * acuerdo exige las dos firmas y que basta una retirada para deshacerlo. La
 * videollamada ocurre en Google Meet y **CIAN no puede impedir técnicamente
 * que alguien grabe ahí dentro**; el alcance real está dicho en NOTES.md, en
 * `lib/consultorio/consent.ts` y en la propia pantalla de sesión.
 *
 * > Las notas privadas del profesional **jamás** aparecen en ninguna respuesta
 * > de API accesible al usuario — verificado con prueba explícita.
 *
 * La tercera se comprueba en `tests/consultorio-notas.test.ts`, contra la
 * función de lectura real, porque es una garantía sobre datos y no sobre
 * lógica.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APPOINTMENT_STATUSES,
  NOTE_VISIBILITIES,
  SPECIALTIES,
  VERIFICATION_STATUSES,
  canJoinRoom,
  canOpenPractice,
  requiresLicense,
} from '../lib/consultorio/types';
import {
  addSignature,
  canStartRecording,
  emptyConsent,
  hasSigned,
  withdrawSignature,
} from '../lib/consultorio/consent';
import {
  availableSlots,
  joinWindow,
  zonedTimeToUtc,
  type AvailabilityRule,
} from '../lib/consultorio/availability';
import {
  describeMeetingLink,
  parseMeetingLink,
} from '../lib/consultorio/meeting';

const MEXICO = 'America/Mexico_City';

// ---------------------------------------------------------------------------
// Verificación profesional
// ---------------------------------------------------------------------------

describe('quién puede abrir consultorio', () => {
  it('solo el estado «verificado» abre la puerta', () => {
    assert.equal(canOpenPractice('verificado'), true);
  });

  /*
   * Se recorre el enum entero en vez de comprobar los tres estados conocidos:
   * si alguien añade un estado nuevo y olvida pensar en esto, la prueba falla
   * en vez de conceder acceso en silencio.
   */
  it('ningún otro estado la abre, ni los que se añadan después', () => {
    for (const status of VERIFICATION_STATUSES) {
      if (status === 'verificado') continue;
      assert.equal(
        canOpenPractice(status),
        false,
        `«${status}» no debería poder abrir consultorio`,
      );
    }
  });

  it('las especialidades sanitarias exigen cédula', () => {
    assert.equal(requiresLicense(['psicologia']), true);
    assert.equal(requiresLicense(['psiquiatria', 'coaching']), true);
    assert.equal(requiresLicense(['nutricion']), true);
  });

  it('las que no son profesión sanitaria, no', () => {
    assert.equal(requiresLicense(['coaching']), false);
    assert.equal(requiresLicense(['grupos_de_apoyo', 'vida_independiente']), false);
    assert.equal(requiresLicense([]), false);
  });

  it('el PRD pide quince especialidades y están las quince', () => {
    assert.equal(SPECIALTIES.length, 15);
  });

  it('los valores de enum son identificadores limpios de Postgres', () => {
    for (const value of [
      ...SPECIALTIES,
      ...VERIFICATION_STATUSES,
      ...APPOINTMENT_STATUSES,
      ...NOTE_VISIBILITIES,
    ]) {
      assert.match(value, /^[a-z_]+$/);
    }
  });

  it('solo se entra a la sala con la cita confirmada', () => {
    assert.equal(canJoinRoom('confirmada'), true);

    for (const status of APPOINTMENT_STATUSES) {
      if (status === 'confirmada') continue;
      assert.equal(canJoinRoom(status), false, `«${status}» no debería dejar entrar`);
    }
  });
});

// ---------------------------------------------------------------------------
// Consentimiento de grabación
// ---------------------------------------------------------------------------

const PROFESIONAL = {
  userId: 'pro-1',
  role: 'profesional' as const,
  at: '2026-08-03T15:00:00.000Z',
};
const USUARIO = {
  userId: 'user-1',
  role: 'usuario' as const,
  at: '2026-08-03T15:00:30.000Z',
};

describe('grabación: el acuerdo exige las dos firmas', () => {
  it('sin nadie, no', () => {
    const verdict = canStartRecording(emptyConsent());

    assert.equal(verdict.allowed, false);
    assert.deepEqual(
      verdict.allowed === false && verdict.missing,
      ['profesional', 'usuario'],
    );
  });

  it('con `null` o `undefined`, tampoco', () => {
    assert.equal(canStartRecording(null).allowed, false);
    assert.equal(canStartRecording(undefined).allowed, false);
  });

  /*
   * El caso que más se intenta: el profesional graba «porque es su consulta».
   * No basta.
   */
  it('la firma del profesional sola no basta', () => {
    const consent = addSignature(emptyConsent(), PROFESIONAL);
    const verdict = canStartRecording(consent);

    assert.equal(verdict.allowed, false);
    assert.deepEqual(verdict.allowed === false && verdict.missing, ['usuario']);
  });

  it('la firma de la persona sola tampoco', () => {
    const consent = addSignature(emptyConsent(), USUARIO);
    const verdict = canStartRecording(consent);

    assert.equal(verdict.allowed, false);
    assert.deepEqual(verdict.allowed === false && verdict.missing, ['profesional']);
  });

  it('con las dos, sí, y queda el momento en que se completó', () => {
    const consent = addSignature(addSignature(emptyConsent(), PROFESIONAL), USUARIO);
    const verdict = canStartRecording(consent);

    assert.equal(verdict.allowed, true);
    // La más tardía: hasta ese instante no había consentimiento completo.
    assert.equal(verdict.allowed === true && verdict.signedAt, USUARIO.at);
  });

  it('firmar dos veces no cuenta como dos personas', () => {
    const consent = addSignature(
      addSignature(emptyConsent(), PROFESIONAL),
      { ...PROFESIONAL, at: '2026-08-03T16:00:00.000Z' },
    );

    assert.equal(consent.signatures.length, 1);
    assert.equal(canStartRecording(consent).allowed, false);
  });

  it('conserva la primera firma, que es cuando se consintió de verdad', () => {
    const consent = addSignature(
      addSignature(emptyConsent(), PROFESIONAL),
      { ...PROFESIONAL, at: '2026-08-03T16:00:00.000Z' },
    );

    assert.equal(consent.signatures[0]?.at, PROFESIONAL.at);
  });

  it('retirar una firma vuelve a cerrar la puerta', () => {
    const completo = addSignature(addSignature(emptyConsent(), PROFESIONAL), USUARIO);
    assert.equal(canStartRecording(completo).allowed, true);

    const retirado = withdrawSignature(completo, 'usuario');
    assert.equal(canStartRecording(retirado).allowed, false);
    assert.equal(hasSigned(retirado, 'profesional'), true);
    assert.equal(hasSigned(retirado, 'usuario'), false);
  });
});

// ---------------------------------------------------------------------------
// Enlace de la videollamada
// ---------------------------------------------------------------------------

describe('enlace de Google Meet', () => {
  it('acepta un enlace de Meet', () => {
    const verdict = parseMeetingLink('https://meet.google.com/abc-defg-hij');

    assert.equal(verdict.valid, true);
    if (!verdict.valid) return;
    assert.equal(verdict.link.provider, 'meet');
    assert.equal(verdict.link.url, 'https://meet.google.com/abc-defg-hij');
  });

  it('tolera espacios alrededor', () => {
    assert.equal(
      parseMeetingLink('  https://meet.google.com/abc-defg-hij  ').valid,
      true,
    );
  });

  /*
   * Lo que esta validación existe para impedir: un campo de URL libre que
   * después se pinta como enlace, dentro de una plataforma de salud, es una vía
   * de phishing. Bastaría con un host que se parezca a Meet.
   */
  it('rechaza un host que solo se parece a Meet', () => {
    for (const impostor of [
      'https://meet.google.com.phishing.mx/abc',
      'https://meet-google.com/abc',
      'https://notmeet.google.com/abc',
      'https://evil.com/meet.google.com/abc',
    ]) {
      assert.equal(
        parseMeetingLink(impostor).valid,
        false,
        `debió rechazar ${impostor}`,
      );
    }
  });

  it('rechaza cualquier cosa que no sea https', () => {
    for (const bad of [
      'http://meet.google.com/abc',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'ftp://meet.google.com/abc',
    ]) {
      assert.equal(parseMeetingLink(bad).valid, false, `debió rechazar ${bad}`);
    }
  });

  it('rechaza credenciales embebidas en la URL', () => {
    assert.equal(
      parseMeetingLink('https://usuario:clave@meet.google.com/abc').valid,
      false,
    );
  });

  it('rechaza lo vacío y lo ilegible', () => {
    assert.equal(parseMeetingLink('').valid, false);
    assert.equal(parseMeetingLink('   ').valid, false);
    assert.equal(parseMeetingLink('no soy una url').valid, false);
  });

  it('no distingue mayúsculas en el host', () => {
    assert.equal(parseMeetingLink('https://MEET.GOOGLE.COM/abc').valid, true);
  });

  it('descarta el fragmento y guarda una forma canónica', () => {
    const verdict = parseMeetingLink('https://meet.google.com/abc#algo');

    assert.equal(verdict.valid, true);
    if (!verdict.valid) return;
    assert.equal(verdict.link.url.includes('#'), false);
  });

  it('el texto para mostrar quita el protocolo', () => {
    assert.equal(
      describeMeetingLink({ provider: 'meet', url: 'https://meet.google.com/abc' }),
      'meet.google.com/abc',
    );
  });

  it('el motivo del rechazo dice qué hacer', () => {
    const verdict = parseMeetingLink('https://zoom.us/j/123');

    assert.equal(verdict.valid, false);
    if (verdict.valid) return;
    assert.match(verdict.reason, /Meet/);
  });
});

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

describe('conversión de hora local a instante', () => {
  it('las 9:00 de Ciudad de México son las 15:00 UTC en agosto', () => {
    const instant = zonedTimeToUtc(2026, 8, 4, 9, 0, MEXICO);
    assert.equal(instant.toISOString(), '2026-08-04T15:00:00.000Z');
  });

  it('la misma hora de pared en otra zona es otro instante', () => {
    const cdmx = zonedTimeToUtc(2026, 8, 4, 9, 0, MEXICO);
    const tijuana = zonedTimeToUtc(2026, 8, 4, 9, 0, 'America/Tijuana');

    assert.notEqual(cdmx.getTime(), tijuana.getTime());
    assert.equal(tijuana.getTime() - cdmx.getTime(), 3_600_000);
  });
});

describe('huecos disponibles', () => {
  // Martes de 9:00 a 11:00, hora de Ciudad de México.
  const rules: AvailabilityRule[] = [
    {
      weekday: 2,
      startTime: '09:00',
      endTime: '11:00',
      timezone: MEXICO,
      active: true,
    },
  ];

  const now = new Date('2026-08-03T12:00:00Z'); // lunes

  it('ofrece los huecos que caben enteros', () => {
    const slots = availableSlots({
      rules,
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 2,
    });

    // Martes 4: 9:00 y 10:00 hora de México = 15:00 y 16:00 UTC.
    assert.equal(slots.length, 2);
    assert.equal(slots[0]?.start.toISOString(), '2026-08-04T15:00:00.000Z');
    assert.equal(slots[1]?.start.toISOString(), '2026-08-04T16:00:00.000Z');
  });

  it('no ofrece medias sesiones al final de la franja', () => {
    const slots = availableSlots({
      rules,
      busy: [],
      durationMinutes: 50,
      now,
      horizonDays: 2,
    });

    // Con 50 minutos caben dos (9:00 y 9:50); el tercero se saldría de las 11.
    assert.equal(slots.length, 2);
    for (const slot of slots) {
      assert.ok(slot.end.getTime() <= new Date('2026-08-04T17:00:00Z').getTime());
    }
  });

  it('descarta lo que ya está ocupado', () => {
    const slots = availableSlots({
      rules,
      busy: [
        {
          start: new Date('2026-08-04T15:00:00Z'),
          end: new Date('2026-08-04T16:00:00Z'),
        },
      ],
      durationMinutes: 60,
      now,
      horizonDays: 2,
    });

    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.start.toISOString(), '2026-08-04T16:00:00.000Z');
  });

  it('descarta también un solapamiento parcial', () => {
    const slots = availableSlots({
      rules,
      busy: [
        {
          start: new Date('2026-08-04T15:30:00Z'),
          end: new Date('2026-08-04T15:45:00Z'),
        },
      ],
      durationMinutes: 60,
      now,
      horizonDays: 2,
    });

    // El de las 15:00 se pisa con la cita de las 15:30.
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.start.toISOString(), '2026-08-04T16:00:00.000Z');
  });

  it('no ofrece nada con menos antelación de la mínima', () => {
    // Justo antes del primer hueco: no da tiempo a nadie a prepararse.
    const slots = availableSlots({
      rules,
      busy: [],
      durationMinutes: 60,
      now: new Date('2026-08-04T14:30:00Z'),
      horizonDays: 1,
    });

    assert.equal(
      slots.some((slot) => slot.start.toISOString() === '2026-08-04T15:00:00.000Z'),
      false,
    );
  });

  it('una regla apagada no ofrece nada', () => {
    const slots = availableSlots({
      rules: [{ ...rules[0]!, active: false }],
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 7,
    });

    assert.equal(slots.length, 0);
  });

  it('ignora una franja con horas mal escritas en vez de romperse', () => {
    const slots = availableSlots({
      rules: [{ ...rules[0]!, startTime: '25:00' }],
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 7,
    });

    assert.equal(slots.length, 0);
  });

  it('ignora una franja que termina antes de empezar', () => {
    const slots = availableSlots({
      rules: [{ ...rules[0]!, startTime: '11:00', endTime: '09:00' }],
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 7,
    });

    assert.equal(slots.length, 0);
  });

  it('se repite cada semana dentro del horizonte', () => {
    const slots = availableSlots({
      rules,
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 15,
    });

    // Tres martes en dos semanas y pico, dos huecos cada uno.
    assert.equal(slots.length, 6);
  });

  it('los devuelve ordenados y sin repetir', () => {
    const slots = availableSlots({
      // Dos reglas solapadas del mismo profesional.
      rules: [rules[0]!, { ...rules[0]!, startTime: '09:00', endTime: '10:00' }],
      busy: [],
      durationMinutes: 60,
      now,
      horizonDays: 2,
    });

    const times = slots.map((slot) => slot.start.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.equal(new Set(times).size, times.length);
  });
});

describe('ventana para entrar a la sala', () => {
  const scheduled = new Date('2026-08-04T15:00:00Z');

  it('abre antes de la hora', () => {
    const window = joinWindow(scheduled, new Date('2026-08-04T14:50:00Z'), 15, 30);
    assert.equal(window.open, true);
  });

  it('sigue abierta un rato después', () => {
    // Una consulta que empieza cinco minutos tarde no debe encontrar la puerta
    // cerrada.
    const window = joinWindow(scheduled, new Date('2026-08-04T15:20:00Z'), 15, 30);
    assert.equal(window.open, true);
  });

  it('está cerrada mucho antes', () => {
    const window = joinWindow(scheduled, new Date('2026-08-04T13:00:00Z'), 15, 30);
    assert.equal(window.open, false);
  });

  it('está cerrada mucho después', () => {
    const window = joinWindow(scheduled, new Date('2026-08-04T16:00:00Z'), 15, 30);
    assert.equal(window.open, false);
  });
});
