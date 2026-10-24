# Betriebs-Checkliste: HUB-042 (Übung Webapplikation, Modul 042)

Diese Checkliste dokumentiert alle betriebsrelevanten Aspekte für den produktiven Betrieb von HUB-042 gemäss Übung „Webapplikation (3/3)“ im Modul 042 Applications Engineering (HKV Aarau / HFWI-2504-AA). Status: `umgesetzt` / `geplant (wie?)` / `bewusst weggelassen (warum?)`.

---

## 1. Daten (Data Management & Persistence)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Persistente Datenspeicherung** | `umgesetzt` | Über das Docker-Volume `postgres_data` gemountet auf `/var/lib/postgresql/data`. Ein Container-Neustart oder -Update führt zu keinem Datenverlust. |
| **Automatische Datenbank-Backups (`pg_dump`)** | `geplant` | **Wie:** Cronjob auf dem Host oder dedizierter Alpine-Backup-Container, der täglich `pg_dump` ausführt, komprimiert (`.sql.gz`) und verschlüsselt in einen S3-kompatiblen Objektspeicher oder lokalen Speicher ablegt. |
| **Desaster Recovery & Restore-Tests** | `geplant` | **Wie:** Quartalsweises Testen des DB-Restores in einer isolierten Staging-Umgebung zur Verifikation der RTO (Recovery Time Objective) und RPO (Recovery Point Objective). |
| **Datenbank-Migrationen** | `umgesetzt` | Idempotente Migration beim Start (`src/migrate.js`): Schuljahre, Module, Lektionen, Aufgaben, Abgaben, Check-ins, Forum, Teilnehmerliste, Audit-Log. Tabellen der Vorgängerversion (`exams`, `module_scores`) bleiben erhalten. Startdaten (Stundenpläne, Teams-Aufgaben) werden genau einmal eingespielt (`app_meta.seed_v1`). Getestet: Update über eine Datenbank der alten Version ohne Datenverlust. |
| **Datenschutz (DSG, Modul DSRE)** | `umgesetzt` | Einwilligung bei der Registrierung, Datenschutzerklärung, Impressum, Datenexport, Konto löschen. Ranking zeigt andere nur als „Anonym“ und erst ab 3 Personen (k-Anonymität). Keine IP-Adressen. Details: [DATENSCHUTZ.md](DATENSCHUTZ.md). |
| **Teilnehmerliste** | `umgesetzt` | Nur in `.env` (`TEILNEHMER_EMAILS`) und in der DB, nie im öffentlichen Repo. Pflege in der App unter „Verwaltung“. |

---

