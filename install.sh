#!/usr/bin/env bash
#
# Instalador automático de ExaTicket (sin Docker) para Ubuntu 22.04/24.04
# (o Debian 11+), pensado para un servidor recién instalado, ejecutado
# como root.
#
# Uso:
#   git clone https://github.com/eliexerguevara/ExaTicket.git
#   cd ExaTicket
#   chmod +x install.sh
#   ./install.sh                      # pregunta el dominio de forma interactiva
#   ./install.sh ticket.tudominio.com # o pásalo directo como argumento
#   ./install.sh ""                   # instala solo con IP, sin dominio/SSL
#
# Es idempotente: puedes volver a correrlo si algo falla a mitad de camino.
# Al final imprime todas las contraseñas/secretos generados. GUÁRDALOS.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"
SERVER_IP="$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')"

DB_NAME="exaticket"
DB_USER="exaticket"
DB_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"
JWT_SECRET="$(openssl rand -hex 32)"
JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
BACKEND_PORT=8080

if [[ $EUID -ne 0 ]]; then
  echo "Este script debe ejecutarse como root." >&2
  exit 1
fi

if [[ ! -f "$INSTALL_DIR/backend/package.json" ]]; then
  echo "No encuentro backend/package.json junto a este script." >&2
  echo "Corre install.sh desde dentro del repo clonado de ExaTicket." >&2
  exit 1
fi

# ───────────────────────────── 0. Preguntar el dominio ─────────────────────────────
DOMAIN="${1-__unset__}"
if [[ "$DOMAIN" == "__unset__" ]]; then
  DOMAIN=""
  if [[ -t 0 ]]; then
    read -r -p "Dominio a usar (ej: ticket.tudominio.com; Enter para usar solo la IP $SERVER_IP): " DOMAIN
  fi
fi

if [[ -n "$DOMAIN" ]]; then
  echo "Se usará el dominio: $DOMAIN (con HTTPS automático)"
else
  echo "Sin dominio: se usará la IP $SERVER_IP por HTTP"
fi

echo "=================================================================="
echo " Instalando ExaTicket (sin Docker) en $SERVER_IP"
echo "=================================================================="

# ───────────────────────────── 1. Paquetes base ─────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl wget git build-essential ca-certificates gnupg lsb-release ufw software-properties-common

# ───────────────────────────── 2. Node.js 18 ─────────────────────────────
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi
node -v
npm install -g pm2

# ───────────────────────────── 3. MariaDB (MySQL) ─────────────────────────────
apt-get install -y mariadb-server mariadb-client
systemctl enable --now mariadb

# ───────────────────────────── 4. Redis ─────────────────────────────
apt-get install -y redis-server
systemctl enable --now redis-server

# ───────────────────────────── 5. Google Chrome (whatsapp-web.js) ─────────────────────────────
if ! command -v google-chrome-stable >/dev/null; then
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -y
  apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1
fi

# ───────────────────────────── 6. Nginx (+ Certbot si hay dominio) ─────────────────────────────
apt-get install -y nginx
if [[ -n "$DOMAIN" ]]; then
  apt-get install -y certbot python3-certbot-nginx
fi

# ───────────────────────────── 7. Base de datos ─────────────────────────────
# Root@localhost entra sin password vía socket (auth_socket) en instalación
# limpia de MariaDB. Si tu root de MySQL ya tiene password, exporta
# MYSQL_ROOT_PASS=xxx antes de correr el script.
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-}"
if [[ -n "$MYSQL_ROOT_PASS" ]]; then
  MYSQL_CMD=(mysql -uroot -p"$MYSQL_ROOT_PASS")
else
  MYSQL_CMD=(mysql -uroot)
fi

"${MYSQL_CMD[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# ───────────────────────────── 8. Backend ─────────────────────────────
cd "$INSTALL_DIR/backend"

if [[ -n "$DOMAIN" ]]; then
  BACKEND_URL="https://${DOMAIN}/api"
  FRONTEND_URL="https://${DOMAIN}"
else
  BACKEND_URL="http://${SERVER_IP}:${BACKEND_PORT}"
  FRONTEND_URL="http://${SERVER_IP}"
fi

cat > .env <<ENV
NODE_ENV=production
PORT=${BACKEND_PORT}

WHATSAPP_PROVIDER=wwebjs
LOG_LEVEL=info
WHAILEYS_LOG_LEVEL=error

CHROME_BIN=$(command -v google-chrome-stable || command -v chromium-browser || command -v chromium)
CHROME_ARGS=--no-sandbox --disable-setuid-sandbox

DB_HOST=localhost
DB_DIALECT=mysql
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

BACKEND_URL=${BACKEND_URL}
FRONTEND_URL=${FRONTEND_URL}
PROXY_PORT=${BACKEND_PORT}

