import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTasks } from '@/lib/db/repositories/tasks';
import { TaskBoard } from './task-board';

export const metadata: Metadata = { title: 'Tareas' };
export const dynamic = 'force-dynamic';

export default async function TareasPage() {
  const ctx = await requireTenantContext();
  const tasks = await listTasks(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
        <p className="mt-2 text-muted-foreground">
          Lo que hay que hacer, partido en pasos. Si algo te cuesta empezar,
          cuéntaselo a CIAN y te devolverá un primer paso mínimo.
        </p>
      </div>

      <TaskBoard
        tasks={tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          estimatedMinutes: task.estimatedMinutes,
          subtasks: task.subtasks.map((subtask) => ({
            id: subtask.id,
            title: subtask.title,
            status: subtask.status,
            estimatedMinutes: subtask.estimatedMinutes,
          })),
        }))}
      />
    </div>
  );
}
