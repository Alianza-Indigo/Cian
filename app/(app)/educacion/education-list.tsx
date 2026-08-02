'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Download, FileDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  EDUCATION_KIND_LABELS,
  UDL_PRINCIPLES,
  UDL_PRINCIPLE_LABELS,
  type EducationKind,
  type EducationPayload,
} from '@/lib/library/types';
import {
  deleteEducationItemAction,
  exportEducationItemAction,
} from '@/lib/library/actions';

type Item = {
  id: string;
  kind: EducationKind;
  title: string;
  payload: EducationPayload;
  documentId: string | null;
  createdAt: string;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function EducationList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function exportItem(id: string) {
    startTransition(async () => {
      const result = await exportEducationItemAction(id);
      setStatus(
        result.ok
          ? 'Exportado. Lo encuentras en Documentos.'
          : result.error,
      );
      if (result.ok) router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteEducationItemAction(id);
      setStatus(result.ok ? 'Material eliminado.' : result.error);
      if (result.ok) router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Todavía no hay materiales. En una conversación puedes pedir algo como
          «necesito preparar una reunión con la maestra» o «hazme una agenda
          visual para las mañanas».
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Trabajando…' : status}
      </p>

      <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        {items.map((item) => (
          <li key={item.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-accent-foreground">
                    {EDUCATION_KIND_LABELS[item.kind]}
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold">{item.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  {item.documentId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Descargar "${item.title}"`}
                      onClick={() => {
                        window.location.href = `/api/documentos/${item.documentId}`;
                      }}
                    >
                      <Download aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Exportar "${item.title}" a PDF`}
                    disabled={isPending}
                    onClick={() => exportItem(item.id)}
                  >
                    <FileDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar "${item.title}"`}
                    disabled={isPending}
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {item.payload.summary ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.payload.summary}
                </p>
              ) : null}

              {item.payload.steps?.length ? (
                <ol className="mt-3 space-y-1">
                  {item.payload.steps.map((step, index) => (
                    <li key={`${item.id}-paso-${index}`} className="text-sm">
                      <span className="text-muted-foreground">{index + 1}.</span>{' '}
                      {step.icon ? `${step.icon} ` : ''}
                      {step.title}
                    </li>
                  ))}
                </ol>
              ) : null}

              {item.payload.udl
                ? UDL_PRINCIPLES.map((principle) => {
                    const entries = item.payload.udl?.[principle];
                    if (!entries || entries.length === 0) return null;

                    return (
                      <div key={principle} className="mt-3">
                        <h3 className="text-xs font-medium text-muted-foreground">
                          {UDL_PRINCIPLE_LABELS[principle]}
                        </h3>
                        <ul className="mt-1 space-y-1">
                          {entries.map((entry) => (
                            <li key={entry} className="flex gap-2 text-sm">
                              <span aria-hidden="true" className="text-muted-foreground">
                                •
                              </span>
                              <span>{entry}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
                : null}

              {item.payload.talkingPoints?.length ? (
                <div className="mt-3">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Puntos a plantear
                  </h3>
                  <ol className="mt-1 space-y-2">
                    {item.payload.talkingPoints.map((point, index) => (
                      <li key={`${item.id}-punto-${index}`} className="text-sm">
                        <span className="text-muted-foreground">{index + 1}.</span>{' '}
                        {point.point}
                        {point.support ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Respaldo: {point.support}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {item.payload.questions?.length ? (
                <div className="mt-3">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Preguntas para la escuela
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {item.payload.questions.map((question) => (
                      <li key={question} className="flex gap-2 text-sm">
                        <span aria-hidden="true" className="text-muted-foreground">
                          •
                        </span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {item.payload.citations?.length ? (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Se apoya en
                  </p>
                  <ul className="mt-1 space-y-1">
                    {item.payload.citations.map((citation) => (
                      <li key={citation.slug}>
                        <Link
                          href={`/biblioteca/${citation.slug}`}
                          className="inline-flex items-center gap-1.5 text-xs underline decoration-muted-foreground underline-offset-2"
                        >
                          <BookOpen aria-hidden="true" className="size-3" />
                          {citation.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
