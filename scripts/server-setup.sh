#!/usr/bin/env bash
# HUB-042 auf einem frischen Ubuntu-Server einrichten (z. B. Oracle Cloud Always Free).
# Aufruf auf dem Server:
#   curl -fsSL https://raw.githubusercontent.com/BanioX/hub-042/main/scripts/server-setup.sh | bash
# Das Skript ist wiederholbar: eine bestehende .env und die Datenbank bleiben erhalten.
set -euo pipefail

REPO=https://github.com/BanioX/hub-042.git
DIR="$HOME/hub-042"
ask() { local v; read -r -p "$1" v < /dev/tty; printf '%s' "$v"; }
ask_secret() { local v; read -r -s -p "$1" v < /dev/tty; echo >&2; printf '%s' "$v"; }

echo "== HUB-042 Server-Einrichtung =="

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "-> Docker wird installiert …"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# 2. Code holen oder aktualisieren
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

# 3. .env anlegen (nur beim ersten Mal)
if [ ! -f .env ]; then
  echo
  echo "Jetzt kommen ein paar Fragen. Die Antworten landen nur in $DIR/.env auf diesem Server."
  TS_AUTHKEY=$(ask_secret "Tailscale-Schlüssel (tskey-auth-…, Eingabe bleibt unsichtbar): ")
  RESET_PASSWORD=$(ask_secret "Werkspasswort für Passwort-Resets (8–20 Zeichen, unsichtbar): ")
  ADMIN_EMAILS=$(ask "Admin-Adresse(n), mit Komma getrennt [alban.hyseni@stud.hkv.ch]: ")
  ADMIN_EMAILS=${ADMIN_EMAILS:-alban.hyseni@stud.hkv.ch}
  TEILNEHMER_EMAILS=$(ask "Teilnehmer-Adressen, mit Komma getrennt (aus deiner Laptop-.env kopieren): ")
  DOZENT_EMAILS=$(ask "Dozierenden-Adresse(n), mit Komma getrennt (leer = keine): ")
  APP_NAME=$(ask "Name in der Statuszeile [Alban]: ")
  APP_NAME=${APP_NAME:-Alban}
  umask 077
  cat > .env <<EOF
APP_NAME=$APP_NAME
PORT=3000
PUBLIC_URL=
TS_AUTHKEY=$TS_AUTHKEY
DB_NAME=webapp_db
DB_USER=webapp_user
DB_PASSWORD=$(openssl rand -hex 24)
DB_VOLUME=hub-042_postgres_data
SESSION_SECRET=$(openssl rand -hex 32)
RESET_PASSWORD=$RESET_PASSWORD
COOKIE_SECURE=false
ADMIN_EMAILS=$ADMIN_EMAILS
DOZENT_EMAILS=$DOZENT_EMAILS
TEILNEHMER_EMAILS=$TEILNEHMER_EMAILS
ALLOWED_EMAIL_DOMAINS=stud.hkv.ch,hkv.ch
GEMINI_API_KEY=
EOF
  echo "-> .env erstellt (nur für dich lesbar)."
fi

# 4. Starten (fertige Images von GitHub, kein Build auf dem Server)
echo "-> Images werden geladen und gestartet …"
$DOCKER compose pull --ignore-buildable 2>/dev/null || $DOCKER compose pull
$DOCKER compose --profile tailscale up -d --no-build

# 5. Feste Tailscale-Adresse ermitteln und als PUBLIC_URL eintragen
echo "-> Warte auf Tailscale …"
HOST=""
for _ in $(seq 1 30); do
  HOST=$($DOCKER exec hub042_tailscale tailscale status --json 2>/dev/null \
    | grep -o '"DNSName": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/; s/\.$//') || true
  [ -n "$HOST" ] && break
  sleep 2
done

if [ -n "$HOST" ]; then
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$HOST|" .env
  $DOCKER compose up -d --no-build app
  echo
  echo "✅ HUB-042 läuft: https://$HOST"
  echo "   Link für die Klasse: https://$HOST/#/willkommen (QR-Code in der Verwaltung)"
  echo "   Der erste Aufruf kann bis zu einer Minute dauern (HTTPS-Zertifikat)."
  echo "   Wichtig: in Tailscale → Machines → hub-042 → ⋯ → Disable key expiry"
else
  echo "⚠️ Tailscale hat noch keine Adresse. Prüfen: $DOCKER compose logs tailscale"
fi
