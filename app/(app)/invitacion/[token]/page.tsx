import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { acceptInvitation } from '@/lib/db/repositories/team';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Invitación' };
export const dynamic = 'force-dynamic';

/**
 * Aceptar una invitación al equipo de apoyo.
 *
 * Quien llega aquí puede no tener cuenta todavía, así que sin sesión se manda
 * al login con el destino puesto: al volver, el enlace se resuelve solo.
 *
 * La comprobación de verdad está en `acceptInvitation`, que exige que el
 * correo de la sesión sea el mismo al que se envió la invitación. Un enlace
 * reenviado no sirve.
 */
export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    redirect(`/login?siguiente=${encodeURIComponent(`/invitacion/${token}`)}`);
  }

  const result = await acceptInvitation(token, {
    userId: session.user.id,
    email: session.user.email,
  });

  if (result.ok) {
    redirect('/compartido');
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invitación</h1>
      </div>

      <Card>
        <p role="alert" className="text-sm">
          {result.reason}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Entraste con <strong>{session.user.email}</strong>. Si la invitación
          llegó a otro correo, cierra sesión y entra con esa cuenta.
        </p>

        <div className="mt-4">
          <Link
            href="/compartido"
            className={buttonVariants({ variant: 'outline' })}
            style={{ minHeight: 'var(--cian-control-height)' }}
          >
            <UserPlus aria-hidden="true" className="size-4" />
            Ver lo que ya me compartieron
          </Link>
        </div>
      </Card>
    </div>
  );
}
