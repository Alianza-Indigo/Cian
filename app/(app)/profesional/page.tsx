import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { hasRoleAtLeast } from '@/lib/tenant/guard';
import {
  getMyProfessionalProfile,
  listAvailability,
  listProfessionals,
} from '@/lib/db/repositories/consultorio';
import { DEFAULT_TIME_ZONE } from '@/lib/notifications/types';
import { ProfessionalBoard } from './professional-board';

export const metadata: Metadata = { title: 'Perfil profesional' };
export const dynamic = 'force-dynamic';

export default async function ProfesionalPage() {
  const ctx = await requireTenantContext();

  const profile = await getMyProfessionalProfile(ctx);
  const isAdmin = hasRoleAtLeast(ctx, 'admin');

  const [availability, pending] = await Promise.all([
    profile ? listAvailability(ctx, profile.id) : Promise.resolve([]),
    // La revisión de altas es de quien administra el espacio.
    isAdmin ? listProfessionals(ctx, false) : Promise.resolve([]),
  ]);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil profesional</h1>
        <p className="mt-2 text-muted-foreground">
          CIAN pone la herramienta con la que atiendes. La atención profesional
          —y su responsabilidad— es tuya. Antes de poder recibir citas hace
          falta que tu perfil quede verificado.
        </p>
      </div>

      <ProfessionalBoard
        profile={
          profile
            ? {
                id: profile.id,
                specialties: profile.specialties,
                licenseNumber: profile.licenseNumber,
                bio: profile.bio,
                verificationStatus: profile.verificationStatus,
                termsAcceptedAt: profile.termsAcceptedAt?.toISOString() ?? null,
              }
            : null
        }
        availability={availability.map((slot) => ({
          id: slot.id,
          weekday: slot.weekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone,
          active: slot.active,
        }))}
        defaultTimezone={DEFAULT_TIME_ZONE}
        isAdmin={isAdmin}
        roster={pending.map((entry) => ({
          id: entry.id,
          name: entry.name ?? entry.email ?? 'Sin nombre',
          specialties: entry.specialties,
          licenseNumber: entry.licenseNumber,
          verificationStatus: entry.verificationStatus,
          termsAcceptedAt: entry.termsAcceptedAt?.toISOString() ?? null,
          isMe: entry.userId === ctx.userId,
        }))}
      />
    </div>
  );
}
