# HUB-042

**Die Klassen-App der HFWI-2504-AA** (Dipl. Wirtschaftsinformatiker*in HF, HKV Aarau): Stundenplan, ATL-Tracker, Notenrechner, Leistungsausweis mit LLP, anonymes Ranking, Forum, Infos, Downloads und Hilfe-Bot. Läuft im Browser und als App auf dem Handy.

> 🎓 **Schulprojekt.** HUB-042 ist während des Unterrichts im **Modul 042 „Applications Engineering“** (HKV Aarau) entstanden, in der Übung „Webapplikation (1–3)“ vom 21. Oktober 2026. Es ist nicht-kommerziell und **kein offizielles Angebot der HKV Aarau**.

## Warum „HUB-042“?

Die Seite entstand im Modul **042**, daher der Name. Und weil der Macher Sci-Fi-Fan ist: In Douglas Adams’ *Per Anhalter durch die Galaxis* (1979) rechnet der Supercomputer Deep Thought 7,5 Millionen Jahre und verkündet dann die Antwort auf die endgültige Frage nach dem Leben, dem Universum und dem ganzen Rest:

> „The Answer to the Great Question… Of Life, the Universe and Everything… Is… Forty-two,“ said Deep Thought, with infinite majesty and calm.
> *Douglas Adams, The Hitchhiker’s Guide to the Galaxy*

Ein Hub mit der Antwort auf (fast) alle Fragen der Klasse also. 🚀

---

## Funktionen

| Bereich | Was es kann |
| :--- | :--- |
| **Dashboard** | Nächste Lektionen, offene Aufgaben, Countdown zur nächsten Prüfung, Notenschnitt, Rang, XP, Level, LLP-Fortschritt |
| **ATL-Tracker** | Aufgaben wie in MS Teams (Bevorstehend / Überfällig / Erledigt), gruppiert nach Datum. Punkte eintragen (z. B. 45/60), Note sofort sehen |
| **Noten** | Schweizer Notenrechner: Modul wählen, Aufgabe wählen (Maximum ist vorgegeben), Punkte eingeben. Note pro Aufgabe, pro Modul, pro Schuljahr. Rundung 0.1 / 0.25 / 0.5 |
| **Leistungsausweis** | Wie der offizielle HKV-Leistungsausweis: LLP möglich/erreicht, Note, Bemerkung pro Modul, Promotion in %, Fortschritt Richtung 3600 LLP |
| **Stundenplan** | Beide Studienjahre aus den offiziellen Excel-Plänen, Ferien und Feiertage, Raum-Hinweise (Stockwerk, Treppe), Kalender-Abo (ICS) für Outlook/Teams/Google/Apple |
| **Check-in** | Präsenz pro Lektion bestätigen: 0.5 LLP pro Lektion (4 Lektionen = 2 LLP, Schultag mit 8 Lektionen = 4 LLP) |
| **Ranking** | Podest pro Schuljahr nach Notenschnitt oder XP. Nur der eigene Name ist sichtbar, alle anderen sind „Anonym“. Andere erscheinen erst ab 3 Personen (k-Anonymität) |
| **Chat** | Gruppenchat „Klasse“ und Direktnachrichten. **Nie gespeichert** (nur Arbeitsspeicher): Abmelden oder 5 min offline = alle Chats verlassen, alter Verlauf weg; Mitglieder können per Einladung den Verlauf wieder freigeben; sind alle draussen, wird gelöscht. **Sperrvorhang** nach 60 s Inaktivität, entsperren durch Hochwischen/-scrollen ([Idee vom 24.10.2026](IDEEN.md)). Screenshot-Schutzschild, Wasserzeichen, kein Kopieren |
| **Gruppen** | Zufalls-Gruppengenerator: Anwesende anhaken, Gruppengrösse wählen (2er–6er), auslosen, Ergebnis für Teams kopieren. Läuft nur im Browser, nichts wird gespeichert |
| **Forum** | Fragen, Wissenswertes, Zusammenfassungen, Lerngruppen, Off-Topic; Likes, „gelöst“, Anheften |
| **Infos** | Downloads, Eckdaten, Lehrplan aller 3 Jahre, Handlungskompetenzen, Englisch/IELTS, Kontakte, optionale Zertifikate (IPMA, IREB, ITIL, COBIT), Weg zum Bachelor nach dem HF (Kalaidos, ZHAW, FHNW, FFHS, BFH …) |
| **Hilfe-Bot** | Beantwortet ohne KI direkt aus den App-Daten: nächste Prüfungen und Lektionen (auch pro Modul), Ferien, Notenrechner („45 von 60“, „was brauche ich für eine 5“), eigener Schnitt und LLP, Module, Zertifikate, Bachelor, Kontakte, Zimmer. Optional ergänzt `GEMINI_API_KEY` offene Fragen über Google Gemini (ohne Namen, Mails, Punkte, Noten) |
| **Gamification** | XP, Level, Streak, Abzeichen |
| **Verwaltung** | Teilnehmerliste, Rollen, Einladungen, manuelles Freischalten, Link mit QR-Code für die Klasse, Schuljahre, Audit-Protokoll |
| **Onboarding** (`#/willkommen`) | Ziel des QR-Codes: 3 Schritte (Was dich im Dashboard erwartet → So registrierst du dich → Wiederherstellungs-ID sofort speichern, mit Warnung und Bestätigungs-Häkchen), wischbar auf dem Handy, ohne Login erreichbar |
| **Datenschutz** | Einwilligung bei der Registrierung, Datenschutzerklärung, Impressum, Datenexport, Konto löschen. Siehe [DATENSCHUTZ.md](DATENSCHUTZ.md) |
| **Mobile / PWA** | Responsive mit Tab-Leiste unten; auf dem iPhone über Safari → Teilen → „Zum Home-Bildschirm“ als App nutzbar |