# Agrega tu clave de IA (Anthropic/Claude) aqui si vas a usar el chat con IA.
# Si vas a reemplazarla por Ollama, este es el archivo que hay que tocar
# junto con backend/src/services/AIServices/GetAIResponse.ts
ANTHROPIC_API_KEY=

ZABBIX_API_URL=
ZABBIX_API_TOKEN=
ZABBIX_API_USER=
ZABBIX_API_PASSWORD=

SPLYNX_PING_TOKEN=

IO_REDIS_SERVER=127.0.0.1
IO_REDIS_PASSWORD=
IO_REDIS_PORT=6379
IO_REDIS_DB_SESSION=2

TELEGRAM_REMINDER_BOT_TOKEN=
TELEGRAM_REMINDER_CHAT_ID=
TELEGRAM_REMINDER_TZ=America/Argentina/Buenos_Aires
ENV

npm install
npm run build
npx sequelize db:migrate
npx sequelize db:seed:all || true

pm2 delete exaticket-backend 2>/dev/null || true
pm2 start dist/server.js --name exaticket-backend
pm2 save

# ───────────────────────────── 9. Frontend ─────────────────────────────
cd "$INSTALL_DIR/frontend"

if [[ -n "$DOMAIN" ]]; then
  VITE_BACKEND_URL="https://${DOMAIN}/api/"
else
  VITE_BACKEND_URL="http://${SERVER_IP}:${BACKEND_PORT}/"
fi

cat > .env <<ENV
VITE_BACKEND_URL=${VITE_BACKEND_URL}
VITE_HOURS_CLOSE_TICKETS_AUTO=24
ENV

npm install
npm run build

rm -rf /var/www/exaticket
mkdir -p /var/www/exaticket
cp -r build/* /var/www/exaticket/ 2>/dev/null || cp -r dist/* /var/www/exaticket/

# ───────────────────────────── 10. Nginx site ─────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="$DOMAIN"
else
  SERVER_NAME="$SERVER_IP"
fi

cat > /etc/nginx/sites-available/exaticket <<NGINX
server {
    listen 80;
    server_name ${SERVER_NAME};

    root /var/www/exaticket;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/exaticket /etc/nginx/sites-enabled/exaticket
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

# ───────────────────────────── 11. Certificado SSL (si hay dominio) ─────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
  if [[ -z "$CERTBOT_EMAIL" ]]; then
    CERTBOT_ARGS=(--register-unsafely-without-email)
  else
    CERTBOT_ARGS=(-m "$CERTBOT_EMAIL")
  fi
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos "${CERTBOT_ARGS[@]}" --redirect
  systemctl enable --now certbot.timer 2>/dev/null || true
fi

# ───────────────────────────── 12. PM2 al arrancar el sistema ─────────────────────────────
pm2 startup systemd -u root --hp /root | tail -n1 | bash || true
pm2 save

# ───────────────────────────── 13. Firewall ─────────────────────────────
ufw allow OpenSSH
ufw allow 80/tcp
if [[ -n "$DOMAIN" ]]; then
  ufw allow 443/tcp
else
  ufw allow ${BACKEND_PORT}/tcp
fi
ufw --force enable

# ───────────────────────────── Resumen final ─────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  SITE_URL="https://${DOMAIN}"
else
  SITE_URL="http://${SERVER_IP}"
fi

SUMMARY_FILE="/root/exaticket-credenciales.txt"
cat > "$SUMMARY_FILE" <<SUMMARY
=================================================================
 ExaTicket instalado correctamente - $(date)
=================================================================

Sitio:     ${SITE_URL}
Backend:   ${BACKEND_URL}

--- Base de datos (MariaDB) ---
Host:            localhost
Puerto:          3306
DB name:         ${DB_NAME}
DB user:         ${DB_USER}
DB password:     ${DB_PASS}

--- Backend secrets ---
JWT_SECRET:          ${JWT_SECRET}
JWT_REFRESH_SECRET:  ${JWT_REFRESH_SECRET}

--- Pendiente ---
- Agregar ANTHROPIC_API_KEY en ${INSTALL_DIR}/backend/.env si vas a usar el
  chat con IA (Claude), o reemplazar backend/src/services/AIServices/GetAIResponse.ts
  para usar Ollama, y luego: pm2 restart exaticket-backend
- El usuario/admin inicial de ExaTicket se crea desde la propia interfaz web
  (pantalla de registro) o revisando los seeders en backend/src/database/seeds.

Este archivo queda guardado en ${SUMMARY_FILE} (solo legible por root).
=================================================================
SUMMARY

chmod 600 "$SUMMARY_FILE"

echo ""
cat "$SUMMARY_FILE"
echo ""
echo "Instalación completa. Copia el contenido de arriba a un lugar seguro."
