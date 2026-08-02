# NOTES

Hallazgos, deuda técnica y pendientes por fase. Lo que aparece aquí no se
resuelve en la fase en curso: se anota y se sigue (regla de oro del PRD).

---

## Transversal — Cerrar sesión daba error

Reportado en uso. La causa no tenía nada que ver con cerrar sesión: la
introduje yo al construir las membresías.

### Qué pasaba

`lib/tenant/actions.ts` lleva `'use server'`, y de ahí exporté tres constantes
—`INVITABLE_ROLES`, `ROLE_LABELS`, `ROLE_HINTS`— para que las usara la pantalla
de miembros. **Un archivo `'use server'` solo puede exportar funciones
asíncronas.**

Lo peligroso es cuándo se nota:

- `tsc --noEmit`: limpio.
- `pnpm test`: limpio.
- `next build`: limpio, y el despliegue sale verde.
- En ejecución, al invocar **cualquier** server action del mismo paquete: 500 y
  `A "use server" file can only export async functions, found object.`

No rompe solo la acción culpable, se lleva por delante todas las que compartan
paquete. Por eso el síntoma fue el botón de cerrar sesión, que no tiene ninguna
relación con los roles de un espacio. El síntoma no señalaba a la causa por
ningún lado.

Las constantes se mudan a `lib/tenant/roles.ts`, un módulo normal.

### Cómo se encontró, porque el método importa

No se dedujo leyendo: se reprodujo. Se levantó la aplicación con `next start`,
se sacó el identificador de la server action del manifiesto de la build
(`.next/server/server-reference-manifest.json` y el chunk del cliente) y se
invocó por HTTP con la cabecera `Next-Action`. El error salió entero en el log
del servidor, con su traza.

Dos trampas de ese proceso que conviene recordar si hay que repetirlo:

- **`npx next build | head -3` puede matar el build a mitad** por SIGPIPE y
  dejar `.next` a medias, lo que da resultados falsos. Los builds de
  verificación van a un archivo, sin recortar.
- El identificador de una server action **cambia en cada build**: hay que volver
  a sacarlo después de recompilar.

### La red que queda puesta

`tests/server-actions.test.ts` recorre `lib/`, `app/` y `components/`, encuentra
los archivos con la directiva y comprueba que cada `export` sea una función
asíncrona o un tipo. Comprobado que falla si se reintroduce el fallo.

Es una comprobación de texto, no un análisis sintáctico: no hay parser de
TypeScript en las pruebas y meter uno sería una dependencia nueva por algo que
se ve mirando las líneas que empiezan por `export`. Eso la hace conservadora, y
si algún día hace falta una forma válida que no contempla, lo que toca es
ampliar la lista, no borrar la prueba.

---

## Transversal — El menú no se podía recorrer en teléfono

Reportado en uso: «el menú queda muy expandido, en móvil no permite hacer
scroll hasta abajo». Eran dos fallos que se sumaban.

### No había ningún contenedor con scroll

`sidebarBody` era una columna de flex con `h-full` y sin `overflow` en ninguna
parte. La lista de conversaciones era lo único desplazable, porque tenía
`flex-1 overflow-y-auto`.

El resto —diecisiete secciones más el bloque de cuenta— medía por sí solo más
que la pantalla de un teléfono. Al no caber, las cajas se encogían por debajo de
su contenido (que es lo que hace flex por omisión) y ese contenido se salía por
abajo sin nada que lo desplazara: el pie acababa pintado sobre la lista de
secciones, y de *Crisis* en adelante no se llegaba a nada.

Medido con Chromium a 390×780, desplazando al fondo todo lo desplazable:
*Crisis* en `y=803`, *Accesibilidad* en `y=1379` y *Cerrar sesión* en `y=1552`,
con el viewport acabando en 780. Después del arreglo, las dos últimas caen
dentro y ninguna sección queda fuera del recorrido del scroll, en 390×780,
360×640, 390×560 (teclado abierto) y 1280×700.

**Afectaba también al escritorio**, aunque se reportara en teléfono: el mismo
`sidebarBody` se usa en los dos, y en un portátil de 720p el menú tampoco cabía.

### El cajón se medía contra el viewport equivocado

`fixed inset-y-0` en un teléfono se resuelve contra el viewport grande, el que
existe con la barra de direcciones escondida. Con la barra a la vista, el último
tramo del menú quedaba **debajo del navegador**: no era contenido pendiente de
desplazar, era contenido tapado. Pasa a `top-0` con `h-dvh`, que sigue al
viewport que de verdad se ve.

