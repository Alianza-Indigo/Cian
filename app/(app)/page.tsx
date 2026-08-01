import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { getCurrentTenant } from '@/lib/db/repositories/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function InicioPage() {
  const ctx = await requireTenantContext();
  const tenant = await getCurrentTenant(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {tenant?.name ?? 'Tu espacio'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Aquí vivirá la conversación con CIAN. Por ahora está lista la base:
          tu cuenta, tu espacio propio y tus preferencias de accesibilidad.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ajusta CIAN a como te acomoda</CardTitle>
          <CardDescription>
            Puedes cambiar el tema, la densidad de la información, el tamaño del
            texto y el movimiento de la interfaz. Se guarda en tu cuenta y te
            acompaña en cualquier dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/configuracion/accesibilidad"
            className="inline-flex items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            style={{ minHeight: 'var(--cian-control-height)', paddingBlock: '0.5rem' }}
          >
            Abrir accesibilidad
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué sigue</CardTitle>
          <CardDescription>
            La conversación es la puerta de entrada de CIAN. Cuando esté lista,
            no tendrás que elegir módulos: escribes lo que necesitas y CIAN se
            encarga del resto.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
