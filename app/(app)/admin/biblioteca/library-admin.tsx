'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileWarning, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  type LibraryCategory,
} from '@/lib/library/types';
import {
  deleteLibraryResourceAction,
  saveLibraryResourceAction,
} from '@/lib/admin/actions';

type Resource = {
  slug: string;
  title: string;
  category: LibraryCategory;
  tags: string[];
  source: string | null;
  content: string;
  updatedAt: string;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const EMPTY: Resource = {
  slug: '',
  title: '',
  category: 'educacion',
  tags: [],
  source: null,
  content: '',
  updatedAt: '',
};

/**
 * Curaduría de la biblioteca desde la plataforma.
 *
 * Publicar aquí trocea el contenido y calcula sus embeddings, así que guardar
 * tarda unos segundos: son varias llamadas al modelo. Se avisa en pantalla en
 * vez de dejar el botón mudo.
 */
export function LibraryAdmin({
  resources,
  repoSlugs,
}: {
  resources: Resource[];
  repoSlugs: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Resource | null>(null);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) {
        setDraft(null);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Publicando e indexando… puede tardar unos segundos.' : status}
      </p>

      {draft ? (
        <Card>
          <h2 className="text-sm font-semibold">
            {draft.updatedAt ? `Editar «${draft.title}»` : 'Recurso nuevo'}
          </h2>

          <div className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            <div>
              <label htmlFor="rec-slug" className="text-sm font-medium">
                Identificador
              </label>
              <input
                id="rec-slug"
                type="text"
                value={draft.slug}
                readOnly={Boolean(draft.updatedAt)}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="ajustes-razonables-en-la-escuela"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Minúsculas, números y guiones. Es la dirección pública del
                recurso y no se cambia después.
              </p>
            </div>

            <div>
              <label htmlFor="rec-titulo" className="text-sm font-medium">
                Título
              </label>
              <input
                id="rec-titulo"
                type="text"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              />
            </div>

            <div>
              <label htmlFor="rec-categoria" className="text-sm font-medium">
                Categoría
              </label>
              <select
                id="rec-categoria"
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value as LibraryCategory })
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                {LIBRARY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {LIBRARY_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rec-etiquetas" className="text-sm font-medium">
                Etiquetas <span className="text-muted-foreground">(separadas por comas)</span>
              </label>
              <input
                id="rec-etiquetas"
                type="text"
                value={draft.tags.join(', ')}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              />
            </div>

            <div>
              <label htmlFor="rec-fuente" className="text-sm font-medium">
                Fuente <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="rec-fuente"
                type="text"
                value={draft.source ?? ''}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="Alianza Índigo Neurodivergente A.C."
              />
            </div>

            <div>
              <label htmlFor="rec-contenido" className="text-sm font-medium">
                Contenido
              </label>
              <textarea
                id="rec-contenido"
                rows={18}
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                placeholder="# Encabezado&#10;&#10;Los encabezados dividen el contenido en fragmentos buscables."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Markdown. Los encabezados marcan los cortes: un texto sin
                encabezados se recupera peor.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    saveLibraryResourceAction({
                      slug: draft.slug,
                      title: draft.title,
                      category: draft.category,
                      tags: draft.tags,
                      source: draft.source || undefined,
                      content: draft.content,
                    }),
                  )
                }
              >
                <Save aria-hidden="true" />
                Publicar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => setDraft({ ...EMPTY })}
        >
          <Plus aria-hidden="true" />
          Recurso nuevo
        </Button>
      )}

      <section aria-labelledby="recursos">
        <h2 id="recursos" className="text-lg font-semibold tracking-tight">
          Recursos publicados
        </h2>

        {resources.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              Todavía no hay recursos globales.
            </p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {resources.map((resource) => {
              const fromRepo = repoSlugs.includes(resource.slug);

              return (
                <li key={resource.slug}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold">{resource.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {LIBRARY_CATEGORY_LABELS[resource.category]} · {resource.slug}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDraft(resource)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirar "${resource.title}"`}
                          disabled={isPending}
                          onClick={() =>
                            run(() => deleteLibraryResourceAction(resource.slug))
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {fromRepo ? (
                      <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                        <FileWarning aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        Este recurso también existe como archivo en el
                        repositorio. Lo que edites aquí se revertirá en el
                        siguiente despliegue.
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