De paso desaparece el `h-[calc(100% - 3.5rem)]` que descontaba a ojo la altura
del botón de cerrar. Un número mágico así deja de cuadrar en cuanto ese botón
cambie de tamaño.

### El menú de acciones de cada conversación se recortaba

Detectado al arreglar lo anterior y corregido en el mismo paso.

El menú de tres puntos —cambiar nombre, archivar, eliminar— era `absolute`
dentro del contenedor de la lista, que tiene `overflow-y-auto`. Al abrirlo en
la última conversación quedaba **entero por debajo del borde de recorte**: a
390×780, 122 píxeles fuera y ninguna de las tres opciones visible. No es que se
viera cortado; es que no se veía, y pulsar el botón parecía no hacer nada.

Técnicamente sí se podía alcanzar —un descendiente absoluto alarga el área
desplazable del contenedor—, pero eso exige que la persona desplace a ciegas
después de pulsar un botón que aparentemente no respondió.

Pasa a `position: fixed` con las coordenadas del disparador, que lo saca del
recorte porque se mide contra el viewport. Comprobado que ningún ancestro
—`transform`, `filter`, `contain: paint`— crea bloque contenedor para elementos
fijos, que es lo que lo habría vuelto a recortar en silencio.

Sigue viviendo en el DOM junto a su botón, así que para un lector de pantalla el
menú y lo que lo abrió no se separan.

**Y se cierra donde antes no se cerraba.** No había ni Escape ni cierre al tocar
fuera: el menú se quedaba abierto hasta volver a pulsar el mismo botón. Ahora se
cierra con Escape —devolviendo el foco al disparador—, al tocar fuera, al
desplazar y al cambiar el tamaño de la ventana. Al desplazar se cierra en vez de
recolocarse a propósito: un menú pegado al viewport mientras la lista se mueve
debajo acaba señalando a otra conversación, y esas opciones incluyen eliminar.

La altura se mide después de pintarlo, no se calcula de antemano: depende del
tamaño de letra del sistema, y quien usa esta plataforma es bastante probable
que lo tenga subido.

### Decisiones del arreglo

- **El pie queda fijo**, fuera del scroll. La cuenta y cerrar sesión tienen que
  estar siempre en el mismo sitio: buscarlas desplazándose es justo lo que le
  cuesta a quien navega esta plataforma.
- **La lista de conversaciones tiene tope (`max-h-[40vh]`)** en vez de quedarse
  con todo el espacio sobrante. Que llegar a *Crisis* dependa de cuántas
  conversaciones tengas es exactamente lo que no puede pasar.
- **`min-h-0` en la zona con scroll.** Sin él, un hijo de flex nunca baja de su
  tamaño de contenido y el `overflow` no llega a activarse: es la mitad del
  fallo original y el error que se repetiría al tocar esto otra vez.

---

## Transversal — Membresías de espacio

Esto no pertenece a una fase: se descubrió al preguntar «¿cómo añades a
médicos?» y resultó ser el hueco que rompía tres fases a la vez.

### La única línea que creaba una membresía

Estaba en `lib/auth/provisioning.ts`: al entrar por primera vez, cada persona
recibía su espacio personal como `owner`. No había forma de meter a nadie más en
un espacio. Cada consecuencia parecía una limitación aislada y por eso no se
veía:

- **El consultorio (Fase 10)** solo lista profesionales del propio espacio, así
  que un médico que se registraba caía en el suyo y nadie podía reservarle. La
  fase entera era inutilizable con terceros.
- **Los asientos (Fase 9)** estaban definidos en `plan_limits` y cobrados en el
  checkout, y sin aplicar, porque no había dónde aplicarlos.
- **El selector de espacios (Fase 0)** no tenía sentido: nadie pertenecía a más
  de uno.

### No es el equipo de apoyo, y no conviene fundirlos

`support_team_members` (Fase 8) comparte **recursos sueltos** con gente de
fuera, y pertenecer a él no da acceso a nada por sí solo. `tenant_invitations`
es lo contrario: entrar a un espacio es trabajar dentro de él con un rol.

Son dos mecanismos y dos rutas de aceptación (`/invitacion/[token]` y
`/unirme/[token]`) a propósito. Mezclar «te comparto este plan» con «trabajas en
mi organización» en un solo camino con un `if` acaba dando a alguien más de lo
que se le quiso dar el día que una de las dos cambie.

