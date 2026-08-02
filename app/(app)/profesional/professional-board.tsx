'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Plus, Save, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleField } from '@/components/ui/toggle-field';
import {
  SPECIALTIES,
  SPECIALTY_LABELS,
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
  addLicenseDocAction,
  deleteAvailabilityAction,
  removeLicenseDocAction,
  saveProfessionalProfileAction,
} from '@/lib/consultorio/actions';
import { uploadAttachments } from '@/lib/attachments/client';

type Profile = {
  id: string;
  specialties: Specialty[];
  licenseNumber: string | null;
  licenseDocs: Array<{ filename: string; blobUrl: string; uploadedAt: string }>;
  bio: string | null;
  defaultMeetingUrl: string | null;
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


const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function ProfessionalBoard({
  profile,
  availability,
  defaultTimezone,
}: {
  profile: Profile | null;
  availability: Slot[];
  defaultTimezone: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  const [specialties, setSpecialties] = useState<Specialty[]>(
    profile?.specialties ?? [],
  );
  const [licenseNumber, setLicenseNumber] = useState(profile?.licenseNumber ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [meetingUrl, setMeetingUrl] = useState(profile?.defaultMeetingUrl ?? '');
  const [accepted, setAccepted] = useState(Boolean(profile?.termsAcceptedAt));

  const [uploading, setUploading] = useState(false);

  /**
   * Sube el documento y lo pega al perfil.
   *
   * Pasa por `/api/adjuntos`, el mismo camino que los adjuntos del chat: queda
   * en almacenamiento privado tras una ruta que comprueba el tenant. La cédula
   * de alguien no puede acabar en una URL que se pueda reenviar.
   */
  async function attachLicenseDoc(file: File) {
    setUploading(true);
    setStatus('Subiendo el documento…');

    const upload = await uploadAttachments([file]);
    setUploading(false);

    if (!upload.ok) {
      setStatus(upload.error);
      return;
    }

    const attachment = upload.attachments[0];
    if (!attachment) {
      setStatus('No pudimos subir el documento.');
      return;
    }

    run(() => addLicenseDocAction(attachment.filename, attachment.url));
  }

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

          <div className="mt-4">
            <label htmlFor="meet" className="text-sm font-medium">
              Tu enlace de Google Meet
            </label>
            <input
              id="meet"
              type="url"
              value={meetingUrl}
              onChange={(event) => setMeetingUrl(event.target.value)}
              className={`mt-1 ${inputClass}`}
              style={{ minHeight: 'var(--cian-control-height)' }}
              placeholder="https://meet.google.com/abc-defg-hij"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              La videollamada ocurre en Meet. CIAN controla quién ve este enlace
              y cuándo —solo las dos personas de la cita, y solo alrededor de su
              hora—, pero no lo que pase dentro de la reunión. Sin enlace, nadie
              puede entrar a la videollamada.
            </p>
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
                  defaultMeetingUrl: meetingUrl || undefined,
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

      {/* --- Documentos de la cédula ------------------------------------------ */}
      {profile ? (
        <section aria-labelledby="documentos-cedula">
          <h2
            id="documentos-cedula"
            className="text-lg font-semibold tracking-tight"
          >
            Documentos que respaldan tu cédula
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quien administra el espacio los revisa antes de verificarte. Sin
            ellos, verificar es creerle a un campo de texto.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quedan en almacenamiento privado, detrás de una ruta que comprueba
            quién los pide. No son públicos ni tienen enlace que se pueda
            reenviar.
          </p>

          <Card className="mt-3">
            {profile.licenseDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no has adjuntado ninguno.
              </p>
            ) : (
              <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
                {profile.licenseDocs.map((doc) => (
                  <li
                    key={doc.blobUrl}
                    className="flex items-center justify-between gap-3"
                  >
                    <a
                      href={doc.blobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm underline underline-offset-4"
                    >
                      {doc.filename}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Retirar ${doc.filename}`}
                      disabled={isPending}
                      onClick={() => run(() => removeLicenseDocAction(doc.blobUrl))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <label
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
              style={{ minHeight: 'var(--cian-control-height)' }}
            >
              <Upload aria-hidden="true" className="size-4" />
              {uploading ? 'Subiendo…' : 'Adjuntar documento'}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={isPending || uploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void attachLicenseDoc(file);
                }}
              />
            </label>

            {profile.verificationStatus === 'verificado' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Retirar un documento devuelve tu verificación a pendiente:
                quitar la evidencia sobre la que alguien te verificó la deja sin
                sostén.
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

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

    </div>
  );
}