### Wer reinkommt

Nur registrierte Mitglieder, und registrieren können sich nur Adressen auf der **Teilnehmerliste**:

- Studierende mit `vorname.nachname@stud.hkv.ch`
- Dozent Applications Engineering mit `vorname.nachname@hkv.ch`

Andere Adressen werden abgewiesen. Im **Demo-Modus ohne Mailversand** (Standard) nimmt der Admin neue Konten in der Verwaltung an; mit SMTP prüft ein Bestätigungslink die Adresse. Passwörter haben 8–20 Zeichen. Abmelden geht jederzeit oben rechts. Ohne Login liefert der Server keine Inhalte aus (alle APIs und Downloads geben `401`). Suchmaschinen werden über `robots.txt`, den Header `X-Robots-Tag: noindex` und ein Meta-Tag ausgesperrt.

### Demo-Modus: ohne Mailversand

Ohne SMTP-Einstellungen läuft HUB-042 im **Demo-Modus**. Die HKV-Adresse dient dann nur der Identifikation, es werden keine Mails verschickt. Login und Registrierung zeigen einen Hinweis.

- **Annehmen:** Neue Konten erscheinen in der Verwaltung als „Bestätigung offen“. Nur der Admin nimmt sie mit **Annehmen** an.
- **Passwort vergessen:** Der Admin klickt **Passwort zurücksetzen**. Das Passwort wird auf das Werkspasswort `RESET_PASSWORD` aus der `.env` gesetzt, das **nie im Repo** steht.
- **Persönliche Wiederherstellungs-ID:** Jede Person erhält beim ersten Login einmalig eine zufällige ID (z. B. `K7Q2-M9XA`). Gespeichert wird nur ein bcrypt-Hash, auch der Admin kennt sie nicht. Nach einem Reset braucht es **Werkspasswort und ID**. Danach muss die Person ein neues Passwort wählen, und bis dahin sperrt der Server alle anderen Funktionen.
- **Passwort + ID zurücksetzen:** Hat jemand die ID verloren, löscht der Admin beides. Dann reicht einmalig das Werkspasswort, beim Login entsteht eine neue ID.
- **Notfall (Admin selbst ausgesperrt):** `docker compose exec app node src/cli/reset-password.js vorname.nachname@stud.hkv.ch`
- Admins und Dozierende sind getrennt: Nur der Admin verwaltet Personen und Passwörter, Dozierende pflegen Aufgaben und Stundenplan.

