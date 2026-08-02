'use client';

import type { UIMessage } from 'ai';
import { FileText, Paperclip } from 'lucide-react';

/**
 * Adjuntos de un mensaje, ya enviados.
 *
 * Las imágenes se previsualizan porque reconocerlas de un vistazo es la mitad
 * del valor; el resto se muestra como una ficha con su nombre. Todo pasa por
 * `/api/adjuntos/<id>`, que comprueba el tenant: la URL del store no aparece
 * nunca en el HTML.
 *
 * Las partes cuya URL ya es un `data:` no se pintan: esas son las que el
 * servidor materializó para el modelo y no deben llegar al navegador.
 */
type FilePart = {
  type: 'file';
  url: string;
  mediaType?: string;
  filename?: string;
};

function filePartsOf(message: UIMessage): FilePart[] {
  const parts: FilePart[] = [];

  for (const part of message.parts) {
    if (part.type !== 'file') continue;
    const candidate = part as unknown as FilePart;
    if (typeof candidate.url !== 'string') continue;
    if (candidate.url.startsWith('data:')) continue;
    parts.push(candidate);
  }

  return parts;
}

export function MessageAttachments({ message }: { message: UIMessage }) {
  const files = filePartsOf(message);
  if (files.length === 0) return null;

  return (
    <ul aria-label="Archivos de este mensaje" className="mb-2 space-y-2">
      {files.map((file) => {
        const name = file.filename ?? 'Archivo';
        const isImage = file.mediaType?.startsWith('image/');
        const isAudio = file.mediaType?.startsWith('audio/');

        if (isImage) {
          return (
            <li key={file.url}>
              {/*
                Sin next/image: la ruta es privada y dinámica, y el
                optimizador no puede leerla.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={name}
                className="max-h-64 w-auto rounded-lg border border-border"
              />
            </li>
          );
        }

        if (isAudio) {
          return (
            <li key={file.url}>
              <audio
                controls
                preload="none"
                src={file.url}
                aria-label={`Reproducir ${name}`}
                className="w-full max-w-xs"
              />
            </li>
          );
        }

        const Icon = file.mediaType === 'application/pdf' ? FileText : Paperclip;

        return (
          <li key={file.url}>
            <a
              href={file.url}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-2 py-1.5 text-xs hover:bg-muted"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{name}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
