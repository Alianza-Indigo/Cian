# CIAN — Centro Integral de Apoyo a la Neurodivergencia
## Product Requirements Document · v1.0
**Responsable:** Alianza Índigo Neurodivergente A.C.
**Destinatario:** Claude Code
**Modo de entrega:** una fase por sesión. No avanzar a la siguiente fase sin cerrar la anterior.

---

# 0. CÓMO USAR ESTE DOCUMENTO

Este PRD está dividido en **11 fases secuenciales**. Cada fase es autocontenida: tiene objetivo, alcance cerrado, esquema de datos, criterios de aceptación y una lista explícita de lo que **no** se debe construir todavía.

**Regla de oro:** Claude Code recibe **una sola fase por sesión**. No leer ni implementar fases futuras. Si durante una fase surge la necesidad de algo que pertenece a otra fase, se documenta en `NOTES.md` y se continúa.

**Plantilla de arranque de sesión:**

```
Lee CIAN_PRD_v1.md, secciones 1 a 4 (contexto, stack, reglas globales, convenciones)
y la FASE N completa. Ignora el resto de las fases.

Implementa únicamente la FASE N. Al terminar, ejecuta los criterios de
aceptación de esa fase y repórtalos uno por uno.

No modifiques migraciones existentes. No instales dependencias fuera
de la lista autorizada sin preguntar.
```

---

# 1. CONTEXTO DEL PRODUCTO

CIAN es una **Progressive Web App** que concentra en un solo lugar las herramientas, recursos y servicios para apoyar a personas neurodivergentes, sus familias, cuidadores, docentes, acompañantes y profesionales.

No es un chatbot. Es un ecosistema donde **la conversación es el punto de entrada** a un conjunto de módulos especializados e integrados.

### Principio de diseño
> La tecnología se adapta a la persona, no la persona a la tecnología.

El usuario nunca elige un módulo. Escribe libremente y un **orquestador agéntico** decide internamente qué capacidades usar, integrando la información de los distintos módulos en una respuesta coherente.

### Ejemplos reales de entrada del usuario
- "Mi hijo llegó muy alterado de la escuela."
- "Ayúdame a organizar la alimentación de esta semana."
- "Necesito preparar una reunión con la maestra."
- "Convierte esto en un plan."
- "Explícame esta terapia."
- "Quiero compartir este plan con mi esposa."

Cada una de estas frases debe funcionar **sin que el usuario navegue a ningún lado**.

### Límite del producto
CIAN **no sustituye** atención médica, psicológica, terapéutica ni legal. No diagnostica. No prescribe. No es servicio de emergencia. Esto se implementa técnicamente, no solo se declara en un aviso legal (ver sección 3.6).

---

# 2. STACK TECNOLÓGICO (FIJO — NO NEGOCIABLE)

Todo corre en Vercel. Sin excepciones.

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript (strict) |
| UI | React 19 + Tailwind CSS + shadcn/ui |
| IA | Vercel AI SDK (`ai`, `@ai-sdk/*`) |
| Base de datos | Vercel Postgres |
| ORM | Drizzle ORM + drizzle-kit |
| Auth | Auth.js (NextAuth v5) con Google OAuth |
| Archivos | Vercel Blob |
| Caché / rate limit | Vercel KV |
| Trabajo diferido | `waitUntil` de `@vercel/functions` + Vercel Cron |
| Video (Fase 10) | LiveKit Cloud (WebRTC en el navegador, token desde API route) |
| Pagos (Fase 9) | Stripe |
| Deploy | Vercel |

### Prohibiciones absolutas
- **No Supabase.**
- **No Prisma.**
- **No servidores externos, VPS, contenedores ni Docker.**
- **No Firebase.**
- **No dependencias con binarios nativos** (deben correr en serverless). Para PDF usar `pdf-lib` o `@react-pdf/renderer`; para Word usar `docx`. Nunca Puppeteer/Chromium.
- **No `localStorage` como fuente de verdad.** Solo caché de UI. La verdad vive en Postgres.

### Dependencias autorizadas de entrada
```
next react react-dom typescript tailwindcss
ai @ai-sdk/anthropic @ai-sdk/react
drizzle-orm drizzle-kit @vercel/postgres
next-auth @auth/drizzle-adapter
@vercel/blob @vercel/kv @vercel/functions
zod nanoid date-fns
pdf-lib docx
lucide-react class-variance-authority tailwind-merge clsx
```
Cualquier otra dependencia se propone antes de instalar.

---

# 3. REGLAS GLOBALES DE ARQUITECTURA

Estas reglas aplican en **todas** las fases. Violarlas obliga a rehacer.

## 3.1 Multi-tenant desde la primera migración

CIAN es multi-tenant. Distintas organizaciones usan la plataforma de forma independiente con datos, configuraciones y recursos aislados.

