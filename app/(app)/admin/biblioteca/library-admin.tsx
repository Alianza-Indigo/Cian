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

type Scope = 'espacio' | 'global';

type Resource = {
  slug: string;
  title: string;
  category: LibraryCategory;
  tags: string[];
  source: string | null;
  content: string;
  updatedAt: string;
};

type Draft = Resource & { scope: Scope };

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const EMPTY: Draft = {
  slug: '',
  title: '',
  category: 'educacion',
  tags: [],
  source: null,
  content: '',
  updatedAt: '',
  scope: 'espacio',
};

/**
 * Curaduría de la biblioteca desde la plataforma.
 *
 * Publicar aquí trocea el contenido y calcula sus embeddings, así que guardar
 * tarda unos segundos: son varias llamadas al modelo. Se avisa en pantalla en
 * vez de dejar el botón mudo.
 *
 * Dos listas separadas y no una con etiquetas: retirar un recurso global afecta
 * a toda la plataforma y retirar uno del espacio no, y esa diferencia tiene que
 * verse antes de pulsar, no leerse en una insignia pequeña.
 */
export function LibraryAdmin({
  tenantResources,
  globalResources,
  canPublishGlobal,
  repoSlugs,
}: {
  tenantResources: Resource[];
  globalResources: Resource[];
  canPublishGlobal: boolean;
  repoSlugs: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

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

            {canPublishGlobal ? (
              <div>
                <label htmlFor="rec-ambito" className="text-sm font-medium">
                  Quién lo ve
                </label>
                <select
                  id="rec-ambito"
                  value={draft.scope}
                  disabled={Boolean(draft.updatedAt)}
                  onChange={(event) =>
                    setDraft({ ...draft, scope: event.target.value as Scope })
                  }
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  <option value="espacio">Solo este espacio</option>
                  <option value="global">Todo CIAN</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {draft.updatedAt
                    ? 'El ámbito no se cambia al editar: mueve el recurso creándolo de nuevo en el otro y retirando este.'
                    : 'Publicar para todo CIAN afecta a cada espacio de la plataforma.'}
                </p>
              </div>
            ) : null}

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
                      scope: draft.scope,
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

      <ResourceList
        id="recursos-espacio"
        heading="Recursos de este espacio"
        description="Solo los ve quien entra a este espacio. Es donde van vuestros protocolos, formatos y materiales propios."
        empty="Todavía no hay recursos propios de este espacio."
        scope="espacio"
        resources={tenantResources}
        repoSlugs={repoSlugs}
        isPending={isPending}
        onEdit={(resource) => setDraft({ ...resource, scope: 'espacio' })}
        onDelete={(slug) => run(() => deleteLibraryResourceAction(slug, 'espacio'))}
      />

      {canPublishGlobal ? (
        <ResourceList
          id="recursos-globales"
          heading="Recursos de toda la plataforma"
          description="Los ve cada espacio de CIAN. Retirar uno lo retira para todo el mundo."
          empty="Todavía no hay recursos globales."
          scope="global"
          resources={globalResources}
          repoSlugs={repoSlugs}
          isPending={isPending}
          onEdit={(resource) => setDraft({ ...resource, scope: 'global' })}
          onDelete={(slug) => run(() => deleteLibraryResourceAction(slug, 'global'))}
        />
      ) : null}
    </div>
  );
}

function ResourceList({
  id,
  heading,
  description,
  empty,
  scope,
  resources,
  repoSlugs,
  isPending,
  onEdit,
  onDelete,
}: {
  id: string;
  heading: string;
  description: string;
  empty: string;
  scope: Scope;
  resources: Resource[];
  repoSlugs: string[];
  isPending: boolean;
  onEdit: (resource: Resource) => void;
  onDelete: (slug: string) => void;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {resources.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm text-muted-foreground">{empty}</p>
        </Card>
      ) : (
        <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {resources.map((resource) => {
            // El aviso solo aplica a lo global: los archivos del repositorio se
            // indexan siempre con `tenant_id` nulo y nunca pisan a un espacio.
            const fromRepo =
              scope === 'global' && repoSlugs.includes(resource.slug);

            return (
              <li key={resource.slug}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">{resource.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {LIBRARY_CATEGORY_LABELS[resource.category]} ·{' '}
                        {resource.slug}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(resource)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirar "${resource.title}"`}
                        disabled={isPending}
                        onClick={() => onDelete(resource.slug)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {fromRepo ? (
                    <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                      <FileWarning
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
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
  );
}