### Decisiones que conviene no revertir sin leer esto

- **`owner` no se puede invitar por correo.** Se transfiere desde dentro, viendo
  a quién se le da. Una invitación que concede la propiedad del espacio es
  demasiado poder viajando en un enlace.
- **Ni `changeMemberRole` ni `removeMember` dejan el espacio sin propietario.**
  De ese estado no se sale sin tocar la base a mano: no se podría invitar, ni
  verificar profesionales, ni cancelar la suscripción.
- **Las invitaciones pendientes ocupan asiento.** Si no contaran, se podrían
  mandar veinte invitaciones con tres asientos y el límite se descubriría al
  aceptar la cuarta, dejando fuera a alguien después de haberle escrito.
- **Los asientos se comprueban otra vez al aceptar**, no solo al invitar: entre
  una cosa y otra el plan pudo bajar o pudo entrar alguien más.

### La tercera excepción sin `TenantContext`

`acceptTenantInvitation` no lo recibe, junto a `listMembershipsForUser` y al
invitado de la Fase 8. Quien acepta viene de su propia cuenta y todavía no
pertenece a ese espacio: exigir contexto haría imposible la operación.

Se limita sola: solo encuentra la fila por el hash de un token que únicamente
tiene quien recibió el correo, exige que el correo coincida —comparación de
tiempo constante— y lo único que escribe es la membresía de esa persona en ese
espacio.

### Pendiente

- **Sin ninguna invitación probada de extremo a extremo**, porque depende de
  Resend y del proxy de este entorno. La invitación se crea igual sin correo
  configurado y la pantalla enseña el enlace para pasarlo a mano, como en la
  Fase 8.

---

## Fase 10 — Consultorios virtuales

### La videollamada la pone Google Meet

Decisión del responsable, tomada al cerrar la fase: nada de servidor de medios
propio ni de SDK de WebRTC. Cada profesional pega su enlace de Meet en su perfil
y CIAN controla **quién lo ve y cuándo**.

Con eso, el proyecto entero queda **sin una sola dependencia fuera de la lista
autorizada del PRD**, que era la única que quedaba pendiente.

**Lo que CIAN sigue controlando:** el enlace no viaja en el HTML de la página.
Se pide a `/api/consultorio/sala/[appointmentId]`, que comprueba en ese
instante participación, tenant, estado de la cita y ventana horaria. Un enlace
no sobrevive a que la cita se cancele, y quien no es parte de la consulta no lo
obtiene por ninguna vía.

**Lo que CIAN ya no controla:** lo que pase dentro de Meet.

### El criterio de la grabación cambia de alcance, y hay que decirlo

El PRD pide que la grabación sea «imposible de iniciar sin consentimiento
registrado de ambas partes». Con la videollamada en Meet, **ese criterio ya no
se puede cumplir técnicamente**: quien decide grabar dentro de Meet es Google y
quien maneja la reunión, no nosotros.

Lo que queda, y está implementado y probado:

- El acuerdo exige las **dos** firmas y se guarda con sello de tiempo del
  servidor, de modo que después se puede responder quién autorizó y cuándo.
- Basta con que una parte lo retire para que el acuerdo deje de existir.
- La pantalla lo dice con estas palabras: «tu autorización queda registrada
  aquí y sirve como acuerdo entre ambas partes, pero CIAN no puede impedir
  técnicamente lo que ocurra dentro de Meet».

Se prefirió decirlo a dejar una promesa que la arquitectura ya no sostiene. En
una consulta de salud, «imposible» cuando en realidad es «acordado» es una
mentira con consecuencias.

`canStartRecording` sigue siendo la función que decidiría el permiso técnico si
algún día la videollamada vuelve a un servidor propio. La pieza está lista; lo
que falta es el servidor.

### El enlace se valida contra una lista de hosts

Un campo de URL libre que después se pinta como enlace, dentro de una
plataforma de salud, es una vía de phishing: bastaría con que alguien con
perfil profesional pusiera una dirección que imita a Meet.

`parseMeetingLink` exige `https`, host **exacto** de la lista —se compara el
host completo, no un sufijo, porque `meet.google.com.phishing.mx` pasaría un
`endsWith`— y rechaza credenciales embebidas. Hay pruebas con cuatro impostores
y cuatro protocolos peligrosos.