**Toda tabla que contenga datos de usuario lleva `tenant_id NOT NULL`** con índice. Sin excepciones, incluso si en v1 solo existe un tenant.

Ninguna query toca la base directamente desde un componente o route handler. Todo pasa por una **capa de repositorio** en `lib/db/repositories/` donde cada función recibe un `TenantContext` obligatorio:

```ts
type TenantContext = {
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'professional' | 'member';
};
```

Si una función de repositorio no puede construir su `where` sin `tenantId`, está mal escrita.

## 3.2 El orquestador es una tool router, no un if/else

El chat es una única API route que usa `streamText` del AI SDK con `stopWhen: stepCountIs(N)` para permitir múltiples pasos de tool calling.

Cada módulo de CIAN se expone al modelo como **una o más tools** con schema Zod. El modelo decide. El código no adivina la intención del usuario con keywords ni clasificadores.

```
app/api/chat/route.ts
  └── buildTools(ctx)  →  registro de tools según fase y permisos del usuario
```

Agregar un módulo nuevo = registrar tools nuevas. **Nunca** tocar la lógica del orquestador.

## 3.3 Respuesta inmediata, trabajo pesado en diferido

La función de chat responde streameando. Lo que no debe bloquear la respuesta (generar el PDF final, indexar biblioteca, escribir resúmenes, telemetría) se despacha con `waitUntil`.

```ts
import { waitUntil } from '@vercel/functions';
waitUntil(generateDocumentAsync(jobId));
```

Declarar `export const maxDuration` en cada route de IA. Confirmar el techo del plan en la configuración del proyecto antes de fijar el número.

## 3.4 Una sola región

Postgres, KV, Blob y las funciones en la **misma región**. Se elige una vez en Fase 0 y no se cambia.

## 3.5 Prompts versionados en base de datos

Los system prompts **no viven en el código**. Viven en la tabla `prompts` con `key`, `version`, `content`, `is_active`. El código los lee por `key` y cachea en KV. Esto permite editarlos desde el panel administrativo sin redeploy.

En Fase 0 se crea la tabla y se hace seed de los prompts iniciales desde archivos en `prompts/seed/`.

## 3.6 Barandales de seguridad implementados en código

Estas no son advertencias legales, son requisitos funcionales:

**Módulo de crisis (Fase 7)** — El prompt del agente de crisis tiene prohibido diagnosticar, sugerir medicación o dar instrucciones médicas. Debe existir una **escalera de derivación** que se dispare ante señales de emergencia real (riesgo de vida, lesión, ideación) y devuelva una respuesta fija y breve dirigiendo a servicios de emergencia, sin continuar el flujo de apoyo. Toda activación del módulo se registra en `crisis_events`.

**Módulo de alimentación (Fase 5)** — Prohibido emitir cantidades, calorías, metas de peso, planes numéricos o restricciones. Solo estrategias de entorno, secuencias respetuosas, preferencias y organización de menús. Selectividad alimentaria colinda con trastornos de la conducta alimentaria y el módulo debe estar diseñado para no cruzar esa línea.

**Toda salida de IA** lleva un descargo persistente en la UI: CIAN no sustituye atención profesional.

**Datos sensibles de salud** — Cifrado en reposo lo da Postgres. La capa de aplicación garantiza que ningún dato clínico salga en logs, telemetría ni mensajes de error.

## 3.7 Accesibilidad como requisito de aceptación

Es una plataforma para personas neurodivergentes. En cada fase que toque UI:
- Navegación completa por teclado
- Foco visible siempre
- `prefers-reduced-motion` respetado
- Contraste AA mínimo
- Sin animaciones automáticas, sin parpadeos, sin autoplay
- Densidad de información configurable (compacta / cómoda / amplia)
- Tipografía escalable sin romper layout

---

# 4. CONVENCIONES

## 4.1 Estructura de carpetas
```
app/
  (auth)/            login, callback
  (app)/             layout con sidebar; rutas autenticadas
    chat/[id]/
    planes/
    rutinas/
    ...
  api/
    chat/route.ts
    ...
components/
  ui/                shadcn
  chat/
  modules/
lib/
  db/
    schema/          un archivo por dominio
    repositories/    acceso a datos con TenantContext
    migrations/
  ai/
    orchestrator.ts
    tools/           una carpeta por módulo
    prompts.ts       lector de prompts desde DB + KV
  auth/
  tenant/
prompts/seed/
docs/
  NOTES.md           hallazgos y deuda técnica por fase
  DECISIONS.md       decisiones de arquitectura con fecha
```

## 4.2 Identidad visual
- Índigo `#1B1F5A` (primario)
- Oro `#C9A227` (acento)
- Neutros cálidos, no grises azulados
- Modo claro y oscuro desde Fase 0
- Sin degradados llamativos, sin sombras duras, sin ruido visual

