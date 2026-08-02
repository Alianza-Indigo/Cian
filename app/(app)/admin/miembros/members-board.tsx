'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Mail, UserMinus, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  cancelInvitationAction,
  changeMemberRoleAction,
  inviteToTenantAction,
  removeMemberAction,
  INVITABLE_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
} from '@/lib/tenant/actions';

type InvitableRole = (typeof INVITABLE_ROLES)[number];

type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
});

export function MembersBoard({
  currentUserId,
  seats,
  members,
  invitations,
}: {
  currentUserId: string;
  seats: { used: number; total: number };
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');

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

  function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    if (email.trim().length === 0) return;

    run(async () => {
      const result = await inviteToTenantAction({ email: email.trim(), role });
      if (result.ok) setEmail('');
      return result;
    });
  }

  const full = seats.used >= seats.total;

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {isPending ? 'Trabajando…' : status}
      </p>

      {inviteUrl ? (
        <Card>
          <p className="text-sm">Enlace de invitación:</p>
          <p className="mt-2 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
            {inviteUrl}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard?.writeText(inviteUrl);
              setStatus('Enlace copiado.');
            }}
          >
            <Copy aria-hidden="true" />
            Copiar
          </Button>
        </Card>
      ) : null}

      {/* --- Invitar ------------------------------------------------------- */}
      <section aria-labelledby="invitar-espacio">
        <h2
          id="invitar-espacio"
          className="text-lg font-semibold tracking-tight"
        >
          Invitar a este espacio
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esto es distinto del equipo de apoyo. Ahí compartes cosas sueltas con
          gente de fuera; aquí la persona entra al espacio y trabaja dentro de
          él. Para que un profesional aparezca en el consultorio tiene que estar
          aquí, con el rol de profesional.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {seats.used} de {seats.total}{' '}
          {seats.total === 1 ? 'asiento ocupado' : 'asientos ocupados'} (las
          invitaciones sin aceptar también cuentan).
        </p>

        <Card className="mt-3">
          <form
            onSubmit={submitInvite}
            style={{ display: 'grid', gap: 'var(--cian-gap)' }}
          >
            <div>
              <label htmlFor="espacio-correo" className="text-sm font-medium">
                Correo
              </label>
              <input
                id="espacio-correo"
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

            <div>
              <label htmlFor="espacio-rol" className="text-sm font-medium">
                Rol
              </label>
              <select
                id="espacio-rol"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as InvitableRole)
                }
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                aria-describedby="espacio-rol-pista"
              >
                {INVITABLE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              <p
                id="espacio-rol-pista"
                className="mt-1 text-xs text-muted-foreground"
              >
                {ROLE_HINTS[role]}
              </p>
            </div>

            <Button
              type="submit"
              disabled={isPending || full}
              className="justify-self-start"
            >
              <UserPlus aria-hidden="true" />
              Enviar invitación
            </Button>

            {full ? (
              <p className="text-sm text-muted-foreground">
                No quedan asientos. Cancela una invitación pendiente, retira a
                alguien o amplía el plan desde Membresía.
              </p>
            ) : null}
          </form>
        </Card>
      </section>

      {/* --- Invitaciones pendientes --------------------------------------- */}
      {invitations.length > 0 ? (
        <section aria-labelledby="pendientes">
          <h2 id="pendientes" className="text-lg font-semibold tracking-tight">
            Invitaciones sin aceptar
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
                        {ROLE_LABELS[invitation.role] ?? invitation.role} · vence
                        el {dateFormat.format(new Date(invitation.expiresAt))}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancelar la invitación de ${invitation.email}`}
                      disabled={isPending}
                      onClick={() =>
                        run(() => cancelInvitationAction(invitation.id))
                      }
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

      {/* --- Miembros ------------------------------------------------------ */}
      <section aria-labelledby="miembros-espacio">
        <h2
          id="miembros-espacio"
          className="text-lg font-semibold tracking-tight"
        >
          Quién está dentro
        </h2>

        <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {members.map((member) => {
            const label = member.name ?? member.email ?? 'Sin nombre';
            const isSelf = member.userId === currentUserId;

            return (
              <li key={member.userId}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">
                        {label}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (tú)
                          </span>
                        ) : null}
                      </h3>
                      {member.name && member.email ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      ) : null}
                    </div>

                    {!isSelf ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirar a ${label} del espacio`}
                        disabled={isPending}
                        onClick={() =>
                          run(() => removeMemberAction(member.userId))
                        }
                      >
                        <UserMinus aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`rol-${member.userId}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Rol
                    </label>
                    <select
                      id={`rol-${member.userId}`}
                      value={member.role}
                      disabled={isPending}
                      onChange={(event) =>
                        run(() =>
                          changeMemberRoleAction({
                            userId: member.userId,
                            role: event.target.value,
                          }),
                        )
                      }
                      className={`mt-1 ${inputClass}`}
                      style={{ minHeight: 'var(--cian-control-height)' }}
                    >
                      {/*
                       * `owner` se puede elegir aquí aunque no se pueda
                       * invitar: transferir la propiedad desde dentro, viendo
                       * a quién se la das, es distinto de mandarla por correo.
                       */}
                      {['owner', ...INVITABLE_ROLES].map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