## 2. Sicherheit (Security)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Secrets Management** | `umgesetzt` | Keine Fallbacks in `docker-compose.yml` (`${DB_PASSWORD:?DB_PASSWORD fehlt}`). Alle Secrets befinden sich ausschliesslich in `.env` (gitignored). `.env.example` dient als versionierte Vorlage ohne sensible Daten. |
| **Rate-Limiting & Brute-Force-Schutz** | `umgesetzt` | `express-rate-limit` drosselt Auth-, Challenge- und Registrierungs-Endpunkte auf max. 30 Anfragen pro 15 Minuten. |
| **Zugangskontrolle** | `umgesetzt` | Registrierung nur mit `@stud.hkv.ch` / `@hkv.ch` **und** Eintrag auf der Teilnehmerliste **und** bestätigtem Mail-Link. Ohne Login liefern alle APIs und Downloads `401`. Rollen: Studierende, Dozierende, Admin. Der frühere Rechen-/Wissens-Bot ist durch die Teilnehmerliste ersetzt. |
| **Keine Indexierung** | `umgesetzt` | `robots.txt` (Disallow /), Header `X-Robots-Tag: noindex, nofollow, noarchive` und Meta-Tag. |
| **Passwort-Sicherheit & Sessions** | `umgesetzt` | Passwörter 8–20 Zeichen, `bcrypt` (10 Runden). Session-Cookies mit `SESSION_SECRET` signiert, `httpOnly`, `sameSite: 'lax'`. Passwort-Reset per Mail (1 Stunde gültig). |
| **Passwort-Reset ohne Mail** | `umgesetzt` | Demo-Modus: Admin setzt auf das Werkspasswort (`RESET_PASSWORD`, nur `.env`) zurück; Login danach nur mit persönlicher Wiederherstellungs-ID (bcrypt-Hash); Pflichtwechsel, bis dahin sperrt der Server alle anderen APIs. |
| **Flüchtiger Chat** | `umgesetzt` | Nur Arbeitsspeicher, keine Persistenz; Sitzungsregeln und Löschung wie in `DATENSCHUTZ.md`. Bewusst ohne Persistenz (Datenschutz): Ein Neustart oder Watchtower-Update löscht alle Chats. |
| **Audit-Protokoll** | `umgesetzt` | Logins, fehlgeschlagene Logins, Einwilligungen, Datenexporte, Verwaltungsaktionen. Nur für Admins sichtbar; 365 Tage, Fehlversuche 30 Tage. |
| **HTTP-Sicherheitsheader (Helmet)** | `umgesetzt` | `helmet` setzt eine strikte CSP (nur eigene Skripte, keine externen Quellen), Frameguard und HSTS. Google Fonts und CDNs wurden entfernt. |
| **Ende-zu-Ende Verschlüsselung (HTTPS/TLS)** | `umgesetzt` | Der Cloudflare Tunnel stellt automatische SSL/TLS-Terminierung am Cloudflare Edge bereit. Kein unverschlüsselter HTTP-Datenverkehr im öffentlichen Netz. |
| **Netzwerk-Isolierung** | `umgesetzt` | PostgreSQL-Container ist nur im internen Docker-Bridge-Netzwerk (`hub042_net`) erreichbar und exponiert keine Ports nach aussen auf den Host. |
| **Principle of Least Privilege** | `umgesetzt` | Der Node.js-Container läuft als unprivilegierter Benutzer (`USER node`). Dozierende/Admins sehen keine Punkte. |
| **Schwachstellen-Scanning (SAST / Container)** | `geplant` | **Wie:** GitHub Actions Integration mit Trivy oder GitHub Dependabot / CodeQL zum automatischen Scannen von NPM-Paketen und Base-Images vor dem Release. |

---

## 3. Betrieb (Operations, Monitoring & Resilience)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Healthchecks** | `umgesetzt` | `/health` prüft HTTP-Dienst und eine echte SQL-Abfrage, liefert Version, Uptime, Zähler (Users, Teilnehmende, Aufgaben, Lektionen) und SMTP-Modus (ohne Secrets). Docker-Healthchecks für `app` und `db`. |
| **E-Mail & SMTP-Dienst** | `umgesetzt` | `nodemailer` über das HKV-Microsoft-365-Konto: Bestätigung, Einladung, Willkommens-Mail mit Produktblatt (PDF), Passwort-Reset. Ohne SMTP stehen die Links im Log, Admins schalten manuell frei. |
| **Hilfe-Bot** | `umgesetzt` | Optional über Google Gemini (`GEMINI_API_KEY`), sonst lokale FAQ; eigenes Rate-Limit; schwärzt E-Mails und Telefonnummern; sendet keine Personendaten. |
| **Auto-Restart Policies** | `umgesetzt` | Alle Dienste in `docker-compose.yml` sind mit `restart: unless-stopped` konfiguriert. Abstürzende Container starten automatisch neu. |
| **Zentrales Logging** | `geplant` | **Wie:** Strukturierte JSON-Logs über Standard-Output (stdout), weitergeleitet an Grafana Loki oder ELK-Stack. |
| **Metriken & Monitoring** | `geplant` | **Wie:** Prometheus-Metriken über `/metrics` zur Erfassung von Latenz, Request-Raten und Fehlerraten; Visualisierung via Grafana Dashboard. |
| **Alerting** | `geplant` | **Wie:** Benachrichtigungen via Webhook an Microsoft Teams oder Slack, falls der `/health`-Endpunkt über 2 Minuten nicht mit HTTP 200 antwortet. |

---

