'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  TASK_PRIORITY_LABELS,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/sensory/types';
import {
  createTaskAction,
  deleteTaskAction,
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
  subtasks: Subtask[];
};

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
          {pending.map((task) => (
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
                    </p>

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

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar "${task.title}"`}
                    disabled={isPending}
                    onClick={() => run(() => deleteTaskAction(task.id), 'Eliminada.')}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
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
