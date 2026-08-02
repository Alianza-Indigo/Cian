'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { addFoodAction } from '@/lib/nutrition/actions';

/**
 * Edición del perfil de alimentación.
 *
 * Las dos listas se presentan sin juicio: «lo que come» y «lo que le cuesta».
 * No hay «permitido» ni «prohibido», ni forma de poner cantidades — y aunque
 * alguien escribiera una, el barandal del servidor la rechaza.
 */
export function FoodProfileEditor({
  accepted,
  avoided,
  notes,
}: {
  accepted: string[];
  avoided: string[];
  notes: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [drafts, setDrafts] = useState({ accepted: '', avoided: '' });
  const [isPending, startTransition] = useTransition();

  function add(field: 'accepted' | 'avoided') {
    const value = drafts[field].trim();
    if (!value) return;

    startTransition(async () => {
      const result = await addFoodAction(field, value);
      setStatus(result.ok ? 'Guardado.' : result.error);
      if (result.ok) {
        setDrafts((current) => ({ ...current, [field]: '' }));
        router.refresh();
      }
    });
  }

  const sections = [
    {
      field: 'accepted' as const,
      title: 'Lo que come sin problema',
      hint: 'Esta es la lista que importa: con ella se arman los menús.',
      items: accepted,
      placeholder: 'Ej.: quesadillas de queso',
    },
    {
      field: 'avoided' as const,
      title: 'Lo que le cuesta',
      hint: 'Es información para no proponerlo, no una lista de prohibiciones.',
      items: avoided,
      placeholder: 'Ej.: verduras cocidas',
    },
  ];

  return (
    <section style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {sections.map((section) => (
        <Card key={section.field}>
          <h2 className="text-sm font-semibold">{section.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{section.hint}</p>

          {section.items.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="rounded-md bg-muted px-2 py-1 text-xs"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add(section.field);
            }}
          >
            <label htmlFor={`alimento-${section.field}`} className="sr-only">
              {section.title}
            </label>
            <input
              id={`alimento-${section.field}`}
              value={drafts[section.field]}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [section.field]: event.currentTarget.value,
                }))
              }
              placeholder={section.placeholder}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <Button type="submit" variant="outline" size="sm" disabled={isPending}>
              <Plus aria-hidden="true" />
              Agregar
            </Button>
          </form>
        </Card>
      ))}

      {notes ? (
        <Card>
          <h2 className="text-sm font-semibold">Notas</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap">{notes}</p>
        </Card>
      ) : null}
    </section>
  );
}
