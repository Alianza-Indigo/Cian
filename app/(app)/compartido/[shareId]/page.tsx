import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getSharedResource, listSharedNotes } from '@/lib/db/repositories/team';
import { readSharedContent } from '@/lib/team/shared-content';
import { recordSharedAccess } from '@/lib/team/audit';
import { canComment, SHAREABLE_TYPE_LABELS } from '@/lib/team/types';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { SharedNotes } from './shared-notes';

export const metadata: Metadata = { title: 'Recurso compartido' };
export const dynamic = 'force-dynamic';

export default async function RecursoCompartidoPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?siguiente=${encodeURIComponent(`/compartido/${shareId}`)}`);
  }

  /*
   * El permiso se comprueba aquí y en cada visita, no al montar una sesión. Si
   * quien compartió lo retira mientras esta página está abierta, recargar da
   * 404 al instante.
   */
  const shared = await getSharedResource(session.user.id, shareId);
  if (!shared) notFound();

  const { share, ownerName, ownerEmail } = shared;

  const [content, notes] = await Promise.all([
    readSharedContent(share.tenantId, share.resourceType, share.resourceId),
    listSharedNotes(share.id, share.tenantId),
  ]);

  // Criterio del PRD: cada acceso a un recurso compartido queda registrado.
  await recordSharedAccess({
    tenantId: share.tenantId,
    viewerUserId: session.user.id,
    shareId: share.id,
    resourceType: share.resourceType,
    action: 'share.view',
  });

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <Link
          href="/compartido"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Compartido conmigo
        </Link>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {content?.title ?? share.resourceTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {SHAREABLE_TYPE_LABELS[share.resourceType]} · lo comparte{' '}
          {ownerName ?? ownerEmail ?? 'alguien de tu equipo'}
        </p>
      </div>

      {!content ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Este recurso ya no está disponible. Puede que quien lo compartió lo
            haya eliminado.
          </p>
        </Card>
      ) : (
        <Card>
          {content.description ? (
            <p className="text-sm text-muted-foreground">{content.description}</p>
          ) : null}

          {content.sections.map((section, index) => (
            <div key={`${section.heading}-${index}`} className="mt-4 first:mt-0">
              <h2 className="text-sm font-semibold">{section.heading}</h2>
              {section.items.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {section.items.map((item, itemIndex) => (
                    <li key={`${index}-${itemIndex}`} className="flex gap-2 text-sm">
                      <span aria-hidden="true" className="text-muted-foreground">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Sin contenido.</p>
              )}
            </div>
          ))}

          {content.downloadId ? (
            <a
              href={`/api/compartido/${share.id}/archivo`}
              className={`mt-4 ${buttonVariants({ variant: 'outline' })}`}
              style={{ minHeight: 'var(--cian-control-height)' }}
            >
              <Download aria-hidden="true" className="size-4" />
              Descargar
            </a>
          ) : null}
        </Card>
      )}

      <SharedNotes
        shareId={share.id}
        canWrite={canComment(share.permission)}
        notes={notes.map(({ note, authorName }) => ({
          id: note.id,
          authorName,
          isMine: note.authorUserId === session.user?.id,
          content: note.content,
          createdAt: note.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
