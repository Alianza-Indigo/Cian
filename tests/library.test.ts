/**
 * Pruebas de la biblioteca.
 *
 * Se prueba lo que decide la calidad de la recuperación —cómo se lee el
 * frontmatter y cómo se trocea el contenido— y la exportación de materiales
 * educativos. Los embeddings y la consulta vectorial necesitan base de datos y
 * modelo, así que ahí no se llega desde aquí.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  chunkContent,
  parseResource,
  LibraryIngestError,
} from '../lib/library/ingest';
import { educationItemToMarkdown } from '../lib/library/education-export';
import { parseContent } from '../lib/documents/content';
import { LIBRARY_CATEGORIES, EMBEDDING_DIMENSIONS } from '../lib/library/types';

const CONTENT_DIR = join(process.cwd(), 'content', 'library');

const VALID = `---
titulo: Un recurso
categoria: educacion
etiquetas: escuela, aula
fuente: Alianza Índigo
revisado: 2026-08-01
---

# Encabezado

Un párrafo con contenido suficiente.
`;

describe('lectura de recursos de la biblioteca', () => {
  it('lee el frontmatter completo', () => {
    const resource = parseResource('un-recurso', VALID);

    assert.equal(resource.title, 'Un recurso');
    assert.equal(resource.category, 'educacion');
    assert.deepEqual(resource.tags, ['escuela', 'aula']);
    assert.equal(resource.source, 'Alianza Índigo');
    assert.equal(resource.reviewedAt?.getUTCFullYear(), 2026);
    assert.ok(resource.content.includes('Un párrafo'));
  });

  it('calcula una huella estable del contenido', () => {
    const a = parseResource('x', VALID);
    const b = parseResource('x', VALID);
    assert.equal(a.contentHash, b.contentHash);
    assert.equal(a.contentHash.length, 64);
  });

  it('cambia la huella si cambia el contenido', () => {
    const a = parseResource('x', VALID);
    const b = parseResource('x', VALID.replace('Un párrafo', 'Otro párrafo'));
    assert.notEqual(a.contentHash, b.contentHash);
  });

  it('rechaza un recurso sin frontmatter', () => {
    assert.throws(
      () => parseResource('x', '# Solo contenido'),
      LibraryIngestError,
    );
  });

  it('rechaza una categoría inventada y dice cuáles valen', () => {
    try {
      parseResource('x', VALID.replace('educacion', 'cocina'));
      assert.fail('debió lanzar');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      assert.ok(message.includes('cocina'));
      assert.ok(message.includes('educacion'));
    }
  });

  it('rechaza un recurso sin título o sin cuerpo', () => {
    assert.throws(
      () => parseResource('x', VALID.replace('titulo: Un recurso', 'titulo:')),
      LibraryIngestError,
    );
    assert.throws(
      () =>
        parseResource(
          'x',
          '---\ntitulo: T\ncategoria: educacion\n---\n\n',
        ),
      LibraryIngestError,
    );
  });
});

describe('troceado del contenido', () => {
  it('arrastra el encabezado de la sección a cada fragmento', () => {
    const chunks = chunkContent(
      '# Título\n\nUno.\n\n## Sección\n\n' + 'Contenido. '.repeat(200),
    );

    const fromSection = chunks.filter((chunk) => chunk.startsWith('Sección'));
    assert.ok(
      fromSection.length > 0,
      'los fragmentos de una sección deben conservar su encabezado',
    );
  });

  it('no produce fragmentos vacíos', () => {
    for (const chunk of chunkContent('# A\n\nUno.\n\n\n\n# B\n\nDos.')) {
      assert.ok(chunk.trim().length > 0);
    }
  });

  it('parte el contenido largo en varios fragmentos', () => {
    const long = Array.from(
      { length: 12 },
      (_, index) => `## Sección ${index}\n\n${'Texto. '.repeat(120)}`,
    ).join('\n\n');

    assert.ok(chunkContent(long).length > 3);
  });

  it('devuelve al menos un fragmento aunque el contenido sea mínimo', () => {
    assert.equal(chunkContent('Una frase.').length, 1);
  });

  it('no corta a media palabra', () => {
    const chunks = chunkContent('# T\n\n' + 'palabra '.repeat(500));
    for (const chunk of chunks) {
      assert.ok(!/palab$|pala$/.test(chunk.trim()));
    }
  });
});

describe('contenido real de content/library/', () => {
  const files = readdirSync(CONTENT_DIR).filter((file) => file.endsWith('.md'));

  it('hay contenido curado', () => {
    assert.ok(files.length >= 5, 'la biblioteca debe traer contenido de arranque');
  });

  for (const file of files) {
    it(`«${file}» es válido y se trocea`, () => {
      const slug = file.replace(/\.md$/, '');
      const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');

      const resource = parseResource(slug, raw);
      assert.ok(LIBRARY_CATEGORIES.includes(resource.category));
      assert.ok(resource.title.length > 0);

      const chunks = chunkContent(resource.content);
      assert.ok(chunks.length > 0);
      // Un fragmento gigante recupera mal: es señal de que el troceado falló.
      for (const chunk of chunks) assert.ok(chunk.length < 4000);
    });
  }
});

describe('exportación de materiales educativos', () => {
  function item(kind: string, payload: unknown) {
    return {
      id: 'e1',
      tenantId: 't1',
      userId: 'u1',
      kind,
      title: 'Material',
      payload,
      documentId: null,
      createdAt: new Date('2026-08-01T12:00:00Z'),
    } as never;
  }

  it('la agenda visual sale como lista numerada', () => {
    const markdown = educationItemToMarkdown(
      item('agenda_visual', {
        steps: [
          { title: 'Levantarse', icon: '☀️' },
          { title: 'Ponerse los zapatos' },
          { title: 'Y después, jugar' },
        ],
      }),
    );

    const blocks = parseContent(markdown);
    const numbered = blocks.filter((block) => block.kind === 'numbered');
    assert.equal(numbered.length, 3);
  });

  it('la adaptación sale agrupada por principio del DUA', () => {
    const markdown = educationItemToMarkdown(
      item('adaptacion', {
        summary: 'Para bajar la carga en el aula.',
        udl: {
          representacion: ['Instrucciones también por escrito'],
          implicacion: ['Ofrecer opciones de tema'],
        },
      }),
    );

    assert.ok(markdown.includes('Formas de presentar la información'));
    assert.ok(markdown.includes('Formas de implicarse'));
    // El principio sin contenido no debe dejar un encabezado huérfano.
    assert.ok(!markdown.includes('Formas de actuar y expresarse'));
  });

  it('el guion de reunión lleva puntos y preguntas con casilla', () => {
    const markdown = educationItemToMarkdown(
      item('reunion_escolar', {
        talkingPoints: [
          { point: 'Llega llorando tres de cinco días', support: 'Registro de dos semanas' },
        ],
        questions: ['¿Qué observan ustedes en el aula?'],
      }),
    );

    const blocks = parseContent(markdown);
    assert.ok(blocks.some((block) => block.kind === 'numbered'));
    assert.ok(blocks.some((block) => block.kind === 'checkbox'));
    assert.ok(markdown.includes('Respaldo: Registro de dos semanas'));
  });

  it('incluye las citas de la biblioteca', () => {
    const markdown = educationItemToMarkdown(
      item('adaptacion', {
        citations: [{ slug: 'ajustes', title: 'Ajustes razonables en la escuela' }],
      }),
    );

    assert.ok(markdown.includes('Se apoya en'));
    assert.ok(markdown.includes('Ajustes razonables en la escuela'));
  });
});

describe('configuración de embeddings', () => {
  it('conserva la dimensión que fija el PRD', () => {
    // Cambiar esto obliga a reindexar la biblioteca y a migrar la columna.
    assert.equal(EMBEDDING_DIMENSIONS, 1536);
  });
});
