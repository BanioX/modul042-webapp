# DevOps Webapplikation (Modul 042)

Webapplikation und automatisierte Deployment-Pipeline gemäss Aufgabenstellung aus Modul 042 (HKV Aarau).

---

## Zielsetzung
Die Applikation ist öffentlich über HTTPS erreichbar und liefert:
> **`Hallo von [Name] – Besucher Nr. [aus DB] – DB: verbunden – Version: [Commit-Hash]`**

---

## Architektur-Überblick

- **Frontend / Backend**: Node.js mit Express
- **Datenbank**: PostgreSQL 16 (Alpine) mit persistentem Docker-Volume `postgres_data`
- **Orchestrierung**: `docker compose` mit getrennten Containern im privaten Netzwerk `webapp_net`
- **Öffentlicher HTTPS-Zugriff**: Cloudflare Tunnel (kostenlos, keine Port-Weiterleitung)
- **CI/CD**: GitHub Actions baut und taggt das Docker-Image bei jedem Push auf `main`
- **Zero-Touch Deployment**: Watchtower zieht aktualisierte Images und startet die Container automatisch neu
- **Healthcheck**: Eigener `/health`-Endpunkt mit Live-Prüfung der Datenbankverbindung

---

## Schnellstart

### 1. Umgebungsvariablen prüfen
Kopiere bei Bedarf `.env.example` nach `.env`:
```bash
cp .env.example .env
```

### 2. Container starten
```bash
docker compose up -d --build
```

### 3. Public Cloudflare Tunnel URL anzeigen
```bash
docker compose logs tunnel
```
In den Logs wird die generierte trycloudflare-Adresse angezeigt:
`https://[zufallsname].trycloudflare.com`

### 4. Healthcheck aufrufen
Lokal: `http://localhost:3000/health` oder über den Tunnel: `https://[zufallsname].trycloudflare.com/health`

---

## Git & GitHub Setup

1. Git initialisieren und committen:
```bash
git init
git add .
git commit -m "feat: initial commit for Modul 042 Webapp"
```

2. GitHub Repository erstellen und pushen:
```bash
gh repo create modul042-webapp --public --source=. --remote=origin --push
```

Sobald auf `main` gepusht wird, startet GitHub Actions automatisch den Build.

---

## Betriebs-Checkliste
Siehe [BETRIEBS_CHECKLISTE.md](file:///C:/Users/hysen/.gemini/antigravity/scratch/devops-webapp/BETRIEBS_CHECKLISTE.md) für die vollständige Dokumentation der 6 Kernbereiche (Daten, Sicherheit, Betrieb, Deployment, Infrastruktur, Organisatorisches).
