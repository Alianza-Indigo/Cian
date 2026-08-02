# NOTES

Hallazgos, deuda técnica y pendientes por fase. Lo que aparece aquí no se
resuelve en la fase en curso: se anota y se sigue (regla de oro del PRD).

---

## Fase 8 — Equipo de apoyo y recordatorios

### Web Push escrito a mano, y por qué

`web-push` no está en la lista de dependencias autorizadas del PRD (sección 2)
y la regla de oro dice que cualquier otra se propone antes de instalar. Se
preguntó y no hubo respuesta, así que se implementó sobre `node:crypto`:
RFC 8291 (cifrado del contenido), RFC 8188 (formato `aes128gcm`) y RFC 8292
(el JWT de VAPID).

**Qué está verificado.** Que un receptor escrito aparte —siguiendo el RFC, sin
compartir código con el emisor— recupera el mensaje; que la cabecera tiene la
disposición exacta (salt 16, rs 4, idlen 1, clave efímera 65); que el
delimitador de último registro es `0x02`; que cada envío usa sal y clave
efímera nuevas; que un mensaje cifrado para una suscripción no se descifra con
otra; y que el JWT valida contra su propia clave pública con la audiencia y la
caducidad correctas.

**Qué NO está verificado.** Que un navegador real lo descifre. Eso exige el
vector de prueba oficial del RFC 8291 o un dispositivo, y desde este entorno no
hay salida de red (`rfc-editor.org` devuelve 403 en el proxy). Si en pruebas
reales el servicio de push devuelve 400 o la notificación llega vacía, lo más
probable es que falle alguna de las cadenas `info` de `webpush.ts`, y
sustituir ese archivo por `web-push` son unas quince líneas.

**Es el pendiente más importante de esta fase.** Conviene probarlo en un
Android instalado antes de anunciarlo a nadie.

### El cron cada 15 minutos necesita plan Pro

`vercel.json` declara `*/15 * * * *` para `/api/cron/recordatorios`. En el plan
Hobby de Vercel los cron corren **una vez al día**, así que ahí el despliegue lo
degrada o lo rechaza.

No se puso un barrido diario porque haría inútil la función: un recordatorio de
rutina matutina que puede llegar con horas de retraso no es un recordatorio.
Con `*/15` el sistema es correcto en cuanto el proyecto suba de plan, y
mientras tanto lo que falla es visible —los recordatorios no salen— en vez de
llegar tarde y en silencio.

`SWEEP_MINUTES` en `lib/notifications/types.ts` es la constante que amarra el
tamaño de la ventana con la frecuencia del cron. **Cambiar el cron sin cambiar
esa constante produce recordatorios perdidos o duplicados.**

### Correo por REST, sin SDK

Se habla con Resend por su API con `fetch`. El SDK oficial no aporta nada que
`fetch` no haga y sería otra dependencia fuera de la lista.

Sin `RESEND_API_KEY` la aplicación no falla: la invitación se crea igual y la
interfaz muestra el enlace para compartirlo a mano. Es peor experiencia, pero
deja a la persona con algo que hacer.

**Sin verificar:** que Resend acepte el remitente. Exige un dominio verificado
en su panel, y eso es configuración, no código.

### Las dos excepciones al ámbito de tenant

Hasta la Fase 7, la única función de repositorio sin `TenantContext` era
`listMembershipsForUser`. Esta fase añade dos casos más, y ambos merecen
revisión antes de replicar el patrón:

1. **El lado del invitado** (`listSharedWithMe`, `getSharedResource`,
   `acceptInvitation`, `addSharedNote`, `readSharedContent`). El invitado no
   pertenece al tenant de quien comparte: exigirle contexto haría imposible la
   operación. A cambio, la restricción es más estrecha: se parte siempre del
   `userId` de la sesión, nunca de un identificador de la petición, y el
   `tenantId` sale de la fila del `share` ya verificada.
2. **El barrido del cron** (`listActiveRemindersForSweep`). Cruza tenants a
   propósito porque no actúa en nombre de nadie. Lo que lo hace seguro es lo
   que hace después: cada recordatorio se despacha solo a las suscripciones y
   al correo de su propio `user_id`, tomados de la misma fila.

