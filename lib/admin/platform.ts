/**
 * Administración de plataforma: todos los espacios, desde un solo sitio.
 *
 * ## Por qué existe, y por qué tardó
 *
 * Durante todo el proyecto ninguna consulta cruzaba espacios. Eso protegía a
 * las personas y, de paso, dejaba a quien es dueño de la plataforma sin poder
 * operarla: no podía ver cuántos espacios había, ni verificar a un profesional
 * de otra organización, ni entender qué estaba pasando en su propio producto.
 *
 * Eso no era seguridad, era una limitación. La decisión, tomada explícitamente:
 * **quien administra la plataforma tiene control total de la operación y ningún
 * acceso al contenido clínico privado.** Son dos cosas distintas y aquí se
 * separan a propósito.
 *
 * ## Dónde está la línea, exactamente
 *
 * **Sí se puede ver y hacer, en cualquier espacio:**
 * espacios y sus planes, quién es miembro y con qué rol, perfiles profesionales
 * con su cédula y sus documentos, verificar y retirar verificaciones, la
 * actividad del consultorio —cuántas citas, entre quiénes, en qué estado—,
 * consumo y límites, y la bitácora de auditoría.
 *
 * **Nunca, por ninguna función de este módulo:**
 * el contenido de las conversaciones con CIAN, las notas de sesión, los
 * resúmenes, la bitácora de crisis, la bitácora sensorial, el perfil de
 * alimentación, los planes, las rutinas ni los documentos de nadie.
 *
 * Eso no es una promesa: `tests/platform-admin.test.ts` lee este archivo y
 * falla si aparece una consulta contra cualquiera de esas tablas. Si alguna vez
 * hace falta cruzar la línea, hay que borrar esa prueba a mano, y entonces al
 * menos queda constancia de que alguien lo decidió.
 *
 * ## Todo queda registrado
 *
 * Cada operación que escribe en un espacio ajeno pasa por `recordAudit` con el
 * tenant afectado. Poder hacerlo todo y que no quede rastro sería lo peligroso;
 * poder hacerlo todo y que quede, es administrar.
 */
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { tenants, tenantMembers } from '../db/schema/tenants';
import { users } from '../db/schema/auth';
import { subscriptions } from '../db/schema/billing';
import {
  appointments,
  professionals,
  type LicenseDoc,
} from '../db/schema/consultorio';
import { auditLog } from '../db/schema/audit';
import { assertSuperadmin } from './access';
import type { MemberRole } from '../tenant/guard';
import type { Plan } from '../billing/types';
import type { Specialty, VerificationStatus } from '../consultorio/types';

// --- Espacios ----------------------------------------------------------------

export type SpaceSummary = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  members: number;
  professionals: number;
  appointments: number;
  createdAt: Date;
};

/** Todos los espacios de la plataforma, con lo que hace falta para operarla. */
export async function listSpaces(): Promise<SpaceSummary[]> {
  await assertSuperadmin('listSpaces');

  const filas = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt));

  if (filas.length === 0) return [];

  const ids = filas.map((fila) => fila.id);

  /*
   * Tres conteos agrupados en vez de tres consultas por espacio. Con veinte
   * espacios daría igual; con mil, la diferencia es la pantalla entera.
   */
  const [miembros, profesionales, citas] = await Promise.all([
    db
      .select({ tenantId: tenantMembers.tenantId, total: count() })
      .from(tenantMembers)
      .where(
        and(
          inArray(tenantMembers.tenantId, ids),
          eq(tenantMembers.status, 'active'),
        ),
      )
      .groupBy(tenantMembers.tenantId),
    db
      .select({ tenantId: professionals.tenantId, total: count() })
      .from(professionals)
      .where(inArray(professionals.tenantId, ids))
      .groupBy(professionals.tenantId),
    db
      .select({ tenantId: appointments.tenantId, total: count() })
      .from(appointments)
      .where(
        and(inArray(appointments.tenantId, ids), eq(appointments.isTest, false)),
      )
      .groupBy(appointments.tenantId),
  ]);

  const mapa = (filas: Array<{ tenantId: string; total: number }>) =>
    new Map(filas.map((fila) => [fila.tenantId, fila.total]));

  const porMiembros = mapa(miembros);
  const porProfesionales = mapa(profesionales);
  const porCitas = mapa(citas);

  return filas.map((fila) => ({
    ...fila,
    members: porMiembros.get(fila.id) ?? 0,
    professionals: porProfesionales.get(fila.id) ?? 0,
    appointments: porCitas.get(fila.id) ?? 0,
  }));
}

// --- Detalle de un espacio ---------------------------------------------------

export type SpaceMember = {
  userId: string;
  name: string | null;
  email: string | null;
  role: MemberRole;
  status: string;
};

export type SpaceProfessional = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  specialties: Specialty[];
  licenseNumber: string | null;
  licenseDocs: LicenseDoc[];
  verificationStatus: VerificationStatus;
  termsAcceptedAt: Date | null;
};

/**
 * Una cita, sin nada de lo que se dijo dentro.
 *
 * Fecha, duración, entre quiénes y en qué estado. Es lo que hace falta para
 * responder «¿esto funciona?» y «¿cuánta actividad hay?», y no incluye una sola
 * palabra de la consulta.
 */
export type SpaceAppointment = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  professionalName: string | null;
  clientName: string | null;
};

