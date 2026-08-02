'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  MODEL_PURPOSES,
  MODEL_PURPOSE_HINTS,
  MODEL_PURPOSE_LABELS,
  type ModelPurpose,
} from '@/lib/billing/types';
import { saveModelConfigAction } from '@/lib/billing/actions';
import { refreshModelCacheAction } from '@/lib/admin/actions';

type Config = {
  id: string;
  purpose: ModelPurpose;
  provider: string;
  model: string;
  active: boolean;
  isGlobal: boolean;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Modelo por propósito.
 *
 * El de `crisis` está aquí porque la Fase 7 dejó anotado que si el modelo
 * económico no sostiene los barandales, la salida es un modelo más capaz
 * **solo ahí** —no relajar el barandal ni encarecer todo lo demás—. Esta
 * pantalla es lo que lo hace posible sin tocar código.
 */
export function ModelBoard({
  isSuperadmin,
  configs,
  fallbacks,
}: {
  isSuperadmin: boolean;
  configs: Config[];
  fallbacks: Record<string, string>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const [global, setGlobal] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MODEL_PURPOSES.map((purpose) => [
        purpose,
        configs.find((config) => config.purpose === purpose)?.model ??
          fallbacks[purpose] ??
          '',
      ]),
    ),
  );

  function save(purpose: ModelPurpose) {
    const model = drafts[purpose]?.trim();
    if (!model) {
      setStatus('Falta el identificador del modelo.');
      return;
    }

    startTransition(async () => {
      const result = await saveModelConfigAction({
        purpose,
        provider: 'google',
        model,
        global: global && isSuperadmin,
        active: true,
      });

      if (!result.ok) {
        setStatus(result.error);
        return;
      }

      // Sin tirar la caché el cambio tardaría hasta cinco minutos en verse y
      // parecería que no se guardó.
      await refreshModelCacheAction({ purpose, global: global && isSuperadmin });

      setStatus('Modelo actualizado. Ya está activo.');
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {isSuperadmin ? (
        <ToggleField
          label="Guardar como valor de toda la plataforma"
          hint="Apagado, el cambio aplica solo a tu espacio. Encendido, a todo CIAN salvo los espacios con configuración propia."
          checked={global}
          onChange={setGlobal}
          disabled={isPending}
        />
      ) : null}

      <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        {MODEL_PURPOSES.map((purpose) => {
          const config = configs.find((entry) => entry.purpose === purpose);

          return (
            <li key={purpose}>
              <Card>
                <h2 className="text-sm font-semibold">
                  {MODEL_PURPOSE_LABELS[purpose]}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {MODEL_PURPOSE_HINTS[purpose]}
                </p>

                <label
                  htmlFor={`modelo-${purpose}`}
                  className="mt-3 block text-xs text-muted-foreground"
                >
                  Identificador del modelo
                </label>
                <input
                  id={`modelo-${purpose}`}
                  type="text"
                  value={drafts[purpose] ?? ''}
                  onChange={(event) =>
                    setDrafts({ ...drafts, [purpose]: event.target.value })
                  }
                  spellCheck={false}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                />

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => save(purpose)}
                  >
                    <Save aria-hidden="true" />
                    Guardar
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {config
                      ? config.isGlobal
                        ? 'Ahora usa el valor global de la plataforma.'
                        : 'Ahora usa un valor propio de este espacio.'
                      : `Sin configurar: usa ${fallbacks[purpose]} del entorno.`}
                  </p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