La prueba `tenant-scope.test.ts` cubre las 27 funciones nuevas que **sí** llevan
contexto. Las cinco excepciones no pueden cubrirse ahí por definición, y esa es
exactamente la razón por la que están enumeradas aquí.

### Deuda descubierta al escribir esto

`tenant-scope.test.ts` **no incluía el repositorio de crisis de la Fase 7**. Se
agregó en esta fase junto con los de la Fase 8. La prueba enumera funciones a
mano, así que agregar una y no registrarla ahí pasa desapercibido. Vale la pena
sustituirla por algo que descubra las exportaciones automáticamente.

### Pendientes de esta fase

- **Sin probar en dispositivo real.** Ni el push en Android instalado, ni la
  guía de instalación en iOS, ni el respaldo por correo. Son tres de los siete
  criterios de aceptación y los tres dependen de hardware que no había.
- **La revocación corta al recargar, no en la pestaña abierta.** Cada lectura
  consulta la fila viva del `share`, así que el corte es inmediato en cualquier
  petición nueva; lo que ya está pintado en pantalla sigue ahí hasta que la
  persona navegue. Cerrarlo del todo exigiría empujar al cliente, y eso es
  infraestructura que esta fase no trae.
- **`recordSharedAccess` traga sus errores.** Si falla el registro, el acceso
  ocurre igual. Se prefirió no dejar a alguien sin ver lo que le compartieron
  por un fallo de escritura, pero significa que el registro es best-effort.
- **Compartir es siempre de lectura.** Nadie edita lo que no es suyo, con
  ningún permiso. Es la decisión, no una limitación temporal.
- **La bitácora de crisis y el chat no son compartibles**, a propósito. El PRD
  usa la primera como ejemplo de lo que alguien puede querer no compartir.
- **Sin recordatorios ligados automáticamente a rutinas.** `reminders.resourceId`
  existe y las tools lo aceptan, pero crear una rutina no crea su recordatorio.

---

## Fase 7 — Crisis no emergentes

### La escalera de derivación corre antes del modelo, no dentro de él

`lib/crisis/escalation.ts` es una comprobación determinista sobre el mensaje
de la persona, y vive en `app/api/chat/route.ts` **antes** de la llamada al
modelo. Si se dispara, CIAN devuelve un texto fijo por el mismo canal de
streaming que una respuesta normal (`createUIMessageStream`) y el modelo no
llega a ejecutarse.

Va incluso antes del límite de uso, a propósito: quien está viviendo una
emergencia no puede toparse con «alcanzaste tu límite de mensajes». Una
derivación no consume cuota porque no consume tokens.

### Precisión y sensibilidad valen lo mismo aquí

La tentación es hacer el detector agresivo. El PRD lo prohíbe explícitamente al
pedir que **no** se dispare con «estoy agotada», y la razón es de producto, no
de ingeniería: si una madre exhausta recibe un aviso de emergencia en vez del
acompañamiento que venía a buscar, se queda sin ayuda y aprende que decir la
verdad sobre su cansancio tiene consecuencias.

De ahí el `IDIOM_TAIL` —«me quiero morir **de vergüenza**»— y la lista
`KNOWN_FALSE_POSITIVES`, que la prueba recorre entera. Por el mismo motivo
«me corto» a secas quedó fuera de la regla de autolesión: cortarse el dedo
picando cebolla produce la misma cadena.

Los números están verificados en fuentes oficiales el 2026-08-02: **911**
(emergencias nacionales) y **800 911 2000** (Línea de la Vida, CONASAMA,
gratuita, 24/7). Si cambian, se cambian en `escalation.ts`.

### El barandal médico cubre lo que se guarda, no lo que se dice

`lib/crisis/medical-guardrail.ts` comprueba todo el texto que el modelo entrega
a través de las tools de crisis: los pasos del acompañamiento, el registro del
episodio, los protocolos y el plan posterior. Ahí falla la tool y el modelo
reescribe.

**Lo que no cubre:** la prosa libre del mensaje en streaming. Comprobarla
exigiría bufferizar la respuesta completa antes de mostrarla, y eso convierte
una respuesta que empieza en dos segundos en una que aparece de golpe al
final —justo en el módulo donde la espera se vive peor—. Hoy esa parte la
sostienen el prompt (`crisis.system`) y el hecho de que la guía accionable
—los pasos— sí pasa por el barandal por diseño: `activateCrisisSupport` los
exige como datos, no como texto.

