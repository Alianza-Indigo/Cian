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
 * espacios y sus planes, quién es miembro y con qué rol —y cambiárselo, o
 * retirarle—, perfiles profesionales con su cédula y sus documentos, verificar
 * y retirar verificaciones, la actividad del consultorio —cuántas citas, entre
 * quiénes, en qué estado—, conceder plan y límites sin pasar por Stripe, y la
 * bitácora de auditoría.
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
 * Cada operación que escribe en un espacio ajeno pasa por `registrarEnEspacio`,
 * que deja la fila en la bitácora **del espacio afectado**. Poder hacerlo todo y
 * que no quede rastro sería lo peligroso; poder hacerlo todo y que quede, es
 * administrar. La misma prueba de arriba falla si se añade una operación de
 * escritura que no pase por ahí.
 *
 * ## Conceder plan y límites, y los dos modos
 *
 * `setPlatformGrant` da plan y límites a un espacio sin tocar Stripe. Por
 * omisión **solo suma**: se aplica cuando es más generoso que lo que el espacio
 * ya paga, así que equivocarse en esa pantalla no deja a nadie con menos de lo
 * que compró.
 *
 * El modo `sustituye` levanta esa red y también puede bajar. Existe porque la
 * plataforma tiene que poder contener un espacio que está haciendo daño sin
 * esperar a que un cobro se cancele en Stripe. Se pide aparte, en su propio
 * control, porque activarlo sin querer sí quita.
 *
 * Las dos reglas viven en `lib/billing/limits.ts`, que es puro y está probado
 * frontera por frontera.
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
import {
  cancelInvitation,
  changeMemberRole,
  inviteToTenant,
  listInvitations,
  removeMember,
} from '../db/repositories/memberships';
import {
  effectivePlan,
  sanitizeGrantedLimits,
  type GrantMode,
} from '../billing/limits';
import { assertSuperadmin } from './access';
import type { MemberRole, TenantContext } from '../tenant/guard';
import type { Plan, PlanLimits } from '../billing/types';
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
  /** `true` si el plan no lo paga: se lo concedió la plataforma. */
  granted?: boolean;
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
      platformPlan: tenants.platformPlan,
      platformOverride: tenants.platformOverride,
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

  return filas.map(({ platformPlan, platformOverride, ...fila }) => ({
    ...fila,
    // El plan que se ve en la lista es el que la gente tiene de verdad, con la
    // concesión ya aplicada. Ver un `free` en un espacio al que se le abrió el
    // plan sería contar una cosa distinta de la que pasa.
    plan: effectivePlan(
      fila.plan,
      platformPlan,
      platformOverride ? 'sustituye' : 'suma',
    ),
    granted: platformPlan !== null,
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
  /** Lo que se paga en Stripe, antes de aplicar ninguna concesión. */
  paidPlan: Plan;
  /** Lo que la plataforma le regaló a este espacio, si algo. */
  grant: PlatformGrant;
  /** Invitaciones sin aceptar, para poder cancelarlas desde aquí. */
  invitations: SpaceInvitation[];
};

export type SpaceInvitation = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
};

export async function spaceDetail(tenantId: string): Promise<SpaceDetail | null> {
  const admin = await assertSuperadmin('spaceDetail');

  const [space] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!space) return null;

  const [miembros, perfiles, citas, totalCitas, suscripcion, invitaciones] =
    await Promise.all([
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
    listInvitations(contextoDe(tenantId, admin.ctx.userId)),
  ]);

  const nombrePorUsuario = new Map(
    [...miembros, ...perfiles.map((p) => ({ userId: p.professional.userId, name: p.name }))].map(
      (fila) => [fila.userId, fila.name],
    ),
  );

  const pagado = suscripcion[0]?.plan ?? space.plan;

  return {
    invitations: invitaciones.map((fila) => ({
      id: fila.id,
      email: fila.email,
      role: fila.role,
      expiresAt: fila.expiresAt,
    })),
    paidPlan: pagado,
    grant: {
      plan: space.platformPlan,
      limits: space.platformLimits,
      mode: space.platformOverride ? 'sustituye' : 'suma',
      note: space.platformNote,
      grantedAt: space.platformGrantedAt,
    },
    space: {
      id: space.id,
      name: space.name,
      slug: space.slug,
      plan: effectivePlan(
        pagado,
        space.platformPlan,
        space.platformOverride ? 'sustituye' : 'suma',
      ),
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
 * Deja constancia en la bitácora **del espacio afectado**, no en la de quien
 * actúa.
 *
 * Es el detalle que separa administrar de espiar: quien administre ese espacio
 * abre su auditoría y ve que alguien de plataforma tocó algo suyo, con qué
 * acción y cuándo. Enterarse por otro lado, o no enterarse, sería peor.
 *
 * Toda función de este módulo que escriba pasa por aquí. Hay una prueba que lo
 * comprueba, para que añadir una operación nueva sin registro no pase colada.
 */
async function registrarEnEspacio(
  tenantId: string,
  adminUserId: string,
  entrada: {
    action: string;
    entity: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    tenantId,
    userId: adminUserId,
    action: entrada.action,
    entity: entrada.entity,
    entityId: entrada.entityId,
    metadata: { ...entrada.metadata, porPlataforma: true },
  });
}

/**
 * Contexto del espacio ajeno, para poder reutilizar el repositorio de siempre.
 *
 * Podría escribir en `tenant_members` directamente, y sería un error: el
 * repositorio de membresías es el que sabe que **un espacio nunca puede quedarse
 * sin propietaria**. Un espacio sin `owner` no lo administra nadie —no se puede
 * invitar, ni verificar, ni cancelar la suscripción— y es un estado del que no
 * se sale sin tocar la base a mano.
 *
 * Copiar esa regla aquí significaría tener dos copias que con el tiempo dejarían
 * de decir lo mismo. Mejor entrar por la misma puerta con las llaves puestas.
 */
function contextoDe(tenantId: string, adminUserId: string): TenantContext {
  return { tenantId, userId: adminUserId, role: 'owner' };
}

/**
 * Comprueba que esa persona esté de verdad en ese espacio.
 *
 * Sin esto, cambiar el rol de alguien que no es miembro no daría error: el
 * `update` no encontraría ninguna fila, la pantalla diría «rol actualizado» y
 * en la bitácora quedaría escrito un cambio que nunca ocurrió. Un registro que
 * miente es peor que no tenerlo.
 */
async function exigirMiembro(tenantId: string, userId: string): Promise<void> {
  const [fila] = await db
    .select({ userId: tenantMembers.userId })
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)),
    )
    .limit(1);

  if (!fila) throw new Error('Esa persona no está en este espacio.');
}

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

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: 'plataforma.verificacion',
    entity: 'professional',
    entityId: professionalId,
    metadata: { status },
  });
}

