import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireTenantContext } from '@/lib/tenant/context';
import { getResourceBySlug } from '@/lib/db/repositories/library';
import { LIBRARY_CATEGORY_LABELS } from '@/lib/library/types';
import { parseContent } from '@/lib/documents/content';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await requireTenantContext();
  const resource = await getResourceBySlug(ctx, slug);
  return { title: resource?.title ?? 'Recurso' };
}

export default async function RecursoPage({ params }: PageProps) {
  const { slug } = await params;
  const ctx = await requireTenantContext();

  // `getResourceBySlug` solo devuelve lo global y lo del propio tenant: un
  // recurso de otro espacio sencillamente no existe desde aquí.
  const resource = await getResourceBySlug(ctx, slug);
  if (!resource) notFound();

  const blocks = parseContent(resource.content);

  const reviewed = resource.reviewedAt
    ? new Intl.DateTimeFormat('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(resource.reviewedAt)
    : null;

  return (
    <article style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <Link
          href="/biblioteca"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Biblioteca
        </Link>

        <p className="mt-3 text-xs font-medium text-accent-foreground">
          {LIBRARY_CATEGORY_LABELS[resource.category]}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {resource.title}
        </h1>

        <p className="mt-2 text-xs text-muted-foreground">
          {resource.source ? `${resource.source}` : 'CIAN'}
          {reviewed ? ` · Revisado el ${reviewed}` : ''}
        </p>
      </div>

      <div className="space-y-4">
        {blocks.map((block, index) => {
          const key = `${block.kind}-${index}`;

          switch (block.kind) {
            case 'heading':
              return block.level === 1 ? (
                <h2 key={key} className="text-xl font-semibold tracking-tight">
                  {block.text}
                </h2>
              ) : (
                <h3 key={key} className="text-base font-semibold">
                  {block.text}
                </h3>
              );
            case 'paragraph':
              return (
                <p key={key} className="text-sm leading-relaxed">
                  {block.text}
                </p>
              );
            case 'bullet':
              return (
                <p key={key} className="flex gap-2 text-sm leading-relaxed">
                  <span aria-hidden="true" className="text-muted-foreground">
                    •
                  </span>
                  <span>{block.text}</span>
                </p>
              );
            case 'numbered':
              return (
                <p key={key} className="flex gap-2 text-sm leading-relaxed">
                  <span aria-hidden="true" className="text-muted-foreground">
                    {block.index}.
                  </span>
                  <span>{block.text}</span>
                </p>
              );
            case 'quote':
              return (
                <blockquote
                  key={key}
                  className="border-l-2 border-accent pl-3 text-sm italic text-muted-foreground"
                >
                  {block.text}
                </blockquote>
              );
            case 'divider':
              return <hr key={key} className="border-border" />;
            default:
              return null;
          }
        })}
      </div>
    </article>
  );
}
