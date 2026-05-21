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

## Cómo funciona

Cada mensaje nuevo recibido en un WhatsApp conectado crea un ticket. La IA responde automáticamente al usuario intentando resolver el problema. Si la IA no puede resolverlo (o el usuario lo solicita), el ticket se transfiere a un operador humano.

Los tickets pueden gestionarse desde la página **Tickets**, donde los operadores pueden aceptarlos, responder y resolverlos.

---

## Instalación con Docker (Recomendado)

### Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) >= 20.x
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.x
- Git

### 1. Clonar el repositorio

```bash
git clone https://github.com/eliexerguevara/ExaTicket.git
cd ExaTicket
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar el archivo `.env` con los valores reales:

```bash
# ============================================================
# MYSQL / MariaDB
# ============================================================
MYSQL_ENGINE=mariadb
MYSQL_VERSION=10.6
MYSQL_ROOT_PASSWORD=tu_password_seguro     # OBLIGATORIO — cámbialo
MYSQL_DATABASE=whaticket
MYSQL_PORT=3306
TZ=America/Bogota

# ============================================================
# BACKEND
# ============================================================
BACKEND_PORT=8080
BACKEND_SERVER_NAME=                       # ej: api.tudominio.com (vacío para localhost)
BACKEND_URL=http://localhost               # Usa https:// en producción
PROXY_PORT=8080                            # 443 si usas HTTPS con proxy inverso

# Genera con: openssl rand -hex 32
JWT_SECRET=                                # OBLIGATORIO
JWT_REFRESH_SECRET=                        # OBLIGATORIO

# Proveedor de WhatsApp: wwebjs (Puppeteer) o whaileys (Baileys)
WHATSAPP_PROVIDER=wwebjs

# ============================================================
# FRONTEND
# ============================================================
FRONTEND_PORT=3000
FRONTEND_SSL_PORT=3001
FRONTEND_SERVER_NAME=                      # ej: app.tudominio.com (vacío para localhost)
FRONTEND_URL=http://localhost:3000

# ============================================================
# IA DE SOPORTE (opcional — dejar vacío para deshabilitar)
# ============================================================
ANTHROPIC_API_KEY=                         # Obtén en https://console.anthropic.com
```

**Generar JWT secrets seguros:**

```bash
# En Linux/Mac:
openssl rand -hex 32

# En Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. Construir e iniciar los contenedores

```bash
docker compose up -d --build
```

Esto levanta los siguientes servicios:

| Servicio     | Puerto por defecto | Descripción                    |
|--------------|--------------------|-------------------------------|
| Frontend     | 3000               | Interfaz web (nginx)          |
| Backend      | 8080               | API REST + WebSockets         |
| MySQL/MariaDB| 3306               | Base de datos                 |
| phpMyAdmin   | 9000               | Administrador de base de datos|

> El backend espera automáticamente a que MySQL esté listo antes de iniciar (healthcheck configurado).

### 4. Verificar que todo esté funcionando

```bash
docker compose logs -f backend
```

Deberías ver: `Server started on port...`

### 5. Acceso inicial

- **Aplicación:** http://localhost:3000
- **phpMyAdmin:** http://localhost:9000

**Credenciales por defecto:**
- Usuario: `admin@whaticket.com`
- Contraseña: `admin`

> Cambia la contraseña inmediatamente después del primer inicio de sesión.

---

## Configurar el Chat IA

Una vez que la app esté corriendo:

1. Obtén tu API Key en [console.anthropic.com](https://console.anthropic.com)
2. Agrégala al `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
3. Reinicia el backend: `docker compose restart backend`
4. En la app, ve a **Configuración → IA de Soporte Técnico**
5. Cambia el estado a **Habilitado**
6. Personaliza el prompt del sistema y el mensaje de escalado

**Triggers de escalado al operador humano:**
- El usuario escribe frases como *"quiero hablar con un agente"*, *"necesito un operador"*, etc.
- La IA decide que no puede resolver el problema (responde con marcador interno `[ESCALAR]`)
- Se alcanza el límite máximo de intentos configurado (por defecto: 10)

---

## Instalación SSL (Producción)

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
# Backend
certbot certonly --cert-name backend --webroot --webroot-path ./ssl/www/ -d api.tudominio.com

# Frontend
certbot certonly --cert-name frontend --webroot --webroot-path ./ssl/www/ -d app.tudominio.com
```

Luego actualiza el `.env` con las URLs de producción:

```bash
BACKEND_URL=https://api.tudominio.com
BACKEND_SERVER_NAME=api.tudominio.com
PROXY_PORT=443
FRONTEND_URL=https://app.tudominio.com
FRONTEND_SERVER_NAME=app.tudominio.com
```

Y reconstruye:

```bash
docker compose up -d --build
```

---

## Actualización

```bash
git pull
docker compose up -d --build
```

Las migraciones de base de datos se ejecutan automáticamente al iniciar el contenedor del backend.

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Reiniciar un servicio
docker compose restart backend

# Detener todo
docker compose down

# Detener y eliminar volúmenes (¡borra la base de datos!)
docker compose down -v

# Ejecutar migraciones manualmente
docker compose exec backend npx sequelize db:migrate

# Ejecutar seeds manualmente
docker compose exec backend npx sequelize db:seed:all
```

---

## Estructura del proyecto

```
ExaTicket/
├── backend/          # API Node.js + TypeScript
│   ├── src/
│   │   ├── services/AIServices/   # Chat IA con Claude
│   │   ├── handlers/              # Eventos de WhatsApp
│   │   ├── models/                # Modelos Sequelize
│   │   └── database/migrations/   # Migraciones DB
│   └── Dockerfile
├── frontend/         # React + Material UI + Vite
│   ├── src/
│   └── Dockerfile
├── ssl/              # Certificados SSL (no incluidos en git)
├── docker-compose.yaml
└── .env.example
```

---

## Aviso legal

Este proyecto no está afiliado, asociado, autorizado ni respaldado por WhatsApp o sus subsidiarias. "WhatsApp" y los nombres relacionados son marcas registradas de sus respectivos propietarios.
