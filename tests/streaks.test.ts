/**
 * Constancia de una rutina. Fase 3.
 *
 * Lo que importa comprobar no es que sepa sumar, sino que no castigue:
 *
 * - Que la racha cuente **días**, no veces. Hacer la rutina tres veces un
 *   martes es un martes.
 * - Que exista el día de margen. Sin él, abrir la pantalla por la mañana antes
 *   de hacer la rutina diría que se rompió la racha.
 * - Que `totalDays` sobreviva a un día fallado, porque ese número sigue siendo
 *   verdad cuando la racha ya no lo es.
 *
 * La función recibe `today` por parámetro justamente para poder probarla, y
 * porque en producción se ejecuta en el navegador, que es donde se sabe qué día
 * es hoy para quien mira.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RECENT_WINDOW_DAYS,
  localDayKey,
  summarizeStreak,
} from '../lib/plans/streaks';

/** Un instante en hora local, para no repetir `new Date(...)` con seis campos. */
function at(year: number, month: number, day: number, hour = 9): Date {
  return new Date(year, month - 1, day, hour);
}

const HOY = at(2026, 3, 15, 20);

describe('racha actual', () => {
  it('cuenta los días seguidos hasta hoy', () => {
    const streak = summarizeStreak(
      [at(2026, 3, 13), at(2026, 3, 14), at(2026, 3, 15)],
      HOY,
    );

    assert.equal(streak.currentStreak, 3);
  });

  it('sigue viva si la última vez fue ayer', () => {
    const streak = summarizeStreak([at(2026, 3, 13), at(2026, 3, 14)], HOY);

    // El día de margen: todavía no es tarde para hacerla hoy.
    assert.equal(streak.currentStreak, 2);
  });

  it('se apaga si la última vez fue anteayer', () => {
    const streak = summarizeStreak([at(2026, 3, 12), at(2026, 3, 13)], HOY);

    assert.equal(streak.currentStreak, 0);
  });

  it('un hueco en medio corta la racha en el hueco', () => {
    const streak = summarizeStreak(
      [at(2026, 3, 10), at(2026, 3, 11), at(2026, 3, 14), at(2026, 3, 15)],
      HOY,
    );

    assert.equal(streak.currentStreak, 2);
  });

  it('varias veces el mismo día son un solo día', () => {
    const streak = summarizeStreak(
      [at(2026, 3, 15, 7), at(2026, 3, 15, 13), at(2026, 3, 15, 21)],
      HOY,
    );

    assert.equal(streak.currentStreak, 1);
    assert.equal(streak.totalDays, 1);
  });
});

describe('lo que queda cuando se rompe la racha', () => {
  it('el total de días no se pierde al fallar', () => {
    const streak = summarizeStreak(
      [at(2026, 2, 1), at(2026, 2, 2), at(2026, 2, 3)],
      HOY,
    );

    assert.equal(streak.currentStreak, 0);
    assert.equal(streak.totalDays, 3);
    assert.equal(streak.longestStreak, 3);
  });

  it('la racha más larga se conserva aunque la actual sea menor', () => {
    const streak = summarizeStreak(
      [
        at(2026, 2, 1),
        at(2026, 2, 2),
        at(2026, 2, 3),
        at(2026, 2, 4),
        at(2026, 3, 15),
      ],
      HOY,
    );

    assert.equal(streak.currentStreak, 1);
    assert.equal(streak.longestStreak, 4);
  });
});

describe('la última vez', () => {
  it('dice cero cuando fue hoy', () => {
    assert.equal(summarizeStreak([at(2026, 3, 15)], HOY).lastDoneDaysAgo, 0);
  });

  it('dice uno cuando fue ayer', () => {
    assert.equal(summarizeStreak([at(2026, 3, 14)], HOY).lastDoneDaysAgo, 1);
  });

  it('cuenta días de calendario, no vueltas de 24 horas', () => {
    // Las 23:30 de ayer y las 00:30 de hoy son una hora, y son dos días.
    const streak = summarizeStreak([at(2026, 3, 14, 23)], at(2026, 3, 15, 0));
    assert.equal(streak.lastDoneDaysAgo, 1);
  });

  it('es null si nunca se completó', () => {
    const streak = summarizeStreak([], HOY);
    assert.equal(streak.lastDoneDaysAgo, null);
    assert.equal(streak.currentStreak, 0);
    assert.equal(streak.longestStreak, 0);
    assert.equal(streak.totalDays, 0);
  });
});

describe('tira de días recientes', () => {
  it('devuelve la ventana completa, del más antiguo al más reciente', () => {
    const streak = summarizeStreak([at(2026, 3, 15)], HOY);

    assert.equal(streak.recentDays.length, RECENT_WINDOW_DAYS);
    assert.equal(streak.recentDays.at(-1)?.key, localDayKey(HOY));
    assert.equal(streak.recentDays.at(-1)?.done, true);
    assert.equal(streak.recentDays[0]?.done, false);
  });

  it('marca solo los días con registro', () => {
    const streak = summarizeStreak([at(2026, 3, 13), at(2026, 3, 15)], HOY);

    const done = streak.recentDays.filter((day) => day.done).map((d) => d.key);
    assert.deepEqual(done, ['2026-03-13', '2026-03-15']);
  });

  it('un registro más viejo que la ventana no aparece en la tira pero sí en el total', () => {
    const streak = summarizeStreak([at(2025, 12, 1), at(2026, 3, 15)], HOY);

    assert.equal(streak.recentDays.filter((day) => day.done).length, 1);
    assert.equal(streak.totalDays, 2);
  });
});
