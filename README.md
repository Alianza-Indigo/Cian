# CIAN — Centro Integral de Apoyo a la Neurodivergencia

Progressive Web App de **Alianza Índigo Neurodivergente A.C.** que reúne
herramientas, recursos y acompañamiento para personas neurodivergentes, sus
familias, cuidadores, docentes, acompañantes y profesionales.

> La tecnología se adapta a la persona, no la persona a la tecnología.

CIAN **no sustituye** atención médica, psicológica, terapéutica ni legal. No
diagnostica, no prescribe y no es un servicio de emergencia.

## Estado

**Fase 4 — Adjuntos y voz.** Entrada y salida multimodal: se pueden adjuntar
documentos, imágenes y audio a la conversación, dictar por voz y escuchar las
respuestas. Se suma a la conversación de la Fase 1, los documentos de la Fase 2
y los planes y rutinas de la Fase 3. Sin recordatorios ni videollamada: eso
llega en las fases siguientes.

El plan completo está en `CIAN_PRD_v1.md`. Se entrega **una fase por sesión** y
no se avanza a la siguiente sin cerrar la anterior.

## Stack

Next.js 15 (App Router) · TypeScript estricto · React 19 · Tailwind CSS v4 ·
Drizzle ORM sobre Vercel Postgres · Auth.js v5 con Google OAuth · todo en
Vercel, región `iad1`.

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local     # llenar POSTGRES_URL, AUTH_SECRET y las de Google
pnpm db:setup                  # aplica migraciones y carga los prompts
pnpm dev
```

`pnpm build` ejecuta `db:setup` antes de compilar, así que **cada despliegue
deja la base al día por sí solo**. Si no hay `POSTGRES_URL`, el paso avisa y se
hace a un lado en vez de romper el build.

El service worker solo se registra en producción, así que la instalación como
PWA se prueba con `pnpm build && pnpm start`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compilación de producción |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Pruebas de aislamiento multi-tenant |
| `pnpm db:generate` | Genera migraciones desde el esquema |
| `pnpm db:setup` | Aplica migraciones y carga los prompts (corre solo en cada build) |
| `node scripts/generate-icons.mjs` | Regenera los iconos de la PWA |

## Cómo está organizado

```
app/
  (auth)/login/                pantalla de acceso
  (app)/                       rutas autenticadas, con shell
    chat/[id]/                 una conversación
    planes/[id]/               plan con objetivos y seguimiento
    rutinas/[id]/secuencia/    la rutina paso a paso
    documentos/                biblioteca de documentos
    memorias/                  lo que CIAN recuerda de ti
    configuracion/accesibilidad/
  api/auth/[...nextauth]/
  api/chat/                    el orquestador
  api/documentos/[id]/         descarga acotada por tenant
  api/adjuntos/                subida y entrega de adjuntos
components/
  ui/                          primitivas sobre elementos nativos
  chat/  shell/  brand/  pwa/
lib/
  db/schema/                   un archivo por dominio
  db/repositories/             acceso a datos, siempre con TenantContext
  db/migrations/
  ai/                          modelo, prompts, tools, recorte de contexto
    tools/                     una carpeta por módulo
  documents/                   generadores de PDF, DOCX y texto
  plans/                       planes, rutinas y su exportación
  attachments/                 validación, extracción y resolución
  tenant/                      guardián y resolución de tenant
  auth/                        Auth.js y aprovisionamiento
  preferences/                 accesibilidad y presentación
prompts/seed/                  prompts versionados que se cargan a la base
docs/                          NOTES.md y DECISIONS.md
tests/
```

## Reglas que no se negocian

- **Multi-tenant desde la primera migración.** Toda tabla con datos de personas
  lleva `tenant_id NOT NULL` indexado. Ninguna consulta toca la base fuera de
  `lib/db/repositories/`, y toda función de repositorio recibe y valida un
  `TenantContext`.
- **Los prompts viven en la base**, no en el código, versionados por `key`.
- **Accesibilidad como criterio de aceptación**, no como mejora posterior:
  teclado completo, foco visible, contraste AA, movimiento reducido respetado,
  densidad y tamaño de texto configurables.
- **Ningún dato clínico** en registros, telemetría ni mensajes de error.

Los detalles y el porqué de cada decisión están en `docs/DECISIONS.md`.