Añadir Zoom es agregar su host a `ALLOWED_HOSTS` y su etiqueta; el resto del
módulo no cambia.

### `sessions` estaba ocupado

El PRD nombra la tabla `sessions`, pero Auth.js la ocupa desde la Fase 0 para
las sesiones de inicio de sesión. La tabla se llama `consult_sessions`; todo lo
demás del esquema es idéntico al del PRD.

### La prueba de las notas privadas mira el SQL, no el resultado

El criterio dice que las notas privadas **jamás** aparecen en una respuesta
accesible al usuario. Lo tentador sería sembrar dos notas y comprobar que la
lectura devuelve una — y eso **no probaría el fallo que importa**: si alguien
filtrara las notas al pintar en vez de en la consulta, esa prueba pasaría igual
mientras las notas privadas viajan en la respuesta de red, donde cualquiera las
lee abriendo las herramientas del navegador.

Así que `tests/consultorio-notas.test.ts` compila la consulta y comprueba que
la condición de visibilidad está en el `WHERE`, que la consulta del usuario
nunca menciona `privada`, y —para que la prueba no se satisfaga filtrando
siempre— que la del profesional **no** filtra.

### Editar el perfil devuelve la verificación a pendiente

Si cambian las especialidades o la cédula. Verificar a alguien como psicólogo y
que después añada «psiquiatría» sin revisión sería exactamente el agujero que
la verificación existe para tapar.

### Pendientes de esta fase

- **Tres criterios pasan a depender de Meet, no de CIAN**: conectar en menos de
  cinco segundos, pantalla compartida junto al video y funcionar en Safari iOS.
  Los tres los cumple Meet por su cuenta; CIAN ya no participa en ellos y por
  tanto no puede garantizarlos ni medirlos.
- **La grabación con consentimiento ya no es una garantía técnica**, solo un
  acuerdo registrado. Ver arriba.
- **Sin chat de sesión.** Iba por el canal de datos de la videollamada. El de
  Meet sirve, y duplicarlo dentro de CIAN sería ruido; queda como decisión
  abierta si se quiere uno que se conserve en el historial.
- **La pizarra no se sincroniza sola.** Se guarda al soltar el trazo y la otra
  parte la ve al recargar. Para tiempo real haría falta un canal en vivo, que
  ahora mismo no existe en ninguna parte del sistema.
- **El resumen no lo genera la IA todavía.** El campo, la aprobación y la
  publicación están; falta la llamada al modelo que redacte el borrador a
  partir de las notas compartidas. Es media hora de trabajo y depende de una
  decisión que no tocaba tomar sola: qué notas alimentan el resumen. Las
  privadas del profesional, por definición, no deberían.
- **Sin recordatorios de cita.** El alcance los pide. La infraestructura existe
  entera desde la Fase 8 (`reminders` + barrido diario); falta crear el
  recordatorio al confirmar una cita. No se hizo porque el barrido es diario y
  un aviso de cita que llega «en algún momento del día» no sirve: conviene
  resolverlo junto con la frecuencia del cron.
- **Sin compartir documentos, planes y rutinas dentro de la sesión.** El
  alcance lo pide. La Fase 8 ya tiene el mecanismo (`resource_shares`); falta
  el atajo desde la pantalla de sesión.
- **Sin subida de documentos de cédula.** El esquema tiene `license_docs`;
  falta la subida a Blob desde el formulario.
- **La verificación es del tenant, no de la plataforma.** Un admin de espacio
  verifica a los profesionales de su espacio. Para una verificación central de
  CIAN haría falta que el superadmin de la Fase 9 vea otros tenants, y esa
  puerta no se abrió a la ligera.

---

## Fase 9 — Membresías y panel administrativo

### Stripe por REST, sin SDK

Tercera vez que pasa lo mismo —`web-push`, el SDK de Resend y ahora `stripe`—
y por la misma razón: la regla de oro del PRD pide proponer cualquier
dependencia fuera de la lista antes de instalarla. De Stripe se usan tres
llamadas HTTP y una comprobación de firma; el SDK no aporta nada que `fetch` y
`node:crypto` no hagan.

**Lo que sí está verificado**, con pruebas: que la firma del webhook solo pasa
si viene del secreto correcto, con el cuerpo exacto y dentro de la ventana de
tiempo; que un cuerpo alterado con la firma original se rechaza; que una firma
auténtica pero vieja se rechaza; que acepta varias firmas `v1` durante una
rotación de secreto; y que el codificador de formularios anida con corchetes
como espera Stripe.

