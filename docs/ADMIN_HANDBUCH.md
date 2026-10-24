# HUB-042 – Admin-Handbuch

Für den Betreiber (Admin), damit HUB-042 auch in ein, zwei Jahren ohne Vorwissen bedient, gesichert, offline genommen oder endgültig abgeschaltet werden kann. Stand: 24.10.2026.

> **Kurz:** Im Notfall **`2_OFFLINE_Killswitch.cmd`** im Admin-Ordner doppelklicken. Ohne Laptop: Oracle-Konsole → Instanz **Stop** (Kapitel 3).

## 1. Was läuft wo?

| Teil | Wo | Wofür |
| :--- | :--- | :--- |
| **Server** | Oracle Cloud, Region *Switzerland North (Zurich)*, Instanz `HUB-042` (`VM.Standard.E2.1.Micro`, Always Free) | App, Datenbank, Tunnel, Updates (Docker Compose in `~/hub-042`) |
| **Feste Adresse** | Tailscale (Gratis-Plan), Maschine `hub-042`, Funnel | `https://hub-042.<tailnet>.ts.net` |
| **Zweite Adresse** | Cloudflare Quick Tunnel (Container `tunnel`) | wechselt bei jedem Neustart, nur als Notlösung |
| **Code** | GitHub `BanioX/hub-042` | Push auf `main` → GitHub Actions baut das Image → **Watchtower** spielt es nach ca. 5 min automatisch ein |
| **Geheimnisse** | nur in `~/hub-042/.env` auf dem Server (Rechte 600) | DB-Passwort, Session-Secret, Werkspasswort, Teilnehmerliste, Tailscale-Schlüssel |
| **Admin-Ordner** | lokal auf dem Laptop (nicht in der Cloud, nicht im Repo) | Doppelklick-Knöpfe, `admin-config.txt`, SSH-Schlüssel-Pfad, gesicherte Stände |

Konten, die du brauchst: Oracle Cloud, Tailscale, GitHub. Passwörter gehören in einen Passwort-Manager, nicht in dieses Handbuch.

## 2. Der Admin-Ordner auf dem Laptop

| Datei | Was sie macht |
| :--- | :--- |
| `1_Status.cmd` | zeigt, ob alles läuft und ob Funnel aktiv ist |
| `2_OFFLINE_Killswitch.cmd` | **sofort offline**, Daten bleiben erhalten |
| `3_Online.cmd` | wieder online |
| `4_Stand_sichern.cmd` | legt unter `Staende\<Datum>` eine Kopie an: Quellcode-ZIP von GitHub **und** verschlüsseltes Datenbank-Backup |
| `5_Server_Konsole.cmd` | öffnet eine SSH-Sitzung auf dem Server |
| `admin-config.txt` | Server-IP und Pfad zum SSH-Schlüssel (Vorlage: `scripts/windows/admin-config.example.txt`) |

Die Knöpfe kommen aus `scripts/windows/` im Repo. Ist der Ordner verloren: Repo-ZIP von GitHub laden, `scripts/windows` kopieren, `admin-config.example.txt` als `admin-config.txt` ausfüllen.

**Empfehlung:** Einmal pro Semester und vor jeder grösseren Änderung `4_Stand_sichern.cmd` ausführen.

## 3. Killswitch: offline nehmen

| Stufe | Wie | Folge |
| :--- | :--- | :--- |
| **A. Sofort offline** (Standard) | `2_OFFLINE_Killswitch.cmd` oder auf dem Server `~/hub-042/scripts/admin.sh offline` | Tunnel und Funnel aus, niemand kommt mehr rein. App und Daten bleiben, bleibt auch nach einem Neustart offline. Rückgängig: `3_Online.cmd` |
| **B. Ohne Laptop** (z. B. vom Handy) | cloud.oracle.com → Compute → Instances → `HUB-042` → **Stop** | ganzer Server aus, Daten bleiben. Rückgängig: **Start** |
| **C. Nur Tailscale sperren** | login.tailscale.com → Machines → `hub-042` → ⋯ → **Remove** | feste Adresse weg (Cloudflare-Adresse läuft weiter, Stufe A ist vollständiger) |

Wann? Sicherheitsproblem, Missbrauch, Beschwerde der Schule oder eines Mitglieds, unklare Lage. Lieber einmal zu früh offline als zu spät.

## 4. Alltag

