# NOTES

Hallazgos, deuda técnica y pendientes por fase. Lo que aparece aquí no se
resuelve en la fase en curso: se anota y se sigue (regla de oro del PRD).

---

## Fase 1 — Chat y orquestador

### Criterios que no se pudieron verificar en esta sesión

El entorno de trabajo no tiene clave del modelo ni salida de red hacia el
proveedor, así que todo lo que exige una respuesta real del modelo queda
**implementado pero sin verificar en ejecución**:

1. **Una conversación de 40 mensajes se mantiene coherente.** El recorte está
   probado con 316 pruebas —incluido el caso de 40 mensajes— pero contra la
   función, no contra el modelo.
2. **El streaming empieza en menos de 2 segundos.** Depende de la latencia de
   Flash-Lite y de la región; hay que medirlo desplegado.
3. **El modelo llama `saveMemory`** ante «recuerda que le molestan los ruidos
   fuertes». La tool está registrada y descrita; que Flash-Lite la dispare de
   forma fiable es justo lo que había que vigilar (ver DECISIONS.md).
4. **`usage_events` registra cada intercambio.** El código está en el `onFinish`
   del `streamText`, despachado con `waitUntil`.

Lo que sí quedó verificado en ejecución: `/api/chat` responde **401 en JSON**
sin sesión (no una redirección a HTML, que al cliente le llegaría ilegible), el
build es limpio y las 316 pruebas pasan.

### Deuda técnica y decisiones aplazadas

- **`@vercel/kv` está marcado como obsoleto** por su autor. Funciona, y el PRD
  fija Vercel KV en el stack, así que se instaló igual. Todo el acceso pasa por
  `lib/kv.ts`, de modo que migrar a `@upstash/redis` sea cambiar un archivo.
  Conviene proponerlo antes de que más fases dependan de la caché.

- **Sin KV configurado, no hay límite de uso.** `checkChatRateLimit` deja pasar
  cuando KV no responde. Es deliberado —preferimos gastar de más antes que
  dejar sin asistente a alguien que lo necesita— pero significa que **el
  criterio de rate limit no se cumple hasta conectar un store de Redis**.

- **Las respuestas se muestran como texto plano, sin Markdown.** Convertir la
  salida del modelo en HTML sin un sanitizador revisado es una vía de inyección.
  Es una limitación visible —las listas y negritas salen con sus asteriscos— y
  merece resolverse pronto, con una biblioteca elegida a conciencia.

- **La búsqueda del historial filtra en el cliente** sobre las 100
  conversaciones más recientes que ya se cargaron. Para el volumen de una
  persona alcanza; cuando alguien acumule cientos, hay que mover el filtro al
  servidor. `listConversations` ya acepta `search`, así que el repositorio está
  listo.

- **`maxDuration = 60`** en `app/api/chat/route.ts`. Es el techo del plan Hobby
  de Vercel. Si el proyecto está en Pro, se puede subir; si se sube por encima
  del techo del plan, **el despliegue falla**, no la ejecución.

- **El guardado del mensaje del asistente puede fallar en silencio.** Si la
  escritura falla tras el streaming, la persona ya vio la respuesta pero no
  queda en el historial. Se prefirió eso a interrumpir una conversación en
  curso. Si se vuelve frecuente, hay que reintentar con `waitUntil`.

- **Editar un mensaje borra lo que venía después**, en pantalla y en la base.
  Es lo que evita que el modelo se confunda con intentos fallidos acumulados,
  pero no hay deshacer. Vale la pena avisarlo en la interfaz si alguien se
  queja.

### Para la Fase 2

- `messages.parts` guarda el formato del AI SDK tal cual, así que los adjuntos
  de la Fase 4 y las llamadas a tools entran sin migrar la tabla.
- `buildTools` es el único punto donde se registran capacidades. La Fase 2 añade
  `createDocument` ahí y no toca `app/api/chat/route.ts`.

---

## Fase 0 — Fundación

### Criterios que no se pudieron verificar en esta sesión

El entorno de trabajo no tiene proyecto de Vercel, base de datos ni credenciales
de Google OAuth. Tres criterios quedan **implementados pero sin verificar en
ejecución**, y deben comprobarse al desplegar:

1. **Login con Google crea usuario, tenant personal y membresía `owner` en una
   transacción.** El código está en `lib/auth/provisioning.ts` y sustituye al
   `createUser` del adaptador. Falta ejecutarlo contra Postgres real.
2. **La app se instala como PWA en Android e iOS y abre en modo standalone.**
   El manifiesto, los iconos (192, 512, maskable, apple-touch) y el service
   worker están servidos y responden 200. Falta la prueba en dispositivo.
   Ojo: el service worker solo se registra en `NODE_ENV === 'production'`.
3. **Migraciones aplicadas.** `lib/db/migrations/0000_solid_luke_cage.sql` está
   generada y validada (`drizzle-kit generate` no reporta deriva), pero no
   aplicada: no hay base a la cual aplicarla.

### Pasos para cerrar la fase en Vercel