**Lo que no**: ningún pago real ha pasado por aquí. Hace falta una cuenta de
Stripe con productos y precios creados. El flujo completo —contratar, renovar,
fallar el pago, cancelar— está implementado y sin probar contra el servicio.

### El cuerpo del webhook se lee crudo

`await request.text()` antes de tocar nada. Si se parseara el JSON y se volviera
a serializar, cambiarían espacios y orden de claves y **todo webhook legítimo se
rechazaría**. Es el error clásico de esta integración y está anotado en la ruta
para que nadie lo «arregle».

### Un pago fallido no corta el acceso

`pago_pendiente` sigue dando servicio. Stripe reintenta el cobro durante días, y
quitarle las herramientas a una familia por una tarjeta vencida sería
desproporcionado. Está en `grantsAccess` y comprobado en las pruebas.

Por el mismo criterio, un estado de Stripe que no sepamos leer cae en
`incompleta`, que **no** da acceso: ante lo desconocido, no conceder.

### La aplicación no le pregunta a Stripe

`subscriptions` es un espejo actualizado por webhook, y es lo que se lee para
decidir si alguien tiene acceso. Consultar la API en cada petición ataría cada
pantalla a la disponibilidad de un tercero.

El precio es la deriva: si un webhook se pierde, la tabla queda desactualizada.
Se acepta porque el error cae del lado generoso —alguien conserva acceso que ya
no paga— y no del que le quita herramientas a quien las usa.

**Resuelto: hay reconciliador.** `/api/cron/suscripciones` corre una vez al día
(`0 11 * * *`), pregunta a Stripe por cada suscripción que conocemos y escribe
lo que Stripe diga, porque Stripe es quien cobró. Solo lee y ajusta lo nuestro:
no cancela, no cobra y no crea nada allá —un reconciliador que además escribe en
el proveedor convierte un error de lectura en un cobro—. Si Stripe no responde
para una fila, esa fila se deja como está: bajarla a `cancelada` por no poder
leerla sería quitarle el acceso a alguien porque Stripe tuvo un mal minuto.

La comparación (`differs`) y la lectura del objeto (`parseRemote`) son puras y
están probadas en `tests/reconcile.test.ts`. El barrido completo sigue sin
verificarse contra Stripe real, como todo lo demás de esta fase.

### Lo que nunca se limita

La escalera de derivación de crisis. La ruta de chat comprueba el límite de plan
**después** de la detección de emergencia y solo cuando no hay señal, igual que
ya hacía con el límite por minuto. Cobrar por el momento en que alguien pide
ayuda sería indefendible.

### La biblioteca ya se administra desde la plataforma

Era una petición explícita: no debería hacer falta editar archivos del
repositorio para publicar contenido. `/admin/biblioteca` crea, edita y retira
recursos globales, con su indexado y sus embeddings.

**La trampa, y está en la interfaz:** los archivos de `content/library/` se
siguen indexando en cada despliegue. Un recurso creado en el panel con el mismo
`slug` que un archivo lo sobrescribe, y el siguiente despliegue lo revierte. La
pantalla marca qué recursos vienen de archivo. Lo limpio sería migrar los
archivos a la base y quitar el indexado del build, pero eso es una decisión
sobre de dónde viene el contenido de arranque y no tocaba tomarla aquí.

**Después:** el panel ya no es solo del superadmin. Quien administra un espacio
publica **para su espacio**, que es lo que la Fase 6 pedía y no existía en
ninguna pantalla. Eso destapó un fallo de esquema: `library_resources` tenía el
`slug` único en toda la tabla y el upsert resolvía el conflicto por `slug`, así
que el primer recurso de un espacio con el nombre de uno global lo habría
sobrescrito **para toda la plataforma**. Ahora son dos índices únicos parciales,
uno por ámbito. Dos parciales y no uno de `(tenant_id, slug)` porque en Postgres
dos `NULL` no chocan entre sí.

### El panel estaba escondido

Quedó como decimoséptimo elemento de la barra lateral, debajo de
Accesibilidad. Existía y no se encontraba, que para el caso es lo mismo. Ahora
tiene su propio sitio junto al bloque de cuenta, separado de las secciones de
acompañamiento —que son de otra naturaleza— y solo aparece para quien puede
entrar.

### Sin costo estimado en pesos

