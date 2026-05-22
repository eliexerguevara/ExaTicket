# ExaTicket

Sistema de tickets de soporte basado en mensajes de WhatsApp, con **Chat IA de primera respuesta** integrado mediante Claude (Anthropic).

El backend utiliza [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) o [Baileys](https://github.com/WhiskeySockets/Baileys) para recibir y enviar mensajes de WhatsApp, crear tickets y almacenarlos en una base de datos MySQL/MariaDB.

El frontend es una aplicación de chat multiusuario construida con React y Material UI, que se comunica con el backend mediante API REST y WebSockets.

> **Aviso:** El uso de clientes no oficiales de WhatsApp puede resultar en el bloqueo del número. Úsalo bajo tu propia responsabilidad.

---

## Características

- Múltiples usuarios atendiendo el mismo número de WhatsApp
- Conexión a múltiples cuentas de WhatsApp en un solo lugar
- **Chat IA de soporte técnico** — la IA atiende primero y escala al operador cuando es necesario
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

La IA responde automáticamente al primer mensaje de cada ticket e intenta resolver el problema antes de pasarlo a un operador.

**Pasos para activarlo:**

1. Obtén tu API Key en [console.anthropic.com](https://console.anthropic.com)
2. Agrégala al `.env`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Reinicia el backend:
   ```bash
   docker compose restart backend
   ```
4. En la aplicación ve a **Configuración → IA de Soporte Técnico**
5. Cambia el estado a **Habilitado**
6. Personaliza el **Prompt del sistema** (instrucciones para la IA)
7. Personaliza el **Mensaje de escalado** (lo que dice la IA al transferir)

**Cuándo escala al operador humano:**

| Trigger | Ejemplo |
|---|---|
| Usuario lo pide | "quiero hablar con un agente", "necesito un operador", "persona real" |
| IA no puede resolver | La IA responde internamente con marcador `[ESCALAR]` |
| Límite de intentos | Por defecto 10 mensajes (configurable en Ajustes) |

Cuando hay un ticket siendo atendido por la IA, aparece un badge morado **"IA"** en la lista de tickets. El operador puede tomar control haciendo clic en el botón **"Tomar control"**.

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

---

## Estructura del proyecto

```
ExaTicket/
├── backend/                          # API Node.js + TypeScript
│   ├── src/
│   │   ├── config/auth.ts            # JWT secrets requeridos (no hardcoded)
│   │   ├── services/
│   │   │   └── AIServices/
│   │   │       └── GetAIResponse.ts  # Integración Claude Haiku
│   │   ├── handlers/
│   │   │   └── handleWhatsappEvents.ts  # Lógica IA + escalado
│   │   ├── models/
│   │   │   └── Ticket.ts             # Campos aiActive, aiAttempts
│   │   └── database/
│   │       ├── migrations/
│   │       │   └── 20260521000000-add-ai-fields-to-tickets.ts
│   │       └── seeds/
│   │           └── 20260521000000-add-ai-settings.ts
│   └── Dockerfile                    # Node.js 18 + Chrome
├── frontend/                         # React + Material UI + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── TicketActionButtons/  # Botón "Tomar control" IA
│   │   │   └── TicketListItem/       # Badge IA en lista tickets
│   │   └── pages/Settings/           # Panel configuración IA
│   ├── .docker/
│   │   ├── nginx/                    # Configuración nginx
│   │   └── add-env-vars.sh           # Inyección VITE_* en runtime
│   └── Dockerfile                    # Node.js 18-alpine + nginx
├── ssl/                              # Certificados SSL (no en git)
├── .docker/data/                     # Datos MySQL (no en git)
├── docker-compose.yaml               # Orquestación completa
├── .env.example                      # Plantilla de variables
└── README.md
```

---

## Aviso legal

Este proyecto no está afiliado, asociado, autorizado ni respaldado por WhatsApp o sus subsidiarias. "WhatsApp" y los nombres relacionados son marcas registradas de sus respectivos propietarios.
