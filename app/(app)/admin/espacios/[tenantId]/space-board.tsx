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
import {
  PLANS,
  PLAN_LABELS,
  type Plan,
  type PlanLimits,
} from '@/lib/billing/types';
import { ROLE_LABELS } from '@/lib/tenant/roles';
import { MEMBER_ROLES, type MemberRole } from '@/lib/tenant/guard';
import {
  GRANT_MODES,
  GRANT_MODE_LABELS,
  type GrantMode,
} from '@/lib/billing/limits';
import { INVITABLE_ROLES, ROLE_HINTS } from '@/lib/tenant/roles';
import {
  cancelInvitationFromPlatformAction,
  inviteFromPlatformAction,
  removeMemberFromPlatformAction,
  setGrantFromPlatformAction,
  setRoleFromPlatformAction,
  verifyFromPlatformAction,
} from '@/lib/admin/platform-actions';

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

type Grant = {
  plan: Plan | null;
  limits: Partial<PlanLimits> | null;
  mode: GrantMode;
  note: string | null;
  grantedAt: string | null;
};

type Invitation = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
};

const selectClass =
  'rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const inputClass = selectClass;

const MB = 1024 * 1024;

/**
 * Los límites concedibles, en las unidades en que se piensan.
 *
 * El almacenamiento se pide en megas y no en bytes a propósito: nadie concede
 * «2147483648» de nada, y un cero de más en un campo de bytes es un error que
 * no se ve al releerlo.
 */
const CAMPOS = [
  { key: 'mensajes', label: 'Mensajes al mes', unidad: null },
  { key: 'documentos', label: 'Documentos al mes', unidad: null },
  { key: 'almacenamiento', label: 'Almacenamiento', unidad: 'MB' },
  { key: 'equipo_de_apoyo', label: 'Personas en el equipo de apoyo', unidad: null },
] as const;

/** Lo guardado, en la unidad del formulario. */
function valorInicial(
  limits: Partial<PlanLimits> | null,
  key: (typeof CAMPOS)[number]['key'],
): string {
  const valor = limits?.[key];
  if (valor === undefined) return '';
  if (valor === null) return 'sin-limite';
  return key === 'almacenamiento' ? String(Math.round(valor / MB)) : String(valor);
}