Queda anotado como la deuda más relevante de esta fase. Una salida razonable
para más adelante: comprobar el texto por fragmentos completos a medida que
llegan y cortar el stream ante una violación, en vez de esperar al final.

### Lo que las pruebas garantizan y lo que no

Las 92 pruebas de `tests/crisis.test.ts` verifican los barandales, no la
conducta del modelo: los 18 casos adversariales documentan una salida que el
modelo podría producir y comprueban que no pasa. El criterio del PRD pide 15.

Sin acceso de red al modelo desde este entorno, sigue **sin verificar en vivo**
que Gemini 3.1 Flash Lite enrute correctamente a `getCrisisStrategies` y
`activateCrisisSupport` con 41 tools registradas. Es el mismo pendiente que
arrastran las fases anteriores y el punto que más conviene medir en la
plataforma: si Flash-Lite no sostiene el enrutado en crisis, la salida no es
relajar el barandal sino usar un modelo más capaz solo para este agente
(`model_configs` de la Fase 9 ya lo admite).

### Los patrones se calculan en el navegador

`lib/crisis/patterns.ts` es una función pura y `crisis-log.tsx` la ejecuta en
el cliente. No es una preferencia de arquitectura: las franjas horarias y los
días de la semana dependen de la zona horaria de quien mira, y el servidor vive
en UTC. Decirle a una familia de Ciudad de México que sus crisis pasan «de
madrugada» cuando pasan por la tarde no es ruido, es un dato falso.

Por eso `getCrisisHistory` —que corre en el servidor— devuelve los conteos que
no dependen de la hora y omite las franjas horarias a propósito.

Con menos de cuatro episodios no se muestran patrones. Con tres, cualquier
coincidencia parece una regla.

### Qué se guarda de una derivación

`crisis_events` anota la **categoría** de la señal (`escalation_signals`) y
nunca el mensaje. Poder responder «¿esto ya había pasado?» no justifica
conservar el peor momento de alguien escrito en una tabla.

### Pendientes de esta fase

- **El modo crisis no se puede activar desde la interfaz.** Solo lo enciende el
  modelo al llamar a `activateCrisisSupport`. Un botón «necesito ayuda ahora»
  en `/crisis` que abra una conversación ya en modo crisis sería útil y no
  estaba en el alcance.
- **El registro del episodio se hace conversando**, no con un formulario. Para
  quien prefiera escribirlo directamente falta una pantalla de alta manual en
  `/crisis`.
- **Sin revisión con lector de pantalla del modo simplificado.** La estructura
  (`section` con `aria-label`, `role="log"` en la respuesta, objetivos táctiles
  de 3.25 rem) está puesta, pero no se ha escuchado.
- **El umbral de cuatro episodios es un juicio, no un cálculo.** Conviene
  revisarlo con datos reales.

---

## Fase 6 — Educación y biblioteca inteligente

### Los 1536 del PRD se conservaron

El PRD fija `vector(1536)`, una dimensión que venía del proveedor anterior.
`gemini-embedding-001` permite configurar la dimensión de salida, así que se
mantuvo el número tal cual: el cambio de proveedor no obligó a desviarse del
documento.

Cambiar `EMBEDDING_DIMENSIONS` obliga a reindexar toda la biblioteca y a migrar
la columna. No es un ajuste, es una operación. Hay una prueba que lo fija.

`taskType` va distinto al indexar (`RETRIEVAL_DOCUMENT`) y al consultar
(`RETRIEVAL_QUERY`). Son espacios distintos del mismo modelo y mezclarlos
degrada la recuperación en silencio, que es la peor forma de degradarse.

### pgvector se habilita en `db-setup`, no en una migración

`CREATE EXTENSION IF NOT EXISTS vector` corre antes de aplicar migraciones.
Drizzle no lo emite por su cuenta, y ponerlo dentro de un archivo de migración
no serviría para una base que ya tiene migraciones anteriores. Si falla, avisa
y sigue: el resto del despliegue no depende de la biblioteca.

### Reindexar no rompe consultas en curso

Es criterio de aceptación y está resuelto por construcción: el reemplazo de
fragmentos ocurre **por recurso y dentro de una transacción**. Mientras uno se
reescribe los demás siguen consultables, y ese uno pasa de su versión anterior
a la nueva sin quedar vacío en medio.