// --- Miembros y roles, en cualquier espacio ----------------------------------

/**
 * Cambia el rol de alguien en cualquier espacio.
 *
 * Hasta ahora esto solo se podía hacer desde dentro del propio espacio, y eso
 * dejaba un caso sin salida: una organización cuya única administradora se va,
 * o pierde el acceso a su cuenta, se quedaba sin nadie que pudiera nombrar a
 * otra. Desde aquí se resuelve en un minuto.
 *
 * Se apoya en el repositorio de siempre, así que sigue valiendo la regla de que
 * un espacio nunca se queda sin propietaria.
 */
export async function setMemberRoleAnywhere(
  tenantId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const admin = await assertSuperadmin('setMemberRoleAnywhere');

  await exigirMiembro(tenantId, userId);
  await changeMemberRole(contextoDe(tenantId, admin.ctx.userId), userId, role);

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: 'plataforma.rol',
    entity: 'tenant_member',
    entityId: userId,
    metadata: { role },
  });
}

/**
 * Saca a alguien de cualquier espacio.
 *
 * Deja de tener acceso a lo compartido de ese espacio. **Lo suyo no se borra**:
 * sus conversaciones, sus documentos y sus bitácoras siguen donde estaban, y
 * esta operación ni los toca ni los muestra.
 */
export async function removeMemberAnywhere(
  tenantId: string,
  userId: string,
): Promise<void> {
  const admin = await assertSuperadmin('removeMemberAnywhere');

  await exigirMiembro(tenantId, userId);
  await removeMember(contextoDe(tenantId, admin.ctx.userId), userId);

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: 'plataforma.miembro_retirado',
    entity: 'tenant_member',
    entityId: userId,
  });
}

// --- Invitaciones a cualquier espacio ----------------------------------------

