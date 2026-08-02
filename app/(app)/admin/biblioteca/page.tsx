import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAdminContext } from '@/lib/admin/access';
import { listResourcesInScope } from '@/lib/admin/library';
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

/**
 * Curaduría de la biblioteca.
 *
 * Ya no es solo del superadmin. Quien administra un espacio publica **para su
 * espacio**; solo el superadmin publica para todo CIAN. La Fase 6 pedía que un
 * espacio pudiera cargar recursos propios y eso existía en el modelo de datos y
 * en las lecturas sin ninguna pantalla que lo escribiera.
 */
export default async function AdminBibliotecaPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const [tenantResources, globalResources] = await Promise.all([
    listResourcesInScope(admin.ctx.tenantId),
    admin.isSuperadmin ? listResourcesInScope(null) : Promise.resolve([]),
  ]);

  const serialize = (resources: Awaited<typeof tenantResources>) =>
    resources.map((resource) => ({
      slug: resource.slug,
      title: resource.title,
      category: resource.category,
      tags: resource.tags,
      source: resource.source,
      content: resource.content,
      updatedAt: resource.updatedAt.toISOString(),
    }));

  return (
    <LibraryAdmin
      tenantResources={serialize(tenantResources)}
      globalResources={serialize(globalResources)}
      canPublishGlobal={admin.isSuperadmin}
      repoSlugs={slugsFromRepo()}
    />
  );
}
