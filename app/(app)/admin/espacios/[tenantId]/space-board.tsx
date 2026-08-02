'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import {
  SPECIALTY_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type Specialty,
  type VerificationStatus,
} from '@/lib/consultorio/types';
import { PLAN_LABELS, type Plan } from '@/lib/billing/types';
import { ROLE_LABELS } from '@/lib/tenant/roles';
import type { MemberRole } from '@/lib/tenant/guard';
import { verifyFromPlatformAction } from '@/lib/admin/platform-actions';

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: MemberRole;
  status: string;
};

type Professional = {
  id: string;
  name: string;
  specialties: Specialty[];
  licenseNumber: string | null;
  licenseDocs: Array<{ filename: string; blobUrl: string }>;
  verificationStatus: VerificationStatus;
  termsAcceptedAt: string | null;
};

type Appointment = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  professionalName: string | null;
  clientName: string | null;
};

const selectClass =
  'rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Un espacio, desde la administración de plataforma.
 *
 * Se puede operar: verificar profesionales, ver quién es quién y con qué rol, y
 * seguir la actividad del consultorio.
 *
 * De cada cita se ve **que ocurrió** —cuándo, entre quiénes, en qué estado— y
 * nunca lo que se dijo dentro. No es una decisión de esta pantalla: el módulo
 * que trae los datos no tiene ninguna consulta a las notas ni a los resúmenes,
 * y hay una prueba que falla si alguien se la añade.
 */
export function SpaceBoard({
  tenantId,
  name,
  plan,
  members,
  professionals,
  appointments,
}: {
  tenantId: string;
  name: string;
  plan: Plan;
  members: Member[];
  professionals: Professional[];
  appointments: Appointment[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      setStatus(
        result.ok
          ? (result.message ?? 'Listo.')
          : (result.error ?? 'Algo salió mal.'),
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan {PLAN_LABELS[plan]} · {members.length}{' '}
          {members.length === 1 ? 'persona' : 'personas'}
        </p>
      </div>

      {/* --- Profesionales ---------------------------------------------------- */}
      <section aria-labelledby="profesionales">
        <h3 id="profesionales" className="text-lg font-semibold tracking-tight">
          Profesionales
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Puedes verificar desde aquí aunque el espacio no tenga a nadie que lo
          haga. Queda registrado en la bitácora de ese espacio, para que quien lo
          administre lo vea.
        </p>

        {professionals.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              Nadie ha rellenado un perfil profesional aquí.
            </p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {professionals.map((professional) => (
              <li key={professional.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold">{professional.name}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {professional.specialties
                          .map((specialty) => SPECIALTY_LABELS[specialty])
                          .join(', ')}
                        {professional.licenseNumber
                          ? ` · Cédula ${professional.licenseNumber}`
                          : ''}
                      </p>

                      {professional.licenseDocs.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-3">
                          {professional.licenseDocs.map((doc) => (
                            <li key={doc.blobUrl}>
                              <a
                                href={doc.blobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs underline underline-offset-4"
                              >
                                {doc.filename}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Sin documentos adjuntos.
                        </p>
                      )}

                      {!professional.termsAcceptedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No ha aceptado los términos: no se puede verificar.
                        </p>
                      ) : null}
                    </div>

                    <select
                      aria-label={`Verificación de ${professional.name}`}
                      value={professional.verificationStatus}
                      disabled={isPending || !professional.termsAcceptedAt}
                      onChange={(event) =>
                        run(() =>
                          verifyFromPlatformAction({
                            tenantId,
                            professionalId: professional.id,
                            status: event.target.value,
                          }),
                        )
                      }
                      className={selectClass}
                      style={{ minHeight: 'var(--cian-control-height)' }}
                    >
                      {VERIFICATION_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {VERIFICATION_STATUS_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Quién está dentro ------------------------------------------------ */}
      <section aria-labelledby="miembros">
        <h3 id="miembros" className="text-lg font-semibold tracking-tight">
          Quién está dentro
        </h3>

        <Card className="mt-3">
          <ul className="space-y-2">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="min-w-0">
                  {member.name ?? member.email ?? 'Sin nombre'}
                  {member.name && member.email ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[member.role]}
                  {member.status !== 'active' ? ` · ${member.status}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* --- Actividad del consultorio ---------------------------------------- */}
      <section aria-labelledby="actividad">
        <h3 id="actividad" className="text-lg font-semibold tracking-tight">
          Actividad del consultorio
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Que la consulta ocurrió, entre quiénes y cómo terminó. Lo que se habló
          dentro no se ve desde aquí.
        </p>

        {appointments.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              No hay citas en este espacio.
            </p>
          </Card>
        ) : (
          <Card className="mt-3">
            <ul className="space-y-2">
              {appointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span className="tabular-nums">
                    {fechaHora.format(new Date(appointment.scheduledAt))}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {appointment.durationMinutes} min
                    </span>
                  </span>
                  <span className="min-w-0 text-xs text-muted-foreground">
                    {appointment.professionalName ?? '—'} ·{' '}
                    {appointment.clientName ?? '—'} ·{' '}
                    {APPOINTMENT_STATUS_LABELS[
                      appointment.status as AppointmentStatus
                    ] ?? appointment.status}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