## 4.3 Idioma
Español de México. Toda la UI, todos los prompts, todos los mensajes de error. Sin anglicismos innecesarios. Estructura preparada para i18n pero un solo idioma en v1.

## 4.4 Definición de "listo"
Una fase está cerrada cuando:
1. Todos los criterios de aceptación pasan
2. `pnpm build` y `pnpm typecheck` limpios, sin `any` nuevos
3. Migraciones generadas y aplicadas
4. Deploy en Vercel funcionando
5. `NOTES.md` actualizado
6. Se reportan los criterios uno por uno al responsable

---

# FASE 0 — FUNDACIÓN

**Objetivo:** dejar la base multi-tenant, autenticación y shell de la aplicación funcionando en Vercel. Sin IA todavía.

### Alcance
1. Proyecto Next.js 15 App Router + TypeScript strict + Tailwind + shadcn/ui
2. Vercel Postgres conectado, Drizzle configurado, primera migración aplicada
3. Auth.js con Google OAuth, adaptador Drizzle, sesión en base de datos
4. Middleware de resolución de tenant + `TenantContext`
5. Capa de repositorios con scoping obligatorio
6. Shell de la app: sidebar, header, tema claro/oscuro, layout responsive
7. PWA: `manifest.json`, iconos, service worker mínimo, instalable
8. Tabla `prompts` + seed
9. Página de configuración de accesibilidad (densidad, tamaño de texto, movimiento reducido) persistida en `user_preferences`

### Esquema de datos
```
tenants            id, slug, name, plan, settings jsonb, created_at
users              id, email, name, image, created_at
tenant_members     id, tenant_id, user_id, role, status, created_at
accounts           (Auth.js)
sessions           (Auth.js)
verification_tokens(Auth.js)
user_preferences   id, tenant_id, user_id, density, text_scale,
                   reduced_motion, theme, detail_level, updated_at
prompts            id, key, version, content, is_active, created_at
audit_log          id, tenant_id, user_id, action, entity, entity_id,
                   metadata jsonb, created_at
```

Índices: `(tenant_id)` en toda tabla con tenant; único en `(tenant_id, user_id)` de `tenant_members`; único en `(key, version)` de `prompts`.

### Criterios de aceptación
- [ ] Login con Google crea usuario, tenant personal y membresía `owner` en una transacción
- [ ] Un usuario autenticado en el tenant A no puede leer ni escribir datos del tenant B por ninguna ruta
- [ ] Existe un test que verifica que las funciones de repositorio fallan si no reciben `tenantId`
- [ ] La app se instala como PWA en Android e iOS y abre en modo standalone
- [ ] Tema claro/oscuro y las tres densidades funcionan y persisten entre sesiones
- [ ] Navegación completa del shell con teclado, foco visible
- [ ] `pnpm build` limpio, deploy en Vercel accesible

### No construir en esta fase
Chat, IA, módulos, documentos, pagos, video, panel admin.

---

# FASE 1 — CHAT Y ORQUESTADOR

**Objetivo:** el corazón de CIAN. Conversación natural con streaming, historial persistente y el orquestador funcionando con su primer conjunto de tools.

### Alcance
1. `app/api/chat/route.ts` con `streamText`, streaming al cliente, `maxDuration` declarado
2. UI de chat con `useChat`: burbujas, streaming visible, estado de carga, reintento, edición del último mensaje
3. Persistencia: conversaciones y mensajes en Postgres, con título autogenerado a partir del primer intercambio
4. Historial en sidebar: lista, búsqueda, renombrar, archivar, eliminar
5. Contexto continuo: se envía la ventana de conversación con recorte inteligente por tokens
6. Registro de tools (`buildTools`) con tres tools de arranque:
   - `getUserContext` — devuelve preferencias y perfil del usuario
   - `saveMemory` — guarda un dato que el usuario autoriza recordar
   - `searchMemory` — recupera datos recordados
7. Memoria de usuario: tabla `user_memories`, siempre consultable, editable y borrable por el usuario desde una pantalla propia
8. Rate limiting por usuario con Vercel KV
9. Contador de uso de tokens por tenant en `usage_events`

### Esquema de datos
```
conversations   id, tenant_id, user_id, title, status, last_message_at, created_at
messages        id, tenant_id, conversation_id, role, parts jsonb,
                model, token_input, token_output, created_at
user_memories   id, tenant_id, user_id, key, value, source_message_id,
                confirmed_by_user, created_at, updated_at
usage_events    id, tenant_id, user_id, kind, model, tokens_in,
                tokens_out, created_at
```

Guardar los mensajes como `parts jsonb` (formato del AI SDK), no como texto plano. Esto permite adjuntos y tool calls después sin migrar.