Además, un recurso cuyo contenido no cambió se salta por huella `sha256`, y con
él el costo de sus embeddings.

### Las citas no dependen de que el modelo se acuerde

Criterio: «toda respuesta que use la biblioteca cita el recurso de forma
visible». Las citas se leen de la **salida de `searchLibrary`**, no del texto
del modelo. Si dependieran de que el modelo las escriba, una respuesta apoyada
en la biblioteca podría quedarse sin fuente. Así la cita aparece porque la
búsqueda ocurrió.

### La búsqueda degrada en vez de fallar

Sin embeddings —sin clave del modelo, o el proveedor caído— la búsqueda cae a
coincidencia de texto. Peor recuperación es mejor que ninguna. También cae al
texto cuando la búsqueda vectorial no supera el umbral de similitud.

Ese umbral (0.35) existe porque sin él cualquier consulta devuelve siempre
cinco resultados, vengan o no a cuento: el índice ordena por cercanía relativa,
no por pertinencia.

### Lo que no se pudo verificar

1. **Que `searchLibrary` responda en menos de 500 ms.** El índice HNSW está en
   la migración, pero medirlo exige base con contenido indexado.
2. **Que la biblioteca se indexe.** Requiere clave del modelo y base de datos.
3. **Que los recursos de un tenant no se filtren a otro.** Está resuelto por
   construcción —las consultas filtran `tenant_id IS NULL OR tenant_id = ?`— y
   cubierto por el aislamiento, pero la prueba con dos tenants sembrados sigue
   pendiente desde la Fase 0.

### Configuración nueva en Vercel

- **`CRON_SECRET`** (`openssl rand -hex 32`). Sin él la ruta de reindexado se
  niega a correr: dejarla abierta permitiría a cualquiera provocar el costo de
  reindexar la biblioteca entera.
- El cron ya está declarado en `vercel.json`: lunes a las 8:00 UTC.

### Deuda técnica

- **El intérprete de frontmatter está escrito a mano.** Son cinco campos de
  texto y no justifica una dependencia. Si el frontmatter se complica, conviene
  proponer `gray-matter` antes que estirarlo.

- **No hay forma de cargar recursos propios de un tenant desde la interfaz.**
  El esquema lo admite (`tenant_id` nullable) y las consultas ya lo respetan,
  pero la carga llega con el panel administrativo de la Fase 9.

- **La biblioteca no tiene buscador propio en su pantalla.** Se navega por
  categoría; la búsqueda semántica existe solo a través de la conversación.

---

## Fase 5 — Sensorialidad, funciones ejecutivas y alimentación

### El barandal de alimentación está en código, no en el prompt

Es lo más importante de esta fase. La regla 3.6 dice que el módulo tiene
prohibido emitir cantidades, calorías, metas de peso, planes numéricos y
restricciones, y que eso **se implementa técnicamente, no solo se declara**.

`lib/nutrition/guardrail.ts` comprueba todo el contenido que produce el modelo
—menús, listas de compras, perfiles— antes de guardarlo. Si cruza la línea, la
tool **falla** con un mensaje que le explica al modelo qué corregir, y el modelo
reescribe. No se sanea en silencio: a un menú al que se le borran las cifras le
queda un texto incoherente, y es mejor rehacerlo entero.

El mismo barandal aplica a lo que escribe una persona en la pantalla, con un
mensaje distinto: a ella se le explica qué hace CIAN y qué no, sin regañarla.

**Los 15 intentos adversariales están en `tests/nutrition-guardrail.test.ts`**,
cada uno con el prompt que lo provocaría y la salida que representaría. Se
detienen los quince. Y hay diez casos de contenido legítimo que deben pasar,
porque un barandal que bloquea lo que el módulo existe para ofrecer no sirve
de nada.

Alcance honesto de esa prueba: verifica la comprobación determinista, no el
comportamiento del modelo. El modelo puede intentar lo que sea; lo que
garantiza la prueba es que si lo intenta, no pasa.

Dos hallazgos al construirlo, ambos errores propios corregidos:

- **`\b` de JavaScript no entiende letras acentuadas.** «índice de masa
  corporal» no se detectaba porque `\b` antes de «í» no marca frontera. Se
  resolvió con miradas Unicode (`(?<!\p{L})`).
