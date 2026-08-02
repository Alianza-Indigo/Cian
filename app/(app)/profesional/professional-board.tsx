'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  SPECIALTIES,
  SPECIALTY_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  canOpenPractice,
  requiresLicense,
  type Specialty,
  type VerificationStatus,
} from '@/lib/consultorio/types';
import {
  PROFESSIONAL_TERMS,
  PROFESSIONAL_TERMS_TITLE,
} from '@/lib/consultorio/terms';
import { WEEKDAY_NAMES } from '@/lib/notifications/types';
import {
  addAvailabilityAction,
  deleteAvailabilityAction,
  saveProfessionalProfileAction,
  setVerificationStatusAction,
} from '@/lib/consultorio/actions';

type Profile = {
  id: string;
  specialties: Specialty[];
  licenseNumber: string | null;
  bio: string | null;
  verificationStatus: VerificationStatus;
  termsAcceptedAt: string | null;
};

type Slot = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  active: boolean;
};

type RosterEntry = {
  id: string;
  name: string;
  specialties: Specialty[];
  licenseNumber: string | null;
  verificationStatus: VerificationStatus;
  termsAcceptedAt: string | null;
  isMe: boolean;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function ProfessionalBoard({
  profile,
  availability,
  defaultTimezone,
  isAdmin,
  roster,
}: {
  profile: Profile | null;
  availability: Slot[];
  defaultTimezone: string;
  isAdmin: boolean;
  roster: RosterEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [specialties, setSpecialties] = useState<Specialty[]>(
    profile?.specialties ?? [],
  );
  const [licenseNumber, setLicenseNumber] = useState(profile?.licenseNumber ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [accepted, setAccepted] = useState(Boolean(profile?.termsAcceptedAt));

  const [weekday, setWeekday] = useState(2);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('14:00');

  const needsLicense = requiresLicense(specialties);
  const verified = profile ? canOpenPractice(profile.verificationStatus) : false;

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {profile ? (
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {verified ? <BadgeCheck aria-hidden="true" className="size-4" /> : null}
            {VERIFICATION_STATUS_LABELS[profile.verificationStatus]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {verified
              ? 'Tu consultorio está abierto: puedes recibir citas.'
              : 'Mientras tu perfil no esté verificado no puedes recibir citas. No es un aviso: la reserva se rechaza.'}
          </p>
        </Card>
      ) : null}

      {/* --- Perfil --------------------------------------------------------- */}
      <section aria-labelledby="perfil">
        <h2 id="perfil" className="text-lg font-semibold tracking-tight">
          Tus datos
        </h2>

        <Card className="mt-3">
          <fieldset>
            <legend className="text-sm font-medium">Especialidades</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPECIALTIES.map((specialty) => {
                const on = specialties.includes(specialty);
                return (
                  <Button
                    key={specialty}
                    type="button"
                    variant={on ? 'primary' : 'outline'}
                    size="sm"
                    aria-pressed={on}
                    onClick={() =>
                      setSpecialties(
                        on
                          ? specialties.filter((value) => value !== specialty)
                          : [...specialties, specialty],
                      )
                    }
                  >
                    {SPECIALTY_LABELS[specialty]}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="cedula" className="text-sm font-medium">
              Cédula profesional{' '}
              {needsLicense ? (
                <span className="text-muted-foreground">(obligatoria)</span>
              ) : (
                <span className="text-muted-foreground">(opcional)</span>
              )}
            </label>
            <input
              id="cedula"
              type="text"
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              className={`mt-1 ${inputClass}`}
              style={{ minHeight: 'var(--cian-control-height)' }}
            />
            {needsLicense ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Las especialidades sanitarias que elegiste la requieren por ley.
              </p>
            ) : null}
          </div>

          <div className="mt-4">
            <label htmlFor="bio" className="text-sm font-medium">
              Cómo te presentas
            </label>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              placeholder="Tu formación, tu enfoque y con quién sueles trabajar."
            />
          </div>

          {/* --- Términos --------------------------------------------------- */}
          <div className="mt-4 rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold">{PROFESSIONAL_TERMS_TITLE}</h3>
            <ul className="mt-2 space-y-1.5">
              {PROFESSIONAL_TERMS.map((term) => (
                <li key={term} className="flex gap-2 text-sm text-muted-foreground">
                  <span aria-hidden="true">•</span>
                  <span>{term.replace(/\*\*/g, '')}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3">
              <ToggleField
                label="Acepto estos términos"
                hint="Sin esto no hay perfil profesional, y sin perfil no hay citas."
                checked={accepted}
                onChange={setAccepted}
                disabled={isPending}
              />
            </div>
          </div>

          <Button
            type="button"
            className="mt-4"
            disabled={isPending || specialties.length === 0 || !accepted}
            onClick={() =>
              run(() =>
                saveProfessionalProfileAction({
                  specialties,
                  licenseNumber: licenseNumber || undefined,
                  bio: bio || undefined,
                  acceptTerms: accepted,
                }),
              )
            }
          >
            <Save aria-hidden="true" />
            Guardar perfil
          </Button>

          {profile ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Cambiar tus especialidades o tu cédula devuelve el perfil a
              revisión. Verificar a alguien y que después añada una especialidad
              sin revisar sería el agujero que la verificación existe para tapar.
            </p>
          ) : null}
        </Card>
      </section>

      {/* --- Disponibilidad --------------------------------------------------- */}
      {profile ? (
        <section aria-labelledby="disponibilidad">
          <h2 id="disponibilidad" className="text-lg font-semibold tracking-tight">
            Cuándo atiendes
          </h2>

          {availability.length > 0 ? (
            <ul className="mt-3" style={{ display: 'grid', gap: '0.5rem' }}>
              {availability.map((slot) => (
                <li key={slot.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm">
                        {WEEKDAY_NAMES[slot.weekday]} de {slot.startTime} a{' '}
                        {slot.endTime}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {slot.timezone}
                        </span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar esta franja"
                        disabled={isPending}
                        onClick={() => run(() => deleteAvailabilityAction(slot.id))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Todavía no declaraste horarios, así que nadie puede reservarte.
            </p>
          )}

          <Card className="mt-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="dia" className="text-xs text-muted-foreground">
                  Día
                </label>
                <select
                  id="dia"
                  value={weekday}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                >
                  {WEEKDAY_NAMES.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="desde" className="text-xs text-muted-foreground">
                  Desde
                </label>
                <input
                  id="desde"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                />
              </div>

              <div>
                <label htmlFor="hasta" className="text-xs text-muted-foreground">
                  Hasta
                </label>
                <input
                  id="hasta"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                  style={{ minHeight: 'var(--cian-control-height)', width: 'auto' }}
                />
              </div>

              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() =>
                    addAvailabilityAction({
                      professionalId: profile.id,
                      weekday,
                      startTime,
                      endTime,
                      timezone: defaultTimezone,
                    }),
                  )
                }
              >
                <Plus aria-hidden="true" />
                Agregar
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Las horas son en {defaultTimezone}. Quien reserve las verá
              convertidas a su propia zona horaria.
            </p>
          </Card>
        </section>
      ) : null}

      {/* --- Revisión de altas ------------------------------------------------ */}
      {isAdmin && roster.length > 0 ? (
        <section aria-labelledby="revision">
          <h2 id="revision" className="text-lg font-semibold tracking-tight">
            Verificación
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verificar es comprobar una cédula contra el registro público. El
            código solo garantiza que quede constancia de quién lo declaró.
          </p>

          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {roster.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {entry.name}
                        {entry.isMe ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (tú)
                          </span>
                        ) : null}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.specialties
                          .map((specialty) => SPECIALTY_LABELS[specialty])
                          .join(', ')}
                        {entry.licenseNumber ? ` · Cédula ${entry.licenseNumber}` : ''}
                      </p>
                      {!entry.termsAcceptedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No ha aceptado los términos: no se puede verificar.
                        </p>
                      ) : null}
                    </div>

                    <select
                      aria-label={`Estado de verificación de ${entry.name}`}
                      value={entry.verificationStatus}
                      disabled={isPending || !entry.termsAcceptedAt}
                      onChange={(event) =>
                        run(() =>
                          setVerificationStatusAction({
                            professionalId: entry.id,
                            status: event.target.value as VerificationStatus,
                          }),
                        )
                      }
                      className={inputClass}
                      style={{
                        minHeight: 'var(--cian-control-height)',
                        width: 'auto',
                      }}
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
        </section>
      ) : null}
    </div>
  );
}
