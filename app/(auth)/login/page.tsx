import type { Metadata } from 'next';
import { signIn } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { CianMark } from '@/components/brand/cian-mark';

export const metadata: Metadata = {
  title: 'Entrar',
};

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams: Promise<{ siguiente?: string; error?: string }>;
};

/** Solo se acepta una ruta interna, para no convertir el login en un redirector abierto. */
function safeInternalPath(value: string | undefined): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const destination = safeInternalPath(params.siguiente);

  return (
    <main
      id="contenido-principal"
      className="flex min-h-dvh items-center justify-center p-6"
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <CianMark className="size-16" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">CIAN</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Centro Integral de Apoyo a la Neurodivergencia
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Entrar a tu espacio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Usa tu cuenta de Google. Si es tu primera vez, creamos tu espacio
            personal automáticamente.
          </p>

          {params.error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-foreground"
            >
              No pudimos completar el acceso. Vuelve a intentarlo.
            </p>
          ) : null}

          <form
            className="mt-6"
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: destination });
            }}
          >
            <Button type="submit" size="lg" className="w-full">
              Continuar con Google
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          CIAN no sustituye atención médica, psicológica, terapéutica ni legal.
          No diagnostica ni prescribe, y no es un servicio de emergencia.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Alianza Índigo Neurodivergente A.C.
        </p>
      </div>
    </main>
  );
}