- **Faltaban las formas acentuadas de las unidades.** «porción» y «ración» se
  colaban donde «porciones» y «raciones» sí se detenían.

### Interpretación que conviene revisar

**La lista de compras va sin cantidades.** El PRD prohíbe «cantidades» sin
matizar, y una lista con «2 kg de manzanas» las lleva. Se optó por la lectura
estricta: solo nombres, con una nota en la pantalla que explica por qué. Si te
parece excesivo, relajarlo es cambiar una regla del barandal.

### El registro de tools ya va en 33

Se duplicó respecto de la fase anterior. Es mucho para Flash-Lite y ahora hay
tools que compiten de verdad: ante «organiza la semana» pueden dispararse
`planMeals`, `createRoutine` o `createPlan`. **Este es el momento de medirlo en
serio.** Si falla, `model_configs` de la Fase 9 permite modelo por propósito.

### Decisiones que conviene no revertir sin leer esto

- **Las subtareas se acotan a seis.** El criterio pide que ante «no puedo
  empezar a limpiar» se devuelva un primer paso mínimo, no una lista de diez.
  Una lista larga ante la parálisis es más parálisis. La tool además pide el
  primer paso **aparte** de los demás, para que el modelo tenga que pensarlo.

- **Los perfiles sensoriales acumulan, no reemplazan.** Lo que ya se sabía que
  funciona no se pierde porque una conversación posterior mencione solo una
  parte.

- **`suggestRegulationStrategy` devuelve primero lo que YA le funcionó** a esa
  persona, y también lo que no. Proponer de cero algo que ya se probó y falló
  es la forma más rápida de perder la confianza de quien está agotado.

- **El perfil de alimentación no dice «permitido» ni «prohibido».** Dice «lo
  que come sin problema» y «lo que le cuesta». El vocabulario es parte del
  barandal.

### Deuda técnica

- **Las tareas no tienen fecha límite en la interfaz.** La columna `due_at`
  existe y la tool puede llenarla, pero no hay selector de fecha.

- **`prioritizeTasks` no tiene interfaz propia.** Solo se puede reordenar desde
  la conversación.

- **La bitácora sensorial no tiene vista de patrones.** Es una lista de
  momentos. Los datos están en `sensory_events` para cuando haga falta.

---

## Fase 4 — Adjuntos y voz

### La decisión que define esta fase

**Gemini lee PDF, imágenes y audio de forma nativa**, así que CIAN no extrae
texto de un PDF ni transcribe audio con una biblioteca aparte: el archivo va al
modelo tal cual.

Eso resuelve tres cosas de golpe:

- **Ninguna dependencia fuera de la lista autorizada del PRD.** Extraer texto
  de PDF habría exigido `pdfjs-dist` o similar; transcribir audio, un servicio
  aparte.
- **Mejor resultado.** Un PDF conserva su maquetación y una foto de un cuaderno
  se lee como imagen, no como texto mal reconocido por OCR.
- **Menos piezas que puedan fallar.**

La única excepción es Word, que Gemini no entiende. De ahí sí se saca el texto,
también sin dependencias: un `.docx` es un zip, así que se lee
`word/document.xml` con `node:zlib` y se le quitan las etiquetas.

Límites propios muy por debajo del techo del proveedor (100 MB inline, 50 MB
por PDF): 10 MB por imagen, 20 MB por PDF o audio, 5 MB por documento, hasta 5
archivos por mensaje.

### Lo que quedó verificado

- **715 pruebas**, build y typecheck limpios.
- **La extracción de Word funciona sobre un zip real** construido a mano en la
  prueba, no sobre un mock.
- **El mensaje ante un tipo no soportado dice qué sí se puede subir** y, ante
  uno muy grande, cuánto pesa y cuál es el tope. Es el criterio de aceptación.

### Lo que no se pudo verificar

1. **Que subir un PDF de 20 páginas y preguntar por su contenido funcione**, y
   que una foto de un cuaderno sirva para pedir ayuda con la tarea. Depende del
   modelo y de que Blob esté conectado.
2. **Que el dictado funcione en Safari iOS y Chrome Android.** Hay dos caminos
   implementados y el primero disponible gana, pero no hay dispositivos aquí.
