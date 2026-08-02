import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminContext } from '@/lib/admin/access';
import { listModelConfigs } from '@/lib/db/repositories/billing';
import { fallbackModelId } from '@/lib/ai/resolve-model';
import { MODEL_PURPOSES } from '@/lib/billing/types';
import { ModelBoard } from './model-board';

export const metadata: Metadata = { title: 'Modelos' };
export const dynamic = 'force-dynamic';

export default async function AdminModelosPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const configs = await listModelConfigs(admin.ctx);

  return (
    <ModelBoard
      isSuperadmin={admin.isSuperadmin}
      configs={configs.map((config) => ({
        id: config.id,
        purpose: config.purpose,
        provider: config.provider,
        model: config.model,
        active: config.active,
        isGlobal: config.tenantId === null,
      }))}
      fallbacks={Object.fromEntries(
        MODEL_PURPOSES.map((purpose) => [purpose, fallbackModelId(purpose)]),
      )}
    />
  );
}
