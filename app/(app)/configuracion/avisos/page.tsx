import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getNotificationPreferences,
  listDeliveries,
  listPushSubscriptions,
  listReminders,
} from '@/lib/db/repositories/notifications';
import { NotificationSettings } from './notification-settings';

export const metadata: Metadata = { title: 'Avisos' };
export const dynamic = 'force-dynamic';

export default async function AvisosPage() {
  const ctx = await requireTenantContext();

  const [preferences, reminders, subscriptions, deliveries] = await Promise.all([
    getNotificationPreferences(ctx),
    listReminders(ctx),
    listPushSubscriptions(ctx),
    listDeliveries(ctx, 10),
  ]);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
        <p className="mt-2 text-muted-foreground">
          Recordatorios de rutinas y tareas, en un resumen diario. Todo empieza
          apagado y puedes apagarlo otra vez cuando quieras: aquí nadie te va a
          insistir.
        </p>
      </div>

      <NotificationSettings
        preferences={preferences}
        reminders={reminders.map((reminder) => ({
          id: reminder.id,
          kind: reminder.kind,
          title: reminder.title,
          body: reminder.body,
          schedule: reminder.schedule,
          channels: reminder.channels,
          active: reminder.active,
          lastSentAt: reminder.lastSentAt?.toISOString() ?? null,
        }))}
        devices={subscriptions.map((subscription) => ({
          endpoint: subscription.endpoint,
          userAgent: subscription.userAgent,
          lastSuccessAt: subscription.lastSuccessAt?.toISOString() ?? null,
        }))}
        deliveries={deliveries.map((entry) => ({
          id: entry.id,
          channel: entry.channel,
          status: entry.status,
          error: entry.error,
          sentAt: entry.sentAt.toISOString(),
        }))}
      />
    </div>
  );
}
