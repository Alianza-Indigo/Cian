/**
 * Reconciliador de suscripciones. Fase 9.
 *
 * Lo que se puede probar aquí sin acceso a Stripe es lo que decide: cuándo hay
 * que corregir y cómo se lee lo que Stripe devuelve. Las dos partes son puras a
 * propósito, precisamente para que existan estas pruebas.
 *
 * Importa que `differs` no sea demasiado sensible ni demasiado tolerante:
 *
 * - Demasiado sensible, escribe en la base en cada barrido y ensucia
 *   `updated_at` de todo el mundo cada día por milisegundos de diferencia.
 * - Demasiado tolerante, deja pasar justo el caso para el que existe: una
 *   suscripción cancelada que aquí sigue activa.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  differs,
  parseRemote,
  type KnownState,
} from '../lib/billing/reconcile';

const BASE: KnownState = {
  plan: 'personal',
  status: 'activa',
  seats: 1,
  currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
};

describe('cuándo hay que corregir', () => {
  it('no corrige cuando todo coincide', () => {
    assert.equal(differs(BASE, { ...BASE }), false);
  });

  it('corrige una cancelación que no llegó por webhook', () => {
    assert.equal(differs(BASE, { ...BASE, status: 'cancelada' }), true);
  });

  it('corrige un cambio de plan hecho desde el panel de Stripe', () => {
    assert.equal(differs(BASE, { ...BASE, plan: 'organization' }), true);
  });

  it('corrige un cambio en los asientos comprados', () => {
    assert.equal(differs(BASE, { ...BASE, seats: 5 }), true);
  });

  it('corrige una cancelación programada al final del periodo', () => {
    assert.equal(differs(BASE, { ...BASE, cancelAtPeriodEnd: true }), true);
  });

  it('corrige una renovación cuyo evento se perdió', () => {
    const renewed = {
      ...BASE,
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
    };
    assert.equal(differs(BASE, renewed), true);
  });
});

describe('lo que no debe disparar una escritura', () => {
  it('los milisegundos no cuentan como diferencia', () => {
    // Stripe manda segundos epoch. Los milisegundos de nuestra fila son ruido
    // y compararlos escribiría en la base en cada barrido.
    const known = {
      ...BASE,
      currentPeriodEnd: new Date('2026-09-01T00:00:00.750Z'),
    };
    assert.equal(differs(known, BASE), false);
  });

  it('dos fechas ausentes coinciden', () => {
    const sinFecha = { ...BASE, currentPeriodEnd: null };
    assert.equal(differs(sinFecha, { ...sinFecha }), false);
  });

  it('una fecha presente frente a una ausente sí es diferencia', () => {
    assert.equal(differs(BASE, { ...BASE, currentPeriodEnd: null }), true);
  });
});

describe('lectura del objeto de Stripe', () => {
  it('lee estado, plan, ciclo, asientos y fin de periodo', () => {
    const remote = parseRemote({
      status: 'active',
      customer: 'cus_123',
      metadata: { plan: 'organization', cycle: 'anual' },
      items: { data: [{ quantity: 8 }] },
      current_period_end: 1_788_000_000,
      cancel_at_period_end: false,
    });

    assert.equal(remote.status, 'activa');
    assert.equal(remote.plan, 'organization');
    assert.equal(remote.cycle, 'anual');
    assert.equal(remote.seats, 8);
    assert.equal(remote.stripeCustomerId, 'cus_123');
    assert.equal(remote.currentPeriodEnd?.getTime(), 1_788_000_000 * 1000);
  });

  it('un estado desconocido de Stripe no concede acceso', () => {
    const remote = parseRemote({ status: 'paused' });
    assert.equal(remote.status, 'incompleta');
  });

  it('sin metadatos cae en el plan personal, no en el más caro', () => {
    const remote = parseRemote({ status: 'active' });
    assert.equal(remote.plan, 'personal');
    assert.equal(remote.cycle, null);
  });

  it('un plan inventado en los metadatos no se acepta', () => {
    const remote = parseRemote({
      status: 'active',
      metadata: { plan: 'ilimitado_gratis' },
    });
    assert.equal(remote.plan, 'personal');
  });

  it('sin líneas de suscripción queda un asiento, nunca cero', () => {
    assert.equal(parseRemote({ status: 'active' }).seats, 1);
    assert.equal(
      parseRemote({ status: 'active', items: { data: [{ quantity: 0 }] } }).seats,
      1,
    );
  });

  it('un objeto vacío no revienta ni inventa una suscripción válida', () => {
    const remote = parseRemote({});
    assert.equal(remote.status, 'incompleta');
    assert.equal(remote.currentPeriodEnd, null);
    assert.equal(remote.cancelAtPeriodEnd, false);
    assert.equal(remote.stripeCustomerId, null);
  });
});