### Prompt del orquestador
Vive en `prompts` con key `orchestrator.system`. Contenido base:
- Identidad: asistente de CIAN, de Alianza Índigo Neurodivergente A.C.
- Tono: cálido, directo, sin condescendencia, sin infantilizar
- Nunca diagnostica, nunca prescribe, nunca sustituye atención profesional
- Usa las tools disponibles sin anunciarlas ni explicar su funcionamiento interno
- Responde en español de México
- Adapta el nivel de detalle a `user_preferences.detail_level`

### Criterios de aceptación
- [ ] Una conversación de 40 mensajes se mantiene coherente y no rompe por longitud de contexto
- [ ] El streaming empieza en menos de 2 segundos
- [ ] Recargar la página restaura la conversación completa desde Postgres
- [ ] El usuario puede ver, editar y borrar cada memoria guardada
- [ ] El modelo llama `saveMemory` cuando el usuario dice algo como "recuerda que le molestan los ruidos fuertes"
- [ ] Rate limit responde con mensaje claro, no con error 500
- [ ] `usage_events` registra cada intercambio
- [ ] El chat es usable solo con teclado y anuncia mensajes nuevos a lector de pantalla

### No construir en esta fase
Adjuntos, voz, módulos funcionales, documentos.

---

# FASE 2 — DOCUMENTOS

**Objetivo:** convertir cualquier conversación en un documento útil. Es la función que más valor percibido genera de inmediato.

### Alcance
1. Tool `createDocument(type, title, content, format)` registrada en el orquestador
2. Generadores serverless:
   - PDF con `pdf-lib` o `@react-pdf/renderer`
   - DOCX con `docx`
   - Markdown y texto plano
3. Tipos de documento con plantilla propia: informe, carta, solicitud, resumen, guía, lista, checklist, historia social, material visual
4. Plantillas con identidad de Alianza Índigo: encabezado, pie, folio, fecha
5. Generación despachada con `waitUntil`; el chat contesta de inmediato con el documento "en preparación" y la UI actualiza cuando está listo
6. Almacenamiento en Vercel Blob, metadatos en Postgres
7. Biblioteca de documentos del usuario: listar, previsualizar, descargar, renombrar, eliminar
8. Regenerar un documento con instrucciones nuevas conservando el original

### Esquema de datos
```
documents      id, tenant_id, user_id, conversation_id, type, title,
               format, status, blob_url, size_bytes, folio,
               source_content, created_at
document_jobs  id, tenant_id, document_id, status, error, created_at, completed_at
```

### Criterios de aceptación
- [ ] "Convierte esto en una carta para la directora" produce un PDF descargable con la plantilla institucional
- [ ] Un documento de 15 páginas se genera sin timeout
- [ ] El chat no se bloquea durante la generación
- [ ] Los PDF abren correctamente en iOS, Android y escritorio
- [ ] Los DOCX abren en Word y en Google Docs sin advertencias
- [ ] Acentos y caracteres especiales del español se renderizan bien en PDF
- [ ] Un documento de un tenant no es accesible por URL desde otro tenant

### No construir en esta fase
Firma electrónica, compartir con terceros, plantillas editables por el usuario.

---

# FASE 3 — PLANES Y RUTINAS

**Objetivo:** los dos módulos estructurales. Todo lo demás se conecta a ellos.

### Alcance

**Planes de apoyo**
1. Tipos: personalizado, familiar, escolar, de autonomía, de seguimiento
2. Estructura: objetivos → estrategias → indicadores de seguimiento
3. Tools: `createPlan`, `updatePlan`, `getPlan`, `listPlans`, `addPlanObjective`, `logPlanProgress`
4. Generación automática desde conversación: "convierte esto en un plan" debe producir un plan estructurado, no un texto
5. UI: lista, vista de detalle, edición manual, seguimiento de progreso
6. Exportar plan a documento (usa Fase 2)

**Rutinas**
1. Tipos: matutina, nocturna, escolar, laboral, sensorial, de descanso, de alimentación
2. Estructura: secuencia ordenada de pasos, cada uno con duración estimada, icono o imagen opcional, nota
3. Secuencias visuales: vista de tarjetas grandes, un paso a la vez, avance manual
4. Checklists derivadas de rutinas
5. Tools: `createRoutine`, `updateRoutine`, `getRoutine`, `listRoutines`, `reorderRoutineSteps`, `logRoutineCompletion`
6. Registro de cumplimiento y vista simple de constancia

### Esquema de datos
```
plans             id, tenant_id, user_id, type, title, description,
                  status, created_at, updated_at
plan_objectives   id, tenant_id, plan_id, title, description, order_index, status
plan_strategies   id, tenant_id, objective_id, content, order_index
plan_progress     id, tenant_id, plan_id, objective_id, note, rating, logged_at

routines          id, tenant_id, user_id, type, title, description,
                  active, created_at, updated_at
routine_steps     id, tenant_id, routine_id, order_index, title,
                  duration_seconds, icon, image_url, note
routine_logs      id, tenant_id, routine_id, completed_steps jsonb,
                  completed_at, note
```

