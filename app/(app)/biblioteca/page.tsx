import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  listLibraryResources,
  searchLibrary,
  type SearchResult,
} from '@/lib/db/repositories/library';
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  type LibraryCategory,
} from '@/lib/library/types';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Biblioteca' };
export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ categoria?: string; buscar?: string }>;
};

/**
 * Un resultado por recurso.
 *
 * `searchLibrary` devuelve **fragmentos**, y un recurso largo puede aportar
 * cuatro. Eso está bien para el modelo, que quiere el trozo exacto, y mal para
 * una lista de lectura: la misma guía repetida cuatro veces parece cuatro guías
 * y esconde las demás.
 */
function byResource(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];

  for (const result of results) {
    if (seen.has(result.resourceId)) continue;
    seen.add(result.resourceId);
    unique.push(result);
  }

  return unique;
}

export default async function BibliotecaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ctx = await requireTenantContext();

  const category = LIBRARY_CATEGORIES.find(
    (candidate) => candidate === params.categoria,
  );

  const query = params.buscar?.trim() ?? '';

  /*
   * Buscar es una navegación, no una interacción con estado: va por la URL y
   * lo resuelve el servidor. Así el resultado se puede compartir y guardar en
   * marcadores, funciona sin JavaScript, y quien vuelve con el botón de atrás
   * encuentra lo que estaba mirando.
   */
  const results = query
    ? byResource(await searchLibrary(ctx, query, { category, limit: 20 }))
    : [];

  const resources = query ? [] : await listLibraryResources(ctx, { category });

  const grouped = new Map<LibraryCategory, typeof resources>();
  for (const resource of resources) {
    const list = grouped.get(resource.category) ?? [];
    list.push(resource);
    grouped.set(resource.category, list);
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
        <p className="mt-2 text-muted-foreground">
          Contenido revisado sobre neurodivergencia, educación, derechos y vida
          diaria. CIAN se apoya en él al responderte, y te dice de dónde salió.
        </p>
      </div>

      <form
        role="search"
        action="/biblioteca"
        className="flex flex-wrap gap-2"
      >
        {/* La categoría elegida viaja con la búsqueda para no perderse. */}
        {category ? (
          <input type="hidden" name="categoria" value={category} />
        ) : null}

        <label htmlFor="buscar-biblioteca" className="sr-only">
          Buscar en la biblioteca
        </label>
        <input
          id="buscar-biblioteca"
          type="search"
          name="buscar"
          defaultValue={query}
          placeholder="Buscar: sobrecarga en el aula, derechos, rutinas…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          style={{ minHeight: 'var(--cian-control-height)' }}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          style={{ minHeight: 'var(--cian-control-height)' }}
        >
          <Search aria-hidden="true" className="size-4" />
          Buscar
        </button>
      </form>

      {/* Al filtrar por categoría se conserva la búsqueda: filtrar es acotar
          lo que se está mirando, no empezar de cero. */}
      <nav aria-label="Categorías de la biblioteca">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href={query ? `/biblioteca?buscar=${encodeURIComponent(query)}` : '/biblioteca'}
              aria-current={category ? undefined : 'page'}
              className={
                category
                  ? 'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted'
                  : 'rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground'
              }
            >
              Todo
            </Link>
          </li>
          {LIBRARY_CATEGORIES.map((item) => (
            <li key={item}>
              <Link
                href={
                  query
                    ? `/biblioteca?categoria=${item}&buscar=${encodeURIComponent(query)}`
                    : `/biblioteca?categoria=${item}`
                }
                aria-current={category === item ? 'page' : undefined}
                className={
                  category === item
                    ? 'rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground'
                    : 'rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted'
                }
              >
                {LIBRARY_CATEGORY_LABELS[item]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {query ? (
        <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {results.length === 0
                ? `Nada sobre «${query}»`
                : `${results.length} ${
                    results.length === 1 ? 'resultado' : 'resultados'
                  } sobre «${query}»`}
            </h2>
            <Link
              href={category ? `/biblioteca?categoria=${category}` : '/biblioteca'}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Ver todo otra vez
            </Link>
          </div>

          {results.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">
                No encontramos nada con esas palabras. Puedes probar con otras,
                quitar el filtro de categoría, o preguntárselo a CIAN en una
                conversación: ahí busca por significado y no solo por palabras.
              </p>
            </Card>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
              {results.map((result) => (
                <li key={result.resourceId}>
                  <Link
                    href={`/biblioteca/${result.slug}`}
                    className="block rounded-xl border border-border bg-card transition-colors hover:bg-muted"
                    style={{ padding: 'var(--cian-block-padding)' }}
                  >
                    <h3 className="text-sm font-semibold">{result.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {LIBRARY_CATEGORY_LABELS[result.category]}
                      {result.source ? ` · ${result.source}` : ''}
                    </p>
                    {/*
                      * El fragmento que coincidió, recortado. Da contexto para
                      * decidir si vale la pena abrirlo sin tener que abrirlo.
                      */}
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {result.excerpt.slice(0, 300)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!query && resources.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            La biblioteca todavía no tiene contenido indexado. Se carga desde
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              content/library/
            </code>
            con el reindexado semanal.
          </p>
        </Card>
      ) : null}

      {[...grouped.entries()].map(([groupCategory, items]) => (
        <section key={groupCategory} style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          <h2 className="text-lg font-semibold tracking-tight">
            {LIBRARY_CATEGORY_LABELS[groupCategory]}
          </h2>

          <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {items.map((resource) => (
              <li key={resource.id}>
                <Link
                  href={`/biblioteca/${resource.slug}`}
                  className="block rounded-xl border border-border bg-card transition-colors hover:bg-muted"
                  style={{ padding: 'var(--cian-block-padding)' }}
                >
                  <h3 className="text-sm font-semibold">{resource.title}</h3>
                  {resource.tags.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {resource.tags.join(' · ')}
                    </p>
                  ) : null}
                  {resource.tenantId ? (
                    <p className="mt-1 text-xs text-accent-foreground">
                      Recurso propio de tu espacio
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
