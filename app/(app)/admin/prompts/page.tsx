import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { assertSuperadmin } from '@/lib/admin/access';
import { listPromptKeys, listPromptVersions } from '@/lib/db/repositories/prompts';
import { PromptEditor } from './prompt-editor';

export const metadata: Metadata = { title: 'Prompts' };
export const dynamic = 'force-dynamic';

export default async function AdminPromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ clave?: string }>;
}) {
  let admin;
  try {
    admin = await assertSuperadmin('adminPrompts');
  } catch {
    notFound();
  }

  const params = await searchParams;
  const keys = await listPromptKeys(admin.ctx);
  const selected = params.clave ?? keys[0]?.key ?? null;

  const versions = selected
    ? await listPromptVersions(admin.ctx, selected)
    : [];

  return (
    <PromptEditor
      keys={keys}
      selected={selected}
      versions={versions.map((row) => ({
        version: row.version,
        content: row.content,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