## 4. Deployment (CI/CD & Delivery)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Automatisierte Unit-Tests in CI** | `umgesetzt` | Vor jedem Docker-Build läuft `npm test` (33 Tests): Zugangsregeln, Ranking-Anonymität und k-Anonymität, LLP-Berechnung nach Leistungsausweis, Notenformel, Gamification, Stundenplan-Import, ICS-Export, Bot-Schwärzung. |
| **Automatisierter Multi-Arch Build (CI)** | `umgesetzt` | GitHub Actions baut bei jedem Push auf `main` das Docker-Image für `linux/amd64` und `linux/arm64` und pusht es auf GHCR (`ghcr.io/baniox/hub-042`). |
| **Continuous Deployment (CD)** | `umgesetzt` | Watchtower überwacht Container-Images lokal und aktualisiert die laufende Instanz ohne manuelle Handarbeit, sobald ein neuer Stand verfügbar ist. |
| **Versionierung & Nachvollziehbarkeit** | `umgesetzt` | Der Git-Commit-Hash wird zur Build-Zeit ins Image injiziert und in der Pflicht-Statuszeile in der Fusszeile angezeigt. Image `ghcr.io/baniox/hub-042`; das Datenbank-Volume behält beim Umstieg seinen Namen (`DB_VOLUME`), damit keine Daten verloren gehen. |
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
| **Dauerbetrieb 24/7** | `umgesetzt` | Seit 24.10.2026 auf Oracle Cloud Always Free (`VM.Standard.E2.1.Micro`, Zürich, 2 GB Swap) mit Tailscale Funnel; A1.Flex war in Zürich ausgebucht. Gleicher Compose-Stack auf einer kostenlosen Oracle-Cloud-VM (Always Free, Region Zürich), Schritt-für-Schritt im README „Dauerhaft online“, Abschnitt B; Einrichtung mit einem Befehl über `scripts/server-setup.sh` (neue Geheimwerte, `.env` nur für den Besitzer lesbar). |
| **Feste öffentliche Adresse (gratis)** | `umgesetzt` | Optionaler Compose-Dienst `tailscale` (Profil `tailscale`) mit Tailscale Funnel: `https://hub-042.<tailnet>.ts.net`. Aktivierung über `TS_AUTHKEY` und `PUBLIC_URL` in der `.env`. |
| **Onboarding nach QR-Scan** | `umgesetzt` | Öffentliche Seite `#/willkommen` mit 3 Schritten (Dashboard, Registrierung, Warnung zur Wiederherstellungs-ID). Keine Datenbearbeitung, nur statische Erklärung. |
| **Link mit QR-Code für die Klasse** | `umgesetzt` | Verwaltung → „Link für die Klasse“: `PUBLIC_URL` oder aktuelle Quick-Tunnel-Adresse (cloudflared-Metrics, nur intern), QR-Code serverseitig als SVG (`qrcode`), nur für Admins (`GET /api/admin/public-url`). |
| **Mobile / PWA** | `umgesetzt` | Responsive Layout mit Tab-Leiste unten, Web-App-Manifest und Apple-Touch-Icon: auf dem iPhone als App auf dem Homescreen nutzbar. |
| **Multi-Host Clustering** | `bewusst weggelassen` | **Warum:** Ein verteiltes Kubernetes- oder Swarm-Cluster übersteigt den Rahmen des lokalen Betriebs und verursacht unnötigen Overhead. |

---

## 6. Organisatorisches (Governance & Documentation)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Betriebshandbuch & README** | `umgesetzt` | Vollständige Anleitung zur Inbetriebnahme, Konfiguration, Fehlerbehebung und Architektur im Repository vorhanden. |
| **Rollen & Verantwortlichkeiten** | `umgesetzt` | Betrieb und Release: Alban Hyseni (Admin). Entwicklung: Claude Code (KI im Agent-Modus, gemäss Übungsvorgabe). Klassen-Admins/Dozierende pflegen Teilnehmerliste, Aufgaben und Stundenplan in der App. |
| **Datenschutz-Dokumentation** | `umgesetzt` | Datenschutzerklärung und Impressum in der App, Selbst-Audit in [DATENSCHUTZ.md](DATENSCHUTZ.md), Produktblatt mit FAQ. |
| **SLA (Service Level Agreement)** | `geplant` | **Wie:** Definition von Verfügbarkeitszielen (z. B. 99% Best-Effort für Übungszwecke, 99.9% für Enterprise). |
| **Incident Response Prozess** | `geplant` | **Wie:** Runbook mit standardisierten Schritten: 1. Tunnel-Status prüfen, 2. `docker compose logs` analysieren, 3. Container neustarten oder zurückrollen. |
| **24/7 Bereitschaftsdienst (On-Call)** | `bewusst weggelassen` | **Warum:** Nicht erforderlich für ein Ausbildungs- und Demonstrationsprojekt. |
