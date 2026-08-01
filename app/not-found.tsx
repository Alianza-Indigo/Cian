import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="contenido-principal"
      className="flex min-h-dvh items-center justify-center p-6"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          No encontramos esta página
        </h1>
        <p className="mt-3 text-muted-foreground">
          Puede que el enlace haya cambiado o que la página ya no exista.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          style={{ minHeight: 'var(--cian-control-height)' }}
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