3. **Que la lectura por voz respete la velocidad y se detenga a media frase.**
   `SpeechSynthesis` varía bastante entre navegadores.

### Decisiones que conviene no revertir sin leer esto

- **El dictado tiene dos caminos y no son equivalentes.** Con Web Speech API la
  voz **no sale del dispositivo**; con el respaldo de grabación, el audio se
  sube y lo transcribe Gemini. La interfaz lo dice al grabar, porque es una
  diferencia de privacidad, no de implementación.

- **La lectura por voz nunca arranca sola** y `cancel()` corta a media palabra.
  Quien la activa por error necesita cortarla ya, no esperar al final del
  párrafo.

- **Los adjuntos se suben al elegirlos, no al enviar.** La espera se reparte
  mientras la persona escribe. El precio es que un archivo elegido y nunca
  enviado queda huérfano; `listOrphanAttachments` los encuentra y el barrido
  programado llega con Vercel Cron en la Fase 8.

- **Un mensaje puede ser solo un archivo, sin texto.** Una foto del cuaderno
  basta como pregunta.

- **Las partes de archivo se materializan en el servidor**, nunca en el
  cliente: el modelo recibe base64 y el navegador solo ve `/api/adjuntos/<id>`.
  Es lo que mantiene los archivos privados de verdad.

### Deuda técnica

- **Al editar un mensaje no se reenvían sus adjuntos.** El mensaje original
  los conserva, pero la versión editada va sin ellos. Reenviarlos duplicaría
  los archivos y quitarlos silenciosamente también confunde; hay que decidirlo
  con calma.

- **Las imágenes se sirven con `<img>` y no con `next/image`.** La ruta es
  privada y dinámica, y el optimizador no puede leerla. Se pierde el
  redimensionado automático.

- **No hay recorte ni compresión de imágenes en el cliente.** Una foto de
  teléfono moderna puede acercarse al límite de 10 MB.

---

## Fase 3 — Planes y rutinas

### Lo que quedó verificado

- **634 pruebas**, build y typecheck limpios.
- **El plan exportado produce Markdown que el generador de la Fase 2
  entiende**: se comprueba que los objetivos salen como encabezados y las
  estrategias como viñetas, no como prosa suelta.
- **El aislamiento por tenant cubre las 23 funciones nuevas** de planes y
  rutinas.

### Lo que no se pudo verificar

Todo lo que depende de que el modelo responda:

1. Que «necesito una rutina matutina para mi hijo de 7 años que se distrae
   mucho» produzca pasos ordenados con duraciones razonables.
2. Que «convierte esto en un plan» produzca objetivos y estrategias coherentes
   con lo hablado.

El esquema de las tools obliga a que un plan traiga objetivos con estrategias
y una rutina traiga pasos: si el modelo devuelve prosa, Zod lo rechaza y tiene
que reintentar. Eso garantiza la **forma**, no la calidad del contenido.

### El registro de tools ya va en 16

Con esta fase el orquestador expone dieciséis tools. Es justo el punto que se
anotó al elegir Flash-Lite: conviene medir si sigue enrutando bien, sobre todo
cuando la petición podría resolverse con varias (`createPlan` frente a
`createDocument`, por ejemplo). Si empieza a fallar, la salida está prevista en
`model_configs` de la Fase 9: modelo por propósito.

### Decisiones que conviene no revertir sin leer esto

- **Reordenar pasos se hace con botones de subir y bajar, no arrastrando.** El
  criterio pide que funcione por teclado; con botones, el teclado y el lector
  de pantalla salen gratis, y en teléfono es más preciso que arrastrar. La
  interfaz manda la lista completa al servidor, no «sube este»: así no quedan
  estados intermedios con índices repetidos.

- **La secuencia visual no lleva temporizador.** La duración se muestra como
  referencia («suele tomar 5 min»), nunca como cuenta regresiva. Un cronómetro
  convierte la rutina en una carrera, y el avance automático es justo lo que la
  regla 3.7 prohíbe.

- **Al cambiar de paso, el foco se mueve al encabezado del paso nuevo.** Sin
  eso, quien navega con teclado o lector de pantalla vuelve al principio de la
  página en cada avance.

