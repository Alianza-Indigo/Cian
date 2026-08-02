'use server';

/**
 * Acciones de administración de plataforma.
 *
 * Aparte de `./actions` porque estas cruzan espacios: cada una comprueba que
 * quien llama sea superadmin y deja constancia en el espacio afectado.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  removeMemberAnywhere,
  setMemberRoleAnywhere,
  setPlatformGrant,
  setVerificationAnywhere,
} from './platform';
import { VERIFICATION_STATUSES } from '../consultorio/types';
import { MEMBER_ROLES } from '../tenant/guard';
import { PLANS } from '../billing/types';

export type PlatformActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const verifySchema = z.object({
  tenantId: z.uuid(),
  professionalId: z.uuid(),
  status: z.enum(VERIFICATION_STATUSES),
});

/**
 * Verifica a un profesional de cualquier espacio.
 *
 * Es la verificación de plataforma que faltaba: un espacio pequeño puede no
 * tener a nadie con criterio para revisar una cédula, y que CIAN pueda hacerlo
 * es lo que permite responder por quién atiende dentro de la plataforma.
 *
 * Sigue sin poder verificarse a quien no ha aceptado los términos, tampoco
 * desde aquí: hacerlo sería firmar por él.
 */
export async function verifyFromPlatformAction(
  input: unknown,
): Promise<PlatformActionResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    await setVerificationAnywhere(
      parsed.data.tenantId,
      parsed.data.professionalId,
      parsed.data.status,
    );

    revalidatePath(`/admin/espacios/${parsed.data.tenantId}`);
    return { ok: true, message: 'Verificación actualizada y registrada.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos cambiarla.',
    };
  }
}

// --- Miembros y roles ---------------------------------------------------------

const roleSchema = z.object({
  tenantId: z.uuid(),
  userId: z.string().min(1).max(255),
  role: z.enum(MEMBER_ROLES),
});

/**
 * Cambia el rol de alguien en cualquier espacio.
 *
 * Resuelve el caso sin salida de antes: una organización cuya única
 * administradora se va, o pierde su cuenta, se quedaba sin nadie que pudiera
 * nombrar a otra.
 */
export async function setRoleFromPlatformAction(
  input: unknown,
): Promise<PlatformActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    await setMemberRoleAnywhere(
      parsed.data.tenantId,
      parsed.data.userId,
      parsed.data.role,
    );

    revalidatePath(`/admin/espacios/${parsed.data.tenantId}`);
    return { ok: true, message: 'Rol actualizado y registrado en ese espacio.' };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'No pudimos cambiar el rol.',
    };
  }
}

const removeSchema = z.object({
  tenantId: z.uuid(),
  userId: z.string().min(1).max(255),
});

export async function removeMemberFromPlatformAction(
  input: unknown,
): Promise<PlatformActionResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    await removeMemberAnywhere(parsed.data.tenantId, parsed.data.userId);

    revalidatePath(`/admin/espacios/${parsed.data.tenantId}`);
    return {
      ok: true,
      message: 'Ya no forma parte de ese espacio. Sus datos propios no se borran.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos retirarle.',
    };
  }
}

// --- Concesión de plan y límites ----------------------------------------------

/**
 * Un límite concedido.
 *
 * Cadena vacía es «no tocar este», y `'sin-limite'` es exactamente eso. Viene
 * de un formulario, donde no existe la diferencia entre `undefined` y `null` si
 * no se nombra.
 */
const limiteSchema = z.union([
  z.literal(''),
  z.literal('sin-limite'),
  z.coerce.number().int().min(0),
]);

const grantSchema = z.object({
  tenantId: z.uuid(),
  plan: z.union([z.literal(''), z.enum(PLANS)]),
  note: z.string().max(500).optional(),
  mensajes: limiteSchema.optional(),
  documentos: limiteSchema.optional(),
  almacenamiento: limiteSchema.optional(),
  equipo_de_apoyo: limiteSchema.optional(),
  asientos: z.union([z.literal(''), z.coerce.number().int().min(1)]).optional(),
});

function traducir(
  valor: '' | 'sin-limite' | number | undefined,
): number | null | undefined {
  if (valor === undefined || valor === '') return undefined;
  return valor === 'sin-limite' ? null : valor;
}

/**
 * Concede o retira plan y límites a un espacio, sin pasar por Stripe.
 *
 * Dejar el plan vacío y todos los límites vacíos retira la concesión entera: el
 * espacio vuelve exactamente a lo que paga.
 */
export async function setGrantFromPlatformAction(
  input: unknown,
): Promise<PlatformActionResult> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los valores.' };

  const { tenantId, plan, note, asientos, ...resto } = parsed.data;

  const limits = {
    mensajes: traducir(resto.mensajes),
    documentos: traducir(resto.documentos),
    almacenamiento: traducir(resto.almacenamiento),
    equipo_de_apoyo: traducir(resto.equipo_de_apoyo),
    asientos: asientos === '' || asientos === undefined ? undefined : asientos,
  };

  // Sin claves definidas no hay concesión de límites: `null`, no un objeto
  // vacío, para que retirar todo deje la fila realmente limpia.
  const definidos = Object.fromEntries(
    Object.entries(limits).filter(([, valor]) => valor !== undefined),
  );

  try {
    await setPlatformGrant(tenantId, {
      plan: plan === '' ? null : plan,
      limits: Object.keys(definidos).length === 0 ? null : definidos,
      note: note ?? null,
    });

    revalidatePath(`/admin/espacios/${tenantId}`);
    revalidatePath('/admin/espacios');

    return {
      ok: true,
      message:
        plan === '' && Object.keys(definidos).length === 0
          ? 'Concesión retirada. Ese espacio vuelve a lo que paga.'
          : 'Concesión guardada y registrada en ese espacio.',
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'No pudimos guardar la concesión.',
    };
  }
}