### Criterios de aceptación
- [ ] "Necesito una rutina matutina para mi hijo de 7 años que se distrae mucho" genera una rutina con pasos ordenados y duraciones razonables
- [ ] "Convierte esto en un plan" tras una conversación larga produce objetivos y estrategias coherentes con lo hablado
- [ ] El modo secuencia visual funciona en teléfono, un paso a la vez, con botones grandes
- [ ] Reordenar pasos funciona por teclado, no solo arrastrando
- [ ] Un plan se exporta a PDF con formato legible
- [ ] Editar manualmente un plan generado por IA no lo rompe

### No construir en esta fase
Recordatorios, notificaciones, compartir, alimentación, sensorialidad.

---

# FASE 4 — ADJUNTOS Y VOZ

**Objetivo:** entrada y salida multimodal. Muchos usuarios de CIAN necesitan no escribir.

### Alcance
1. Adjuntar documentos al chat (PDF, DOCX, TXT) con extracción de texto en serverless
2. Adjuntar imágenes, enviadas al modelo como visión
3. Adjuntar audio con transcripción
4. Dictado por voz con Web Speech API, con respaldo de grabación + transcripción en servidor donde no haya soporte
5. Lectura por voz de las respuestas con `SpeechSynthesis`, control de velocidad, pausa y detención
6. Todos los adjuntos en Vercel Blob, referenciados en `message_attachments`
7. Límites de tamaño y tipo claros, con mensaje de error entendible

### Esquema de datos
```
message_attachments  id, tenant_id, message_id, kind, filename, mime,
                     size_bytes, blob_url, extracted_text, created_at
```

### Criterios de aceptación
- [ ] Subir un PDF de 20 páginas y preguntar sobre su contenido funciona
- [ ] Subir una foto de un cuaderno escolar y pedir ayuda con la tarea funciona
- [ ] Dictado funciona en Safari iOS y Chrome Android
- [ ] Lectura por voz respeta velocidad configurada y se puede detener a media frase
- [ ] Un archivo de tipo no soportado da un mensaje claro, no un error genérico
- [ ] Los controles de voz son alcanzables por teclado y tienen etiqueta accesible

### No construir en esta fase
Videollamada, grabación de sesiones.

---

# FASE 5 — SENSORIALIDAD, FUNCIONES EJECUTIVAS Y ALIMENTACIÓN

**Objetivo:** los tres módulos de vida diaria. Se construyen juntos porque comparten patrón: perfil + registro + estrategias.

### Alcance

**Sensorialidad**
1. Perfil sensorial por dominio: sonidos, luces, texturas, temperatura, olores, interocepción, propiocepción
2. Cada dominio con nivel de sensibilidad, disparadores conocidos, estrategias que funcionan
3. Registro de eventos sensoriales con contexto
4. Catálogo de herramientas sensoriales y ambientes seguros del usuario
5. Tools: `getSensoryProfile`, `updateSensoryProfile`, `logSensoryEvent`, `suggestRegulationStrategy`

**Funciones ejecutivas**
1. Tareas con descomposición automática en subtareas
2. Apoyo al inicio de tarea: primer paso mínimo concreto
3. Priorización asistida y estimación de tiempo
4. Tools: `createTask`, `breakDownTask`, `prioritizeTasks`, `listTasks`, `completeTask`

**Alimentación** — leer sección 3.6 antes de implementar
1. Preferencias y aversiones alimentarias
2. Registro de alimentos aceptados
3. Planeación de menús semanales sin cifras
4. Listas de compras generadas del menú
5. Estrategias respetuosas durante las comidas y adaptaciones del entorno
6. Tools: `getFoodProfile`, `updateFoodProfile`, `planMeals`, `generateShoppingList`, `logAcceptedFood`

### Esquema de datos
```
sensory_profiles   id, tenant_id, user_id, domain, sensitivity,
                   triggers jsonb, strategies jsonb, updated_at
sensory_events     id, tenant_id, user_id, domain, intensity, context,
                   strategy_used, outcome, occurred_at
sensory_tools      id, tenant_id, user_id, name, description, domain, effective

tasks              id, tenant_id, user_id, parent_task_id, title, notes,
                   priority, estimated_minutes, status, due_at, created_at

food_profiles      id, tenant_id, user_id, accepted jsonb, avoided jsonb,
                   textures jsonb, notes, updated_at
meal_plans         id, tenant_id, user_id, week_start, plan jsonb, created_at
shopping_lists     id, tenant_id, meal_plan_id, items jsonb, created_at
```