1. Crear el proyecto en Vercel y el store de Postgres **en la región `iad1`**
   (debe coincidir con `vercel.json`). Conectarlo al proyecto: Vercel inyecta
   `POSTGRES_URL` y dispara un redespliegue.
2. Configurar `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_GOOGLE_ID` y
   `AUTH_GOOGLE_SECRET`. En Google Cloud Console, el URI de redirección
   autorizado es `https://DOMINIO/api/auth/callback/google`.
   Ojo: cambiar variables **no** afecta a un despliegue ya hecho; hay que
   volver a desplegar.
3. Las migraciones y el seed ya no son un paso manual: `pnpm build` corre
   `db:setup` antes de compilar, así que el redespliegue del punto 1 los aplica.
4. Verificar en un teléfono Android y en un iPhone que la app se instala y abre
   en modo standalone.

### Preview comparte base con Producción

Los despliegues de Preview heredan las variables de Producción salvo que se les
asigne un store propio. Hoy eso significa que **un Preview con una migración
nueva la aplicaría sobre la base de producción**, porque `db:setup` corre en
todo build.

Mientras haya un solo entorno no molesta. En cuanto se empiece a usar Preview de
verdad —seguramente al abrir la Fase 1 a más gente— hay que darle su propio
store de Postgres.

### Deuda técnica y decisiones aplazadas

- **Sin ESLint.** `eslint` y `eslint-config-next` no están en la lista de
  dependencias autorizadas. La sección 4.4 solo exige `build` y `typecheck`
  limpios, y ambos lo están. Vale la pena proponerlo antes de la Fase 1: con
  varias personas tocando el código, el linter atrapa cosas que el compilador
  de tipos no ve.

- **Sin caché de prompts en KV.** La regla 3.5 pide cachear en Vercel KV.
  `getActivePrompt()` va directo a Postgres por ahora, porque `@vercel/kv` es
  dependencia de la Fase 1. La firma de la función no cambia cuando se agregue.

- **Selector de espacio de trabajo.** La infraestructura multi-tenant está
  completa (cookie `cian_tenant`, resolución en middleware, verificación de
  membresía), pero no hay interfaz para cambiar de espacio porque en Fase 0 cada
  persona solo tiene el suyo. Cuando la Fase 8 traiga organizaciones con varios
  miembros, hará falta el selector y una server action que fije la cookie.

- **`listMembershipsForUser` no recibe `TenantContext`.** Es la única excepción
  y es deliberada: sirve para *descubrir* a qué tenants pertenece alguien, antes
  de que exista contexto. Filtra siempre por `userId` y estado activo, y no
  acepta otro criterio. Si alguna fase futura necesita algo parecido, conviene
  revisar este patrón antes de replicarlo.

- **Aislamiento entre tenants: verificado por construcción, no por prueba de
  integración.** Las 107 pruebas confirman que ninguna función de repositorio
  se ejecuta sin `tenantId` válido, y todas filtran por él. La prueba de que
  *un usuario del tenant A no lee datos del tenant B por ninguna ruta* necesita
  base de datos con dos tenants sembrados. Es la primera prueba de integración
  que conviene escribir cuando haya entorno de pruebas.

- **Reintento de slug en el aprovisionamiento.** `createUserWithPersonalTenant`
  reintenta hasta 5 veces si el slug ya existe. Con sufijo aleatorio de 6
  caracteres sobre un alfabeto de 28 la colisión es improbable, pero el índice
  único es lo que garantiza la corrección: el reintento solo evita el error
  visible. Si alguna vez se agotan los intentos, la transacción falla y la
  persona ve un error de acceso.

### Notas de accesibilidad

- El zoom del navegador queda habilitado a propósito (`maximumScale: 5`,
  `userScalable: true`). Bloquearlo es una barrera de accesibilidad frecuente.
- La escala tipográfica se aplica en `html { font-size }` y todo el espaciado
  usa `rem`, así que el texto crece junto con sus contenedores. Se probó a 150%
  sin desbordes en el shell ni en la pantalla de accesibilidad.
- El indigo institucional `#1B1F5A` no alcanza contraste AA como color de texto
  sobre fondo oscuro. En modo oscuro se usa `#A9B0E8` para texto y acentos, y el
  indigo queda como color de fondo. Es una desviación consciente de la regla
  4.2, tomada para no incumplir la 3.7.
- Falta una revisión con lector de pantalla real (VoiceOver / TalkBack). La
  estructura de encabezados, `aria-current`, `role="status"` y el enlace de
  salto están puestos, pero no se han escuchado.

### Para la Fase 1

- `user_preferences.detail_level` ya se guarda y se puede configurar; el prompt
  del orquestador (`prompts/seed/orchestrator.system.md`) ya lo menciona. Solo
  falta inyectarlo en el contexto del modelo.
- `prompts/seed/safety.disclaimer.md` está sembrado y sin usar todavía. El
  descargo se muestra hoy como texto fijo en el shell y en el login.
- El registro de tools (`buildTools`) y la carpeta `lib/ai/` todavía no existen:
  la Fase 0 se entrega sin IA, tal como pide el PRD.