El PRD lo pide entre las métricas. No está, a propósito: poner una cifra de
dinero exigiría cablear el precio por millón de tokens de cada modelo, que
cambia sin avisar y sin que nada en el código se entere. Una cifra
desactualizada sobre la que se toman decisiones de presupuesto es peor que
ninguna. Están los tokens por modelo, que es el dato que sí es verdad y con el
que se puede calcular fuera.

**Es un criterio de aceptación entregado a medias y conviene decidirlo**: o se
añade una tabla de precios editable desde el panel, o se acepta que el costo se
calcula fuera.

### Cambiar un modelo tarda hasta cinco minutos

`resolve-model.ts` cachea en KV cinco minutos, igual que los prompts. Guardar
desde el panel invalida la caché de ese propósito, así que el cambio se ve al
instante en la instancia que lo guardó; las demás pueden tardar. Aceptable para
configuración, y la pantalla lo dice.

### Pendientes de esta fase

- **Sin ningún pago real probado.** Cuatro de los seis criterios de aceptación
  dependen de una cuenta de Stripe configurada.
- ~~Sin reconciliador de suscripciones.~~ **Resuelto.** Ver arriba.
- ~~Membresías de organización con asientos: a medias.~~ **Resuelto.**
  `/admin/miembros` invita, cambia roles y retira, y `checkSeats` aplica el
  límite del plan contando las invitaciones pendientes como ocupadas: si no
  contaran, el tope se descubriría al aceptar, dejando fuera a alguien después
  de haberle escrito.
- ~~`plan_limits` no tiene pantalla.~~ **Resuelto.** `/admin/planes`, solo para
  superadmin. Un campo vacío significa «sin límite» y no cero, y el
  almacenamiento se escribe en megabytes: pedir bytes en un formulario es pedir
  errores de tres ceros.
- **El panel no administra otros tenants.** Un superadmin ve datos globales
  —prompts, biblioteca— pero sigue viendo métricas y auditoría solo de su propio
  espacio. Administrar usuarios y organizaciones ajenas exigiría un camino que
  esquive el ámbito de tenant, y no se abrió a la ligera.

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

### Un solo barrido al día: los avisos son un resumen, no una alarma

`vercel.json` declara `0 13 * * *` para `/api/cron/recordatorios`: una vez al
día, a las 13:00 UTC, que son las 7:00 en Ciudad de México.

Esto **cambia lo que la aplicación puede prometer**, y el código y la interfaz
lo dicen en vez de disimularlo. Con un solo barrido, un recordatorio no suena a
la hora que la persona eligió: sale en el barrido. Así que los avisos son un
resumen del día, con la hora escrita dentro del mensaje —«Rutina de la mañana ·
A las 07:00»—, que sirve como agenda aunque no sea una alarma.

Dos consecuencias en el código, ambas necesarias:

- **`isDue` ya no tiene ventana horaria.** Con un solo barrido, una ventana de
  quince minutos alrededor de la hora elegida dejaría fuera a todo el mundo
  menos a quien la puso justo a esa hora: la mayoría de los recordatorios no se
  enviaría nunca, en silencio. La regla es de día: entra lo que toca hoy y no
  ha salido hoy. El corte contra el duplicado sigue siendo `lastSentAt` en hora
  local.
- **El silencio se mide contra la hora elegida**, no contra la del barrido.
  Medirlo contra la del barrido rompería el módulo fuera del centro de México:
  en Tijuana el barrido cae a las 6:00 locales, dentro del silencio nocturno
  por omisión, y esa persona no recibiría un aviso jamás sin que nada lo
  indicara.

`SWEEP_HOUR_UTC` en `lib/notifications/types.ts` documenta la hora y tiene que
coincidir con `vercel.json`. Si algún día el proyecto sube a un plan con cron
más frecuentes, lo que hay que cambiar es esa constante, `vercel.json` y volver
a meter una ventana en `isDue` —además del texto de la interfaz, que hoy
promete un resumen y pasaría a poder prometer puntualidad—.

**Límite conocido:** un recordatorio de las 20:00 llega en el resumen de las
7:00 de ese mismo día, es decir, con antelación. Es preferible a que llegue al
día siguiente, pero no es lo que la palabra «recordatorio» sugiere. La interfaz
lo advierte en el formulario y arriba de la pantalla.

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