export type SpaceDetail = {
  space: SpaceSummary;
  members: SpaceMember[];
  professionals: SpaceProfessional[];
  appointments: SpaceAppointment[];
};

export async function spaceDetail(tenantId: string): Promise<SpaceDetail | null> {
  await assertSuperadmin('spaceDetail');

  const [space] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!space) return null;

  const [miembros, perfiles, citas, totalCitas, suscripcion] = await Promise.all([
    db
      .select({
        userId: tenantMembers.userId,
        name: users.name,
        email: users.email,
        role: tenantMembers.role,
        status: tenantMembers.status,
      })
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, tenantId))
      .orderBy(tenantMembers.createdAt),
    db
      .select({ professional: professionals, name: users.name, email: users.email })
      .from(professionals)
      .innerJoin(users, eq(users.id, professionals.userId))
      .where(eq(professionals.tenantId, tenantId))
      .orderBy(professionals.createdAt),
    /*
     * `users` entra por el lado del cliente, así que `users.name` de aquí es
     * siempre el nombre de quien recibe la consulta. El del profesional sale
     * del mapa de abajo, para no unir dos veces la misma tabla.
     */
    db
      .select({
        appointment: appointments,
        professionalUserId: professionals.userId,
        clientName: users.name,
      })
      .from(appointments)
      .innerJoin(
        professionals,
        eq(professionals.id, appointments.professionalId),
      )
      .innerJoin(users, eq(users.id, appointments.clientUserId))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.isTest, false),
        ),
      )
      .orderBy(desc(appointments.scheduledAt))
      .limit(200),
    /*
     * El total va aparte porque la lista de arriba está recortada a 200. Sin
     * esto, un espacio con mucha actividad diría «200 citas» para siempre.
     */
    db
      .select({ total: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.isTest, false),
        ),
      ),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1),
  ]);

  const nombrePorUsuario = new Map(
    [...miembros, ...perfiles.map((p) => ({ userId: p.professional.userId, name: p.name }))].map(
      (fila) => [fila.userId, fila.name],
    ),
  );

  return {
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      plan: suscripcion[0]?.plan ?? space.plan,
      members: miembros.filter((m) => m.status === 'active').length,
      professionals: perfiles.length,
      appointments: totalCitas[0]?.total ?? 0,
      createdAt: space.createdAt,
    },
    members: miembros,
    professionals: perfiles.map((fila) => ({
      id: fila.professional.id,
      userId: fila.professional.userId,
      name: fila.name,
      email: fila.email,
      specialties: fila.professional.specialties,
      licenseNumber: fila.professional.licenseNumber,
      licenseDocs: fila.professional.licenseDocs,
      verificationStatus: fila.professional.verificationStatus,
      termsAcceptedAt: fila.professional.termsAcceptedAt,
    })),
    appointments: citas.map((fila) => ({
      id: fila.appointment.id,
      scheduledAt: fila.appointment.scheduledAt,
      durationMinutes: fila.appointment.durationMinutes,
      status: fila.appointment.status,
      professionalName:
        nombrePorUsuario.get(fila.professionalUserId) ?? null,
      clientName: fila.clientName,
    })),
  };
}

// --- Actuar sobre un espacio -------------------------------------------------

/**
 * Verifica —o retira la verificación de— un profesional de cualquier espacio.
 *
 * Es la verificación de plataforma que faltaba. Un espacio pequeño puede no
 * tener a nadie con criterio para revisar una cédula; que CIAN pueda hacerlo es
 * lo que permite responder por quién atiende dentro de la plataforma.
 *
 * Sigue valiendo la regla que ya existía: **sin términos aceptados no se
 * verifica a nadie**, tampoco desde aquí. Verificar a quien no ha declarado que
 * la responsabilidad profesional es suya sería firmar por él.
 */
export async function setVerificationAnywhere(
  tenantId: string,
  professionalId: string,
  status: VerificationStatus,
): Promise<void> {
  const admin = await assertSuperadmin('setVerificationAnywhere');

  const [existing] = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error('No encontramos ese perfil profesional.');

  if (status === 'verificado' && !existing.termsAcceptedAt) {
    throw new Error(
      'No se puede verificar a alguien que no ha aceptado los términos.',
    );
  }

  await db
    .update(professionals)
    .set({
      verificationStatus: status,
      verifiedAt: status === 'verificado' ? new Date() : null,
    })
    .where(eq(professionals.id, professionalId));

  /*
   * La auditoría se escribe en el tenant afectado, no en el de quien actúa.
   * Así, quien administre ese espacio ve en su propia bitácora que alguien de
   * plataforma tocó algo suyo. Enterarse por otro lado sería peor.
   */
  await db.insert(auditLog).values({
    tenantId,
    userId: admin.ctx.userId,
    action: 'plataforma.verificacion',
    entity: 'professional',
    entityId: professionalId,
    metadata: { status, porPlataforma: true },
  });
}

/** Últimos movimientos de plataforma, para poder responder quién hizo qué. */
export async function platformAuditTrail(limit = 100) {
  await assertSuperadmin('platformAuditTrail');

  return db
    .select({
      id: auditLog.id,
      tenantId: auditLog.tenantId,
      tenantName: tenants.name,
      userId: auditLog.userId,
      action: auditLog.action,
      entity: auditLog.entity,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(tenants, eq(tenants.id, auditLog.tenantId))
    .where(gte(auditLog.createdAt, new Date(Date.now() - 30 * 86_400_000)))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}