/** De lo que se escribió en el campo de megas a lo que se guarda. */
function enBytes(valor: FormDataEntryValue | null): string {
  const texto = String(valor ?? '').trim();
  if (texto === '' || texto === 'sin-limite') return texto;

  const megas = Number(texto);
  return Number.isFinite(megas) ? String(Math.round(megas * MB)) : texto;
}

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
  paidPlan,
  grant,
  invitations,
  members,
  professionals,
  appointments,
}: {
  tenantId: string;
  name: string;
  plan: Plan;
  paidPlan: Plan;
  grant: Grant;
  invitations: Invitation[];
  members: Member[];
  professionals: Professional[];
  appointments: Appointment[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<{
      ok: boolean;
      message?: string;
      error?: string;
      inviteUrl?: string;
    }>,
  ) {
    startTransition(async () => {
      const result = await action();
      setStatus(
        result.ok
          ? (result.message ?? 'Listo.')
          : (result.error ?? 'Algo salió mal.'),
      );
      // Cuando el correo no está configurado, el enlace es la única forma de
      // que esa persona entre. Se enseña hasta que se haga otra cosa.
      setInviteUrl(result.inviteUrl ?? '');
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">
          {isPending ? 'Guardando…' : status}
        </p>
        {inviteUrl ? (
          <p className="mt-1 break-all text-sm">
            <code>{inviteUrl}</code>
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan {PLAN_LABELS[plan]}
          {grant.plan && plan !== paidPlan
            ? ` (concedido; paga ${PLAN_LABELS[paidPlan]})`
            : ''}{' '}
          · {members.length} {members.length === 1 ? 'persona' : 'personas'}
        </p>
      </div>

      {/* --- Plan y límites concedidos ---------------------------------------- */}
      <section aria-labelledby="concesion">
        <h3 id="concesion" className="text-lg font-semibold tracking-tight">
          Plan y límites de este espacio
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Puedes abrirle el plan a una asociación que no paga, o subirle un
          límite puntual, sin montar un cobro. No pasa por Stripe y no caduca.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Este espacio paga <strong>{PLAN_LABELS[paidPlan]}</strong>. Con{' '}
          <em>solo suma</em>, lo que concedas se aplica cuando es más generoso
          que eso y nunca cuando es menor, así que equivocarte no puede quitarle
          nada. Con <em>sustituye</em> manda lo que pongas, también hacia abajo.
          Para retirar la concesión entera, vacía los campos y guarda.
        </p>

        <Card className="mt-3">
          <form
            action={(formData) => {
              /*
               * «Sustituye» es lo único de esta pantalla que puede dejar a un
               * espacio con menos de lo que tenía. Se pregunta una vez, con el
               * nombre del espacio delante, para que no pase por descuido.
               */
              if (formData.get('mode') === 'sustituye') {
                const seguro = confirm(
                  `«Sustituye» reemplaza lo que ${name} tiene, también hacia ` +
                    'abajo. ¿Continuar?',
                );
                if (!seguro) return;
              }

              run(() =>
                setGrantFromPlatformAction({
                  tenantId,
                  plan: formData.get('plan'),
                  mode: formData.get('mode'),
                  note: formData.get('note'),
                  mensajes: formData.get('mensajes'),
                  documentos: formData.get('documentos'),
                  // Se pide en megas y se guarda en bytes.
                  almacenamiento: enBytes(formData.get('almacenamiento')),
                  equipo_de_apoyo: formData.get('equipo_de_apoyo'),
                  asientos: formData.get('asientos'),
                }),
              );
            }}
            style={{ display: 'grid', gap: 'var(--cian-gap)' }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Plan concedido</span>
                <select
                  name="plan"
                  defaultValue={grant.plan ?? ''}
                  disabled={isPending}
                  className={`${selectClass} mt-1 block w-full`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  <option value="">Ninguno — lo que pague</option>
                  {PLANS.map((value) => (
                    <option key={value} value={value}>
                      {PLAN_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="font-medium">Cómo se aplica</span>
                <select
                  name="mode"
                  defaultValue={grant.mode}
                  disabled={isPending}
                  className={`${selectClass} mt-1 block w-full`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  {GRANT_MODES.map((value) => (
                    <option key={value} value={value}>
                      {GRANT_MODE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  «Sustituye» también puede bajar lo que este espacio tiene.
                </span>
              </label>
            </div>

            <fieldset
              className="grid gap-3 sm:grid-cols-2"
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <legend className="text-sm font-medium">
                Límites puntuales
                <span className="ml-2 font-normal text-muted-foreground">
                  vacío = el del plan
                </span>
              </legend>

              {CAMPOS.map((campo) => (
                <label key={campo.key} className="block text-sm">
                  <span>
                    {campo.label}
                    {campo.unidad ? ` (${campo.unidad})` : ''}
                  </span>
                  <input
                    name={campo.key}
                    type="text"
                    inputMode="numeric"
                    defaultValue={valorInicial(grant.limits, campo.key)}
                    placeholder="sin-limite para quitar el tope"
                    disabled={isPending}
                    className={`${inputClass} mt-1 block w-full`}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  />
                </label>
              ))}

              <label className="block text-sm">
                <span>Asientos</span>
                <input
                  name="asientos"
                  type="text"
                  inputMode="numeric"
                  defaultValue={
                    grant.limits?.asientos === undefined
                      ? ''
                      : String(grant.limits.asientos)
                  }
                  disabled={isPending}
                  className={`${inputClass} mt-1 block w-full`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Cuántas personas caben. No admite «sin límite».
                </span>
              </label>
            </fieldset>

            <label className="block text-sm">
              <span className="font-medium">Por qué</span>
              <input
                name="note"
                type="text"
                maxLength={500}
                defaultValue={grant.note ?? ''}
                placeholder="Convenio con la asociación, ciclo 2026"
                disabled={isPending}
                className={`${inputClass} mt-1 block w-full`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Lo lee quien venga dentro de un año a preguntarse por qué este
                espacio no paga.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                Guardar concesión
              </button>
              {grant.grantedAt ? (
                <span className="text-xs text-muted-foreground">
                  Concedido el {fechaHora.format(new Date(grant.grantedAt))}
                </span>
              ) : null}
            </div>
          </form>
        </Card>
      </section>

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
        <p className="mt-1 text-sm text-muted-foreground">
          Puedes cambiar roles y retirar a alguien aunque este espacio se haya
          quedado sin nadie que administre. Un espacio nunca se queda sin
          propietaria: si es la única, hay que nombrar a otra antes.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Retirar a alguien le quita el acceso a lo compartido de este espacio.{' '}
          <strong>Lo suyo no se borra</strong>: sus conversaciones, documentos y
          bitácoras siguen donde estaban, y desde aquí no se ven.
        </p>

        <Card className="mt-3">
          <ul className="space-y-3">
            {members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {member.name ?? member.email ?? 'Sin nombre'}
                  {member.name && member.email ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  ) : null}
                  {member.status !== 'active' ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.status}
                    </span>
                  ) : null}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Rol de ${member.name ?? member.email ?? 'esta persona'}`}
                    value={member.role}
                    disabled={isPending}
                    onChange={(event) =>
                      run(() =>
                        setRoleFromPlatformAction({
                          tenantId,
                          userId: member.userId,
                          role: event.target.value,
                        }),
                      )
                    }
                    className={selectClass}
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  >
                    {MEMBER_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      // Sacar a alguien de un espacio no se deshace con
                      // ctrl+z: se vuelve a invitar y hay que aceptar otra vez.
                      const quien = member.name ?? member.email ?? 'esta persona';
                      if (!confirm(`¿Retirar a ${quien} de ${name}?`)) return;

                      run(() =>
                        removeMemberFromPlatformAction({
                          tenantId,
                          userId: member.userId,
                        }),
                      );
                    }}
                    className="inline-flex items-center rounded-lg border border-border px-3 text-sm hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  >
                    Retirar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* --- Invitar a este espacio ------------------------------------------- */}
      <section aria-labelledby="invitar">
        <h3 id="invitar" className="text-lg font-semibold tracking-tight">
          Invitar a este espacio
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Para cuando no queda nadie dentro a quien ascender: metes a la persona
          y luego le das el rol que toque, arriba. La invitación caduca y ocupa
          asiento igual que cualquier otra.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong>Propietaria</strong> no se manda por correo —es demasiado
          poder viajando en un enlace que puede reenviarse—. Invita como quien
          administra y súbele el rol cuando acepte.
        </p>

        <Card className="mt-3">
          <form
            action={(formData) =>
              run(() =>
                inviteFromPlatformAction({
                  tenantId,
                  email: formData.get('email'),
                  role: formData.get('role'),
                }),
              )
            }
            style={{ display: 'grid', gap: 'var(--cian-gap)' }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Correo</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={320}
                  disabled={isPending}
                  className={`${inputClass} mt-1 block w-full`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium">Rol</span>
                <select
                  name="role"
                  defaultValue="admin"
                  disabled={isPending}
                  className={`${selectClass} mt-1 block w-full`}
                  style={{ minHeight: 'var(--cian-control-height)' }}
                >
                  {INVITABLE_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {ROLE_HINTS.admin}
                </span>
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                Enviar invitación
              </button>
            </div>
          </form>

          {invitations.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-border pt-4">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0">
                    {invitation.email}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ROLE_LABELS[invitation.role]} · caduca el{' '}
                      {fechaHora.format(new Date(invitation.expiresAt))}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        cancelInvitationFromPlatformAction({
                          tenantId,
                          invitationId: invitation.id,
                        }),
                      )
                    }
                    className="inline-flex items-center rounded-lg border border-border px-3 text-sm hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                    style={{ minHeight: 'var(--cian-control-height)' }}
                  >
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
