'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Circle,
  Eraser,
  Lock,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Video,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  NOTE_VISIBILITIES,
  NOTE_VISIBILITY_HINTS,
  NOTE_VISIBILITY_LABELS,
  type AppointmentStatus,
  type NoteVisibility,
  type SessionTaskStatus,
  type WhiteboardState,
} from '@/lib/consultorio/types';
import { RECORDING_NOTICE } from '@/lib/consultorio/meeting';
import {
  WHITEBOARD_COLORS,
  type WhiteboardColor,
} from '@/lib/consultorio/whiteboard';
import {
  SHAREABLE_TYPE_LABELS,
  type ShareableType,
} from '@/lib/team/types';
import {
  addSessionNoteAction,
  assignSessionTaskAction,
  deleteSessionNoteAction,
  draftSessionSummaryAction,
  endSessionAction,
  publishSessionSummaryAction,
  revokeSessionShareAction,
  saveSessionSummaryAction,
  shareInSessionAction,
  applyWhiteboardAction,
  setRecordingConsentAction,
  setSessionTaskStatusAction,
} from '@/lib/consultorio/actions';

type Note = {
  id: string;
  visibility: NoteVisibility;
  content: string;
  createdAt: string;
  isMine: boolean;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: SessionTaskStatus;
  isMine: boolean;
};

/** Algo que una parte enseñó a la otra dentro de esta sesión. */
type Share = {
  id: string;
  resourceType: ShareableType;
  resourceTitle: string;
  isMine: boolean;
};

/** Algo propio que se puede ofrecer. Solo lo de quien mira. */
type Shareable = {
  type: ShareableType;
  id: string;
  title: string;
};