### Notenformel und LLP

```
Note        = Punkte × 5 ÷ Maximum + 1        (gerundet auf 0.1)
LLP möglich = 0.5 × Lektionen + Σ Maximalpunkte (ATL, Mastery Tests)
Modulnote   = LLP erreicht ÷ LLP möglich × 5 + 1
```

Beispiel aus dem Leistungsausweis: *Informationssysteme gestalten* = 44 Lektionen × 0.5 (22) + Mastery Test 28 + ATL 1 50 + ATL 2 40 = **140 LLP möglich**; mit z. B. 112 erreichten LLP ergibt das 112 ÷ 140 × 5 + 1 = Note **5.0**.

---

## Übung Webapplikation (1–3): Was davon wo steckt

| Vorgabe | Umsetzung |
| :--- | :--- |
| Öffentlich über HTTPS, zeigt „Hallo von [Name] – Besucher Nr. [aus DB] – DB: verbunden – Version: [Commit-Hash]“ | Cloudflare Tunnel; die Zeile steht serverseitig gerendert in der Fusszeile jeder Seite (`src/server.js`) |
| App und Datenbank in getrennten Containern, Start mit `docker compose` | `docker-compose.yml`: `app` (Node/Express) + `db` (PostgreSQL 16) im privaten Netz `hub042_net` |
| Code in einem GitHub-Repository | dieses Repo |
| Docker-Image automatisch mit GitHub Actions | `.github/workflows/deploy.yml` (Tests → Multi-Arch-Build → GHCR) |
| Veröffentlichung über Cloudflare Tunnel | Service `tunnel` (`cloudflared`) |
| Nichts kostet etwas | GitHub Free, GHCR, Cloudflare Quick Tunnel, PostgreSQL, Node.js |
| Daten bleiben nach Neustart erhalten | Docker-Volume `postgres_data` |
| Passwörter und Tokens nicht im Repo | nur in `.env` (gitignored); Vorlage `.env.example` |
| Healthcheck | `GET /health` prüft App und DB; Docker-Healthchecks für `app` und `db` |
| Push auf `main` → neue Version ohne Handarbeit live | GitHub Actions baut das Image, **Watchtower** auf dem Laptop holt es alle 30 s und startet neu |
| Betriebs-Checkliste | [BETRIEBS_CHECKLISTE.md](BETRIEBS_CHECKLISTE.md) |

### Wofür eigentlich Docker?

Docker verpackt die App und die Datenbank je in einen **Container**: eine abgeschlossene Box mit allem, was das Programm braucht. Darum läuft HUB-042 auf jedem Laptop gleich, ohne dass man Node.js oder PostgreSQL installieren muss. `docker compose up` startet alles zusammen, und das Volume sorgt dafür, dass die Daten einen Neustart überleben.

---

## Architektur

```
Browser / iPhone-App (PWA)
        │ HTTPS
        ▼
Cloudflare Tunnel ──► app (Node.js / Express, Port 3000)  ──►  db (PostgreSQL 16, Volume postgres_data)
                       │  public/      Single-Page-App (Vanilla JS, kein Build)
                       │  src/routes/  REST-API (auth, tasks, schedule, forum, admin, assistant, downloads)
                       │  src/         Migration, Ranking, LLP, Gamification, Mail, ICS
                       ▼
               Watchtower  ◄── zieht neue Images aus ghcr.io (gebaut von GitHub Actions)
```

Image: `ghcr.io/baniox/hub-042`. Container: `hub042_server`, `hub042_postgres`, `hub042_tunnel`, `hub042_watchtower` im Netz `hub042_net`. Das Datenbank-Volume behält seinen bisherigen Namen (`DB_VOLUME`), damit beim Umstieg keine Daten verloren gehen.

