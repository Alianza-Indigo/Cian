import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Home } from 'lucide-react';
import { auth } from '@/lib/auth';
import { acceptTenantInvitation } from '@/lib/db/repositories/memberships';
import { TENANT_COOKIE } from '@/lib/tenant/context';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Unirme a un espacio' };
export const dynamic = 'force-dynamic';

/**
 * Aceptar una invitación **a un espacio**.
 *
 * Ruta aparte de `/invitacion/[token]`, que es la del equipo de apoyo. Son dos
 * cosas distintas y comparten muy poco: aquella comparte recursos sueltos con
 * gente de fuera, esta mete a alguien dentro de un espacio con un rol. Fundirlas
 * en una sola ruta con un `if` acabaría dando a alguien más de lo que se le
 * quiso dar el día que una de las dos cambie.
 *
 * Al aceptar se deja la cookie apuntando al espacio nuevo: quien acaba de
 * aceptar quiere ver ese espacio, no el suyo.
 */
export default async function UnirmePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    redirect(`/login?siguiente=${encodeURIComponent(`/unirme/${token}`)}`);
  }

  const result = await acceptTenantInvitation(token, {
    userId: session.user.id,
    email: session.user.email,
  });

  if (result.ok) {
    const cookieStore = await cookies();
    cookieStore.set(TENANT_COOKIE, result.tenantId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    redirect('/');
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Unirme a un espacio
        </h1>
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
            href="/"
            className={buttonVariants({ variant: 'outline' })}
            style={{ minHeight: 'var(--cian-control-height)' }}
          >
            <Home aria-hidden="true" className="size-4" />
            Ir a mi espacio
          </Link>
        </div>
      </Card>
    </div>
  );
}
