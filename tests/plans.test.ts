/**
 * Pruebas de la lógica de planes y rutinas.
 *
 * Se prueba lo que da forma a lo que ve la persona: el formato de duraciones
 * de una secuencia y la exportación de un plan a documento.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDuration, totalDuration } from '../lib/plans/types';
import { planToMarkdown } from '../lib/plans/export';
import { parseContent } from '../lib/documents/content';

describe('duración de los pasos', () => {
  it('usa la unidad que se lee de un vistazo', () => {
    assert.equal(formatDuration(30), '30 s');
    assert.equal(formatDuration(60), '1 min');
    assert.equal(formatDuration(300), '5 min');
    assert.equal(formatDuration(3600), '1 h');
    assert.equal(formatDuration(5400), '1 h 30 min');
  });

  it('trata la ausencia de duración como ausencia, no como cero', () => {
    assert.equal(formatDuration(null), null);
    assert.equal(formatDuration(0), null);
  });

  it('suma la secuencia ignorando los pasos sin estimación', () => {
    assert.equal(
      totalDuration([
        { durationSeconds: 120 },
        { durationSeconds: null },
        { durationSeconds: 180 },
      ]),
      300,
    );
    assert.equal(totalDuration([]), 0);
  });
});

describe('exportación de un plan', () => {
  const plan = {
    id: 'p1',
    tenantId: 't1',
    userId: 'u1',
    conversationId: null,
    type: 'escolar' as const,
    title: 'Apoyo en el aula',
    description: 'Acuerdos con la escuela para el ciclo actual.',
    status: 'activo' as const,
    createdAt: new Date('2026-08-01T12:00:00Z'),
    updatedAt: new Date('2026-08-01T12:00:00Z'),
    objectives: [
      {
        id: 'o1',
        tenantId: 't1',
        planId: 'p1',
        title: 'Reducir la sobrecarga en el comedor',
        description: null,
        orderIndex: 0,
        status: 'en_progreso' as const,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        strategies: [
          {
            id: 's1',
            tenantId: 't1',
            objectiveId: 'o1',
            content: 'Permitir el uso de audífonos durante el recreo',
            orderIndex: 0,
            createdAt: new Date('2026-08-01T12:00:00Z'),
          },
        ],
      },
    ],
  };

  it('produce Markdown que el generador de documentos entiende', () => {
    const markdown = planToMarkdown(plan);
    const bloques = parseContent(markdown);

    // El objetivo debe salir como encabezado, no como párrafo suelto.
    const encabezados = bloques.filter((b) => b.kind === 'heading');
    assert.ok(encabezados.length >= 1);
    assert.ok(
      encabezados.some(
        (b) => b.kind === 'heading' && b.text.includes('Reducir la sobrecarga'),
      ),
    );

    // Y la estrategia como viñeta.
    assert.ok(
      bloques.some(
        (b) => b.kind === 'bullet' && b.text.includes('audífonos'),
      ),
    );
  });

  it('incluye tipo, estado y descripción', () => {
    const markdown = planToMarkdown(plan);
    assert.ok(markdown.includes('Escolar'));
    assert.ok(markdown.includes('Activo'));
    assert.ok(markdown.includes('Acuerdos con la escuela'));
  });

  it('numera los objetivos en el orden del plan', () => {
    const markdown = planToMarkdown(plan);
    assert.ok(markdown.includes('## 1. Reducir la sobrecarga en el comedor'));
  });

  it('dice que no hay objetivos en vez de dejar un hueco', () => {
    const markdown = planToMarkdown({ ...plan, objectives: [] });
    assert.ok(markdown.includes('todavía no tiene objetivos'));
  });

  it('agrega el seguimiento cuando lo hay', () => {
    const markdown = planToMarkdown(plan, [
      {
        id: 'pr1',
        tenantId: 't1',
        planId: 'p1',
        objectiveId: 'o1',
        note: 'Funcionó dos de tres días',
        rating: 4,
        loggedAt: new Date('2026-08-02T12:00:00Z'),
      },
    ]);

    assert.ok(markdown.includes('Seguimiento'));
    assert.ok(markdown.includes('Funcionó dos de tres días'));
    assert.ok(markdown.includes('valoración 4 de 5'));
  });
});
