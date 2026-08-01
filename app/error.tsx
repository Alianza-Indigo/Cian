'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Pantalla de error.
 *
 * Regla 3.6: no se muestra `error.message` ni la traza. Un mensaje de error
 * puede arrastrar datos de la persona, y aqui no hay forma de saber si los
 * lleva. El identificador de resumen (`digest`) basta para rastrearlo en los
 * registros del servidor.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle queda del lado del servidor; en el navegador solo el digest.
    console.error('Error en CIAN', error.digest ?? '(sin identificador)');
  }, [error]);

  return (
    <main
      id="contenido-principal"
      className="flex min-h-dvh items-center justify-center p-6"
    >
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Algo salió mal
        </h1>
        <p className="mt-3 text-muted-foreground">
          No pudimos completar la operación. Puedes intentarlo de nuevo; si
          vuelve a ocurrir, avísanos.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Identificador: {error.digest}
          </p>
        ) : null}
        <Button type="button" onClick={reset} className="mt-6">
          Intentar de nuevo
        </Button>
      </div>
    </main>
  );
}
