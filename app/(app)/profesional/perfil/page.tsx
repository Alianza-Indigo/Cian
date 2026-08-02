import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getMyProfessionalProfile,
  listAvailability,
} from '@/lib/db/repositories/consultorio';
import { DEFAULT_TIME_ZONE } from '@/lib/notifications/types';
import { ProfessionalBoard } from './professional-board';

export const metadata: Metadata = { title: 'Perfil profesional' };
export const dynamic = 'force-dynamic';

export default async function ProfesionalPage() {
  const ctx = await requireTenantContext();

  const profile = await getMyProfessionalProfile(ctx);

  const availability = profile
    ? await listAvailability(ctx, profile.id)
    : [];

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
                licenseDocs: profile.licenseDocs,
                bio: profile.bio,
                defaultMeetingUrl: profile.defaultMeetingUrl,
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
      />
    </div>
  );
}