- ~~El modo crisis no se puede activar desde la interfaz.~~ **Resuelto.**
  `/crisis` abre con «Necesito ayuda ahora», que lleva a una conversación nueva
  con el primer mensaje ya enviado. El modo crisis lo sigue encendiendo el
  modelo al llamar a `activateCrisisSupport` —nunca una palabra clave del
  cliente— pero ya no hace falta acertar con las palabras para llegar ahí.
- ~~El registro del episodio se hace conversando.~~ **Resuelto.** Hay alta
  manual en `/crisis`, y pasa por el mismo barandal médico que las tools: no
  para protegerse del modelo, sino para que la bitácora no acabe siendo un
  expediente con diagnósticos y dosis escritos por quien no puede
  diagnosticar.
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

- **`CRON_SECRET`** (`openssl rand -hex 32`). Sin él las rutas de cron se niegan
  a correr: dejarlas abiertas permitiría a cualquiera provocar el costo de
  reindexar la biblioteca entera, disparar notificaciones reales o consumir la
  cuota de la API de Stripe. Es el mismo secreto para las tres.
- Los crons ya están declarados en `vercel.json`, todos en UTC:
  reindexado de la biblioteca los lunes a las 8:00, recordatorios diarios a las
  13:00 y reconciliación de suscripciones diaria a las 11:00.

### Deuda técnica

- **El intérprete de frontmatter está escrito a mano.** Son cinco campos de
  texto y no justifica una dependencia. Si el frontmatter se complica, conviene
  proponer `gray-matter` antes que estirarlo.

- ~~No hay forma de cargar recursos propios de un tenant desde la interfaz.~~
  **Resuelto.** `/admin/biblioteca` ya publica en dos ámbitos: quien administra
  un espacio publica para su espacio, y solo el superadmin publica para todo
  CIAN. Son dos listas separadas y no una con etiquetas, porque retirar un
  recurso global afecta a toda la plataforma y retirar uno del espacio no, y esa
  diferencia tiene que verse antes de pulsar.

- ~~La biblioteca no tiene buscador propio en su pantalla.~~ **Resuelto.**
  `/biblioteca?buscar=` usa la misma `searchLibrary` que el modelo, con su
  respaldo textual cuando no hay embeddings.

  Va por la URL y lo resuelve el servidor a propósito: el resultado se puede
  compartir y guardar en marcadores, funciona sin JavaScript, y quien vuelve con
  el botón de atrás encuentra lo que estaba mirando. Se deduplica por recurso:
  la función devuelve fragmentos, y la misma guía repetida cuatro veces parece
  cuatro guías y esconde las demás.

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

- ~~Las tareas no tienen fecha límite en la interfaz.~~ **Resuelto.** Con
  selector de fecha por tarea. El instante lo construye el navegador a partir
  del día local: una fecha suelta habría que interpretarla en algún huso, y el
  del servidor no es el de nadie —en Tijuana, una tarea para el jueves se
  habría guardado como miércoles—.

- ~~`prioritizeTasks` no tiene interfaz propia.~~ **Resuelto.** Con dos flechas
  por tarea, no arrastrando: arrastrar exige puntería y mantener el clic, y no
  funciona con teclado ni con lector de pantalla.

- ~~La bitácora sensorial no tiene vista de patrones.~~ **Resuelto.**
  `lib/sensory/patterns.ts`, puro y calculado en el navegador por lo mismo que
  el de crisis: las franjas horarias dependen del huso de quien mira.

  Dos decisiones que conviene no revertir: «se mantuvo igual» no cuenta ni en
  lo que ayudó ni en lo que no —es lo único que se sabe de ese registro: nada—,
  y la intensidad se cuenta por nivel en vez de promediarse, porque un promedio
  la convierte en una calificación y una calificación invita a bajarla. Por
  debajo de cinco registros no se enseña nada.

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

- ~~`routine_steps.image_url` existe en el esquema pero no hay forma de subir
  imágenes.~~ **Resuelto.** Se sube por `/api/adjuntos`, el mismo camino que los
  adjuntos del chat, así que queda en almacenamiento privado tras una ruta que
  comprueba el tenant. En la secuencia la imagen manda sobre el emoji: es el
  apoyo visual de verdad y quien la puso lo hizo para verla grande ahí.

  El repositorio **solo acepta rutas con la forma `/api/adjuntos/<uuid>`**. Sin
  eso, escribir `image_url` sería escribir un `<img src>` arbitrario, y una
  imagen remota en la pantalla de una rutina le cuenta al servidor que la sirve
  cuándo la abre esta persona y desde dónde.

