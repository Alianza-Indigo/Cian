'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/sensory/types';
import {
  createTaskAction,
  deleteTaskAction,
  reorderTasksAction,
  setTaskDueAtAction,
  setTaskPriorityAction,
  setTaskStatusAction,
} from '@/lib/sensory/actions';

type Subtask = {
  id: string;
  title: string;
  status: TaskStatus;
  estimatedMinutes: number | null;
};

type Task = Subtask & {
  priority: TaskPriority;
  /** Instante ISO, o null. Se convierte a día local aquí, en el navegador. */
  dueAt: string | null;
  subtasks: Subtask[];
};

const controlClass =
  'rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * El día local de un instante, en el formato que espera `<input type="date">`.
 *
 * Se calcula en el navegador a propósito. En el servidor habría que elegir un
 * huso, y el del servidor no es el de nadie: una tarea para el jueves acabaría
 * mostrándose como miércoles a quien vive en Tijuana.
 */
function toLocalDateValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** El día local elegido, convertido al final de ese día en hora local. */
function toInstant(dateValue: string): string | null {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 0, 0).toISOString();
}

const dueFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Cuántos días faltan, contando días de calendario y no horas. */
function daysUntil(iso: string): number {
  const due = new Date(iso);
  const today = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.round((dueDay.getTime() - todayDay.getTime()) / 86_400_000);
}

/**
 * Cómo se dice una fecha límite.
 *
 * «Hoy» y «mañana» en vez de la fecha, y «se pasó» sin dramatizar: la lista de
 * tareas de alguien con dificultad ejecutiva ya carga bastante sin que la
 * interfaz la regañe en rojo.
 */
function describeDue(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Para hoy';
  if (days === 1) return 'Para mañana';
  if (days < 0) {
    return days === -1 ? 'Se pasó ayer' : `Se pasó hace ${-days} días`;
  }
  return `Para el ${dueFormat.format(new Date(iso))}`;
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [newTask, setNewTask] = useState('');
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? done : (result.error ?? 'No se pudo completar.'));
      if (result.ok) router.refresh();
    });
  }

  function toggle(id: string, current: TaskStatus) {
    run(
      () => setTaskStatusAction(id, current === 'hecha' ? 'pendiente' : 'hecha'),
      current === 'hecha' ? 'Marcada como pendiente.' : 'Hecha.',
    );
  }

  const pending = tasks.filter((task) => task.status !== 'hecha');
  const done = tasks.filter((task) => task.status === 'hecha');

  /**
   * Sube o baja una tarea un lugar.
   *
   * Con botones y no arrastrando: arrastrar exige puntería y mantener el clic,
   * y no funciona con teclado ni con lector de pantalla. Dos flechas hacen lo
   * mismo y las puede usar cualquiera.
   */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pending.length) return;

    const reordered = [...pending];
    const moved = reordered[index];
    const displaced = reordered[target];
    if (!moved || !displaced) return;
    reordered[index] = displaced;
    reordered[target] = moved;

    run(
      () => reorderTasksAction(reordered.map((task) => task.id)),
      'Orden guardado.',
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <Card>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = newTask.trim();
            if (!value) return;
            run(() => createTaskAction(value), 'Tarea guardada.');
            setNewTask('');
          }}
        >
          <label htmlFor="nueva-tarea" className="sr-only">
            Nueva tarea
          </label>
          <input
            id="nueva-tarea"
            value={newTask}
            onChange={(event) => setNewTask(event.currentTarget.value)}
            placeholder="Agregar una tarea…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
          <Button type="submit" disabled={isPending}>
            <Plus aria-hidden="true" />
            Agregar
          </Button>
        </form>
      </Card>

      {tasks.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No hay tareas todavía.
          </p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {pending.map((task, index) => (
            <li key={task.id}>
              <Card>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`tarea-${task.id}`}
                    checked={false}
                    disabled={isPending}
                    onChange={() => toggle(task.id, task.status)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`tarea-${task.id}`}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {task.title}
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {TASK_PRIORITY_LABELS[task.priority]}
                      {task.estimatedMinutes
                        ? ` · unos ${task.estimatedMinutes} min`
                        : ''}
                      {task.dueAt ? ` · ${describeDue(task.dueAt)}` : ''}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`vence-${task.id}`}
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <CalendarDays aria-hidden="true" className="size-3.5" />
                        Para el
                      </label>
                      <input
                        id={`vence-${task.id}`}
                        type="date"
                        value={toLocalDateValue(task.dueAt)}
                        disabled={isPending}
                        onChange={(event) =>
                          run(
                            () =>
                              setTaskDueAtAction(
                                task.id,
                                toInstant(event.currentTarget.value),
                              ),
                            event.currentTarget.value
                              ? 'Fecha guardada.'
                              : 'Se quitó la fecha.',
                          )
                        }
                        className={controlClass}
                      />

                      <label
                        htmlFor={`prioridad-${task.id}`}
                        className="sr-only"
                      >
                        Prioridad de {task.title}
                      </label>
                      <select
                        id={`prioridad-${task.id}`}
                        value={task.priority}
                        disabled={isPending}
                        onChange={(event) =>
                          run(
                            () =>
                              setTaskPriorityAction(
                                task.id,
                                event.currentTarget.value,
                              ),
                            'Prioridad guardada.',
                          )
                        }
                        className={controlClass}
                      >
                        {TASK_PRIORITIES.map((value) => (
                          <option key={value} value={value}>
                            {TASK_PRIORITY_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {task.subtasks.length > 0 ? (
                      <ol className="mt-3 space-y-2 border-l-2 border-border pl-3">
                        {task.subtasks.map((subtask, index) => (
                          <li key={subtask.id} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              id={`paso-${subtask.id}`}
                              checked={subtask.status === 'hecha'}
                              disabled={isPending}
                              onChange={() => toggle(subtask.id, subtask.status)}
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                            />
                            <label
                              htmlFor={`paso-${subtask.id}`}
                              className={
                                subtask.status === 'hecha'
                                  ? 'cursor-pointer text-sm text-muted-foreground line-through'
                                  : 'cursor-pointer text-sm'
                              }
                            >
                              {/* El primer paso se destaca: es el que importa. */}
                              {index === 0 && subtask.status !== 'hecha' ? (
                                <span className="font-medium">
                                  Empieza por aquí: {subtask.title}
                                </span>
                              ) : (
                                subtask.title
                              )}
                            </label>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir "${task.title}"`}
                      disabled={isPending || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar "${task.title}"`}
                      disabled={isPending || index === pending.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar "${task.title}"`}
                      disabled={isPending}
                      onClick={() =>
                        run(() => deleteTaskAction(task.id), 'Eliminada.')
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {done.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">
            Hechas ({done.length})
          </h2>
          <ul className="mt-2 space-y-1">
            {done.map((task) => (
              <li key={task.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`hecha-${task.id}`}
                  checked
                  disabled={isPending}
                  onChange={() => toggle(task.id, task.status)}
                  className="size-4 shrink-0 accent-primary"
                />
                <label
                  htmlFor={`hecha-${task.id}`}
                  className="cursor-pointer text-sm text-muted-foreground line-through"
                >
                  {task.title}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
