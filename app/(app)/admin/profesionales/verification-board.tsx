'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SPECIALTY_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  type Specialty,
  type VerificationStatus,
} from '@/lib/consultorio/types';
import { setVerificationStatusAction } from '@/lib/consultorio/actions';
import {
  cancelInvitationAction,
  inviteToTenantAction,
} from '@/lib/tenant/actions';

export type RosterEntry = {
  id: string;
  name: string;
  specialties: Specialty[];
  licenseNumber: string | null;
  licenseDocs: Array<{ filename: string; blobUrl: string }>;
  verificationStatus: VerificationStatus;
  termsAcceptedAt: string | null;
  isMe: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  expiresAt: string;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
});

const selectClass =
  'rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Verificación de profesionales del espacio.
 *
 * Vivía dentro de «Perfil profesional», mezclada con el formulario del perfil
 * propio. Eran dos cosas distintas en la misma pantalla: una es «mis datos» y
 * la otra es «doy de alta a otros», y quien administraba entraba a una pantalla
 * que se llamaba como si fuera suya.
 *
 * Verificar es comprobar una cédula contra el registro público. El código solo
 * garantiza que lo haga alguien con permiso y que quede constancia de quién lo
 * declaró y cuándo.
 */
export function VerificationBoard({
  roster,
  invitations,
}: {
  roster: RosterEntry[];
  invitations: PendingInvitation[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
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
      setInviteUrl(result.ok ? (result.inviteUrl ?? null) : null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      {/* --- Cómo funciona el alta -------------------------------------------- */}
      <Card>
        <h2 className="text-sm font-semibold">Dar de alta a alguien que atiende</h2>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>1. Le invitas por correo desde aquí abajo.</li>
          <li>
            2. Acepta y rellena su perfil: especialidades, cédula, documentos que
            la respalden y los términos.
          </li>
          <li>3. Revisas sus documentos y le verificas.</li>
        </ol>
        <p className="mt-2 text-sm text-muted-foreground">
          Hasta el tercer paso no aparece en el consultorio ni puede recibir
          citas. Registrarse por su cuenta no sirve: eso crea un espacio suyo, no
          le mete en el tuyo.
        </p>
      </Card>

      {/* --- Invitar ---------------------------------------------------------- */}
      <section aria-labelledby="invitar-profesional">
        <h2
          id="invitar-profesional"
          className="text-lg font-semibold tracking-tight"
        >
          Invitar a un profesional
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La invitación va con el rol de profesional puesto. Para el resto de
          roles está la pantalla de Miembros.
        </p>

        <Card className="mt-3">
          <form
            style={{ display: 'grid', gap: 'var(--cian-gap)' }}
            onSubmit={(event) => {
              event.preventDefault();
              if (email.trim().length === 0) return;

              run(async () => {
                const result = await inviteToTenantAction({
                  email: email.trim(),
                  role: 'professional',
                });
                if (result.ok) setEmail('');
                return result;
              });
            }}
          >
            <div>
              <label htmlFor="correo-profesional" className="text-sm font-medium">
                Correo
              </label>
              <input
                id="correo-profesional"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="terapeuta@clinica.mx"
              />
            </div>

            <Button type="submit" disabled={isPending} className="justify-self-start">
              <UserPlus aria-hidden="true" />
              Enviar invitación
            </Button>
          </form>

          {inviteUrl ? (
            <div className="mt-3">
              <p className="text-sm">Enlace de invitación:</p>
              <p className="mt-1 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                {inviteUrl}
              </p>
            </div>
          ) : null}
        </Card>
      </section>

      {/* --- Invitados sin contestar ------------------------------------------ */}
      {invitations.length > 0 ? (
        <section aria-labelledby="invitados">
          <h2 id="invitados" className="text-lg font-semibold tracking-tight">
            Invitados, sin aceptar todavía
          </h2>

          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <Mail
                          aria-hidden="true"
                          className="mr-2 inline size-4 align-text-bottom"
                        />
                        {invitation.email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vence el {dateFormat.format(new Date(invitation.expiresAt))}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancelar la invitación de ${invitation.email}`}
                      disabled={isPending}
                      onClick={() => run(() => cancelInvitationAction(invitation.id))}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Verificación ----------------------------------------------------- */}
      <section aria-labelledby="verificacion">
        <h2 id="verificacion" className="text-lg font-semibold tracking-tight">
          Perfiles y verificación
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Verificar es comprobar una cédula contra el registro público. Aquí solo
          queda constancia de quién lo declaró y cuándo.
        </p>
      </section>

      {roster.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nadie ha rellenado un perfil profesional en este espacio todavía.
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
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

                    {/* Los documentos son lo que se mira para verificar. */}
                    {entry.licenseDocs.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-3">
                        {entry.licenseDocs.map((doc) => (
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
                        No adjuntó ningún documento. Verificar sin verlo es
                        creerle al número que escribió.
                      </p>
                    )}

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
    </div>
  );
}
