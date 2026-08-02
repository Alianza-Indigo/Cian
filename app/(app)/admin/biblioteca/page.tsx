import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertSuperadmin } from '@/lib/admin/access';
import { listGlobalResources } from '@/lib/admin/library';
import { LibraryAdmin } from './library-admin';

export const metadata: Metadata = { title: 'Biblioteca' };
export const dynamic = 'force-dynamic';

/** Slugs que vienen de archivos del repositorio y se reindexan al desplegar. */
function slugsFromRepo(): string[] {
  try {
    return readdirSync(join(process.cwd(), 'content', 'library'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

export default async function AdminBibliotecaPage() {
  try {
    await assertSuperadmin('adminBiblioteca');
  } catch {
    notFound();
  }

  const resources = await listGlobalResources();

  return (
    <LibraryAdmin
      resources={resources.map((resource) => ({
        slug: resource.slug,
        title: resource.title,
        category: resource.category,
        tags: resource.tags,
        source: resource.source,
        content: resource.content,
        updatedAt: resource.updatedAt.toISOString(),
      }))}
      repoSlugs={slugsFromRepo()}
    />
  );
}
