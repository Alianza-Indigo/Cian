'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { rollbackPromptAction, savePromptAction } from '@/lib/admin/actions';

type Version = {
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
};

/**
 * Editor de prompts con historial.
 *
 * Dos criterios de aceptación viven aquí: que editar cambie el comportamiento
 * del asistente sin redeploy, y que el rollback funcione.
 *
 * Guardar **nunca modifica una versión existente**: crea una nueva y la
 * activa. Por eso el historial de abajo se puede recorrer entero y volver a
 * cualquier punto; un editor que sobrescribiera dejaría un historial que miente
 * sobre lo que el asistente decía cuando lo decía.
 */
export function PromptEditor({
  keys,
  selected,
  versions,
}: {
  keys: Array<{ key: string; activeVersion: number | null; versions: number }>;
  selected: string | null;
  versions: Version[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const active = versions.find((version) => version.isActive);
  const [content, setContent] = useState(active?.content ?? '');

  // Al cambiar de clave, el editor carga el contenido de la nueva.
  useEffect(() => {
    setContent(active?.content ?? '');
    setStatus('');
  }, [selected, active?.content]);

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) router.refresh();
    });
  }

  if (keys.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          No hay prompts cargados. Se siembran en cada despliegue desde
          <code className="mx-1">prompts/seed/</code>.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <nav aria-label="Prompts">
        <ul className="flex flex-wrap gap-2">
          {keys.map((entry) => (
            <li key={entry.key}>
              <Button
                type="button"
                variant={entry.key === selected ? 'primary' : 'outline'}
                size="sm"
                aria-current={entry.key === selected ? 'page' : undefined}
                onClick={() => router.push(`/admin/prompts?clave=${entry.key}`)}
              >
                {entry.key}
                <span className="ml-1 text-xs opacity-70">v{entry.activeVersion ?? '—'}</span>
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      <Card>
        <label htmlFor="prompt-contenido" className="text-sm font-medium">
          Contenido de «{selected}»
        </label>
        <textarea
          id="prompt-contenido"
          rows={22}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={isPending || !selected || content.trim().length === 0}
            onClick={() =>
              run(() => savePromptAction({ key: selected, content }))
            }
          >
            <Save aria-hidden="true" />
            Guardar y activar
          </Button>
          <p className="text-xs text-muted-foreground">
            Se guarda como versión nueva. El cambio se aplica de inmediato, sin
            desplegar.
          </p>
        </div>
      </Card>

      <section aria-labelledby="historial">
        <h2 id="historial" className="text-lg font-semibold tracking-tight">
          Historial
        </h2>

        <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {versions.map((version) => (
            <li key={version.version}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Versión {version.version}
                      {version.isActive ? (
                        <span className="ml-2 text-xs font-normal text-accent-foreground">
                          activa
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('es-MX', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(version.createdAt))}
                    </p>
                  </div>

                  {!version.isActive && selected ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        run(() =>
                          rollbackPromptAction({
                            key: selected,
                            version: version.version,
                          }),
                        )
                      }
                    >
                      <History aria-hidden="true" />
                      Volver a esta
                    </Button>
                  ) : null}
                </div>

                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {version.content.slice(0, 800)}
                  {version.content.length > 800 ? '…' : ''}
                </pre>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