/**
 * Invita a alguien a un espacio ajeno.
 *
 * Cierra el otro extremo del caso que resolvía `setMemberRoleAnywhere`: en un
 * espacio que se quedó sin nadie que administre no basta con poder cambiar
 * roles, porque a veces no queda **nadie dentro** a quien ascender. Aquí se
 * mete a la persona nueva y luego se le da el rol que toque.
 *
 * Se apoya en `inviteToTenant`, así que la invitación caduca igual, cuenta
 * asiento igual y llega por correo igual. Lo único distinto es quién la manda.
 *
 * `owner` no se invita por correo, tampoco desde plataforma: es demasiado poder
 * viajando en un enlace que puede reenviarse. Se invita como `admin` y se le
 * sube el rol con `setMemberRoleAnywhere`, que ya existe y queda registrado.
 */
export async function inviteToSpaceAnywhere(
  tenantId: string,
  input: { email: string; role: MemberRole },
): Promise<{ invitationId: string; email: string; token: string }> {
  const admin = await assertSuperadmin('inviteToSpaceAnywhere');

  const { invitation, token } = await inviteToTenant(
    contextoDe(tenantId, admin.ctx.userId),
    input,
  );

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: 'plataforma.invitacion',
    entity: 'tenant_invitation',
    entityId: invitation.id,
    metadata: { role: invitation.role },
  });

  return { invitationId: invitation.id, email: invitation.email, token };
}

export async function cancelInvitationAnywhere(
  tenantId: string,
  invitationId: string,
): Promise<void> {
  const admin = await assertSuperadmin('cancelInvitationAnywhere');

  await cancelInvitation(contextoDe(tenantId, admin.ctx.userId), invitationId);

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: 'plataforma.invitacion_cancelada',
    entity: 'tenant_invitation',
    entityId: invitationId,
  });
}

// --- Plan y límites de un espacio --------------------------------------------

export type PlatformGrant = {
  plan: Plan | null;
  limits: Partial<PlanLimits> | null;
  /** `suma` regala capacidad; `sustituye` también puede bajarla. */
  mode: GrantMode;
  note: string | null;
  grantedAt: Date | null;
};

/**
 * Concede —o retira— plan y límites a un espacio, sin pasar por Stripe.
 *
 * Es lo que hacía falta para poder decir «esta asociación no paga» sin montar
 * un cobro de cero pesos, y para subirle los asientos a una escuela durante un
 * curso escolar sin que nadie tenga que meter una tarjeta.
 *
 * **La concesión solo suma.** Se aplica cuando es más generosa que lo que el
 * espacio ya paga, nunca cuando es menor: un descuido aquí no puede quitarle a
 * nadie lo que está pagando. Para bajar de plan se cambia la suscripción en
 * Stripe, que es donde vive el dinero. Para retirar el regalo, se pasa `null` y
 * el espacio vuelve exactamente a lo suyo.
 *
 * Los números se saneen antes de guardarse: un límite negativo, o uno absurdo
 * fruto de un dedazo, guardado tal cual serían un problema difícil de ver desde
 * la pantalla de alguien que de repente no puede escribir.
 */
export async function setPlatformGrant(
  tenantId: string,
  grant: {
    plan: Plan | null;
    limits: Partial<PlanLimits> | null;
    mode: GrantMode;
    note: string | null;
  },
): Promise<void> {
  const admin = await assertSuperadmin('setPlatformGrant');

  const [space] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!space) throw new Error('No encontramos ese espacio.');

  const limits = sanitizeGrantedLimits(grant.limits);
  const vacia = grant.plan === null && limits === null;

  await db
    .update(tenants)
    .set({
      platformPlan: grant.plan,
      platformLimits: limits,
      // Sin nada concedido, el modo no significa nada: se apaga con lo demás.
      platformOverride: vacia ? false : grant.mode === 'sustituye',
      platformNote: vacia ? null : (grant.note?.trim().slice(0, 500) || null),
      platformGrantedAt: vacia ? null : new Date(),
      platformGrantedBy: vacia ? null : admin.ctx.userId,
    })
    .where(eq(tenants.id, tenantId));

  await registrarEnEspacio(tenantId, admin.ctx.userId, {
    action: vacia ? 'plataforma.concesion_retirada' : 'plataforma.concesion',
    entity: 'tenant',
    entityId: tenantId,
    metadata: { plan: grant.plan, limits, modo: vacia ? null : grant.mode },
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
