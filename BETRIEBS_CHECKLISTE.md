# Betriebs-Checkliste: Modul 042 Webapplikation (ATL-Arena)

Diese Checkliste dokumentiert alle betriebsrelevanten Aspekte für den produktiven Betrieb der Webapplikation gemäss den Vorgaben von Modul 042 (HKV Aarau / HFWI-2504-AA).

---

## 1. Daten (Data Management & Persistence)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Persistente Datenspeicherung** | `umgesetzt` | Über das Docker-Volume `postgres_data` gemountet auf `/var/lib/postgresql/data`. Ein Container-Neustart oder -Update führt zu keinem Datenverlust. |
| **Automatische Datenbank-Backups (`pg_dump`)** | `geplant` | **Wie:** Cronjob auf dem Host oder dedizierter Alpine-Backup-Container, der täglich `pg_dump` ausführt, komprimiert (`.sql.gz`) und verschlüsselt in einen S3-kompatiblen Objektspeicher oder lokalen Speicher ablegt. |
| **Desaster Recovery & Restore-Tests** | `geplant` | **Wie:** Quartalsweises Testen des DB-Restores in einer isolierten Staging-Umgebung zur Verifikation der RTO (Recovery Time Objective) und RPO (Recovery Point Objective). |
| **Datenbank-Migrationen** | `umgesetzt` | **Wie:** Idempotentes Schema-Init beim Start (`visits`, `users`, `modules`, `exams`). Bestehende `visitors`/`module_scores` werden automatisch migriert und nicht gelöscht. |
| **Datenschutz & DSGVO / DSG (Modul DSRE)** | `umgesetzt` | Es werden keine personenbezogenen Klarnamen oder E-Mail-Adressen in der Rangliste veröffentlicht. Jeder Student erhält ein Tier-Icon und ein kryptografisches Pseudonym (`Student #XXXX`). |

---

## 2. Sicherheit (Security)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Secrets Management** | `umgesetzt` | Keine Fallbacks in `docker-compose.yml` (`${DB_PASSWORD:?DB_PASSWORD fehlt}`). Alle Secrets befinden sich ausschliesslich in `.env` (gitignored). `.env.example` dient als versionierte Vorlage ohne sensible Daten. |
| **Rate-Limiting & Brute-Force-Schutz** | `umgesetzt` | `express-rate-limit` drosselt Auth-, Challenge- und Registrierungs-Endpunkte auf max. 30 Anfragen pro 15 Minuten. |
| **Einlass in 3 Levels (Bot-Gatekeeper)** | `umgesetzt` | Schutz vor Spam-Registrierungen: Level 1 (Rechen-Bot mit serverseitig HMAC-signiertem Token), Level 2 (Wissens-Bot mit 16 Fragen), Level 3 (Mail-Bot mit E-Mail-Aktivierungstoken). |
| **Passwort-Sicherheit & Sessions** | `umgesetzt` | Passwörter werden mit `bcrypt` (10 Runden) gesalzen und gehasht. Session-Cookies sind mit `SESSION_SECRET` signiert, `httpOnly: true`, `sameSite: 'lax'`. |
| **HTTP-Sicherheitsheader (Helmet)** | `umgesetzt` | `helmet` setzt Content-Security-Policy (CSP), Frameguard, X-XSS-Protection und HSTS. Externe Ressourcen (Google Fonts, Chart.js via CDN) sind explizit in der CSP freigegeben. |
| **Ende-zu-Ende Verschlüsselung (HTTPS/TLS)** | `umgesetzt` | Der Cloudflare Tunnel stellt automatische SSL/TLS-Terminierung am Cloudflare Edge bereit. Kein unverschlüsselter HTTP-Datenverkehr im öffentlichen Netz. |
| **Netzwerk-Isolierung** | `umgesetzt` | PostgreSQL-Container ist nur im internen Docker-Bridge-Netzwerk (`webapp_net`) erreichbar und exponiert keine Ports nach aussen auf den Host. |
| **Principle of Least Privilege** | `geplant` | **Wie:** Betrieb des Node.js-Containers unter einem unprivilegierten Benutzer (`USER node` im Dockerfile) statt als `root`. |
| **Schwachstellen-Scanning (SAST / Container)** | `geplant` | **Wie:** GitHub Actions Integration mit Trivy oder GitHub Dependabot / CodeQL zum automatischen Scannen von NPM-Paketen und Base-Images vor dem Release. |

---

