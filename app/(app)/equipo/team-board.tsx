'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MessageSquare, Share2, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  MEMBER_STATUS_LABELS,
  RELATIONSHIPS,
  RELATIONSHIP_LABELS,
  SHAREABLE_TYPE_LABELS,
  SHARE_PERMISSIONS,
  SHARE_PERMISSION_HINTS,
  SHARE_PERMISSION_LABELS,
  type MemberStatus,
  type Relationship,
  type ShareableType,
  type SharePermission,
} from '@/lib/team/types';
import {
  deleteMemberAction,
  inviteMemberAction,
  revokeMemberAction,
  revokeShareAction,
  shareResourceAction,
} from '@/lib/team/actions';

type Member = {
  id: string;
  email: string;
  displayName: string | null;
  relationship: Relationship;
  status: MemberStatus;
  acceptedAt: string | null;
};

type Share = {
  id: string;
  memberId: string;
  resourceType: ShareableType;
  resourceId: string;
  resourceTitle: string;
  permission: SharePermission;
  notes: number;
};

export type ShareableItem = {
  type: ShareableType;
  id: string;
  title: string;
};

const inputClass =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function TeamBoard({
  members,
  shares,
  shareable,
}: {
  members: Member[];
  shares: Share[];
  shareable: ShareableItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('familiar');

  /** A quién se está compartiendo ahora mismo. Null = el formulario cerrado. */
  const [sharingWith, setSharingWith] = useState<string | null>(null);
  const [pickedResource, setPickedResource] = useState('');
  const [permission, setPermission] = useState<SharePermission>('lectura');

  const sharesByMember = useMemo(() => {
    const map = new Map<string, Share[]>();
    for (const share of shares) {
      map.set(share.memberId, [...(map.get(share.memberId) ?? []), share]);
    }
    return map;
  }, [shares]);

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string; inviteUrl?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? result.message ?? 'Listo.' : result.error ?? 'Algo salió mal.');
      setInviteUrl(result.ok ? result.inviteUrl ?? null : null);
      if (result.ok) router.refresh();
    });
  }

  function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    if (email.trim().length === 0) return;

    run(async () => {
      const result = await inviteMemberAction({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        relationship,
      });
      if (result.ok) {
        setEmail('');
        setDisplayName('');
      }
      return result;
    });
  }

  function submitShare(memberId: string) {
    const item = shareable.find(
      (candidate) => `${candidate.type}:${candidate.id}` === pickedResource,
    );
    if (!item) {
      setStatus('Elige qué compartir.');
      return;
    }

    run(async () => {
      const result = await shareResourceAction({
        memberId,
        resourceType: item.type,
        resourceId: item.id,
        resourceTitle: item.title,
        permission,
      });
      if (result.ok) {
        setSharingWith(null);
        setPickedResource('');
      }
      return result;
    });
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
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
      <section aria-labelledby="invitar">
        <h2 id="invitar" className="text-lg font-semibold tracking-tight">
          Invitar a alguien
        </h2>

        <Card className="mt-3">
          <form onSubmit={submitInvite} style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            <div>
              <label htmlFor="equipo-correo" className="text-sm font-medium">
                Correo
              </label>
              <input
                id="equipo-correo"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="maestra@escuela.mx"
              />
            </div>

            <div>
              <label htmlFor="equipo-nombre" className="text-sm font-medium">
                Cómo le llamas <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="equipo-nombre"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
                placeholder="Maestra Lupita"
              />
            </div>

            <div>
              <label htmlFor="equipo-relacion" className="text-sm font-medium">
                Relación
              </label>
              <select
                id="equipo-relacion"
                value={relationship}
                onChange={(event) => setRelationship(event.target.value as Relationship)}
                className={`mt-1 ${inputClass}`}
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                {RELATIONSHIPS.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={isPending} className="justify-self-start">
              <UserPlus aria-hidden="true" />
              Enviar invitación
            </Button>
          </form>
        </Card>
      </section>

      {/* --- Miembros ------------------------------------------------------ */}
      <section aria-labelledby="miembros">
        <h2 id="miembros" className="text-lg font-semibold tracking-tight">
          Tu equipo
        </h2>

        {members.length === 0 ? (
          <Card className="mt-3">
            <p className="text-sm text-muted-foreground">
              Todavía no has invitado a nadie.
            </p>
          </Card>
        ) : (
          <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
            {members.map((member) => {
              const memberShares = sharesByMember.get(member.id) ?? [];
              const revoked = member.status === 'revocado';

              return (
                <li key={member.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold">
                          {member.displayName ?? member.email}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {RELATIONSHIP_LABELS[member.relationship]} ·{' '}
                          {MEMBER_STATUS_LABELS[member.status]}
                        </p>
                        {member.displayName ? (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 gap-1">
                        {!revoked ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Retirar el acceso de ${member.displayName ?? member.email}`}
                            disabled={isPending}
                            onClick={() => run(() => revokeMemberAction(member.id))}
                          >
                            <UserMinus aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar a ${member.displayName ?? member.email} del equipo`}
                          disabled={isPending}
                          onClick={() => run(() => deleteMemberAction(member.id))}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {revoked ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Ya no ve nada. Invítala de nuevo si quieres restablecerlo.
                      </p>
                    ) : (
                      <>
                        {memberShares.length > 0 ? (
                          <ul className="mt-3 space-y-1">
                            {memberShares.map((share) => (
                              <li
                                key={share.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm">{share.resourceTitle}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {SHAREABLE_TYPE_LABELS[share.resourceType]} ·{' '}
                                    {SHARE_PERMISSION_LABELS[share.permission]}
                                    {share.notes > 0 ? (
                                      <span className="ml-1 inline-flex items-center gap-1">
                                        <MessageSquare
                                          aria-hidden="true"
                                          className="inline size-3"
                                        />
                                        {share.notes}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => run(() => revokeShareAction(share.id))}
                                >
                                  Dejar de compartir
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">
                            No le has compartido nada todavía.
                          </p>
                        )}

                        {sharingWith === member.id ? (
                          <div
                            className="mt-3 rounded-lg border border-border p-3"
                            style={{ display: 'grid', gap: 'var(--cian-gap)' }}
                          >
                            <div>
                              <label
                                htmlFor={`recurso-${member.id}`}
                                className="text-sm font-medium"
                              >
                                Qué compartir
                              </label>
                              <select
                                id={`recurso-${member.id}`}
                                value={pickedResource}
                                onChange={(event) => setPickedResource(event.target.value)}
                                className={`mt-1 ${inputClass}`}
                                style={{ minHeight: 'var(--cian-control-height)' }}
                              >
                                <option value="">Elige un recurso…</option>
                                {shareable.map((item) => (
                                  <option
                                    key={`${item.type}:${item.id}`}
                                    value={`${item.type}:${item.id}`}
                                  >
                                    {SHAREABLE_TYPE_LABELS[item.type]}: {item.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label
                                htmlFor={`permiso-${member.id}`}
                                className="text-sm font-medium"
                              >
                                Permiso
                              </label>
                              <select
                                id={`permiso-${member.id}`}
                                value={permission}
                                onChange={(event) =>
                                  setPermission(event.target.value as SharePermission)
                                }
                                className={`mt-1 ${inputClass}`}
                                style={{ minHeight: 'var(--cian-control-height)' }}
                              >
                                {SHARE_PERMISSIONS.map((value) => (
                                  <option key={value} value={value}>
                                    {SHARE_PERMISSION_LABELS[value]}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {SHARE_PERMISSION_HINTS[permission]}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                disabled={isPending}
                                onClick={() => submitShare(member.id)}
                              >
                                Compartir
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setSharingWith(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            disabled={isPending || shareable.length === 0}
                            onClick={() => {
                              setSharingWith(member.id);
                              setPickedResource('');
                              setPermission('lectura');
                            }}
                          >
                            <Share2 aria-hidden="true" />
                            {shareable.length === 0
                              ? 'Nada que compartir todavía'
                              : 'Compartir algo'}
                          </Button>
                        )}
                      </>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
