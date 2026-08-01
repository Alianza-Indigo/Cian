/**
 * Aprovisionamiento de una persona nueva.
 *
 * Criterio de aceptacion de Fase 0: "Login con Google crea usuario, tenant
 * personal y membresia owner en una transaccion". Por eso esta funcion
 * reemplaza al `createUser` del adaptador de Drizzle en lugar de colgarse de
 * un evento posterior: si algo falla a medias, no queda un usuario huerfano
 * sin espacio propio.
 */
import { customAlphabet } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { AdapterUser } from 'next-auth/adapters';
import { getDb } from '../db/client';
import { users } from '../db/schema/auth';
import { tenantMembers, tenants } from '../db/schema/tenants';
import { userPreferences } from '../db/schema/preferences';
import { auditLog } from '../db/schema/audit';

/** Sin vocales ni caracteres ambiguos: los slugs se leen y se dictan. */
const randomSuffix = customAlphabet('23456789bcdfghjkmnpqrstvwxyz', 6);

function slugifyEmailLocalPart(email: string): string {
  const localPart = email.split('@')[0] ?? 'persona';
  const cleaned = localPart
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return cleaned.length > 0 ? cleaned : 'persona';
}

/** Nombre por defecto del espacio personal, en espanol de Mexico. */
function personalTenantName(user: { name?: string | null; email: string }): string {
  const displayName = user.name?.trim();
  if (displayName && displayName.length > 0) {
    return `Espacio de ${displayName}`;
  }
  return `Espacio de ${user.email.split('@')[0] ?? 'la persona'}`;
}

/**
 * Crea usuario + tenant personal + membresia `owner` + preferencias iniciales
 * en una sola transaccion.
 */
export async function createUserWithPersonalTenant(
  data: Omit<AdapterUser, 'id'> & { id?: string },
): Promise<AdapterUser> {
  const db = getDb();
  const email = data.email;

  if (!email) {
    throw new Error('No se puede crear una cuenta sin correo electronico.');
  }

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        id: data.id ?? crypto.randomUUID(),
        name: data.name ?? null,
        email,
        emailVerified: data.emailVerified ?? null,
        image: data.image ?? null,
      })
      .returning();

    if (!user) {
      throw new Error('No se pudo crear la cuenta.');
    }

    // El slug debe ser unico a nivel plataforma. El sufijo aleatorio hace que
    // la colision sea improbable; el reintento la vuelve imposible de observar.
    let slug = `${slugifyEmailLocalPart(email)}-${randomSuffix()}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      if (existing.length === 0) break;
      slug = `${slugifyEmailLocalPart(email)}-${randomSuffix()}`;
    }

    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug,
        name: personalTenantName({ name: user.name, email }),
        plan: 'free',
        settings: { timezone: 'America/Mexico_City' },
      })
      .returning();

    if (!tenant) {
      throw new Error('No se pudo crear el espacio personal.');
    }

    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
    });

    await tx.insert(userPreferences).values({
      tenantId: tenant.id,
      userId: user.id,
    });

    await tx.insert(auditLog).values({
      tenantId: tenant.id,
      userId: user.id,
      action: 'tenant.provisioned',
      entity: 'tenant',
      entityId: tenant.id,
      metadata: { slug: tenant.slug, plan: tenant.plan },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    } satisfies AdapterUser;
  });
}