---

## Schnellstart

```bash
cp .env.example .env          # Werte anpassen: DB_PASSWORD, SESSION_SECRET, TEILNEHMER_EMAILS, SMTP_*
docker compose up -d --build  # App, Datenbank, Tunnel und Watchtower starten
docker compose logs tunnel    # öffentliche https://….trycloudflare.com-Adresse anzeigen
```

- Downloads-Bereich: HKV-Dokumente (Broschüre, Factsheet, Merkblatt Englisch, Ferienplan, Zimmer- und Lageplan, Excel-Stundenpläne) in den Ordner `downloads/` legen. Sie sind bewusst **nicht im Repo**, weil das Repo öffentlich ist; die App zeigt nur vorhandene Dateien und nur eingeloggten Mitgliedern. Dateinamen siehe `src/routes/downloads.js`.
- Lokal: <http://localhost:3000> · Healthcheck: <http://localhost:3000/health>
- Erste Anmeldung: mit der Adresse aus `ADMIN_EMAILS` registrieren. Im Demo-Modus den Bestätigungslink aus dem Log holen (`docker compose logs app | findstr verify` unter Windows, `grep` unter Mac/Linux) oder den Notfall-Reset nutzen: `docker compose exec app node src/cli/reset-password.js <adresse>`.
- Danach nimmst du in der **Verwaltung** alle weiteren Konten an.

### Wichtige Einstellungen in `.env`