### Criterios de aceptación
- [ ] "Le molesta mucho el ruido del comedor" actualiza el perfil sensorial y sugiere estrategias concretas
- [ ] "No puedo empezar a limpiar" devuelve un primer paso mínimo, no una lista de diez cosas
- [ ] Una tarea compleja se descompone en subtareas accionables
- [ ] El módulo de alimentación **nunca** emite calorías, gramos, metas de peso ni restricciones — verificado con al menos 10 prompts de prueba documentados que intenten provocarlo
- [ ] "Organiza la alimentación de esta semana" produce un menú y una lista de compras
- [ ] Los tres módulos son alcanzables por conversación sin abrir su pantalla

### No construir en esta fase
Crisis, educación, biblioteca, compartir.

---

# FASE 6 — EDUCACIÓN Y BIBLIOTECA INTELIGENTE

**Objetivo:** el módulo con mayor demanda, respaldado por una base de conocimiento propia.

### Alcance

**Biblioteca Inteligente**
1. Contenido curado y revisado sobre neurodivergencia, educación, comunicación, inclusión, derechos, accesibilidad, estrategias prácticas, vida diaria y recursos para familias
2. Ingesta: markdown en `content/library/` con frontmatter (título, categoría, etiquetas, fuente, fecha de revisión)
3. Chunking + embeddings almacenados en Postgres con `pgvector`
4. Tool `searchLibrary(query, category?)` disponible para todos los agentes
5. Toda respuesta que use la biblioteca **cita el recurso** de forma visible en la UI
6. Reindexado mediante Vercel Cron o comando administrativo

**Educación**
1. Adaptaciones educativas por perfil
2. Diseño Universal para el Aprendizaje aplicado a contenidos concretos
3. Planeaciones y agendas visuales
4. Materiales para docentes
5. Preparación de reuniones escolares: guion, puntos a plantear, documentos de respaldo
6. Tools: `createEducationalAdaptation`, `generateVisualSchedule`, `prepareSchoolMeeting`, `createLessonSupport`

### Esquema de datos
```
library_resources  id, slug, title, category, tags jsonb, source,
                   reviewed_at, content, created_at
library_chunks     id, resource_id, chunk_index, content, embedding vector(1536)
education_items    id, tenant_id, user_id, kind, title, payload jsonb,
                   document_id, created_at
```

La biblioteca es **global**, no por tenant. Un tenant puede además tener recursos propios: `tenant_id` nullable, donde `NULL` significa contenido global.

### Criterios de aceptación
- [ ] `searchLibrary` devuelve resultados relevantes en menos de 500 ms
- [ ] Las respuestas basadas en biblioteca muestran la fuente con enlace al recurso
- [ ] "Necesito preparar una reunión con la maestra" produce un guion con puntos concretos y ofrece generar el documento
- [ ] Una agenda visual se genera y se exporta a PDF imprimible
- [ ] Los recursos propios de un tenant no se filtran a otro
- [ ] Reindexar la biblioteca completa no rompe consultas en curso

### No construir en esta fase
Crisis, equipo de apoyo, pagos.

---

# FASE 7 — CRISIS NO EMERGENTES

**Objetivo:** acompañamiento durante desregulación. Es la fase con mayor exposición y la que exige más disciplina. Leer sección 3.6 completa antes de escribir código.

### Alcance
1. Detección de contexto de crisis por el orquestador, que activa un agente especializado con prompt propio (`crisis.system`)
2. Modo de interfaz simplificado al activarse: menos texto, pasos cortos, botones grandes, sin distracciones
3. Funciones del agente: reducir demandas, organizar el ambiente, recordar estrategias que ya funcionaron con este usuario (consulta `sensory_profiles` y `sensory_events`), guiar al cuidador paso a paso
4. **Escalera de derivación**: ante señales de riesgo de vida, lesión grave o crisis médica, el flujo se detiene y se entrega una respuesta breve y fija dirigiendo a servicios de emergencia. No se continúa el acompañamiento ni se ofrecen alternativas.
5. Registro posterior del episodio: qué pasó, qué se intentó, qué funcionó
6. Plan posterior generado a partir del registro, conectado al módulo de Planes
7. Bitácora de episodios con vista de patrones

### Esquema de datos
```
crisis_events    id, tenant_id, user_id, conversation_id, severity,
                 triggers jsonb, actions_taken jsonb, outcome,
                 escalated boolean, started_at, ended_at
crisis_protocols id, tenant_id, user_id, title, steps jsonb, active
```

### Criterios de aceptación
- [ ] "Mi hijo llegó muy alterado de la escuela" activa el modo crisis con pasos concretos e inmediatos, no con un ensayo
- [ ] El agente nunca sugiere medicación, nunca diagnostica, nunca interpreta síntomas médicos — verificado con al menos 15 prompts adversariales documentados
- [ ] La escalera de derivación se dispara correctamente ante los casos de prueba de riesgo y **no** se dispara con falsos positivos comunes como "estoy agotada"
- [ ] El agente usa estrategias que ya están registradas como efectivas para ese usuario
- [ ] Cada activación queda en `crisis_events`
- [ ] El modo simplificado es usable con una sola mano en teléfono
- [ ] Terminado el episodio, se ofrece registrar y generar plan posterior

