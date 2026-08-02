import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  busyIntervals,
  listAvailability,
  listMyAppointments,
  listProfessionals,
} from '@/lib/db/repositories/consultorio';
import { availableSlots, HORIZON_DAYS } from '@/lib/consultorio/availability';
import { DEFAULT_DURATION_MINUTES } from '@/lib/consultorio/types';
import { ConsultorioBoard } from './consultorio-board';

export const metadata: Metadata = { title: 'Consultorio' };
export const dynamic = 'force-dynamic';

export default async function ConsultorioPage() {
  const ctx = await requireTenantContext();
  const now = new Date();

  // Solo verificados: quien no lo está no puede recibir citas, así que
  // tampoco tiene sentido ofrecerlo.
  const [professionals, appointments] = await Promise.all([
    listProfessionals(ctx, true),
    listMyAppointments(ctx),
  ]);

  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const withSlots = await Promise.all(
    professionals.map(async (professional) => {
      const [rules, busy] = await Promise.all([
        listAvailability(ctx, professional.id),
        busyIntervals(ctx, professional.id, now, horizonEnd),
      ]);

      const slots = availableSlots({
        rules: rules.map((rule) => ({
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          timezone: rule.timezone,
          active: rule.active,
        })),
        busy,
        durationMinutes: DEFAULT_DURATION_MINUTES,
        now,
        maxSlots: 24,
      });

      return {
        id: professional.id,
        name: professional.name ?? professional.email ?? 'Profesional',
        specialties: professional.specialties,
        bio: professional.bio,
        slots: slots.map((slot) => slot.start.toISOString()),
      };
    }),
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultorio</h1>
        <p className="mt-2 text-muted-foreground">
          Sesiones con profesionales verificados. CIAN pone la herramienta; la
          atención y su responsabilidad son de quien la presta.
        </p>
      </div>

      <ConsultorioBoard
        professionals={withSlots}
        appointments={appointments.map((entry) => ({
          id: entry.appointment.id,
          status: entry.appointment.status,
          scheduledAt: entry.appointment.scheduledAt.toISOString(),
          durationMinutes: entry.appointment.durationMinutes,
          role: entry.role,
          requestedBy: entry.appointment.requestedBy,
          otherName: entry.otherName,
          reason: entry.appointment.reason,
        }))}
        durationMinutes={DEFAULT_DURATION_MINUTES}
      />
    </div>
  );
}
