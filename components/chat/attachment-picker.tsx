'use client';

import { useRef } from 'react';
import { FileText, Image as ImageIcon, Music, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatBytes,
} from '@/lib/attachments/types';
import type { UploadedAttachment } from '@/lib/attachments/client';

const KIND_ICONS = {
  image: ImageIcon,
  pdf: FileText,
  audio: Music,
  document: FileText,
} as const;

/**
 * Lista de adjuntos elegidos y botón para agregar más.
 *
 * La subida ocurre al elegir el archivo, no al enviar: así la espera se
 * reparte mientras la persona escribe, y el envío es inmediato.
 */
export function AttachmentPicker({
  attachments,
  onFilesChosen,
  onRemove,
  uploading,
  error,
  disabled = false,
}: {
  attachments: UploadedAttachment[];
  onFilesChosen: (files: File[]) => void;
  onRemove: (id: string) => void;
  uploading: boolean;
  error: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE;

  return (
    <>
      {attachments.length > 0 ? (
        <ul aria-label="Archivos adjuntos" className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const Icon = KIND_ICONS[attachment.kind];
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="max-w-40 truncate text-xs">
                  {attachment.filename}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(attachment.sizeBytes)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${attachment.filename}`}
                  onClick={() => onRemove(attachment.id)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs"
        >
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          onFilesChosen(files);
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled || uploading || full}
        aria-label={
          full
            ? `Ya alcanzaste el máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} archivos`
            : 'Adjuntar un archivo'
        }
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden="true" />
      </Button>

      {uploading ? (
        <p role="status" aria-live="polite" className="sr-only">
          Subiendo archivo…
        </p>
      ) : null}
    </>
  );
}
