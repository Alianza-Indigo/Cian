import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { listLibraryResources } from '@/lib/db/repositories/library';
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  type LibraryCategory,
} from '@/lib/library/types';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Biblioteca' };
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ categoria?: string }> };

export default async function BibliotecaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ctx = await requireTenantContext();

  const category = LIBRARY_CATEGORIES.find(
    (candidate) => candidate === params.categoria,
  );

  const resources = await listLibraryResources(ctx, { category });

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

      <nav aria-label="Categorías de la biblioteca">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/biblioteca"
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
                href={`/biblioteca?categoria=${item}`}
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

      {resources.length === 0 ? (
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
