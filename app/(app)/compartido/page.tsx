import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listSharedWithMe } from '@/lib/db/repositories/team';
import { Card } from '@/components/ui/card';
import { SHAREABLE_TYPE_LABELS, SHARE_PERMISSION_LABELS } from '@/lib/team/types';

export const metadata: Metadata = { title: 'Compartido conmigo' };
export const dynamic = 'force-dynamic';

/**
 * Lo que otras personas comparten con quien mira.
 *
 * No usa `TenantContext`: aquí no se leen datos del propio espacio sino de los
 * espacios de quienes compartieron. La identidad sale de la sesión y el resto
 * lo decide `listSharedWithMe`.
 */
export default async function CompartidoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?siguiente=/compartido');

  const shared = await listSharedWithMe(session.user.id);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compartido conmigo</h1>
        <p className="mt-2 text-muted-foreground">
          Lo que otras personas decidieron compartir contigo. Ves solo esto:
          nada de sus conversaciones ni del resto de su espacio.
        </p>
      </div>

      {shared.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nadie ha compartido nada contigo todavía. Si aceptaste una
            invitación, quien te invitó tiene que elegir además qué compartir.
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {shared.map(({ share, ownerName, ownerEmail }) => (
            <li key={share.id}>
              <Link
                href={`/compartido/${share.id}`}
                className="block rounded-xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Card className="transition-colors hover:bg-muted">
                  <h2 className="text-sm font-semibold">{share.resourceTitle}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {SHAREABLE_TYPE_LABELS[share.resourceType]} ·{' '}
                    {SHARE_PERMISSION_LABELS[share.permission]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lo comparte {ownerName ?? ownerEmail ?? 'alguien de tu equipo'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
