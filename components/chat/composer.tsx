'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ComposerProps = {
  onSubmit: (text: string) => void;
  onCancelEdit: () => void;
  onStop: () => void;
  busy: boolean;
  /** Si no es null, se está editando el último mensaje. */
  editingText: string | null;
};

export function Composer({
  onSubmit,
  onCancelEdit,
  onStop,
  busy,
  editingText,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Al entrar en modo edición, el texto anterior queda listo para corregir.
  useEffect(() => {
    if (editingText === null) return;
    setValue(editingText);
    const field = textareaRef.current;
    if (field) {
      field.focus();
      field.setSelectionRange(editingText.length, editingText.length);
    }
  }, [editingText]);

  // El campo crece con el contenido, sin barra de desplazamiento interna.
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || busy) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form
      className="sticky bottom-0 mt-4 bg-background pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {editingText !== null ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-2 text-sm">
          <span>Estás editando tu último mensaje.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onCancelEdit();
              setValue('');
            }}
          >
            <X aria-hidden="true" />
            Cancelar
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2">
        <label htmlFor="mensaje" className="sr-only">
          Escribe tu mensaje
        </label>
        <textarea
          id="mensaje"
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter envía; Mayús+Enter hace salto de línea. Es lo que la
            // mayoría espera, y el botón sigue ahí para quien prefiera el ratón.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Escribe lo que necesites…"
          className="max-h-60 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />

        {busy ? (
          <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Detener respuesta">
            <Square aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar mensaje"
            disabled={value.trim().length === 0}
          >
            <Send aria-hidden="true" />
          </Button>
        )}
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        CIAN no sustituye atención profesional y no es un servicio de emergencia.
      </p>
    </form>
  );
}
