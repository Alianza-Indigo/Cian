/**
 * Middleware de acceso y resolucion de tenant.
 *
 * Hace dos cosas y ninguna mas:
 *   1. Corta el paso a las rutas autenticadas cuando no hay cookie de sesion.
 *   2. Normaliza el tenant solicitado y lo propaga en `x-cian-tenant`.
 *
 * Aqui NO se decide si la persona pertenece al tenant: eso exige base de datos
 * y se hace en `lib/tenant/context.ts`. El middleware solo evita viajes
 * inutiles y limpia la entrada. Tratar su salida como una autorizacion seria
 * un error de seguridad.
 */
import { NextResponse, type NextRequest } from 'next/server';

const TENANT_COOKIE = 'cian_tenant';
const TENANT_HEADER = 'x-cian-tenant';

/** Auth.js usa el prefijo `__Secure-` cuando la cookie viaja por HTTPS. */
const SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_PATHS = ['/login', '/acceso-denegado'];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!isPublic && !hasSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('siguiente', `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Quien ya inicio sesion no tiene por que ver la pantalla de acceso.
  if (pathname === '/login' && hasSessionCookie(request)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  // Se descarta cualquier valor entrante: el encabezado lo fija el middleware,
  // nunca el cliente.
  requestHeaders.delete(TENANT_HEADER);

  const requestedTenant = request.cookies.get(TENANT_COOKIE)?.value;
  if (requestedTenant && UUID_PATTERN.test(requestedTenant)) {
    requestHeaders.set(TENANT_HEADER, requestedTenant);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Todo menos: rutas de Auth.js, archivos internos de Next y los recursos
     * de la PWA. Estos ultimos deben servirse sin sesion: si el middleware
     * redirigiera `offline.html` al login, el service worker guardaria la
     * pantalla de acceso como pagina sin conexion.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|offline\\.html|icons/).*)',
  ],
};
