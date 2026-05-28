# ExaTicket

Sistema de tickets de soporte multicanal (**WhatsApp + Telegram**) con **Chat IA de primera respuesta** e integración con **Splynx ISP Billing**.

El backend utiliza [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) o [Baileys](https://github.com/WhiskeySockets/Baileys) para WhatsApp, y [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) para Telegram. Todos los canales crean tickets y los almacenan en MySQL/MariaDB.

El frontend es una aplicación de chat multiusuario construida con React y Material UI, que se comunica con el backend mediante API REST y WebSockets.

> **Aviso:** El uso de clientes no oficiales de WhatsApp puede resultar en el bloqueo del número. Úsalo bajo tu propia responsabilidad.

---

## ⚡ Instalación rápida (5 pasos)

> Requisito único: tener **Docker** instalado. Si no lo tienes, ve a la sección [Instalación de Docker](#instalación-de-docker-en-ubuntu) más abajo.

```bash
# 1. Clonar el repositorio
git clone https://github.com/eliexerguevara/ExaTicket.git
cd ExaTicket

# 2. Crear el archivo de configuración
cp .env.example .env
```

Abre el `.env` y cambia **solo estas 3 líneas** obligatorias:

```bash
MYSQL_ROOT_PASSWORD=pon_aqui_una_contraseña_segura
BACKEND_URL=http://TU_IP_PUBLICA
FRONTEND_URL=http://TU_IP_PUBLICA:3000
```

```bash
# 3. Generar los JWT secrets (copia cada resultado en JWT_SECRET y JWT_REFRESH_SECRET del .env)
openssl rand -hex 32
openssl rand -hex 32

# 4. Construir e iniciar (primera vez tarda ~20 min)
docker compose up --build -d

# 5. Crear el usuario admin (solo una vez, espera que el backend diga "Server started")
docker exec exaticket-backend-1 npx sequelize db:seed:all
```

✅ **Listo.** Abre `http://TU_IP_PUBLICA:3000` con:
- **Email:** `admin@whaticket.com`
- **Contraseña:** `admin`

> Cambia la contraseña inmediatamente en Configuración → Usuarios.

---

## Características

- Múltiples usuarios atendiendo el mismo número de WhatsApp
- Conexión a múltiples cuentas de WhatsApp en un solo lugar
- **🤖 Bot de Telegram con IA** — recibe mensajes de Telegram, crea tickets y los atiende con el mismo pipeline de IA que WhatsApp
- **Gestión de bots Telegram desde la UI** — página `/telegram` para agregar, editar, conectar y desconectar bots sin reiniciar
- **Íconos de canal en lista de tickets** — badge verde WhatsApp / badge azul Telegram superpuesto en el avatar del contacto
- **Identidad visual ExaTicket** — logo cerebro/circuito, favicon SVG, AppBar con nombre y colores propios
- **Chat IA de soporte técnico** — la IA atiende primero y escala al operador cuando es necesario
- **Enrutamiento IA por departamento** — la IA pregunta el área (Administración / Ventas / Soporte) antes de actuar
- **Adaptación de lenguaje automática** — la IA detecta si el cliente es técnico o no y ajusta el registro de respuesta
- **Nota interna automática al escalar** — al transferir a un humano la IA genera un resumen del caso visible solo para agentes
- **Consulta directa al asistente IA** — los agentes pueden preguntarle a la IA sobre cualquier ticket desde el chat
- **Verificación de cliente antes de soporte** — la IA comprueba si el número o nombre está registrado en Splynx antes de abrir una sesión de soporte técnico; si no está en el sistema solicita nombre o teléfono de contrato y cierra el ticket si no se puede verificar
- **Integración Splynx ISP Billing** — la IA consulta estado de servicios, historial de tickets y cortes generales antes de responder
- **Pestaña Grupos** — visualización dedicada para conversaciones de grupos de WhatsApp
- Escalado automático al operador humano (por solicitud del usuario, decisión de la IA o límite de intentos)
- Creación y gestión de tickets desde el navegador
- Envío y recepción de mensajes, imágenes, audio y documentos
- Colas de atención con mensajes de bienvenida personalizados
- Respuestas rápidas predefinidas
- Soporte SSL integrado en el contenedor nginx

---

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) >= 20.x
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.x (plugin integrado con Docker)
- Git
- Mínimo 2 GB RAM (recomendado 4 GB — el build de Chrome requiere memoria)
- Mínimo 8 GB de espacio en disco (las imágenes Docker ocupan ~6 GB)

### Instalación de Docker en Ubuntu

```bash
# Agregar repositorio oficial de Docker
apt-get update
apt-get install -y curl ca-certificates gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

# Instalar Docker y Docker Compose plugin
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Iniciar y habilitar Docker
systemctl enable docker
systemctl start docker

# Verificar instalación
docker --version
docker compose version
```

---

## Instalación con Docker

### 1. Clonar el repositorio

```bash
git clone https://github.com/eliexerguevara/ExaTicket.git
cd ExaTicket
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Llenar el archivo `.env` con los valores correspondientes:

```bash
# ============================================================
# MYSQL / MariaDB
# ============================================================
MYSQL_ENGINE=mariadb
MYSQL_VERSION=10.6
MYSQL_ROOT_PASSWORD=tu_password_muy_seguro    # OBLIGATORIO — cámbialo
MYSQL_DATABASE=whaticket
MYSQL_PORT=3306
TZ=America/Bogota                             # Ajusta tu zona horaria

# ============================================================
# BACKEND
# ============================================================
BACKEND_PORT=8080
BACKEND_SERVER_NAME=                          # ej: api.tudominio.com (vacío = localhost)
BACKEND_URL=http://IP_DEL_SERVIDOR            # IP pública o dominio
PROXY_PORT=8080                               # Cambiar a 443 si usas HTTPS

# OBLIGATORIO — generar con: openssl rand -hex 32
JWT_SECRET=
JWT_REFRESH_SECRET=

WHATSAPP_PROVIDER=wwebjs                      # wwebjs (Puppeteer) o whaileys (Baileys)
LOG_LEVEL=info

# ============================================================
# FRONTEND
# ============================================================
FRONTEND_PORT=3000
FRONTEND_SSL_PORT=3001
FRONTEND_SERVER_NAME=                         # ej: app.tudominio.com (vacío = localhost)
FRONTEND_URL=http://IP_DEL_SERVIDOR:3000

# ============================================================
# IA DE SOPORTE (opcional — dejar vacío para deshabilitar)
# ============================================================
ANTHROPIC_API_KEY=                            # Obtén en https://console.anthropic.com

# ============================================================
# PHPMYADMIN
# ============================================================
PMA_PORT=9000
```

**Generar JWT secrets seguros:**

```bash
# En Linux/Mac:
openssl rand -hex 32   # copiar el resultado en JWT_SECRET
openssl rand -hex 32   # copiar el resultado en JWT_REFRESH_SECRET

# En Windows (PowerShell):
[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace("-","").ToLower()
```

### 3. Crear directorios necesarios

```bash
mkdir -p ssl/certs/backend ssl/certs/frontend ssl/www
mkdir -p .docker/data
mkdir -p backend/.wwebjs_auth
mkdir -p backend/public
```

### 4. Construir e iniciar los contenedores

> **Importante:** El primer build tarda entre **20 y 40 minutos** porque descarga Node.js 18, instala Google Chrome y compila el proyecto. Las siguientes veces usa caché y es mucho más rápido.

```bash
docker compose up --build -d
```

Puedes seguir el progreso con:

```bash
docker compose logs -f backend
```

Espera hasta ver esta línea antes de continuar:

```
{"msg":"Server started on port: 3000"}
```

### 5. Ejecutar seeds (solo la primera vez)

**Este paso es obligatorio** para crear el usuario administrador y la configuración inicial:

```bash
docker exec exaticket-backend-1 npx sequelize db:seed:all
```

Deberías ver:

```
== 20200904070004-create-default-users: migrated
== 20200904070004-create-default-settings: migrated
== 20200904070006-create-apiToken-settings: migrated
== 20260521000000-add-ai-settings: migrated
== 20260526000000-add-splynx-settings: migrated
```

### 6. Acceder a la aplicación

| Servicio | URL | Puerto |
|---|---|---|
| **Aplicación** | http://IP_DEL_SERVIDOR:3000 | 3000 |
| **API Backend** | http://IP_DEL_SERVIDOR:8080 | 8080 |
| **phpMyAdmin** | http://IP_DEL_SERVIDOR:9000 | 9000 |

**Credenciales iniciales:**

| Campo | Valor |
|---|---|
| Email | `admin@whaticket.com` |
| Contraseña | `admin` |

> **Cambia la contraseña de admin inmediatamente** en: Configuración → Usuarios → Editar.

---

## Servicios Docker

| Contenedor | Imagen | Descripción |
|---|---|---|
| `exaticket-backend-1` | Node.js 18 + Chrome | API REST + WebSockets + WhatsApp |
| `exaticket-frontend-1` | nginx:alpine | Interfaz web React |
| `exaticket-mysql-1` | mariadb:10.6 | Base de datos |
| `exaticket-phpmyadmin-1` | phpmyadmin | Administrador de base de datos |

El backend espera automáticamente a que MySQL esté saludable (`healthcheck`) antes de iniciar. Las migraciones se ejecutan solas al arrancar.

---

## Configurar el Chat IA

La IA responde automáticamente al primer mensaje de cada ticket e intenta resolver el problema antes de pasarlo a un operador humano. Usa el modelo **Claude Haiku** (Anthropic) por su velocidad y bajo costo.

### Activación rápida

1. Obtén tu API Key en [console.anthropic.com](https://console.anthropic.com)
2. Agrégala al `.env`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Reinicia el backend:
   ```bash
   docker compose restart backend
   ```
4. En la aplicación ve a **Configuración → 🤖 IA de Soporte Técnico**
5. Cambia el estado a **Habilitado**
6. Personaliza el **Prompt del sistema** y el **Mensaje de escalado**

---

### Flujo de atención IA

```
Cliente escribe → [Splynx: consulta servicios + historial + cortes]
                       │
                  IA recibe contexto del cliente
                       │
               IA pregunta departamento
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    Administración   Ventas      Soporte técnico
    (cola directa) (cola directa)  │
                                   ▼
                             IA detecta nivel técnico
                             del cliente y adapta lenguaje
                                   │
                          ┌────────┴────────┐
                          ▼                 ▼
                    Resuelto OK       No resuelto / [ESCALAR]
                                           │
                                    Nota interna IA
                                    + Transferir agente
```

---

### Adaptación automática de lenguaje

La IA analiza el vocabulario del cliente y ajusta su registro:

| Cliente usa... | IA responde con... |
|---|---|
| Términos técnicos: `IP`, `DNS`, `firmware`, `ONT`, `latencia`, `PPPoE` | Lenguaje técnico directo |
| Lenguaje cotidiano: "no funciona el wifi", "el aparato parpadeando" | Lenguaje muy sencillo, paso a paso. Ej: *"Busca el aparato negro con lucecitas, desenchúfalo 30 segundos y vuelve a enchufarlo."* |

Esto se configura desde el **Prompt del sistema** en Ajustes. El prompt guardado en base de datos tiene prioridad sobre el fallback del código.

---

### Cuándo escala al operador humano

| Trigger | Descripción |
|---|---|
| Usuario lo pide | "quiero hablar con un agente", "necesito un operador", "persona real", "human agent" |
| IA no puede resolver | La IA incluye el marcador interno `[ESCALAR]` en su respuesta |
| Límite de intentos | Por defecto 10 mensajes (configurable en Ajustes → `aiMaxAttempts`) |
| Departamento sin cola | Si Administración o Ventas no tienen cola configurada |

Al escalar, la IA:
1. Envía el mensaje de escalado al cliente (configurable en `aiEscalationMessage`)
2. Genera automáticamente una **nota interna** con un resumen del caso para el agente
3. Desactiva el modo IA en el ticket (`aiActive = false`)
4. Asigna el ticket a la cola de Soporte si estaba sin cola

> **Reactivación automática:** Si un cliente vuelve a escribir después de que su ticket fue resuelto, el sistema crea o reabre el ticket con la IA activa nuevamente (`aiActive = true, aiAttempts = 0`).

---

### Notas internas IA

Cuando la IA escala un ticket, guarda automáticamente una nota privada visible solo para los agentes (nunca se envía al cliente):

```
*Resumen IA del caso:*
Cliente reporta que su router no conecta desde ayer. El bot verificó
los LEDs del equipo y sugirió reinicio. El problema persiste —
posible falla en el PoE o en la antena del nodo.
```

Las notas internas aparecen en el chat con fondo ámbar y el badge **"Nota interna IA"** para distinguirlas visualmente.

---

### Consulta directa al asistente IA (modo agente)

Los agentes pueden preguntarle a la IA directamente desde el chat de cualquier ticket usando el botón 🤖 en la barra de entrada de mensajes.

**Cómo usarlo:**
1. Abre un ticket
2. Haz clic en el ícono 🤖 (robot) en la barra inferior
3. Escribe tu pregunta técnica, por ejemplo: *"¿podría estar el router desconfigurado?"*
4. La IA responde como nota interna usando todo el historial del ticket como contexto

**La IA analiza y aconseja sobre:**
- Nivel técnico del cliente (para que el agente sepa cómo comunicarse)
- Router desconfigurado: IP asignada, DNS, reset de fábrica, canal WiFi, WPA2
- Sin internet: LEDs del modem/ONT, PPPoE credentials, cable UTP, estado de la zona
- Velocidad lenta: speedtest cable vs WiFi, interferencias 2.4GHz, QoS
- Intermitencia: potencia óptica (-8 a -27 dBm), temperatura, empalmes, splitter
- Configuración manual: APN, DNS, gateway, MTU (1492 para PPPoE)

La respuesta queda guardada como nota interna en el ticket para referencia futura.

**Endpoint API:**
```
POST /api/messages/:ticketId/agent-ai
Body: { "question": "¿podría estar el router desconfigurado?" }
```

---

### Configuración IA desde la interfaz (Settings)

| Clave | Descripción | Valor por defecto |
|---|---|---|
| `aiEnabled` | `"enabled"` o `"disabled"` | `disabled` |
| `aiSystemPrompt` | Instrucciones para la IA | Prompt ISP con adaptación de lenguaje |
| `aiEscalationMessage` | Mensaje al transferir al humano | *"Voy a conectarte con un agente ahora."* |
| `aiMaxAttempts` | Máximo de mensajes antes de escalar | `10` |

Cuando hay un ticket siendo atendido por la IA, aparece un badge morado **"IA"** en la lista de tickets. El operador puede tomar control haciendo clic en el botón **"Tomar control"**.

---

## Integración Splynx ISP Billing

ExaTicket puede conectarse a tu servidor Splynx para enriquecer automáticamente el contexto de la IA con datos reales del cliente antes de responder. Utiliza la **REST API v2 de Splynx** con autenticación vía credenciales de administrador o API Key.

### Qué consulta la IA

Cuando un cliente escribe, ExaTicket busca al cliente en Splynx por número de teléfono y obtiene:

| Dato | Cómo lo usa la IA |
|---|---|
| Nombre del cliente | Personaliza el saludo |
| Estado de servicios (activo / bloqueado / suspendido) | Informa sobre cortes o bloqueos de cuenta |
| Plan contratado y velocidad | Ayuda a diagnosticar problemas de velocidad |
| Tickets abiertos en Splynx | Evita crear duplicados; da contexto del historial |
| Corte general (todos los servicios caídos) | Detecta incidentes masivos y avisa al cliente antes de hacer diagnóstico individual |
| **Ping en tiempo real al equipo del cliente** | Confirma si el CPE/router del cliente responde desde la red del ISP |

### Reglas de comportamiento IA con Splynx

1. **Corte general detectado** → La IA informa que hay un incidente en la zona y no pide al cliente que reinicie equipos hasta que se resuelva
2. **Servicio bloqueado/suspendido** → La IA indica que la cuenta tiene una restricción y dirige al cliente al área de administración/pagos
3. **Ticket abierto en Splynx** → La IA menciona que ya hay un caso registrado y da seguimiento
4. **Cliente no encontrado** → La IA continúa sin contexto Splynx (degradación elegante)
5. **Equipo NO responde ping** → La IA dirige al cliente a verificar luces del ONT/router y pide reinicio del equipo
6. **Equipo SÍ responde ping** → La IA asume problema del lado del cliente (WiFi, cable interno, dispositivo) y hace troubleshooting local

### Verificación de conectividad en tiempo real (ping check)

ExaTicket puede verificar si el CPE/ONT del cliente responde en la red antes de dar instrucciones de troubleshooting.
Soporta **dos métodos** — el sistema intenta Zabbix primero y cae a netcheck.php automáticamente si el IP no está en Zabbix.

| Método | Velocidad | Requisito |
|--------|-----------|-----------|
| **Zabbix API** (preferido) | ~100 ms — lee datos del ciclo de monitoreo ya ejecutado | Zabbix 5.4+ con hosts monitoreados por IP |
| **netcheck.php** (fallback) | ~2–4 s — ejecuta ping en tiempo real | Endpoint PHP en el servidor Splynx |

#### Opción A — Zabbix API (recomendado)

Zabbix ya monitorea tus equipos con ICMP ping cada 1 minuto. ExaTicket consulta ese dato directamente en lugar de disparar un nuevo ping, lo que lo hace prácticamente instantáneo.

##### Requisitos previos en Zabbix
- Los equipos CPE/ONT de los clientes deben estar monitoreados en Zabbix
- El template asignado debe incluir los ítems `icmpping` y `icmppingsec` (cualquier template ICMP estándar los incluye)
- Las interfaces de los hosts deben tener la misma IP asignada en Splynx (coincidencia por IP)

##### Crear un token de API (Zabbix 5.4+)

1. Inicia sesión en la interfaz web de Zabbix
2. Ve a **Administration → API tokens → Create API token**
3. Asigna un nombre descriptivo (p.ej. `exaticket-readonly`)
4. Elige un usuario con acceso de **lectura** a los host groups de clientes
5. Copia el token generado

##### Configurar en ExaTicket

```bash
# En el servidor de producción (NO en git):
echo "ZABBIX_API_URL=https://zabbix.tuisp.com/api_jsonrpc.php" >> /root/ExaTicket/.env
echo "ZABBIX_API_TOKEN=TU_TOKEN_ZABBIX_AQUI" >> /root/ExaTicket/.env
docker compose restart backend
```

Si usas Zabbix más antiguo (sin tokens API), usa usuario y contraseña:

```bash
echo "ZABBIX_API_URL=https://zabbix.tuisp.com/api_jsonrpc.php" >> /root/ExaTicket/.env
echo "ZABBIX_API_USER=exaticket_ro" >> /root/ExaTicket/.env
echo "ZABBIX_API_PASSWORD=CONTRASEÑA_AQUI" >> /root/ExaTicket/.env
docker compose restart backend
```

> **Usuarios no encontrados:** Si el IP del cliente no está en Zabbix, el sistema automáticamente intenta netcheck.php como fallback.

---

#### Opción B — netcheck.php en servidor Splynx (fallback)

Ejecuta un ping en tiempo real desde el servidor Splynx hacia el equipo del cliente.

##### Cómo funciona

1. La IA obtiene la IP del servicio (`ipv4`) desde la API de Splynx
2. ExaTicket llama a un endpoint PHP (`netcheck.php`) instalado en el servidor Splynx
3. El endpoint ejecuta `ping -c 2 -W 2 <IP>` y devuelve `{"online": true/false, "latency": "Xms"}`
4. El resultado se inyecta en el contexto de la IA: 🟢 ONLINE o 🔴 Sin respuesta

#### Configuración

**Paso 1 — Desplegar `netcheck.php` en el servidor Splynx**

Crea el archivo `/var/www/splynx/web/netcheck.php` en tu servidor Splynx con el siguiente contenido. Elige un token aleatorio seguro:

```php
<?php
$ALLOWED_TOKEN = 'TU_TOKEN_SECRETO_AQUI';  // Cambiar por un token seguro

// Auth check
$token = $_GET['token'] ?? '';
if (!hash_equals($ALLOWED_TOKEN, $token)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// IP validation — only RFC-1918 and your ISP's public range
$ip = $_GET['ip'] ?? '';
if (!preg_match('/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|TU_RANGO_PUBLICO\.)/', $ip)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid IP']);
    exit;
}

$escaped = escapeshellarg($ip);
$output = shell_exec("ping -n -c 2 -W 2 $escaped 2>/dev/null");
$online = $output && strpos($output, ' 0% packet loss') !== false;

preg_match('/time=(\d+\.?\d*) ms/', $output ?? '', $m);
$latency = isset($m[1]) ? $m[1] . 'ms' : null;
if (!$latency) {
    preg_match('/rtt min.*= [\d.]+\/([\d.]+)/', $output ?? '', $m2);
    $latency = isset($m2[1]) ? $m2[1] . 'ms' : null;
}

header('Content-Type: application/json');
echo json_encode([
    'online' => $online,
    'ip' => $ip,
    'latency' => $latency,
    'checked_at' => date('c')
]);
```

**Paso 2 — Probar el endpoint desde el servidor ExaTicket**

```bash
curl "https://splynx.tuisp.com/netcheck.php?token=TU_TOKEN&ip=10.1.0.1"
# Respuesta esperada: {"online":true,"ip":"10.1.0.1","latency":"15ms","checked_at":"..."}
```

**Paso 3 — Agregar el token a `.env` del servidor ExaTicket**

```bash
# En el servidor de producción (NO en git):
echo "SPLYNX_PING_TOKEN=TU_TOKEN_SECRETO_AQUI" >> /root/ExaTicket/.env
docker compose restart backend
```

> **Seguridad:** El token nunca debe quedar en el repositorio git. La variable `SPLYNX_PING_TOKEN` está en `.gitignore` vía el archivo `.env`.

> **Alcance de red:** El ping funciona solo si el servidor Splynx tiene rutas de red hacia las IPs de los clientes. Si usas rangos privados (`10.x.x.x`, `192.168.x.x`) asegúrate de que el servidor Splynx esté en la misma red o tenga rutas estáticas configuradas.

> **Sin token configurado:** Si `SPLYNX_PING_TOKEN` está vacío, el ping check se omite silenciosamente y la IA continúa sin información de ping (degradación elegante).

### Métodos de autenticación

ExaTicket admite dos métodos de autenticación con Splynx (intenta el primero disponible):

| Método | Cuándo usarlo |
|---|---|
| **Admin login + password** | El más habitual. Usa el usuario administrador del panel Splynx. No requiere configuración adicional en Splynx. |
| **API Key + API Secret** | Requiere crear un "Addon API key" en Splynx (`Admin → Addons → API`). Recomendado para entornos de producción multi-tenant. |

Si configuras ambos, ExaTicket intenta primero `api_key` y luego `admin` como respaldo.

### Activación

1. En la interfaz ve a **Configuración → 🔌 Splynx**
2. Cambia el estado a **Habilitado**
3. Expande **"Credenciales de conexión Splynx"**
4. Completa los campos según el método que prefieras:

**Opción A — Credenciales de administrador (recomendado):**

| Campo | Descripción |
|---|---|
| **URL del servidor** | Ej: `https://splynx.tuisp.com` (sin barra final) |
| **Usuario administrador** | Login del administrador en el panel Splynx |
| **Contraseña administrador** | Contraseña del administrador de Splynx |

**Opción B — API Key (addon):**

| Campo | Descripción |
|---|---|
| **URL del servidor** | Ej: `https://splynx.tuisp.com` (sin barra final) |
| **API Key** | Clave pública generada en `Admin → Addons → API` |
| **API Secret** | Secreto generado junto al API Key |

5. Haz clic en **"Probar conexión"** — deberías ver ✅ `Conexión exitosa. Clientes accesibles: N+`
6. Guarda con el botón **Guardar**

> Los tokens de Splynx se cachean por 23 horas para evitar re-autenticación en cada mensaje. Si cambias las credenciales, reinicia el backend para limpiar la caché: `docker compose restart backend`.

### Configuración Splynx desde Settings

| Clave | Descripción | Valor por defecto |
|---|---|---|
| `splynxEnabled` | `"enabled"` o `"disabled"` | `disabled` |
| `splynxApiUrl` | URL base del servidor Splynx (sin `/` final) | vacío |
| `splynxApiKey` | API Key de Splynx (addon) | vacío |
| `splynxApiSecret` | API Secret de Splynx (addon) | vacío |
| `splynxAdminLogin` | Usuario administrador de Splynx | vacío |
| `splynxAdminPassword` | Contraseña del administrador de Splynx | vacío |

### Endpoint de prueba

```
POST /api/splynx/test-connection
Body (admin):   { "apiUrl": "https://...", "adminLogin": "admin", "adminPassword": "pass" }
Body (api key): { "apiUrl": "https://...", "apiKey": "KEY", "apiSecret": "SECRET" }
Response:       { "ok": true, "message": "Conexión exitosa. Clientes accesibles: 634+" }
```

### Compatibilidad

La integración usa la **REST API v2 de Splynx** (`/api/2.0/`), compatible con Splynx 3.x y 4.x. No requiere modificaciones en el servidor Splynx — solo que la REST API esté habilitada (activa por defecto en todas las instalaciones modernas).

---

## Interfaz de usuario

### Navegación principal

| Ítem del menú | Descripción |
|---|---|
| Dashboard | Panel de estadísticas |
| Conexiones | Gestión de cuentas WhatsApp |
| **Chat's** | Lista de conversaciones / tickets |
| Contactos | Directorio de clientes |
| Respuestas rápidas | Plantillas de respuesta |
| Usuarios / Colas / Configuración | Solo administradores |

### Pestañas en Chat's

| Pestaña | Descripción |
|---|---|
| **Bandeja** | Tickets abiertos y en cola asignados al agente |
| **Resueltos** | Tickets cerrados |
| **Buscar** | Búsqueda full-text por nombre, número o mensaje |
| **Grupos** | Conversaciones de grupos de WhatsApp (`isGroup = true`) |

---

## Instalación SSL (producción)

Para habilitar HTTPS, coloca los certificados en la carpeta `ssl/certs/`:

```
ssl/
├── certs/
│   ├── backend/
│   │   ├── fullchain.pem
│   │   └── privkey.pem
│   └── frontend/
│       ├── fullchain.pem
│       └── privkey.pem
└── www/
```

**Generar certificados con Certbot:**

```bash
# Instalar certbot
snap install --classic certbot

# Backend (api.tudominio.com)
certbot certonly --cert-name backend --webroot --webroot-path ./ssl/www/ -d api.tudominio.com

# Frontend (app.tudominio.com)
certbot certonly --cert-name frontend --webroot --webroot-path ./ssl/www/ -d app.tudominio.com

# Copiar certificados a las carpetas correctas
cp /etc/letsencrypt/live/backend/fullchain.pem ssl/certs/backend/
cp /etc/letsencrypt/live/backend/privkey.pem ssl/certs/backend/
cp /etc/letsencrypt/live/frontend/fullchain.pem ssl/certs/frontend/
cp /etc/letsencrypt/live/frontend/privkey.pem ssl/certs/frontend/
```

Actualizar el `.env` para producción:

```bash
BACKEND_URL=https://api.tudominio.com
BACKEND_SERVER_NAME=api.tudominio.com
PROXY_PORT=443
FRONTEND_URL=https://app.tudominio.com
FRONTEND_SERVER_NAME=app.tudominio.com
FRONTEND_PORT=80
FRONTEND_SSL_PORT=443
```

Reconstruir el frontend (necesario para que tome la nueva URL):

```bash
docker compose up --build -d frontend
```

---

## Comandos útiles

```bash
# Ver estado de contenedores
docker compose ps

# Ver logs en tiempo real
docker compose logs -f
docker compose logs -f backend    # solo backend
docker compose logs -f frontend   # solo frontend

# Reiniciar un servicio
docker compose restart backend
docker compose restart frontend

# Detener todo (sin borrar datos)
docker compose down

# Detener y eliminar volúmenes — ¡BORRA LA BASE DE DATOS!
docker compose down -v

# Ejecutar migraciones manualmente
docker exec exaticket-backend-1 npx sequelize db:migrate

# Ejecutar seeds manualmente (solo si es necesario)
docker exec exaticket-backend-1 npx sequelize db:seed:all

# Ver logs del servidor en tiempo real
docker logs -f exaticket-backend-1

# Entrar al contenedor del backend
docker exec -it exaticket-backend-1 bash

# Ver uso de disco de imágenes Docker
docker system df
```

---

## Actualización

```bash
# Obtener últimos cambios
git pull

# Reconstruir y reiniciar
docker compose up --build -d

# Las migraciones se ejecutan automáticamente al reiniciar el backend
```

> **Nota:** Después de cada actualización verifica el archivo `.env.example` por si hay nuevas variables y agrégalas a tu `.env`.

---

## Solución de problemas

**El frontend carga pero no puede conectarse al backend (`ERR_CONNECTION_REFUSED`)**

El backend tarda varios minutos en iniciar la primera vez porque ejecuta todas las migraciones de base de datos. Espera a que los logs muestren `Server started on port: 3000` antes de acceder.

```bash
# Verificar que el backend está corriendo
docker compose ps

# Ver si las migraciones terminaron
docker logs exaticket-backend-1 | tail -5
```

**Error al hacer login: credenciales inválidas**

Los seeds no se han ejecutado. Correr:

```bash
docker exec exaticket-backend-1 npx sequelize db:seed:all
```

**Docker no inicia (`docker.socket: Failed to resolve group docker`)**

El grupo `docker` no existió al momento de instalar. Reiniciar el socket:

```bash
systemctl start docker.socket
systemctl start docker
```

**El build falla con `not found: /.docker/add-env-vars.sh`**

Los archivos de configuración de nginx no estuvieron incluidos al copiar el proyecto. Asegúrate de clonar con `git clone` completo, sin excluir la carpeta `frontend/.docker/`.

**No hay suficiente espacio en disco**

```bash
# Limpiar imágenes y capas sin usar
docker system prune -a

# Ver cuánto ocupa cada imagen
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

**La integración Splynx no funciona**

1. Verifica que `splynxEnabled = "enabled"` en Configuración
2. Usa el botón **"Probar conexión"** para validar las credenciales — el error aparece en pantalla
3. Comprueba que la URL **no tenga barra final** (`/`) — correcto: `https://splynx.tuisp.com`
4. Verifica que estés usando credenciales de **administrador** de Splynx (el mismo usuario que entra al panel web)
5. Si tu Splynx usa un dominio con HTTPS, asegúrate de que el certificado SSL sea válido y accesible desde el servidor donde corre ExaTicket
6. El token de Splynx se cachea 23 h — si cambias las credenciales, reinicia el backend:
   ```bash
   docker compose restart backend
   ```

**`testConnection` devuelve error 401 o "Invalid API call!"**

Esto indica credenciales incorrectas o URL equivocada. Verifica:
- La URL apunta directamente al servidor Splynx (no a un proxy ni a una IP interna)
- Las credenciales son de un usuario con perfil **Administrator** en Splynx (no un técnico ni cliente)
- No hay espacios extras en el usuario o contraseña

---

## Estructura del proyecto

```
ExaTicket/
├── backend/                              # API Node.js + TypeScript
│   ├── src/
│   │   ├── config/auth.ts                # JWT secrets requeridos (no hardcoded)
│   │   ├── controllers/
│   │   │   ├── MessageController.ts      # +agentAsk: consulta agente→IA
│   │   │   ├── SplynxController.ts       # POST /splynx/test-connection
│   │   │   ├── TelegramController.ts     # CRUD + connect/disconnect bots Telegram
│   │   │   └── TicketController.ts       # +isGroup filter en listado
│   │   ├── routes/
│   │   │   ├── messageRoutes.ts          # POST /messages/:id/agent-ai
│   │   │   ├── settingRoutes.ts          # POST /splynx/test-connection
│   │   │   └── telegramRoutes.ts         # GET|POST|PUT|DELETE /telegram · /telegram/:id/connect|disconnect
│   │   ├── services/
│   │   │   ├── AIServices/
│   │   │   │   └── GetAIResponse.ts      # getAIResponse(splynxContext?) · getAgentAdvice · getTicketSummary
│   │   │   ├── SplynxService/
│   │   │   │   └── SplynxService.ts      # findCustomerByPhone · buildSplynxContext · testConnection · auth admin/api_key
│   │   │   ├── TelegramService/
│   │   │   │   └── TelegramBotService.ts # Polling · handleTelegramMessage · pipeline IA · sendWithTyping
│   │   │   └── TicketServices/
│   │   │       ├── ListTicketsService.ts # +isGroup filter · +Telegram include
│   │   │       ├── ShowTicketService.ts  # +Telegram include
│   │   │       └── FindOrCreateTicketService.ts # aiActive reset al reabrir ticket
│   │   ├── handlers/
│   │   │   └── handleWhatsappEvents.ts   # Flujo IA: Splynx → enrutamiento → soporte → escalado
│   │   ├── models/
│   │   │   ├── Telegram.ts               # Modelo Telegram (id, name, botToken, status, greetingMessage)
│   │   │   ├── Ticket.ts                 # +telegramId FK · aiActive · aiAttempts · isGroup
│   │   │   └── Message.ts                # Campo isInternal (notas privadas)
│   │   └── database/
│   │       ├── index.ts                  # +Telegram registrado en Sequelize
│   │       ├── migrations/
│   │       │   ├── 20260521000000-add-ai-fields-to-tickets.ts
│   │       │   ├── 20260522100000-add-isInternal-to-messages.ts
│   │       │   └── 20260527200000-create-telegrams.ts  # Tabla Telegrams + columna Tickets.telegramId
│   │       └── seeds/
│   │           ├── 20260521000000-add-ai-settings.ts
│   │           └── 20260526000000-add-splynx-settings.ts
│   └── Dockerfile                        # Node.js 18 + Chrome
├── frontend/                             # React + Material UI + Vite
│   ├── public/
│   │   ├── favicon.svg                   # Favicon cerebro/circuito (SVG)
│   │   ├── index.html                    # <title>ExaTicket</title>
│   │   └── manifest.json                 # name: "ExaTicket"
│   ├── src/
│   │   ├── assets/
│   │   │   └── logo.svg                  # Logo cerebro/circuito ExaTicket
│   │   ├── components/
│   │   │   ├── MessagesList/             # Renderizado de notas internas IA (fondo ámbar)
│   │   │   ├── MessageInput/             # Botón 🤖 + panel consulta agente→IA
│   │   │   ├── TicketActionButtons/      # Botón "Tomar control" IA
│   │   │   ├── TicketListItem/           # Badge canal (WA verde / TG azul) + badge IA
│   │   │   └── TicketsManager/           # Pestañas: Bandeja · Resueltos · Buscar · Grupos
│   │   ├── hooks/
│   │   │   └── useTickets/               # +isGroup param → API
│   │   ├── layout/
│   │   │   ├── index.js                  # AppBar con logo + EXATICKET (blanco en modo oscuro)
│   │   │   └── MainListItems.js          # Nav: "Chat's" · ícono Telegram en sidebar
│   │   ├── pages/
│   │   │   ├── Settings/                 # Panel IA + Panel Splynx (accordion credenciales)
│   │   │   └── Telegram/                 # Gestión de bots: tabla, modal agregar/editar, connect/disconnect
│   │   └── translate/languages/es.js     # +tickets.tabs.groups · mainDrawer.tickets="Chat's"
│   ├── .docker/
│   │   ├── nginx/                        # Configuración nginx
│   │   └── add-env-vars.sh               # Inyección VITE_* en runtime
│   └── Dockerfile                        # Node.js 18-alpine + nginx
├── ssl/                                  # Certificados SSL (no en git)
├── .docker/data/                         # Datos MySQL (no en git)
├── docker-compose.yaml                   # Orquestación completa
├── .env.example                          # Plantilla de variables
└── README.md
```

---

## Historial de cambios

### v1.9.2 — 2026-05-28

- **Botón X en tickets pendientes borra el chat** — al hacer clic en la X roja en un ticket pendiente se ejecuta `DELETE /tickets/:id`, eliminando el ticket completamente de la base de datos
- **Colores de botones pendientes mejorados** — el botón de lupa (ver conversación) ahora es azul (`#2563eb`) para diferenciarse claramente del botón de aceptar (verde); los 3 botones son ahora: 🔵 azul lupa / 🔴 rojo X / 🟢 verde check
- **Modo oscuro aplicado al chat** — `MessagesList`, `MessageInput` y `TicketHeader` usan la paleta oscura de WhatsApp Web (`#0b141a` fondo, `#202c33` burbujas recibidas, `#005c4b` burbujas enviadas)
- **Badge IA ocultado en tickets cerrados y pendientes** — el badge morado "IA" solo aparece en tickets abiertos activos
- **Chips WA/TG en lista de tickets** — chips de color inline junto al nombre del contacto y badge de canal superpuesto en el avatar
- **Resumen IA limitado a últimas 12 horas** — al documentar un caso en Splynx, la IA solo resume los mensajes de las últimas 12 horas e incluye la hora en que el cliente reportó el problema

### v1.9.0 — 2026-05-28

- **Verificación de cliente antes de soporte (Phase 2.5)**
  - Cuando el cliente elige "Soporte técnico", la IA busca su número en Splynx antes de abrir la sesión
  - Si el número **sí está** registrado → accede directo al soporte IA (sin fricción extra)
  - Si el número **no está** en el sistema → entra en la fase de verificación: la IA pide nombre completo o número de teléfono del contrato
  - Si la verificación **tiene éxito** → la IA confirma al cliente por nombre y continúa con el soporte
  - Si la verificación **falla** → la IA comunica que no puede brindar soporte y cierra el ticket automáticamente
  - Aplica tanto en WhatsApp (`handleWhatsappEvents.ts`) como en Telegram (`TelegramBotService.ts`)
  - Nueva función `findCustomerByInput(input)` en `SplynxService.ts`: detecta si el input es teléfono (≥ 7 dígitos) o nombre y delega a `findCustomerByPhone` / `findCustomersByName` según corresponda
  - Flujo de fases actualizado: Fase 1 → Fase 2 → **Fase 2.5** (verificación) → Fase 3 (soporte IA)
  - `aiAttempts`: 0 = enrutamiento, 1 = selección dpto., 2 = pendiente verificación, **3+** = soporte verificado
- **Fix: crash de pantalla en blanco al contestar chat de Telegram desde el panel**
  - `CreateMessageService` ya emitía el evento socket `appMessage` con el registro completo de la DB (incluyendo `createdAt`)
  - `MessageController` emitía un segundo evento con un objeto incompleto (sin `createdAt`), causando `RangeError: Invalid time value` en el formateador de fechas del frontend
  - Eliminado el emit duplicado; ahora solo `CreateMessageService` emite

### v1.8.0 — 2026-05-27
- **Integración Telegram Bot** — los clientes ahora pueden abrir y gestionar tickets directamente desde Telegram
  - Modelo `Telegram` en base de datos: `id`, `name`, `botToken`, `status` (`connected`/`disconnected`/`error`), `greetingMessage`
  - Migración `20260527200000-create-telegrams.ts`: crea tabla `Telegrams` y columna `telegramId` en `Tickets`
  - `TelegramBotService.ts`: polling con `node-telegram-bot-api` v0.67.0, arranque automático de todos los bots al iniciar el servidor
  - Pipeline IA idéntico al de WhatsApp: **Fase 1** (pregunta de enrutamiento) → **Fase 2** (selección de departamento: Administración / Ventas / Soporte) → **Fase 3** (soporte IA con Anthropic Claude Haiku)
  - Integración Splynx completa en Telegram: contexto de cliente, estado de servicio, ping en tiempo real y cortes generales
  - Todos los mensajes entrantes Y salientes guardados en la base de datos → los agentes ven la conversación completa en la vista del ticket
  - Escalado automático a cola de soporte cuando la IA no puede resolver, el usuario lo solicita o se alcanza el límite de intentos
  - Nota interna con resumen del caso al escalar a un humano
  - `TelegramController.ts`: endpoints REST `GET|POST|PUT|DELETE /telegram` y `POST /telegram/:id/connect|disconnect`
  - `telegramRoutes.ts`: rutas protegidas con `isAuth`
- **Página de gestión de bots Telegram** (`/telegram`)
  - Tabla con todos los bots configurados, chip de estado (verde Conectado / gris Desconectado / rojo Error)
  - Modal para agregar y editar bots (nombre, token, mensaje de bienvenida personalizado)
  - Botones Conectar / Desconectar / Eliminar con confirmación para acciones destructivas
  - Ícono Telegram en el sidebar de navegación
- **Íconos de canal en lista de tickets**
  - Badge circular superpuesto en el avatar de cada contacto: 🟢 verde WA para WhatsApp, 🔵 azul para Telegram
  - Chip de nombre de conexión coloreado por canal: verde para WhatsApp, azul Telegram para bots de Telegram
  - `ListTicketsService` y `ShowTicketService` actualizados para incluir el modelo Telegram en las consultas

### v1.7.5 — 2026-05-27
- **Integración Zabbix API**: nuevo `ZabbixService.ts` que consulta el estado ICMP de un host en Zabbix (~100 ms vs ~4 s del ping directo)
  - Soporta autenticación por API Token (Zabbix 5.4+) y por usuario/contraseña (todas las versiones)
  - El sistema intenta Zabbix primero; si el IP no está en Zabbix cae automáticamente a `netcheck.php`
  - Nuevas variables de entorno: `ZABBIX_API_URL`, `ZABBIX_API_TOKEN`, `ZABBIX_API_USER`, `ZABBIX_API_PASSWORD`
  - Cache de sesión para evitar `user.login` en cada solicitud (TTL 22 h)
  - `testZabbixConnection()` para verificar conectividad y versión del servidor desde la interfaz

### v1.7.4 — 2026-05-27
- **Ping check en tiempo real**: la IA ahora sabe si el equipo del cliente responde desde la red del ISP antes de hacer troubleshooting
  - Nueva función `checkCustomerOnline(ip, splynxBaseUrl)` en `SplynxService.ts` — llama a `netcheck.php` en el servidor Splynx
  - Resultado inyectado en el contexto IA: 🟢 ONLINE (con latencia) o 🔴 Sin respuesta
  - Si el equipo no responde: instrucción al agente IA de pedir al cliente que revise luces del ONT y reinicie
  - Si el equipo responde: instrucción para troubleshooting del lado del cliente (WiFi, cables, dispositivo)
  - Router lookup y ping check corren en paralelo (no añaden latencia extra al tiempo de respuesta)
  - Degradación elegante: si `SPLYNX_PING_TOKEN` no está configurado, el ping se omite sin error
- **Nueva variable de entorno**: `SPLYNX_PING_TOKEN` en `.env` y `.env.example` (sin valor — debe configurarse en el servidor)
- **Documentación**: sección "Verificación de conectividad en tiempo real" con instrucciones completas de despliegue de `netcheck.php`

### v1.7.3 — 2026-05-27
- **Saludo "Encontré tu servicio"**: la primera respuesta de la IA en fase de soporte saluda al cliente por nombre y confirma que encontró su servicio en Splynx
- **Diagnóstico de servicio desactivado**: cuando el servicio está suspendido o inactivo, la IA informa el estado y el nodo/router asignado
- **Información de router/nodo**: `getRouter(routerId)` consulta detalles del dispositivo NAS — nombre, IP de gestión, sector PPPoE
- **`SplynxContextResult`**: `buildSplynxContext` retorna `{ context, hasOutage, customerId }` en lugar de string plano
- **`isFirstMessage`**: parámetro booleano en `buildSplynxContext` — activa el bloque de saludo solo en el primer mensaje de soporte
- **Fix interfaz `SplynxInternetService`**: eliminados campos `online` y `last_online` que no existen en la API real; uso de `status === "active"` como indicador de servicio habilitado

### v1.7.2 — 2026-05-27
- **Visibilidad de grupos para admin**: los usuarios admin ven TODOS los grupos activos (bug: antes se filtraban por `userId`/`queueId`)
- **Detección de caso resuelto mejorada**: instrucción IA con ejemplos explícitos de frases en tiempo PRESENTE vs pasado; añadida detección por palabras clave en el backend como red de seguridad
- **Ticket Splynx automático al cerrar caso**: cuando el cliente confirma que su servicio funciona (por IA o por palabras clave), se crea automáticamente un ticket `solved` en Splynx con resumen generado por IA
- **Fix falso positivo "Falla General"**: `checkGeneralOutage` ahora valida el asunto del ticket del lado del cliente para evitar que tickets no relacionados disparen el aviso de corte masivo
- **`RESOLUTION_KEYWORDS`**: 22 frases en tiempo presente que activan cierre directo sin esperar a la IA (p.ej. "ya funciona", "ya tengo internet", "volvió el internet")

### v1.7.1 — 2026-05-26
- **Fix Splynx REST API**: corregidos todos los endpoints de la integración Splynx para que funcionen con la REST API v2 estándar:
  - Endpoint de autenticación: `/api/2.0/auth/tokens` → `/api/2.0/admin/auth/tokens`
  - `auth_type`: `"administrator"` → `"admin"` (valor correcto según la spec de Splynx API v2)
  - Header de autorización: `Splynx-EA TOKEN` → `Splynx-EA (access_token=TOKEN)` (formato requerido por Splynx)
  - Rutas de clientes: `/customers/customer` → `/admin/customers/customer`
  - Rutas de tickets: `/helpdesk/tickets` → `/admin/support/tickets`
  - Ruta de servicios: `/internet-service` → `/internet-services` (plural correcto)
- **Soporte de credenciales admin**: `testConnection`, `SplynxController` y el panel de Settings ahora aceptan `adminLogin` + `adminPassword` como alternativa (o complemento) al API Key/Secret
- **Campos en UI**: agregados los campos "Usuario administrador" y "Contraseña administrador" en el accordion de Splynx en Configuración
- **Seed actualizado**: `20260526000000-add-splynx-settings.ts` incluye `splynxAdminLogin` y `splynxAdminPassword`
- **Compatibilidad**: la integración funciona con cualquier instalación estándar de Splynx 3.x / 4.x sin cambios en el servidor Splynx

### v1.5.0 — 2026-05-26
- **Rebranding ExaTicket**: logo cerebro/circuito SVG en AppBar y como favicon
- **Texto blanco en modo oscuro**: color explícito para el nombre en la barra superior
- **Navegación renombrada**: sidebar "Tickets" → **"Chat's"**
- **Nueva pestaña Grupos**: muestra conversaciones de grupos WhatsApp (`isGroup = true`, excluye cerrados)
- **Filtro isGroup en backend**: `ListTicketsService` + `TicketController` aceptan parámetro `isGroup`
- **title + manifest**: actualizados a "ExaTicket"

### v1.4.0 — 2026-05-26
- **Integración Splynx ISP Billing**: identificación de clientes por teléfono, estado de servicios, historial de tickets, detección de cortes generales
- **Contexto Splynx en IA**: `buildSplynxContext` inyecta datos del cliente en el system prompt antes de cada respuesta
- **Panel Splynx en Configuración**: accordion con campos URL, API Key, API Secret, botón "Probar conexión" y selector habilitado/deshabilitado
- **Token caching**: autenticación con Splynx cacheada 23 h para evitar re-auth por mensaje
- **Degradación elegante**: si Splynx no está configurado o falla, la IA continúa sin contexto

### v1.3.1 — 2026-05-25
- **Fix foco robado**: el panel consulta-IA ya no roba el foco al campo de mensajes en cada tecla
- **Fix IA inactiva tras reapertura**: cuando un cliente escribe después de un ticket resuelto, la IA se reactiva automáticamente (`aiActive = true`, `aiAttempts = 0`)

### v1.3.0 — 2026-05-22
- **Adaptación automática de lenguaje**: la IA detecta el nivel técnico del cliente y ajusta su vocabulario (técnico ↔ sencillo)
- **Consulta agente→IA**: botón 🤖 en la barra de mensajes — el agente escribe una pregunta y la IA responde como nota interna usando el historial del ticket
- **Nota interna automática al escalar**: cuando la IA transfiere a un humano genera un resumen del caso (visible solo para agentes, fondo ámbar en el chat)
- **Campo `isInternal` en Messages**: distingue notas privadas de mensajes enviados al cliente
- **Diagnósticos ISP en modo agente**: router desconfigurado, sin internet, velocidad lenta, intermitencia, configuración manual

### v1.2.0 — 2026-05-21
- **Enrutamiento por departamento**: la IA pregunta el área (Administración / Ventas / Soporte técnico) antes de actuar
- **Palabras clave de escalado en múltiples idiomas**: español e inglés
- **Escalado automático a cola Soporte** al transferir al humano
- **Botón "Lupa" de previsualización** de conversación antes de aceptar ticket

### v1.1.0 — 2026-05-20
- **Chat IA de primera respuesta** con Claude Haiku (Anthropic)
- Configuración desde panel de ajustes: prompt, mensaje de escalado, máximo de intentos
- Badge IA morado en lista de tickets
- Botón "Tomar control" para que el agente deshabilite la IA en un ticket

---

## Aviso legal

Este proyecto no está afiliado, asociado, autorizado ni respaldado por WhatsApp o sus subsidiarias. "WhatsApp" y los nombres relacionados son marcas registradas de sus respectivos propietarios.