| Variable | Zweck |
| :--- | :--- |
| `ADMIN_EMAILS` / `DOZENT_EMAILS` | fest berechtigte Admins und Dozierende |
| `TEILNEHMER_EMAILS` | Teilnehmerliste (kommagetrennt). **Nicht ins Repo**, Namen der Klasse sind Personendaten |
| `ALLOWED_EMAIL_DOMAINS` | Standard `stud.hkv.ch,hkv.ch` |
| `RESET_PASSWORD` | Werkspasswort für Passwort-Resets durch den Admin (8–20 Zeichen, **nur in der `.env`**) |
| `SMTP_*`, `MAIL_FROM`, `MAIL_REPLY_TO` | **Optional.** Ohne Werte läuft der Demo-Modus ohne Mails. Mit Werten (Gmail-App-Passwort oder Microsoft 365, falls die Schule es erlaubt) gibt es Bestätigung, Willkommens-Mail und „Passwort vergessen“. Test: Verwaltung → „Test-Mail an mich senden“ |
| `GEMINI_API_KEY` | optional, für den KI-Hilfe-Bot ([Key holen](https://aistudio.google.com/apikey)) |
| `COOKIE_SECURE` | `true`, wenn nur noch über HTTPS genutzt |

### Tests

```bash
npm ci
npm test     # 52 Unit-Tests: Zugang, Ranking-Anonymität, LLP, Noten, Gamification, Stundenplan-Import, ICS, Bot, Wiederherstellungs-ID, Gruppen, flüchtiger Chat
```

### Produktblatt neu erzeugen

Das Produktblatt entsteht automatisch aus `src/data/features.json` und `src/data/faq.json` (Vorlage `docs/produktblatt.template.html`):

```bash
node scripts/build-produktblatt.js   # braucht Playwright mit Chromium
```

Das PDF geht nach der Bestätigung als Anhang der Willkommens-Mail raus und liegt im Downloads-Bereich.

---

## Dauerhaft online (ohne dass der Laptop 24/7 läuft)

> **Stand 24.10.2026: HUB-042 läuft rund um die Uhr** auf einer Gratis-VM von Oracle Cloud (Always Free, `VM.Standard.E2.1.Micro`, Rechenzentrum Zürich) mit fester Adresse über Tailscale Funnel. Neue Versionen spielt Watchtower nach jedem Push auf `main` automatisch ein. Die Adresse steht bewusst nicht im Repo; Mitglieder bekommen sie per QR-Code vom Admin.

Für die Übung läuft HUB-042 auf dem Laptop. Damit die Klasse die Seite jederzeit erreicht, kann derselbe Stack ohne Änderungen auf einem kostenlosen, dauerhaft laufenden Server laufen:

| Option | Kosten | Stabile URL | Bemerkung |
| :--- | :--- | :--- | :--- |
| **Oracle Cloud Always Free** (ARM-VM, bis 4 Kerne / 24 GB RAM, Region Zürich) | 0 CHF | mit Cloudflare *Named Tunnel* + eigener Domain oder Tailscale Funnel | **Empfehlung:** Docker installieren, Repo klonen, `.env` kopieren, `docker compose up -d`. Watchtower aktualisiert weiter automatisch |
| Raspberry Pi / alter PC zu Hause | Strom | wie oben | läuft 24/7, Daten bleiben bei dir |
| Render / Koyeb / Fly.io Free Tier | 0 CHF | ja | schlafen bei Inaktivität ein, Gratis-Datenbanken sind befristet; Watchtower und Compose nicht nutzbar |

Wichtig: Der **Quick Tunnel** (`trycloudflare.com`) bekommt bei jedem Neustart eine neue Adresse. Für eine feste Adresse braucht es einen Cloudflare *Named Tunnel* (gratis, aber mit eigener Domain, ca. CHF 10–15 pro Jahr) oder **Tailscale Funnel** (gratis, Adresse wie `https://hub-042.<tailnet>.ts.net`).

**Link teilen:** In der Verwaltung zeigt die Karte „📱 Link für die Klasse“ die aktuelle Adresse samt **QR-Code**, Kopier-Knopf, **„Gross zeigen“** (Vollbild zum Hochhalten oder für den Beamer) und **„QR speichern“** (SVG zum Drucken oder Teilen). Der Code führt auf `#/willkommen`, das 3-Schritte-Onboarding für Neue. Quelle: `PUBLIC_URL` aus der `.env`, sonst die aktuelle Quick-Tunnel-Adresse (Metrics-Endpunkt von `cloudflared`, nur im internen Docker-Netz).

### A) Feste Adresse gratis: Tailscale Funnel

1. Gratis-Konto auf [tailscale.com](https://tailscale.com) (Anmeldung mit Google, Microsoft oder GitHub).
2. Admin-Konsole → **DNS**: *MagicDNS* und *HTTPS Certificates* aktivieren.
3. Admin-Konsole → **Access controls**: Funnel erlauben (Tailscale bietet den Knopf „Enable Funnel“ an, oder in der Policy `"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`).
4. **Settings → Keys → Generate auth key** (wiederverwendbar), in die `.env` als `TS_AUTHKEY=tskey-auth-…`.
5. `docker compose --profile tailscale up -d`
6. Die Adresse steht in der Admin-Konsole bei der Maschine `hub-042`, z. B. `https://hub-042.tail1234.ts.net`. In die `.env` als `PUBLIC_URL=…` eintragen und `docker compose up -d app` ausführen. Der QR-Code in der Verwaltung zeigt danach die feste Adresse.

Der Quick Tunnel kann parallel weiterlaufen. Die feste Adresse bleibt nach Neustarts gleich.

### B) 24/7 gratis: Oracle Cloud Always Free

1. Konto auf [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Als Heimatregion **Switzerland North (Zürich)** wählen. Eine Kreditkarte wird nur zur Identitätsprüfung verlangt; Always-Free-Ressourcen kosten nichts.
2. **Compute → Instance erstellen:** Image *Ubuntu 24.04*, Shape *VM.Standard.A1.Flex* (ARM, z. B. 2 OCPU / 12 GB). Meldet Oracle „Out of capacity“, später nochmals versuchen oder *VM.Standard.E2.1.Micro* nehmen. SSH-Schlüssel herunterladen.
3. **Schnellweg:** Per SSH verbinden und das Einrichtungs-Skript starten. Es installiert Docker, holt HUB-042, erzeugt neue Geheimwerte, fragt nach Tailscale-Schlüssel, Werkspasswort und Teilnehmerliste, startet alles und trägt die feste Adresse als `PUBLIC_URL` ein:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/BanioX/hub-042/main/scripts/server-setup.sh | bash
   ```
   Oder von Hand, Docker installieren:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu   # danach neu einloggen
   git clone https://github.com/BanioX/hub-042.git && cd hub-042
   nano .env            # Inhalt der lokalen .env einfügen
   docker compose --profile tailscale up -d
   ```
4. Eingehende Ports müssen **nicht** geöffnet werden: Tunnel und Funnel bauen ausgehende Verbindungen auf.
5. Daten vom Laptop mitnehmen (optional): lokal `docker compose exec db pg_dump -U webapp_user webapp_db > backup.sql`, auf die VM kopieren (`scp`) und dort `docker compose exec -T db psql -U webapp_user webapp_db < backup.sql`.
6. Watchtower holt neue Versionen nach jedem Push auf `main` automatisch. Den Laptop-Stack danach mit `docker compose stop` anhalten (nicht `down -v`!).

## Betrieb, Killswitch und Abschalten

Alles für den Admin steht im **[Admin-Handbuch](docs/ADMIN_HANDBUCH.md)**: was wo läuft, Killswitch (sofort offline), Backups und Wiederherstellung, endgültiges Abschalten nach dem Studium. Werkzeuge: `scripts/admin.sh` auf dem Server und Doppelklick-Knöpfe in `scripts/windows/` für den Laptop.

## Für KI-Assistenten

[`AGENTS.md`](AGENTS.md) (dazu `CLAUDE.md` und `GEMINI.md`) beschreibt Projekt, Datenschutz-Regeln und die **Checkliste nach jeder neuen Funktion**: Funktionskatalog, Bot, Produktblatt, README, Datenschutz, Betriebs-Checkliste, Tests. `test/consistency.test.js` lässt den Build scheitern, wenn Produktblatt oder Bot nicht zum Funktionsumfang passen.

## Ideen & Urheberschaft

Eigene Ideen sind mit Datum in [IDEEN.md](IDEEN.md) festgehalten, z. B. der **Chat-Sperrvorhang mit Wisch-/Scroll-Entsperrung (Alban Hyseni, 24.10.2026)**.

## Für Dozierende: Code ansehen und bewerten

Das Repository ist öffentlich. Code, Git-Historie und GitHub-Actions-Läufe sind ohne zusätzliche Rechte einsehbar. Einstiegspunkte:

| Thema | Datei |
| :--- | :--- |
| Übung 1–3 (Statuszeile, Healthcheck, Container, CI/CD) | `src/server.js`, `docker-compose.yml`, `Dockerfile`, `.github/workflows/deploy.yml` |
| Betriebs-Checkliste | `BETRIEBS_CHECKLISTE.md` |
| Datenschutz-Audit | `DATENSCHUTZ.md` |
| Zugang, Rollen, Passwort-Reset, Wiederherstellungs-ID | `src/access.js`, `src/routes/auth.js`, `src/routes/admin.js`, `src/recovery.js` |
| Noten, LLP, Ranking (k-Anonymität) | `src/grades.js`, `src/llp.js`, `src/ranking.js` |
| Flüchtiger Chat und Sperrvorhang | `src/chat.js`, `src/routes/chat.js`, `public/app.js` (`viewChat`) |
| Tests | `test/` (`npm test`) |

## Mitwirkende

- **Alban Hyseni**: Idee, Anforderungen, Betrieb und Deployment (Übung Modul 042)
- **Claude Code** (Anthropic): Entwicklung und Setup im Agent-Modus, gemäss Übungsvorgabe „Deine KI übernimmt Entwicklung und Setup“

## Kontakt

Feature-Wünsche, Fehler, Löschanfragen: **alban.hyseni@stud.hkv.ch** oder persönlich im Unterricht.