### No construir en esta fase
Notificaciones a terceros, alertas automáticas a profesionales.

---

# FASE 8 — EQUIPO DE APOYO Y RECORDATORIOS

**Objetivo:** que la información llegue a quien debe, con control total del usuario, y que las rutinas funcionen sin que el usuario recuerde abrir la app.

### Alcance

**Equipo de apoyo**
1. Invitar por correo a familiares, docentes, cuidadores, terapeutas, acompañantes y profesionales
2. Permisos granulares por recurso: el usuario decide exactamente qué comparte — este plan sí, esta rutina sí, la bitácora de crisis no
3. Vista del invitado: solo lo compartido, sin acceso al chat del usuario
4. Revocar acceso en cualquier momento, con efecto inmediato
5. Notas compartidas y comentarios sobre recursos compartidos
6. Registro de accesos en `audit_log`

**Recordatorios**
1. Web Push con VAPID, suscripción por dispositivo
2. Vercel Cron barre rutinas y tareas programadas y despacha notificaciones
3. Correo como canal de respaldo configurable
4. Preferencias por usuario: horarios, canales, silencios
5. En iOS solo funciona con la PWA instalada: la UI detecta la situación y guía la instalación con instrucciones claras en lugar de fallar en silencio

### Esquema de datos
```
support_team_members  id, tenant_id, owner_user_id, member_user_id, email,
                      relationship, status, invited_at, accepted_at
resource_shares       id, tenant_id, resource_type, resource_id,
                      shared_with_user_id, permission, created_at, revoked_at
shared_notes          id, tenant_id, resource_share_id, author_user_id,
                      content, created_at
push_subscriptions    id, tenant_id, user_id, endpoint, keys jsonb,
                      user_agent, created_at
reminders             id, tenant_id, user_id, kind, resource_id, schedule jsonb,
                      channels jsonb, active, last_sent_at
notification_log      id, tenant_id, user_id, reminder_id, channel,
                      status, error, sent_at
```

### Criterios de aceptación
- [ ] "Quiero compartir este plan con mi esposa" genera una invitación y comparte solo ese plan
- [ ] Un miembro del equipo de apoyo no puede acceder a nada que no se le haya compartido explícitamente
- [ ] Revocar un acceso corta el acceso de inmediato, incluso con sesión abierta
- [ ] Cada acceso a un recurso compartido queda registrado
- [ ] Un recordatorio de rutina matutina llega puntual en Android instalado y en escritorio
- [ ] En iOS sin instalar, la app explica cómo instalar en lugar de prometer notificaciones que no llegarán
- [ ] El respaldo por correo funciona cuando el push falla

### No construir en esta fase
Pagos, consultorios.

---

# FASE 9 — MEMBRESÍAS Y PANEL ADMINISTRATIVO

**Objetivo:** sostenibilidad y operación.

### Alcance

**Membresías**
1. Planes mensual y anual con Stripe Checkout
2. Webhooks de Stripe para alta, renovación, fallo de pago y cancelación
3. Límites por plan aplicados en el código: mensajes, documentos, almacenamiento, miembros de equipo de apoyo
4. Portal de facturación de Stripe para el usuario
5. Plan gratuito con límites, para que nadie quede fuera por costo
6. Membresías de organización con asientos

**Panel administrativo** (rol `admin` de tenant y superadmin de plataforma)
1. Usuarios, organizaciones y membresías
2. Recursos y biblioteca: cargar, editar, revisar, publicar
3. Prompts versionables: editar, activar versión, historial, rollback
4. Configuración de modelos de IA por tenant
5. Métricas de uso: usuarios activos, mensajes, documentos, tokens, costo estimado
6. Auditoría consultable

### Esquema de datos
```
subscriptions      id, tenant_id, stripe_customer_id, stripe_subscription_id,
                   plan, status, seats, current_period_end, created_at
plan_limits        id, plan, limits jsonb
model_configs      id, tenant_id, purpose, provider, model, params jsonb, active
```

### Criterios de aceptación
- [ ] Contratar, renovar, fallar el pago y cancelar reflejan el estado correcto en la app
- [ ] Alcanzar un límite de plan produce un mensaje claro con la opción de mejorar plan, no un error
- [ ] Editar un prompt desde el panel cambia el comportamiento del asistente sin redeploy
- [ ] Rollback de prompt a la versión anterior funciona
- [ ] Un admin de tenant no puede ver datos de otro tenant
- [ ] Las métricas de uso cuadran con `usage_events`

### No construir en esta fase
Consultorios virtuales.

---

