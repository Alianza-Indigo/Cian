# Decisiones de arquitectura

Registro de decisiones con fecha. Una decisión entra aquí cuando condiciona
fases posteriores o cuando alguien podría revertirla sin saber por qué se tomó.

---

## 2026-08-01 — Fase 0

### Región única: `iad1`

Regla 3.4 del PRD. Postgres, KV, Blob y las funciones viven en Washington D.C.
(EE. UU. Este). Queda fijado en `vercel.json` (`regions: ["iad1"]`) y debe
coincidir con la región del store de Postgres al crearlo.

Se eligió `iad1` por ser la región por defecto de Vercel con disponibilidad
completa de Postgres, KV y Blob. **No se cambia en fases posteriores**: mover
la base implica migrar datos y perder la colocación con las funciones.

### El guardián de tenant es un módulo puro

`lib/tenant/guard.ts` no importa base de datos, ni Next, ni sesión. Toda función
de repositorio lo invoca como primera línea.

Se hizo así para que las pruebas del criterio «los repositorios fallan sin
`tenantId`» corran sin infraestructura, y para que no exista ninguna ruta por la
que una consulta llegue a Postgres sin haber pasado por la validación.

### El middleware no autoriza, solo filtra

`middleware.ts` corre en el runtime Edge y no tiene base de datos. Comprueba que
exista cookie de sesión y normaliza el tenant solicitado en `x-cian-tenant`.

**La pertenencia al tenant se verifica en `lib/tenant/context.ts`, contra la base
de datos, en cada petición.** Una cookie manipulada no abre el espacio de nadie:
si no hay membresía activa, se cae al espacio propio de la persona.

El middleware borra cualquier `x-cian-tenant` entrante antes de fijar el suyo,
para que el encabezado nunca pueda venir del cliente.

### El alta de una persona pasa por nuestro `createUser`

En vez de colgarse de un evento posterior de Auth.js, se reemplaza el
`createUser` del adaptador de Drizzle (`lib/auth/provisioning.ts`).

Motivo: el criterio de aceptación exige que usuario, tenant personal y membresía
`owner` se creen **en una transacción**. Con un evento posterior, un fallo a
mitad dejaría usuarios sin espacio, que es el peor estado posible: la persona
entra y no tiene a dónde llegar.

### Sesiones en base de datos, no JWT

`session.strategy = 'database'`. Cuesta una consulta por petición, pero en la
Fase 8 el equipo de apoyo necesita que **revocar un acceso surta efecto
inmediato, incluso con sesión abierta**. Con JWT habría que esperar a que expire
el token.

### Sin Radix UI: primitivas nativas

shadcn/ui normalmente se apoya en `@radix-ui/*`, que no está en la lista de
dependencias autorizadas del PRD.

Los componentes se escribieron sobre elementos nativos: `<button>`, `<fieldset>`
con `<input type="radio">`, `<input type="checkbox" role="switch">`. Para una
plataforma dirigida a personas neurodivergentes esto es una ventaja, no un
apaño: el recorrido con flechas, el anuncio «opción 2 de 3» en lectores de
pantalla y el funcionamiento sin JavaScript vienen de fábrica.

`components.json` queda configurado, así que `shadcn add` sigue disponible si en
alguna fase se decide traer un componente concreto.

### Tailwind CSS v4

Se usa v4 con `@tailwindcss/postcss` y configuración en CSS (`@theme`), sin
`tailwind.config.js`. `@tailwindcss/postcss` es el complemento obligatorio del
propio Tailwind, no una dependencia adicional de terceros.

El modo oscuro se activa por atributo (`[data-theme='dark']`), no por clase ni
por media query, porque **la preferencia guardada de la persona debe ganarle a
la del sistema operativo**.

### Los valores de las preferencias viven fuera del esquema

`lib/preferences/types.ts` es un módulo sin dependencias que define densidades,
temas y niveles de detalle. El esquema de Drizzle construye sus `pgEnum` a
partir de esas listas.

La dirección de la dependencia importa: cuando el módulo compartido importaba
del repositorio, el paquete del cliente crecía de 2.9 kB a 69 kB porque
arrastraba Drizzle y el driver de Postgres al navegador.

### El espejo de preferencias en cookie no es fuente de verdad

La verdad vive en `user_preferences` (Postgres). La cookie `cian_prefs` existe
solo para pintar el primer render y para las pantallas sin sesión. Si ambas
discrepan, gana la base y el espejo se reescribe.

Esto respeta la prohibición del PRD sobre `localStorage` como fuente de verdad,
y la razón de fondo es la misma: la configuración de accesibilidad debe seguir a
la persona entre dispositivos, no quedarse en el navegador donde la eligió.

### El service worker no cachea datos

Solo precarga la pantalla sin conexión, el manifiesto y los iconos. Las rutas
`/api/` quedan explícitamente fuera.

Servir datos de salud viejos —o peor, de otra sesión— sería más dañino que no
mostrar nada.

### Los iconos PNG se generan desde el repositorio

`scripts/generate-icons.mjs` escribe los PNG a mano con `node:zlib`. Las
prohibiciones del PRD descartan dependencias con binarios nativos (`sharp`,
`canvas`), y la marca es lo bastante simple para dibujarla por píxel.

### Pruebas con el ejecutor de Node, sin framework

Node 22 entiende TypeScript y trae `node:test`. `tests/resolve-hooks.mjs` añade
el alias `@/` y las extensiones implícitas mediante los ganchos nativos de
`node:module`.

Evita sumar `vitest` y su cadena de dependencias, que el PRD habría exigido
proponer antes de instalar.
