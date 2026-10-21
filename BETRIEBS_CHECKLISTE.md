# Betriebs-Checkliste: Modul 042 Webapplikation

Diese Checkliste dokumentiert alle betriebsrelevanten Aspekte für den produktiven Betrieb der Webapplikation gemäss den Vorgaben von Modul 042 (HKV Aarau).

---

## 1. Daten (Data Management & Persistence)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Persistente Datenspeicherung** | `umgesetzt` | Über das Docker-Volume `postgres_data` gemountet auf `/var/lib/postgresql/data`. Ein Container-Neustart oder -Update führt zu keinem Datenverlust. |
| **Automatische Datenbank-Backups** | `geplant` | **Wie:** Cronjob auf dem Host oder dedizierter Backup-Container, der täglich `pg_dump` ausführt, komprimiert (`.sql.gz`) und verschlüsselt in einen S3-kompatiblen Objektspeicher ablegt. |
| **Desaster Recovery & Restore-Tests** | `geplant` | **Wie:** Quartalsweises Testen des DB-Restores in einer isolierten Staging-Umgebung zur Verifikation der RTO (Recovery Time Objective) und RPO (Recovery Point Objective). |
| **Datenbank-Migrationen** | `umgesetzt` | **Wie:** Idempotentes Schema-Init (`CREATE TABLE IF NOT EXISTS visitors`) beim Start der Node.js Applikation. Für komplexe Versionen sind Tools wie Prisma Migrate oder Flyway vorgesehen. |
| **Datenschutz & DSGVO / DSG** | `umgesetzt` | Es werden keine personenbezogenen Klardaten gespeichert. Lediglich ein Zähler und anonymisierte Request-Metadaten. |

---

## 2. Sicherheit (Security)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Secrets Management** | `umgesetzt` | Passwörter, Credentials und Tokens befinden sich ausschliesslich in `.env`. Die `.env`-Datei ist in `.gitignore` eingetragen und wird niemals im Git-Repository versioniert. |
| **Ende-zu-Ende Verschlüsselung (HTTPS/TLS)** | `umgesetzt` | Der Cloudflare Tunnel stellt automatische SSL/TLS-Terminierung am Cloudflare Edge bereit. Kein unverschlüsselter HTTP-Datenverkehr im öffentlichen Netz. |
| **Principle of Least Privilege** | `geplant` | **Wie:** Betrieb des Node.js-Containers unter einem unprivilegierten Benutzer (`USER node` im Dockerfile) statt als `root`. |
| **Schwachstellen-Scanning (SAST / Container)** | `geplant` | **Wie:** GitHub Actions Integration mit Trivy oder GitHub Dependabot / CodeQL zum automatischen Scannen von NPM-Paketen und Base-Images vor dem Release. |
| **Netzwerk-Isolierung** | `umgesetzt` | PostgreSQL-Container ist nur im internen Docker-Bridge-Netzwerk (`webapp_net`) erreichbar und exponiert keine Ports nach aussen auf den Host. |

---

## 3. Betrieb (Operations, Monitoring & Resilience)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Healthchecks** | `umgesetzt` | Endpunkt `/health` prüft sowohl den HTTP-Dienst als auch eine echte SQL-Abfrage (`SELECT 1`) an PostgreSQL. Docker führt periodische Healthchecks aus. |
| **Zentrales Logging** | `geplant` | **Wie:** Strukturierte JSON-Logs über Standard-Output (stdout), weitergeleitet an Grafana Loki oder ELK-Stack. |
| **Metriken & Monitoring** | `geplant` | **Wie:** Prometheus-Metriken über `/metrics` zur Erfassung von Latenz, Request-Raten und Fehlerraten; Visualisierung via Grafana Dashboard. |
| **Alerting** | `geplant` | **Wie:** Benachrichtigungen via Webhook an Microsoft Teams oder Slack, falls der `/health`-Endpunkt über 2 Minuten nicht mit HTTP 200 antwortet. |
| **Auto-Restart Policies** | `umgesetzt` | Alle Dienste in `docker-compose.yml` sind mit `restart: unless-stopped` konfiguriert. Abstürzende Container starten automatisch neu. |

