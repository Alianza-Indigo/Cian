'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import {
  SPECIALTY_LABELS,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABELS,
  type Specialty,
  type VerificationStatus,
} from '@/lib/consultorio/types';
import { setVerificationStatusAction } from '@/lib/consultorio/actions';

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
export function VerificationBoard({ roster }: { roster: RosterEntry[] }) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
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
        <p className="text-sm text-muted-foreground">
          Verificar es comprobar una cédula contra el registro público. Aquí solo
          queda constancia de quién lo declaró y cuándo.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo aparece quien ya rellenó su perfil profesional. Para que alguien
          llegue aquí, invítale al espacio con el rol de profesional desde
          Miembros.
        </p>
      </div>

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