## 3. Betrieb (Operations, Monitoring & Resilience)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Healthchecks** | `umgesetzt` | Endpunkt `/health` prüft sowohl den HTTP-Dienst, eine echte SQL-Abfrage (`SELECT 1`) an PostgreSQL, Uptime, User-/Exam-Zähler als auch den SMTP-Status (ohne Passwörter auszugeben). |
| **E-Mail & SMTP-Dienst** | `umgesetzt` | `nodemailer` versendet Bestätigungslinks für neue Accounts. Ist SMTP in `.env` noch nicht hinterlegt, greift automatisch der Console-Fallback für lokale Tests. |
| **Auto-Restart Policies** | `umgesetzt` | Alle Dienste in `docker-compose.yml` sind mit `restart: unless-stopped` konfiguriert. Abstürzende Container starten automatisch neu. |
| **Zentrales Logging** | `geplant` | **Wie:** Strukturierte JSON-Logs über Standard-Output (stdout), weitergeleitet an Grafana Loki oder ELK-Stack. |
| **Metriken & Monitoring** | `geplant` | **Wie:** Prometheus-Metriken über `/metrics` zur Erfassung von Latenz, Request-Raten und Fehlerraten; Visualisierung via Grafana Dashboard. |
| **Alerting** | `geplant` | **Wie:** Benachrichtigungen via Webhook an Microsoft Teams oder Slack, falls der `/health`-Endpunkt über 2 Minuten nicht mit HTTP 200 antwortet. |

---

## 4. Deployment (CI/CD & Delivery)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Automatisierte Unit-Tests in CI** | `umgesetzt` | In GitHub Actions (`.github/workflows/deploy.yml`) wird vor jedem Docker-Build `npm test` mit `node:test` ausgeführt (Notenformel, Rundung, Challenge-Kryptografie, FAQ-Matching). |
| **Automatisierter Multi-Arch Build (CI)** | `umgesetzt` | GitHub Actions baut bei jedem Push auf `main` das Docker-Image für `linux/amd64` und `linux/arm64` und pusht es auf GHCR (`ghcr.io/baniox/modul042-webapp`). |
| **Continuous Deployment (CD)** | `umgesetzt` | Watchtower überwacht Container-Images lokal und aktualisiert die laufende Instanz ohne manuelle Handarbeit, sobald ein neuer Stand verfügbar ist. |
| **Versionierung & Nachvollziehbarkeit** | `umgesetzt` | Der genaue Git-Commit-Hash wird zur Build-Zeit in das Image injiziert und live auf der Weboberfläche sowie in der Footer-Statuszeile angezeigt. |
| **Rollback-Strategie** | `geplant` | **Wie:** Bei fehlerhaftem Release kann Watchtower oder Docker Compose via Image-Tag auf den vorherigen Git-Commit SHA zurückgesetzt werden (`docker compose up -d`). |
| **Zero-Downtime Deployment** | `bewusst weggelassen` | **Warum:** Für ein Single-Host / Edge-Tunnel-Setup reicht ein kurzes 2-Sekunden Restart-Fenster. Ein vollständiges Blue-Green- oder Rolling-Update mit Kubernetes / Traefik wäre unverhältnismässig komplex für diese Anforderung. |

---

## 5. Infrastruktur (Infrastructure & Architecture)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Containerisierung** | `umgesetzt` | Vollständige Kapselung von Web-Applikation und Datenbank in getrennten, leichtgewichtigen Alpine-Docker-Containern. |
| **Öffentliche Bereitstellung ohne Portweiterleitung** | `umgesetzt` | Cloudflare Tunnel baut einen ausgehenden verschlüsselten Tunnel zur Cloudflare-Edge auf. Keine Router-Freigaben oder öffentliche IPv4-Adressen erforderlich. |
| **Kostenfreiheit** | `umgesetzt` | Sämtliche Komponenten (GitHub Free Tier, GitHub Container Registry, Cloudflare Quick Tunnel, PostgreSQL, Node.js) sind zu 100% kostenlos nutzbar. |
| **Ressourcen-Limits (CPU/RAM)** | `geplant` | **Wie:** `deploy.resources.limits` in `docker-compose.yml` setzen, um Denial-of-Service durch Ressourcenerschöpfung zu verhindern. |
| **Multi-Host Clustering** | `bewusst weggelassen` | **Warum:** Ein verteiltes Kubernetes- oder Swarm-Cluster übersteigt den Rahmen des lokalen Betriebs und verursacht unnötigen Overhead. |

---

## 6. Organisatorisches (Governance & Documentation)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Betriebshandbuch & README** | `umgesetzt` | Vollständige Anleitung zur Inbetriebnahme, Konfiguration, Fehlerbehebung und Architektur im Repository vorhanden. |
| **Rollen & Verantwortlichkeiten** | `umgesetzt` | DevOps-Verantwortung liegt beim jeweiligen Studierenden (Setup, Release, Überwachung). |
| **SLA (Service Level Agreement)** | `geplant` | **Wie:** Definition von Verfügbarkeitszielen (z. B. 99% Best-Effort für Übungszwecke, 99.9% für Enterprise). |
| **Incident Response Prozess** | `geplant` | **Wie:** Runbook mit standardisierten Schritten: 1. Tunnel-Status prüfen, 2. `docker compose logs` analysieren, 3. Container neustarten oder zurückrollen. |
| **24/7 Bereitschaftsdienst (On-Call)** | `bewusst weggelassen` | **Warum:** Nicht erforderlich für ein Ausbildungs- und Demonstrationsprojekt. |