- ~~La constancia de rutinas es una lista de fechas.~~ **Resuelto.** Racha
  actual, días en total, racha más larga y una tira de cuatro semanas.

  Las rachas mal hechas castigan, así que: cuenta días distintos y no veces,
  deja un día de margen —abrir la pantalla por la mañana antes de hacerla no
  rompe nada—, enseña el total además de la racha porque «56 días» sigue siendo
  verdad el día después de fallar, y no hay porcentajes de cumplimiento ni días
  fallados en rojo. Calculado en el navegador: en un servidor en UTC, una rutina
  hecha a las nueve de la noche en Ciudad de México cae al día siguiente.

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

- ~~Sin ESLint.~~ **Resuelto, con autorización explícita.** `eslint` y
  `eslint-config-next` no estaban en la lista de dependencias del PRD, así que
  el proyecto entero se construyó con `tsc --noEmit` como única red y esto
  quedó anotado hasta que se pidió instalarlo.

  Se instalaron **solo dos**: `eslint` 9 y `eslint-config-next` fijado a la
  misma versión que Next (15.5.22), más `@eslint/eslintrc` que hace falta para
  leer la configuración plana. Nada de `typescript-eslint` con reglas que
  exigen información de tipos: es otra dependencia grande y otra pasada del
  compilador en cada ejecución, y `tsc --noEmit` ya cubre lo que aportaría.

  `pnpm add -D eslint eslint-config-next` sin fijar trae ESLint 10 y
  `eslint-config-next` 16, y los tres plugins que arrastra piden ESLint 9. Si
  algún día hay que reinstalarlo, conviene fijar las dos versiones.

  **263 archivos, cero errores y cero avisos** a la primera pasada. Los dos
  únicos hallazgos se corrigieron: la pantalla de secuencia recibía el título
  de la rutina y no lo usaba —ahora lo enseña al terminar, que quien tiene
  varias rutinas necesita saber cuál acaba de cerrar— y la propia configuración
  exportaba un array anónimo.

  Lo que aporta sobre `tsc`, y por lo que valía la pena: dependencias mal
  declaradas en `useEffect`/`useMemo`, que en React 19 dan datos rancios en
  pantalla sin error ninguno, y las reglas de accesibilidad de `jsx-a11y`, que
  en una plataforma cuyo público navega con lector de pantalla no son
  cosmética.

- ~~Sin caché de prompts en KV.~~ **Resuelto en la Fase 1.** `getPromptContent`
  cachea en KV con 300 segundos de vida y cae a Postgres si KV no responde. La
  nota se quedó aquí sin tachar y decía lo contrario de lo que hace el código.

- ~~Selector de espacio de trabajo.~~ **Resuelto** al construir las membresías.
  El selector aparece en la barra lateral solo cuando alguien pertenece a más de
  un espacio —uno solo es ruido— y `switchTenantAction` comprueba la membresía
  antes de escribir la cookie.

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

- **`user_preferences.detail_level` sigue sin llegar al modelo, y es el
  pendiente más serio que queda fuera de la Fase 10.** Se guarda, se configura
  desde Accesibilidad y el prompt del orquestador lo menciona, pero la única vía
  por la que el modelo puede leerlo es llamando a la tool `getUserContext`. Con
  Flash-Lite y más de cuarenta tools registradas, para una pregunta normal no la
  llama.
  El efecto es que quien puso «respuestas breves» —probablemente porque los
  textos largos le abruman— sigue recibiendo respuestas largas. Es un ajuste de
  accesibilidad que existe, se anuncia y no hace nada la mayor parte del tiempo,
  que es peor que no ofrecerlo. Se arregla añadiendo la guía de detalle al
  `system` en `app/api/chat/route.ts`, donde el modelo no puede ignorarla.
- ~~`prompts/seed/safety.disclaimer.md` está sembrado y sin usar todavía.~~
  **Resuelto nueve fases después.** El descargo bajo el campo de escritura se
  lee de la tabla `prompts`, con el texto corto de respaldo si la base no
  responde. Estuvo todo ese tiempo editable desde el panel sin que editarlo
  cambiara nada de lo que se veía. El del login sigue siendo texto fijo: esa
  pantalla no tiene sesión ni base garantizada.
- El registro de tools (`buildTools`) y la carpeta `lib/ai/` todavía no existen:
  la Fase 0 se entrega sin IA, tal como pide el PRD.
