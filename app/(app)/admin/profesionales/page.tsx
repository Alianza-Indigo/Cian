import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin/access";
import { listProfessionals } from "@/lib/db/repositories/consultorio";
import { listInvitations } from "@/lib/db/repositories/memberships";
import {
  consultorioReadiness,
  listTestAppointments,
} from "@/lib/db/repositories/practice";
import { VerificationBoard } from "./verification-board";
import { TestDrive } from "./test-drive";

export const metadata: Metadata = { title: "Profesionales" };
export const dynamic = "force-dynamic";

/**
 * El alta de un profesional, entera y en una sola pantalla.
 *
 * ## Por qué está todo junto aquí
 *
 * Dar de alta a alguien que atiende son tres pasos —invitarle, que rellene su
 * perfil, verificarle— y estaban repartidos en tres pantallas distintas:
 * «Miembros», «Perfil profesional» y el panel. Ninguna se llamaba como la tarea,
 * así que quien administraba tenía que saberse el recorrido de memoria.
 *
 * Aquí se ve el proceso completo: a quién se invitó y sigue sin contestar, quién
 * ya rellenó su perfil y espera revisión, y quién está verificado y aparece en
 * el consultorio. Invitar desde aquí manda el rol de profesional puesto, que es
 * el error fácil de cometer desde la pantalla general de miembros.
 *
 * `/admin/miembros` sigue existiendo para el resto de roles; esto no la
 * sustituye, la especializa.
 */
export default async function AdminProfesionalesPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const [roster, invitations, readiness, tests] = await Promise.all([
    // `false` = también los pendientes; son justo los que hay que revisar.
    listProfessionals(admin.ctx, false),
    listInvitations(admin.ctx),
    consultorioReadiness(admin.ctx),
    listTestAppointments(admin.ctx),
  ]);

  return (
    <div style={{ display: "grid", gap: "var(--cian-section-gap)" }}>
      <VerificationBoard
        roster={roster.map((entry) => ({
          id: entry.id,
          name: entry.name ?? entry.email ?? "Sin nombre",
          specialties: entry.specialties,
          licenseNumber: entry.licenseNumber,
          licenseDocs: entry.licenseDocs.map((doc) => ({
            filename: doc.filename,
            blobUrl: doc.blobUrl,
          })),
          verificationStatus: entry.verificationStatus,
          termsAcceptedAt: entry.termsAcceptedAt?.toISOString() ?? null,
          isMe: entry.userId === admin.ctx.userId,
        }))}
        /*
         * Solo las invitaciones de profesionales. Las demás se administran en
         * Miembros: enseñarlas aquí convertiría esta pantalla en la otra.
         */
        invitations={invitations
          .filter((invitation) => invitation.role === "professional")
          .map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            expiresAt: invitation.expiresAt.toISOString(),
          }))}
      />

      {/*
       * Al final: poner en marcha el consultorio es lo que se hace después de
       * dar de alta a alguien, no antes.
       */}
      <TestDrive
        readiness={readiness}
        tests={tests.map((test) => ({
          id: test.id,
          scheduledAt: test.scheduledAt.toISOString(),
        }))}
      />
    </div>
  );
}
