'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DocumentState = {
  id: string;
  estado: 'pending' | 'ready' | 'failed';
  titulo: string;
  tipo: string;
  formato: string;
  folio: string;
  tamanoBytes: number | null;
};

/** Se consulta hasta que deje de estar en preparación, con techo de intentos. */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // unos 90 segundos

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCard({
  documentId,
  fallbackTitle,
}: {
  documentId: string;
  fallbackTitle: string;
}) {
  const [state, setState] = useState<DocumentState | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`/api/documentos/${documentId}/estado`, {
          cache: 'no-store',
        });

        if (response.ok) {
          const data = (await response.json()) as DocumentState;
          if (cancelled) return;
          setState(data);
          if (data.estado !== 'pending') return; // listo o fallido: se detiene
        }
      } catch {
        // Un fallo de red no cancela el seguimiento: se reintenta.
      }

      polls += 1;
      if (polls >= MAX_POLLS) {
        if (!cancelled) setGaveUp(true);
        return;
      }

      timer = setTimeout(check, POLL_INTERVAL_MS);
    };

    void check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentId]);

  const title = state?.titulo ?? fallbackTitle;
  const status = state?.estado ?? 'pending';

  return (
    <div className="mt-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>

          {state ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {state.tipo} · {state.formato.toUpperCase()} · Folio {state.folio}
              {formatSize(state.tamanoBytes)
                ? ` · ${formatSize(state.tamanoBytes)}`
                : ''}
            </p>
          ) : null}

          {status === 'pending' && !gaveUp ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              Preparando el documento…
            </p>
          ) : null}

          {status === 'pending' && gaveUp ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Está tardando más de lo normal. Búscalo en tus documentos dentro de
              un momento.
            </p>
          ) : null}

          {status === 'failed' ? (
            <p
              role="alert"
              className="mt-2 flex items-center gap-2 text-xs text-foreground"
            >
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              No pudimos preparar este documento. Puedes pedirlo de nuevo.
            </p>
          ) : null}

          {status === 'ready' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                window.location.href = `/api/documentos/${documentId}`;
              }}
            >
              <Download aria-hidden="true" />
              Descargar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