- **Un plan se crea completo o no se crea.** `createPlan` inserta plan,
  objetivos y estrategias en una transacción: un plan con objetivos pero sin
  estrategias deja a la persona sin saber si fue un error o si así se generó.

### Deuda técnica

- **`routine_steps.image_url` existe en el esquema pero no hay forma de subir
  imágenes.** Las imágenes llegan con los adjuntos de la Fase 4. Por ahora solo
  se admite un emoji como icono.

- **La constancia de rutinas es una lista de fechas**, no una vista de
  patrones. El PRD pide «vista simple de constancia» y eso es lo que hay; si
  hiciera falta más, los datos ya están en `routine_logs`.

- **Editar el título de un plan o una rutina guarda al perder el foco**, sin
  botón. Es cómodo pero poco explícito: alguien que escribe y cierra la pestaña
  sin quitar el foco pierde el cambio.

---

## Fase 2 — Documentos

### Lo que sí quedó verificado en ejecución

A diferencia de las fases anteriores, aquí se pudo probar casi todo sin
infraestructura, porque la generación es local:

- **Criterio de las 15 páginas, con margen.** 15 páginas en 126 ms, 36 en
  108 ms y 118 en 349 ms. El techo de la función son 60 s.
- **Acentos y caracteres del español en PDF.** Se comprobó carácter por
  carácter que las fuentes estándar tienen glifo para los 29 signos habituales
  —acentos, ñ, ¿, ¡, comillas angulares, guiones largos, puntos suspensivos—.
- **El DOCX es un OOXML completo**: firma zip válida y todas las partes
  requeridas (`[Content_Types].xml`, `word/document.xml`, estilos, encabezado,
  pie, numeración).
- **419 pruebas**, build y typecheck limpios.

### Lo que no se pudo verificar

1. **Que los PDF abran bien en iOS, Android y escritorio**, y que los DOCX
   abran en Word y Google Docs sin advertencias. No hay dispositivos ni Word
   aquí. La estructura es correcta, pero eso no sustituye abrirlos.
2. **La subida a Vercel Blob.** Falta `BLOB_READ_WRITE_TOKEN` en este entorno.
   Sin él, el documento queda en `failed` con un mensaje explícito en vez de
   fallar en silencio.
3. **Que el modelo llame a `createDocument`** ante «conviértelo en una carta
   para la directora». Es el mismo riesgo de enrutamiento anotado para
   Flash-Lite, ahora con una tool más en el registro.

### Decisiones que conviene no revertir sin leer esto

- **El archivo se guarda con `access: 'private'` y la URL del store no se
  expone nunca.** La descarga pasa por `/api/documentos/[id]`, que comprueba el
  tenant contra la base. Servir un redirect a la URL del blob dejaría el enlace
  suelto en el historial del navegador e incumpliría el criterio de aislamiento
  entre tenants.

- **El folio es secuencial por tenant y por año** (`AIN-2026-000042`), con
  índice único y reintento. Un identificador aleatorio habría sido más simple,
  pero quien recibe un documento institucional espera un folio correlativo.

- **Regenerar no borra el original hasta que la versión nueva está arriba.**
  Perder un documento por una instrucción mal entendida sería el peor
  resultado posible.

- **Al regenerar sí se espera el resultado**, a diferencia de la generación
  desde el chat, que va con `waitUntil`. La diferencia es quién lo pidió: una
  persona que acaba de pulsar un botón quiere ver el resultado.

### Deuda técnica

- **La tarjeta del chat consulta el estado cada 2 segundos**, hasta 90. No hay
  notificación en vivo. Cuando la Fase 8 traiga Web Push, conviene revisarlo.

- **El intérprete de contenido es deliberadamente pequeño**: encabezados,
  viñetas, listas numeradas, casillas, citas y separadores. No cubre tablas ni
  imágenes. Si un documento las necesita, hay que ampliarlo a conciencia.

- **Un emoji del modelo se descarta en el PDF**, y queda constancia en el log.
  Es la decisión correcta —un documento sin emoji sirve, uno que no se generó
  no— pero conviene saber que el PDF puede diferir del texto del chat.

- **`documents.source_content` guarda el contenido del documento**, que puede
  ser sensible. Está acotado por tenant como todo lo demás, pero es la primera
  tabla donde vive texto largo de la persona fuera de los mensajes.

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