# FASE 10 — CONSULTORIOS VIRTUALES

**Objetivo:** espacios privados de atención, orientación y colaboración entre usuarios y profesionales. Es un producto completo por sí mismo y merece su propio lanzamiento.

CIAN proporciona la **infraestructura tecnológica**. Los servicios profesionales son responsabilidad de quienes los prestan. Esto debe quedar implementado, no solo escrito.

### Alcance

**Perfil profesional**
1. Alta de profesional con especialidad, cédula profesional y documentos de respaldo
2. Estado de verificación: pendiente, verificado, suspendido. Solo un profesional verificado puede abrir consultorio
3. Especialidades soportadas: psicología, psiquiatría, neurología, terapia ocupacional, terapia del lenguaje, nutrición, educación especial, docencia, orientación familiar, trabajo social, asesoría en derechos, inserción laboral, vida independiente, coaching, grupos de apoyo
4. Términos que declaran expresamente que la responsabilidad profesional es del prestador

**Agenda**
1. Disponibilidad del profesional, citas, confirmación, cancelación
2. Recordatorios automáticos por push y correo
3. Sala de espera virtual

**Sesión**
1. Videollamada con LiveKit: el token se emite desde una API route, el WebRTC vive en el navegador
2. Chat integrado durante la sesión
3. Compartir pantalla
4. Pizarra colaborativa
5. Compartir documentos, planes y rutinas dentro de la sesión
6. Agenda visual compartida y herramientas de comunicación visual
7. Grabación **opcional**, solo con consentimiento expreso registrado con sello de tiempo de ambas partes

**Después de la sesión**
1. Notas privadas del profesional, no visibles para el usuario
2. Notas compartidas con el usuario
3. Resumen de sesión generado por IA, **publicado solo con autorización explícita del profesional**
4. Asignación de tareas al usuario
5. Seguimiento entre sesiones
6. Historial de sesiones para ambas partes
7. Generación de documentos desde la sesión

### Esquema de datos
```
professionals        id, tenant_id, user_id, specialties jsonb, license_number,
                     license_docs jsonb, verification_status, verified_at, bio
availability_slots   id, tenant_id, professional_id, weekday, start_time,
                     end_time, timezone, active
appointments         id, tenant_id, professional_id, client_user_id, status,
                     scheduled_at, duration_minutes, room_id, created_at
sessions             id, tenant_id, appointment_id, started_at, ended_at,
                     recording_url, recording_consent jsonb
session_notes        id, tenant_id, session_id, author_user_id, visibility,
                     content, created_at
session_summaries    id, tenant_id, session_id, content, approved_by,
                     approved_at, published
session_tasks        id, tenant_id, session_id, assigned_to_user_id, title,
                     description, due_at, status
whiteboard_states    id, tenant_id, session_id, state jsonb, updated_at
```

### Criterios de aceptación
- [ ] Un profesional no verificado no puede abrir consultorio ni recibir citas
- [ ] La videollamada conecta en menos de 5 segundos entre dos dispositivos en redes distintas
- [ ] Pantalla compartida y pizarra funcionan simultáneamente con el video
- [ ] La grabación es imposible de iniciar sin consentimiento registrado de ambas partes
- [ ] Las notas privadas del profesional **jamás** aparecen en ninguna respuesta de API accesible al usuario — verificado con prueba explícita
- [ ] El resumen de sesión no se publica sin aprobación del profesional
- [ ] El historial de sesiones es consultable por ambas partes con los alcances que corresponden a cada rol
- [ ] Un profesional del tenant A no puede ver pacientes del tenant B
- [ ] La sesión funciona en Safari iOS

---

# 5. LO QUE CIAN SERÁ AL CERRAR LA FASE 10

Una plataforma integral que combina inteligencia artificial, organización personal, generación documental, recursos especializados, colaboración, consultorios virtuales y herramientas de apoyo en un solo ecosistema, permitiendo que personas, familias, profesionales y organizaciones trabajen de forma coordinada para favorecer la calidad de vida, la inclusión y la autonomía de las personas neurodivergentes.

Todo corriendo en Vercel. Todo accesible desde cualquier dispositivo. Todo con la conversación como puerta de entrada.

---

# 6. CHECKLIST DE COORDINACIÓN ENTRE FASES

Antes de abrir una sesión nueva con Claude Code:

- [ ] La fase anterior tiene todos sus criterios de aceptación marcados
- [ ] El deploy en Vercel de la fase anterior está funcionando
- [ ] `NOTES.md` refleja los hallazgos de la fase anterior
- [ ] `DECISIONS.md` tiene las decisiones de arquitectura que se tomaron
- [ ] Las migraciones de la fase anterior están aplicadas en producción
- [ ] Se entrega **solo** la fase siguiente, con las secciones 1 a 4 de este documento

---

*Documento vivo. Versión 1.0.*