| Aufgabe | Wie |
| :--- | :--- |
| Neue Konten annehmen, sperren, Passwort zurücksetzen | in der App → **Verwaltung** |
| Link/QR für die Klasse | Verwaltung → „Link für die Klasse“ → **Gross zeigen** |
| Teilnehmer ergänzen, sperren, entfernen | App → **Verwaltung** → „Personen hinzufügen“: Name oder Mailadresse im Dropdown wählen (oder „Alle fehlenden hinzufügen“); sperren/entfernen in der Tabelle. Die Dropdowns zeigen nur die **Klassenliste** aus der `.env` (`TEILNEHMER_EMAILS`, `DOZENT_EMAILS`), andere Adressen nimmt der Server nicht an. Neue Person in die Klasse? Erst in der `.env` ergänzen, dann `docker compose up -d app` |
| App-Update | passiert automatisch nach Push auf `main`. Prüfen: Fusszeile „Version: …“ = neuester Commit auf GitHub |
| Änderung an `docker-compose.yml`, Skripten, Tailscale-Konfiguration | Server: `~/hub-042/scripts/admin.sh update` |
| Notfall-Passwort-Reset ohne Login | Server: `cd ~/hub-042 && docker compose exec app node src/cli/reset-password.js <mail>` |

## 5. Backup und Wiederherstellung

- **Erstellen:** `4_Stand_sichern.cmd` (inkl. Kopie auf den Laptop) oder auf dem Server `admin.sh backup`.
- Backups sind mit **AES-256** und einem Backup-Passwort verschlüsselt. **Ohne dieses Passwort ist ein Backup wertlos**, also in den Passwort-Manager.
- Auf dem Server bleiben die letzten 10 Backups in `~/hub-042-backups`.
- **Zurückspielen:** Datei auf den Server kopieren (`scp -i <schlüssel> datei ubuntu@<IP>:~/`), dann `~/hub-042/scripts/admin.sh restore ~/datei.sql.gz.enc`. Das Skript prüft zuerst das Passwort und ersetzt erst danach die Datenbank.
- Backups enthalten Personendaten (Punkte, Forum): nur lokal aufbewahren, nicht in Cloud-Speicher oder ins Repo.

## 6. Endgültig abschalten (nach dem Studium, ca. April 2028)

Das verspricht die Datenschutzerklärung. In dieser Reihenfolge:

1. Mitglieder 2–4 Wochen vorher informieren, damit sie ihre Daten exportieren können (Profil → „Meine Daten herunterladen“).
2. Server: `~/hub-042/scripts/admin.sh ende`. Es fragt nach einem letzten Backup und löscht dann Container und Datenbank.
3. Oracle: Instanz `HUB-042` → **Terminate**, dabei *Boot-Volume löschen* ankreuzen. Danach das Netzwerk `hub-042-vcn` löschen.
4. Tailscale: Maschine `hub-042` entfernen, unter Keys alle Auth-Keys widerrufen.
5. Laptop: lokalen Docker-Stack entfernen und gesicherte Datenbank-Backups löschen. Behalte nur den Quellcode, falls gewünscht.
6. GitHub: Repo auf **Archived** stellen (Settings → Archive), der Code bleibt als Referenz für das Schulprojekt.
7. Optional: Oracle- und Tailscale-Konto schliessen.

## 7. Störungen

| Problem | Ursache und Lösung |
| :--- | :--- |
| Seite nicht erreichbar | `1_Status.cmd`. Läuft nichts: Oracle-Konsole prüfen, ob die Instanz gestoppt ist (Oracle hält wenig genutzte Gratis-Server manchmal an) → **Start**, danach `3_Online.cmd` |
| `ts.net`-Adresse „nicht gefunden“ | Tailscale → DNS: MagicDNS und HTTPS Certificates aktiviert? Access controls: Funnel-Regel gespeichert? Server: `docker compose restart tailscale` |
| Maschine in Tailscale abgelaufen | Machines → `hub-042` → ⋯ → **Disable key expiry**. Ist sie schon weg: neuen Auth-Key erzeugen, in `.env` als `TS_AUTHKEY` eintragen, `docker compose --profile tailscale up -d` |
| SSH geht nicht | IP in `admin-config.txt` aktuell? Schlüsseldatei vorhanden? Notfalls Oracle-Konsole → Instanz → **Cloud Shell / Console connection** |
| Updates kommen nicht an | GitHub → Actions: ist der letzte Lauf grün? Server: `docker compose ps`, läuft `hub042_watchtower`? |
| Kosten-Mail von Oracle | Instanz-Typ prüfen (muss „Always Free“ sein), keine weiteren Ressourcen anlegen, nie auf „Upgrade to Pay As You Go“ klicken |

## 8. Wichtige Regeln

- **Nie** ohne Backup `docker compose down -v`, `docker volume rm` oder `admin.sh ende`: Das löscht die Datenbank.
- `.env`, SSH-Schlüssel, Backups und `admin-config.txt` **nie** committen (die `.gitignore` sperrt sie zusätzlich).
- Bei Änderungen an der Datenbearbeitung: Datenschutzerklärung anpassen (siehe `AGENTS.md`).