type Props = {
  appointmentId: string;
  sessionId: string;
  role: 'profesional' | 'usuario';
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  otherPartyUserId: string | null;
  hasMeetingLink: boolean;
  consent: { mine: boolean; both: boolean };
  notes: Note[];
  tasks: Task[];
  summary: { content: string; published: boolean } | null;
  whiteboard: WhiteboardState;
  whiteboardRevision: number;
  shares: Share[];
  shareable: Shareable[];
  endedAt: string | null;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Cada cuánto se pregunta si la pizarra cambió.
 *
 * Dos segundos y medio se siente inmediato dibujando y son 24 peticiones por
 * minuto y sesión, que para una consulta de dos personas es barato. Bajarlo no
 * mejora la sensación lo suficiente como para justificar el gasto.
 */
const POLL_MS = 2500;

/**
 * Pizarra colaborativa.
 *
 * Se dibuja con `<canvas>` y punteros nativos —`pointerdown`, `pointermove`—
 * en vez de eventos de ratón, porque en una consulta la mitad de la gente está
 * en una tableta o en un teléfono, y los eventos de ratón no llegan ahí.
 *
 * ## Cómo se sincroniza
 *
 * Al soltar el trazo se manda **la operación** —este trazo, o borrar todo—, no
 * la pizarra entera. Mandar el estado completo hacía que con dos personas
 * dibujando el último en soltar el lápiz borrara lo del otro.
 *
 * Para ver lo que dibuja la otra parte se pregunta cada pocos segundos por la
 * revisión. No es un canal abierto: mantener uno por sesión en este despliegue
 * cuesta una función viva por consulta, y para dos personas dibujando el sondeo
 * cuesta menos y no se cae.
 *
 * **Mientras se está dibujando no se refresca.** Reemplazar el lienzo debajo de
 * un trazo a medio hacer es la forma más rápida de que alguien deje de usar
 * esto.
 */
function Whiteboard({
  sessionId,
  initial,
  initialRevision,
  disabled,
}: {
  sessionId: string;
  initial: WhiteboardState;
  initialRevision: number;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<WhiteboardState['strokes']>(initial.strokes);
  const drawingRef = useRef<number[] | null>(null);
  const revisionRef = useRef(initialRevision);
  const [color, setColor] = useState<WhiteboardColor>('#1B1F5A');

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const stroke of strokesRef.current) {
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.beginPath();

      for (let index = 0; index < stroke.points.length; index += 2) {
        const x = stroke.points[index]!;
        const y = stroke.points[index + 1]!;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }

      context.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
  }, [redraw]);

  /*
   * Sondeo de la pizarra mientras la sesión está abierta.
   *
   * Se salta el turno si esta persona está dibujando: cambiar el lienzo debajo
   * de un trazo a medio hacer lo estropea, y el trazo propio ya está en
   * pantalla de todas formas.
   */
  useEffect(() => {
    if (disabled) return;

    let vivo = true;

    const intervalo = setInterval(async () => {
      if (drawingRef.current !== null) return;

      try {
        const response = await fetch(`/api/consultorio/pizarra/${sessionId}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = (await response.json()) as {
          strokes: WhiteboardState['strokes'];
          revision: number;
        };

        if (!vivo) return;
        if (data.revision === revisionRef.current) return;
        if (drawingRef.current !== null) return;

        revisionRef.current = data.revision;
        strokesRef.current = data.strokes;
        redraw();
      } catch {
        // Un sondeo perdido no es nada: el siguiente lo recupera. Avisar de
        // cada fallo de red en medio de una consulta sería peor que el fallo.
      }
    }, POLL_MS);

    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [sessionId, disabled, redraw]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget;

    return [
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    ];
  }

  function persist(op: { op: 'add'; stroke: unknown } | { op: 'clear' }) {
    void applyWhiteboardAction({ sessionId, ...op }).then((result) => {
      // La revisión propia se anota para no volver a traerse lo que uno acaba
      // de dibujar en el siguiente sondeo.
      if (result.ok && typeof result.revision === 'number') {
        revisionRef.current = result.revision;
      }
    });
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={800}
        height={450}
        aria-label="Pizarra colaborativa"
        className="w-full touch-none rounded-lg border border-border bg-card"
        style={{ aspectRatio: '16 / 9' }}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawingRef.current = pointFrom(event);
        }}
        onPointerMove={(event) => {
          if (disabled || !drawingRef.current) return;
          drawingRef.current.push(...pointFrom(event));

          const context = event.currentTarget.getContext('2d');
          if (!context) return;

          const points = drawingRef.current;
          context.strokeStyle = color;
          context.lineWidth = 3;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(points[points.length - 4]!, points[points.length - 3]!);
          context.lineTo(points[points.length - 2]!, points[points.length - 1]!);
          context.stroke();
        }}
        onPointerUp={() => {
          const points = drawingRef.current;
          drawingRef.current = null;
          if (!points || points.length < 4) return;

          const stroke = {
            id: crypto.randomUUID(),
            color,
            width: 3,
            points,
          };
          strokesRef.current = [...strokesRef.current, stroke];
          persist({ op: 'add', stroke });
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {WHITEBOARD_COLORS.map((value) => (
          <Button
            key={value}
            type="button"
            variant={color === value ? 'primary' : 'outline'}
            size="sm"
            aria-label={`Color ${value}`}
            aria-pressed={color === value}
            onClick={() => setColor(value)}
          >
            <Circle aria-hidden="true" style={{ color: value }} />
          </Button>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            strokesRef.current = [];
            redraw();
            persist({ op: 'clear' });
          }}
        >
          <Eraser aria-hidden="true" />
          Borrar todo
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Lo que dibujes se guarda. La otra persona lo ve al recargar: la pizarra
        todavía no se sincroniza sola.
      </p>
    </div>
  );
}

export function SessionRoom(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [noteText, setNoteText] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>(
    props.role === 'profesional' ? 'privada' : 'compartida',
  );
  const [summaryText, setSummaryText] = useState(props.summary?.content ?? '');
  const [taskTitle, setTaskTitle] = useState('');
  const [picked, setPicked] = useState('');
  const [videoState, setVideoState] = useState<string | null>(null);

  const isProfessional = props.role === 'profesional';

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) router.refresh();
    });
  }

  /**
   * Pide el enlace de Meet y abre la reunión.
   *
   * El enlace no está en esta página a propósito: se pide en el momento, y el
   * servidor comprueba entonces participación, estado de la cita y ventana
   * horaria. Así un enlace no sobrevive a que la cita se cancele.
   *
   * Se abre en una pestaña nueva para no perder las notas ni la pizarra, que
   * es justo lo que se usa durante la sesión.
   */
  async function joinRoom() {
    setVideoState('Abriendo la videollamada…');

    const response = await fetch(`/api/consultorio/sala/${props.appointmentId}`);
    const payload = (await response.json()) as { error?: string; url?: string };

    if (!response.ok || !payload.url) {
      setVideoState(payload.error ?? 'No pudimos abrir la videollamada.');
      return;
    }

    setVideoState('Se abrió Google Meet en otra pestaña.');
    window.open(payload.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sesión</h1>
        <p className="mt-2 text-muted-foreground">
          {new Intl.DateTimeFormat('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(props.scheduledAt))}{' '}
          · {props.durationMinutes} minutos
          {props.endedAt ? ' · sesión terminada' : ''}
        </p>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {/* --- Videollamada ----------------------------------------------------- */}
      <section aria-labelledby="video">
        <h2 id="video" className="text-lg font-semibold tracking-tight">
          Videollamada
        </h2>

        <Card className="mt-3">
          {!props.hasMeetingLink ? (
            <p className="text-sm text-muted-foreground">
              {isProfessional
                ? 'Todavía no pusiste tu enlace de Google Meet. Lo configuras en tu perfil profesional; sin él, nadie puede entrar a la videollamada.'
                : 'El profesional todavía no ha puesto el enlace de la videollamada. El resto de la sesión funciona igual.'}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                La videollamada ocurre en Google Meet. Se abre en otra pestaña
                para que las notas y la pizarra sigan aquí.
              </p>
              <Button
                type="button"
                className="mt-3"
                onClick={() => void joinRoom()}
              >
                <Video aria-hidden="true" />
                Abrir la videollamada
              </Button>
              {videoState ? (
                <p className="mt-2 text-sm text-muted-foreground">{videoState}</p>
              ) : null}
            </>
          )}
        </Card>
      </section>

      {/* --- Consentimiento de grabación --------------------------------------- */}
      <section aria-labelledby="grabacion">
        <h2 id="grabacion" className="text-lg font-semibold tracking-tight">
          Grabación
        </h2>

        <Card className="mt-3">
          <p className="text-sm text-muted-foreground">{RECORDING_NOTICE}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Hace falta que las dos personas autoricen, y basta con que una lo
            retire para que el acuerdo deje de existir.
          </p>

          <div className="mt-3">
            <ToggleField
              label="Autorizo que esta sesión se grabe"
              hint={
                props.consent.both
                  ? 'Ambas partes autorizaron: la grabación es posible.'
                  : 'Falta la autorización de la otra parte.'
              }
              checked={props.consent.mine}
              onChange={(next) =>
                run(() => setRecordingConsentAction(props.sessionId, next))
              }
              disabled={isPending || Boolean(props.endedAt)}
            />
          </div>

          {!props.consent.both ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <VideoOff aria-hidden="true" className="size-4 shrink-0" />
              Sin acuerdo para grabar.
            </p>
          ) : null}
        </Card>
      </section>

      {/* --- Pizarra ---------------------------------------------------------- */}
      <section aria-labelledby="pizarra">
        <h2 id="pizarra" className="text-lg font-semibold tracking-tight">
          Pizarra
        </h2>
        <div className="mt-3">
          <Whiteboard
            sessionId={props.sessionId}
            initial={props.whiteboard}
            initialRevision={props.whiteboardRevision}
            disabled={Boolean(props.endedAt)}
          />
        </div>
      </section>

      {/* --- Notas ------------------------------------------------------------ */}
      <section aria-labelledby="notas">
        <h2 id="notas" className="text-lg font-semibold tracking-tight">
          Notas
        </h2>

        {props.notes.length > 0 ? (
          <ul className="mt-3" style={{ display: 'grid', gap: '0.5rem' }}>
            {props.notes.map((note) => (
              <li key={note.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {note.visibility === 'privada' ? (
                          <Lock aria-hidden="true" className="size-3" />
                        ) : null}
                        {NOTE_VISIBILITY_LABELS[note.visibility]} ·{' '}
                        {new Intl.DateTimeFormat('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(note.createdAt))}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
                    </div>

                    {note.isMine ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar esta nota"
                        disabled={isPending}
                        onClick={() =>
                          run(() => deleteSessionNoteAction(note.id, props.sessionId))
                        }
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Todavía no hay notas.</p>
        )}

        <Card className="mt-3">
          <label htmlFor="nota" className="text-sm font-medium">
            Escribir una nota
          </label>
          <textarea
            id="nota"
            rows={3}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />

          {isProfessional ? (
            <div className="mt-2">
              <label htmlFor="visibilidad" className="text-xs text-muted-foreground">
                Quién la ve
              </label>
              <select
                id="visibilidad"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as NoteVisibility)
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
              >
                {NOTE_VISIBILITIES.map((value) => (
                  <option key={value} value={value}>
                    {NOTE_VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {NOTE_VISIBILITY_HINTS[visibility]}
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            className="mt-3"
            disabled={isPending || noteText.trim().length === 0}
            onClick={() =>
              run(async () => {
                const result = await addSessionNoteAction({
                  sessionId: props.sessionId,
                  visibility,
                  content: noteText,
                });
                if (result.ok) setNoteText('');
                return result;
              })
            }
          >
            <Send aria-hidden="true" />
            Guardar nota
          </Button>
        </Card>
      </section>

      {/* --- Compartido en la sesión ------------------------------------------ */}
      <section aria-labelledby="compartido-sesion">
        <h2
          id="compartido-sesion"
          className="text-lg font-semibold tracking-tight"
        >
          Lo que se enseña en esta sesión
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo dentro de esta consulta y solo de lectura. Retirarlo aquí no toca
          nada de lo que hayas compartido en otra parte.
        </p>

        <Card className="mt-3">
          {props.shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no se ha enseñado nada.
            </p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
              {props.shares.map((share) => (
                <li
                  key={share.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {share.resourceTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {SHAREABLE_TYPE_LABELS[share.resourceType]}
                    </p>
                  </div>

                  {/* Solo lo retira quien lo enseñó. */}
                  {share.isMine ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Dejar de enseñar ${share.resourceTitle}`}
                      disabled={isPending}
                      onClick={() =>
                        run(() =>
                          revokeSessionShareAction(props.sessionId, share.id),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {props.shareable.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="compartir-recurso" className="text-sm font-medium">
                  Enseñar algo tuyo
                </label>
                <select
                  id="compartir-recurso"
                  value={picked}
                  onChange={(event) => setPicked(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  <option value="">Elige…</option>
                  {props.shareable.map((item) => (
                    <option
                      key={`${item.type}:${item.id}`}
                      value={`${item.type}:${item.id}`}
                    >
                      {SHAREABLE_TYPE_LABELS[item.type]} · {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                disabled={isPending || picked === ''}
                onClick={() => {
                  const item = props.shareable.find(
                    (candidate) => `${candidate.type}:${candidate.id}` === picked,
                  );
                  if (!item) return;

                  run(async () => {
                    const result = await shareInSessionAction({
                      sessionId: props.sessionId,
                      resourceType: item.type,
                      resourceId: item.id,
                      resourceTitle: item.title,
                    });
                    if (result.ok) setPicked('');
                    return result;
                  });
                }}
              >
                <Share2 aria-hidden="true" />
                Enseñar
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No tienes planes, rutinas ni documentos que enseñar todavía.
            </p>
          )}
        </Card>
      </section>

      {/* --- Resumen ---------------------------------------------------------- */}
      {isProfessional ? (
        <section aria-labelledby="resumen">
          <h2 id="resumen" className="text-lg font-semibold tracking-tight">
            Resumen de la sesión
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No se publica hasta que tú lo apruebes. Guardar un borrador nuevo
            retira la aprobación anterior: una aprobación es para un texto
            concreto, no para el hueco donde va.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Si pides el borrador a CIAN, lo redacta <strong>solo</strong> con
            las notas compartidas y los acuerdos. Tus notas privadas no entran,
            ni siquiera como contexto: resumir un texto deja rastro de él, y
            esto lo va a leer la persona que atendiste.
          </p>

          <Card className="mt-3">
            <textarea
              aria-label="Resumen de la sesión"
              rows={8}
              value={summaryText}
              onChange={(event) => setSummaryText(event.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/*
                * El borrador con IA va el primero pero como acción secundaria:
                * escribirlo a mano sigue siendo el camino normal, y quien
                * prefiera hacerlo no tiene por qué pasar por aquí.
                */}
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await draftSessionSummaryAction(
                      props.sessionId,
                    );
                    if (result.ok && result.content) {
                      setSummaryText(result.content);
                    }
                    return result;
                  })
                }
              >
                <Sparkles aria-hidden="true" />
                Redactar borrador
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isPending || summaryText.trim().length === 0}
                onClick={() =>
                  run(() => saveSessionSummaryAction(props.sessionId, summaryText))
                }
              >
                Guardar borrador
              </Button>

              <Button
                type="button"
                disabled={isPending || !props.summary || props.summary.published}
                onClick={() => run(() => publishSessionSummaryAction(props.sessionId))}
              >
                {props.summary?.published ? 'Ya está publicado' : 'Aprobar y publicar'}
              </Button>
            </div>
          </Card>
        </section>
      ) : props.summary?.published ? (
        <section aria-labelledby="resumen">
          <h2 id="resumen" className="text-lg font-semibold tracking-tight">
            Resumen de la sesión
          </h2>
          <Card className="mt-3">
            <p className="whitespace-pre-wrap text-sm">{props.summary.content}</p>
          </Card>
        </section>
      ) : null}

      {/* --- Tareas ----------------------------------------------------------- */}
      <section aria-labelledby="tareas">
        <h2 id="tareas" className="text-lg font-semibold tracking-tight">
          Para después de la sesión
        </h2>

        {props.tasks.length > 0 ? (
          <ul className="mt-3" style={{ display: 'grid', gap: '0.5rem' }}>
            {props.tasks.map((task) => (
              <li key={task.id}>
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">{task.title}</p>
                      {task.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}
                    </div>

                    {task.isMine && task.status === 'pendiente' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            setSessionTaskStatusAction(
                              task.id,
                              'hecha',
                              props.sessionId,
                            ),
                          )
                        }
                      >
                        Marcar hecha
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {task.status}
                      </span>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sin tareas asignadas.</p>
        )}

        {isProfessional && props.otherPartyUserId ? (
          <Card className="mt-3">
            <label htmlFor="tarea" className="text-sm font-medium">
              Asignar una tarea
            </label>
            <input
              id="tarea"
              type="text"
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              className={`mt-1 ${inputClass}`}
              style={{ minHeight: 'var(--cian-control-height)' }}
              placeholder="Practicar la pausa antes de responder"
            />
            <Button
              type="button"
              className="mt-2"
              disabled={isPending || taskTitle.trim().length === 0}
              onClick={() =>
                run(async () => {
                  const result = await assignSessionTaskAction({
                    sessionId: props.sessionId,
                    assignedToUserId: props.otherPartyUserId,
                    title: taskTitle,
                  });
                  if (result.ok) setTaskTitle('');
                  return result;
                })
              }
            >
              Asignar
            </Button>
          </Card>
        ) : null}
      </section>

      {isProfessional && !props.endedAt ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={isPending}
          onClick={() => run(() => endSessionAction(props.sessionId))}
        >
          Cerrar la sesión
        </Button>
      ) : null}
    </div>
  );
}
