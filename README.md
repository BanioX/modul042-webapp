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
| **Forum** | Fragen, Wissenswertes, Zusammenfassungen, Lerngruppen, Off-Topic; Likes, „gelöst“, Anheften |
| **Infos** | Downloads, Eckdaten, Lehrplan aller 3 Jahre, Handlungskompetenzen, Englisch/IELTS, Kontakte, optionale Zertifikate (IPMA, IREB, ITIL, COBIT), Weg zum Bachelor nach dem HF (Kalaidos, ZHAW, FHNW, FFHS, BFH …) |
| **Hilfe-Bot** | Kontextbezogen zur aktuellen Seite. Mit `GEMINI_API_KEY` über Google Gemini, sonst lokale FAQ. Sendet nie Namen, E-Mails, Punkte oder Noten |
| **Gamification** | XP, Level, Streak, Abzeichen |
| **Verwaltung** | Teilnehmerliste, Rollen, Einladungen, manuelles Freischalten, Schuljahre, Audit-Protokoll |
| **Datenschutz** | Einwilligung bei der Registrierung, Datenschutzerklärung, Impressum, Datenexport, Konto löschen. Siehe [DATENSCHUTZ.md](DATENSCHUTZ.md) |
| **Mobile / PWA** | Responsive mit Tab-Leiste unten; auf dem iPhone über Safari → Teilen → „Zum Home-Bildschirm“ als App nutzbar |

### Wer reinkommt

Nur registrierte Mitglieder, und registrieren können sich nur Adressen auf der **Teilnehmerliste**:

- Studierende mit `vorname.nachname@stud.hkv.ch`
- Dozent Applications Engineering mit `vorname.nachname@hkv.ch`

Andere Adressen werden abgewiesen. Die Adresse wird per Bestätigungslink geprüft, Passwörter haben 8–20 Zeichen. Ohne Login liefert der Server keine Inhalte aus (alle APIs und Downloads geben `401`). Suchmaschinen werden über `robots.txt`, den Header `X-Robots-Tag: noindex` und ein Meta-Tag ausgesperrt.

### Demo-Modus: ohne Mailversand

Ohne SMTP-Einstellungen läuft HUB-042 im **Demo-Modus**. Die HKV-Adresse dient dann nur der Identifikation, es werden keine Mails verschickt. Login und Registrierung zeigen einen Hinweis.

- **Annehmen:** Neue Konten erscheinen in der Verwaltung als „Bestätigung offen“. Nur der Admin nimmt sie mit **Annehmen** an.
- **Passwort vergessen:** Der Admin klickt **Passwort zurücksetzen**. Das Passwort wird auf das Werkspasswort `RESET_PASSWORD` aus der `.env` gesetzt, das **nie im Repo** steht.
- **Persönliche Wiederherstellungs-ID:** Jede Person erhält beim ersten Login einmalig eine zufällige ID (z. B. `K7Q2-M9XA`). Gespeichert wird nur ein bcrypt-Hash, auch der Admin kennt sie nicht. Nach einem Reset braucht es **Werkspasswort und ID**. Danach muss die Person ein neues Passwort wählen, und bis dahin sperrt der Server alle anderen Funktionen.
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
- Erste Anmeldung: mit der Adresse aus `ADMIN_EMAILS` registrieren. Ohne SMTP steht der Bestätigungslink im Log: `docker compose logs app | grep verify`.

### Wichtige Einstellungen in `.env`

| Variable | Zweck |
| :--- | :--- |
| `ADMIN_EMAILS` / `DOZENT_EMAILS` | fest berechtigte Admins und Dozierende |
| `TEILNEHMER_EMAILS` | Teilnehmerliste (kommagetrennt). **Nicht ins Repo**, Namen der Klasse sind Personendaten |
| `ALLOWED_EMAIL_DOMAINS` | Standard `stud.hkv.ch,hkv.ch` |
| `SMTP_*`, `MAIL_FROM` | Versand über das HKV-Microsoft-365-Konto (`smtp.office365.com:587`) |
| `GEMINI_API_KEY` | optional, für den KI-Hilfe-Bot ([Key holen](https://aistudio.google.com/apikey)) |
| `COOKIE_SECURE` | `true`, wenn nur noch über HTTPS genutzt |

### Tests

```bash
npm ci
npm test     # 33 Unit-Tests: Zugang, Ranking-Anonymität, LLP, Noten, Gamification, Stundenplan-Import, ICS, Bot
```

### Produktblatt neu erzeugen

`docs/produktblatt.html` → `downloads/HUB-042_Produktblatt.pdf`:

```bash
node scripts/build-produktblatt.js   # braucht Playwright mit Chromium
```

Das PDF geht nach der Bestätigung als Anhang der Willkommens-Mail raus und liegt im Downloads-Bereich.

---

## Dauerhaft online (ohne dass der Laptop 24/7 läuft)

Für die Übung läuft HUB-042 auf dem Laptop. Damit die Klasse die Seite jederzeit erreicht, kann derselbe Stack ohne Änderungen auf einem kostenlosen, dauerhaft laufenden Server laufen:

| Option | Kosten | Stabile URL | Bemerkung |
| :--- | :--- | :--- | :--- |
| **Oracle Cloud Always Free** (ARM-VM, bis 4 Kerne / 24 GB RAM, Region Zürich) | 0 CHF | mit Cloudflare *Named Tunnel* + eigener Domain oder Tailscale Funnel | **Empfehlung:** Docker installieren, Repo klonen, `.env` kopieren, `docker compose up -d`. Watchtower aktualisiert weiter automatisch |
| Raspberry Pi / alter PC zu Hause | Strom | wie oben | läuft 24/7, Daten bleiben bei dir |
| Render / Koyeb / Fly.io Free Tier | 0 CHF | ja | schlafen bei Inaktivität ein, Gratis-Datenbanken sind befristet; Watchtower und Compose nicht nutzbar |

Wichtig: Der **Quick Tunnel** (`trycloudflare.com`) bekommt bei jedem Neustart eine neue Adresse. Für eine feste Adresse braucht es einen Cloudflare *Named Tunnel* (gratis, aber mit eigener Domain, ca. CHF 10–15 pro Jahr) oder **Tailscale Funnel** (gratis, Adresse wie `https://hub-042.<tailnet>.ts.net`).

## Mitwirkende

- **Alban Hyseni**: Idee, Anforderungen, Betrieb und Deployment (Übung Modul 042)
- **Claude Code** (Anthropic): Entwicklung und Setup im Agent-Modus, gemäss Übungsvorgabe „Deine KI übernimmt Entwicklung und Setup“

## Kontakt

Feature-Wünsche, Fehler, Löschanfragen: **alban.hyseni@stud.hkv.ch** oder persönlich im Unterricht.