---

## 4. Deployment (CI/CD & Delivery)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Automatisierter Build (CI)** | `umgesetzt` | GitHub Actions Workflow (`.github/workflows/deploy.yml`) baut bei jedem Push auf `main` das Docker-Image und taggt es mit Git Commit SHA und `latest`. |
| **Continuous Deployment (CD)** | `umgesetzt` | Watchtower überwacht Container-Images lokal und aktualisiert die laufende Instanz ohne manuelle Handarbeit, sobald ein neuer Stand verfügbar ist. |
| **Versionierung & Nachvollziehbarkeit** | `umgesetzt` | Der genaue Git-Commit-Hash wird zur Build-Zeit in das Image injiziert und live auf der Weboberfläche angezeigt. |
| **Rollback-Strategie** | `geplant` | **Wie:** Bei fehlerhaftem Release kann Watchtower oder Docker Compose via Image-Tag auf den vorherigen Git-Commit SHA zurückgesetzt werden (`docker compose up -d`). |
| **Zero-Downtime Deployment** | `bewusst weggelassen` | **Warum:** Für ein einfaches Single-Host / Edge-Tunnel-Setup reicht ein kurzes 2-Sekunden Restart-Fenster. Ein vollständiges Blue-Green- oder Rolling-Update mit Kubernetes / Traefik wäre unverhältnismässig komplex für diese Anforderung. |

---

## 5. Infrastruktur (Infrastructure & Architecture)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Containerisierung** | `umgesetzt` | Vollständige Kapselung von Web-Applikation und Datenbank in getrennten, leichtgewichtigen Alpine-Docker-Containern. |
| **Öffentliche Bereitstellung ohne Portweiterleitung** | `umgesetzt` | Cloudflare Tunnel baut einen ausgehenden verschlüsselten Tunnel zur Cloudflare-Edge auf. Keine Router-Freigaben oder öffentliche IPv4-Adressen erforderlich. |
| **Ressourcen-Limits (CPU/RAM)** | `geplant` | **Wie:** `deploy.resources.limits` in `docker-compose.yml` setzen, um Denial-of-Service durch Ressourcenerschöpfung zu verhindern. |
| **Kostenfreiheit** | `umgesetzt` | Sämtliche Komponenten (GitHub Free Tier, GitHub Container Registry, Cloudflare Quick Tunnel, PostgreSQL, Node.js) sind zu 100% kostenlos nutzbar. |
| **Multi-Host Clustering** | `bewusst weggelassen` | **Warum:** Ein verteiltes Kubernetes- oder Swarm-Cluster übersteigt den Rahmen des lokalen Laptop-Betriebs und verursacht unnötigen Overhead. |

---

## 6. Organisatorisches (Governance & Documentation)

| Aspekt | Status | Begründung & Massnahme / Vorgehen |
| :--- | :--- | :--- |
| **Betriebshandbuch & README** | `umgesetzt` | Vollständige Anleitung zur Inbetriebnahme, Konfiguration, Fehlerbehebung und Architektur im Repository vorhanden. |
| **Rollen & Verantwortlichkeiten** | `umgesetzt` | DevOps-Verantwortung liegt beim jeweiligen Studierenden (Setup, Release, Überwachung). |
| **SLA (Service Level Agreement)** | `geplant` | **Wie:** Definition von Verfügbarkeitszielen (z. B. 99% Best-Effort für Übungszwecke, 99.9% für Enterprise). |
| **Incident Response Prozess** | `geplant` | **Wie:** Runbook mit standardisierten Schritten: 1. Tunnel-Status prüfen, 2. `docker compose logs` analysieren, 3. Container neustarten oder zurückrollen. |
| **24/7 Bereitschaftsdienst (On-Call)** | `bewusst weggelassen` | **Warum:** Nicht erforderlich für ein Ausbildungs- und Demonstrationsprojekt. |
