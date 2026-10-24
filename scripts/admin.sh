#!/usr/bin/env bash
# HUB-042 Admin-Werkzeug für den Server (siehe docs/ADMIN_HANDBUCH.md)
# Aufruf auf dem Server: ~/hub-042/scripts/admin.sh <befehl>
set -euo pipefail
cd "$(dirname "$0")/.."

DC="docker compose --profile tailscale"
docker info >/dev/null 2>&1 || DC="sudo $DC"
envval() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true; }
DB_USER=$(envval DB_USER); DB_USER=${DB_USER:-webapp_user}
DB_NAME=$(envval DB_NAME); DB_NAME=${DB_NAME:-webapp_db}
BACKUP_DIR="$HOME/hub-042-backups"

confirm() {
  local a
  read -r -p "$1 Zum Bestätigen '$2' eintippen: " a < /dev/tty
  [ "$a" = "$2" ] || { echo "Abgebrochen, nichts geändert."; exit 1; }
}
ask_pass() {
  local p
  read -r -s -p "Backup-Passwort (mind. 8 Zeichen, gut merken!): " p < /dev/tty; echo >&2
  [ ${#p} -ge 8 ] || { echo "Zu kurz." >&2; exit 1; }
  printf '%s' "$p"
}

do_backup() {
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
  local pass file
  pass=$(ask_pass)
  file="$BACKUP_DIR/hub042_$(date +%Y-%m-%d_%H%M).sql.gz.enc"
  $DC exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip \
    | HUB_PASS="$pass" openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:HUB_PASS -out "$file"
  chmod 600 "$file"
  # Auf dem Server nur die letzten 10 Backups behalten
  ls -1t "$BACKUP_DIR"/hub042_*.sql.gz.enc 2>/dev/null | tail -n +11 | xargs -r rm -f
  echo "✅ Verschlüsseltes Backup: $file"
}

case "${1:-hilfe}" in
  status)
    $DC ps
    echo
    docker exec hub042_tailscale tailscale funnel status 2>/dev/null || sudo docker exec hub042_tailscale tailscale funnel status 2>/dev/null || true
    ;;
  offline)
    # Killswitch: Zugang von aussen sofort kappen, App und Datenbank bleiben erhalten
    $DC stop tunnel tailscale
    echo "🔴 HUB-042 ist OFFLINE (von aussen nicht mehr erreichbar). Alle Daten bleiben erhalten."
    echo "   Wieder online: admin.sh online"
    ;;
  online)
    $DC up -d --no-build
    echo "🟢 HUB-042 ist wieder ONLINE."
    ;;
  update)
    git pull --ff-only
    $DC pull --ignore-buildable 2>/dev/null || $DC pull
    $DC up -d --no-build
    echo "✅ Konfiguration und Images aktualisiert."
    ;;
  backup)
    do_backup
    ;;
  backups)
    ls -lh "$BACKUP_DIR" 2>/dev/null || echo "Noch keine Backups."
    ;;
  restore)
    file="${2:?Datei angeben, z. B.: admin.sh restore ~/hub-042-backups/hub042_2027-01-01_1200.sql.gz.enc}"
    confirm "⚠️ Die aktuelle Datenbank wird komplett durch das Backup ersetzt." WIEDERHERSTELLEN
    pass=$(ask_pass)
    tmp=$(umask 077; mktemp)
    trap 'rm -f "$tmp"' EXIT
    # Erst entschlüsseln und prüfen, erst danach die Datenbank anfassen
    HUB_PASS="$pass" openssl enc -d -aes-256-cbc -pbkdf2 -pass env:HUB_PASS -in "$file" | gunzip > "$tmp" \
      || { echo "❌ Falsches Passwort oder defekte Datei. Datenbank NICHT verändert."; exit 1; }
    $DC stop app
    $DC exec -T db psql -q -U "$DB_USER" "$DB_NAME" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    $DC exec -T db psql -q -U "$DB_USER" "$DB_NAME" < "$tmp" >/dev/null
    $DC start app
    echo "✅ Backup wiederhergestellt."
    ;;
  ende)
    echo "Endgültiges Abschalten (z. B. nach Studienabschluss): löscht ALLE Daten auf diesem Server."
    confirm "⚠️ Das kann nicht rückgängig gemacht werden." ENDE
    read -r -p "Vorher noch ein letztes Backup machen? (j/n) " b < /dev/tty
    [ "$b" = "j" ] && do_backup
    $DC down -v
    echo
    echo "✅ Container und Datenbank auf dem Server sind gelöscht."
    echo "   Noch von Hand (siehe Handbuch Kapitel 6): Oracle-Instanz terminieren, Tailscale-Maschine entfernen,"
    echo "   Backups auf dem Laptop löschen, GitHub-Repo archivieren."
    ;;
  *)
    cat <<'EOF'
HUB-042 Admin-Befehle:
  status    Zeigt, welche Container laufen und ob Funnel aktiv ist
  offline   KILLSWITCH: sofort von aussen unerreichbar, Daten bleiben
  online    Wieder erreichbar machen
  update    Neue Konfiguration von GitHub holen und neu starten
  backup    Verschlüsseltes Datenbank-Backup anlegen (~/hub-042-backups)
  backups   Vorhandene Backups anzeigen
  restore   Backup zurückspielen:  admin.sh restore <datei>
  ende      Alles endgültig löschen (nach dem Studium)
EOF
    ;;
esac
