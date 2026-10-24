# HUB-042 – Anleitung für KI-Assistenten (Claude Code, Antigravity/Gemini, Cursor …)

Diese Datei gilt für **jede Arbeit an diesem Repository**. Lies sie vollständig, bevor du etwas änderst, und halte dich an die Checkliste unten **nach jeder neuen oder geänderten Funktion**.

## Projekt in Kürze

- **HUB-042**: Klassen-App der HFWI-2504-AA (HKV Aarau), entstanden als Schulprojekt im Modul 042 „Applications Engineering“ (Übung Webapplikation 1–3).
- **Stack:** Node.js 20 + Express, PostgreSQL 16, Vanilla-JS-Single-Page-App ohne Build (`public/`), Docker Compose (app, db, Cloudflare Tunnel, Watchtower), GitHub Actions → `ghcr.io/baniox/hub-042`.
- **Sprache:** Oberfläche, Texte, Commits und Doku auf **Deutsch (Schweiz, kein ß)**.
- **Betreiber/Admin:** Alban Hyseni (`alban.hyseni@stud.hkv.ch`). Mitwirkend: Claude Code.

## Befehle

```bash
npm ci && npm test                      # alle Unit-Tests (müssen grün sein)
docker compose up -d --build            # lokal starten → http://localhost:3000
node scripts/build-produktblatt.js      # Produktblatt (HTML + PDF) neu erzeugen, braucht Playwright
docker compose exec app node src/cli/reset-password.js <mail>   # Notfall-Reset
```

## Wichtige Dateien

| Bereich | Datei |
| :--- | :--- |
| **Funktionskatalog (eine Quelle für alles)** | `src/data/features.json` |
| Allgemeine FAQ (Produktblatt-FAQ: `"sheet": true`) | `src/data/faq.json` |
| Hilfe-Bot ohne KI (Intents) | `src/bot/local.js` |
| Bot-API / Gemini-Kontext | `src/routes/assistant.js` |
| Produktblatt-Vorlage → generiert | `docs/produktblatt.template.html` → `docs/produktblatt.html`, `downloads/HUB-042_Produktblatt.pdf` |
| Datenschutzerklärung (in der App) | `public/app.js` → `privacyHtml()`; Version: `src/access.js` → `PRIVACY_VERSION` |
| Impressum (in der App) | `public/app.js` → `imprintHtml()` |
| Datenschutz-Audit / Betrieb | `DATENSCHUTZ.md`, `BETRIEBS_CHECKLISTE.md` |
| Eigene Ideen mit Datum | `IDEEN.md` |
| Konsistenz-Tests | `test/consistency.test.js` |

## ✅ Checkliste nach jeder neuen oder geänderten Funktion

1. **`src/data/features.json`**: Eintrag anlegen oder anpassen (`id` = Tab-Name, `title`, `text`, `faq.keywords`, `faq.answer`). Neue Tabs in `NAV` (public/app.js) brauchen zwingend einen Eintrag.
2. **Bot:** Kann man die Funktion mit App-Daten beantworten (Termine, Zahlen, eigene Werte)? Dann einen Intent in `src/bot/local.js` ergänzen und in `test/bot.test.js` testen. Sonst genügt die FAQ-Antwort aus Schritt 1.
3. **Produktblatt:** `node scripts/build-produktblatt.js` ausführen und `docs/produktblatt.html` sowie `downloads/HUB-042_Produktblatt.pdf` committen.
4. **README.md**: Funktionstabelle und gegebenenfalls „Wichtige Einstellungen“ ergänzen.
5. **Datenschutz:** Werden neue Personendaten bearbeitet, gespeichert oder an Dritte gesendet?
   - `privacyHtml()` in `public/app.js` und `DATENSCHUTZ.md` (Verzeichnis, Empfänger, Fristen) anpassen.
   - Bei wesentlichen Änderungen `PRIVACY_VERSION` erhöhen, dann müssen alle neu zustimmen.
6. **`BETRIEBS_CHECKLISTE.md`**: Zeile mit Status `umgesetzt` / `geplant (wie?)` / `bewusst weggelassen (warum?)`.
7. **Eigene Idee des Betreibers?** Mit Datum und Beschreibung in `IDEEN.md` festhalten.
8. **Tests:** `npm test` muss grün sein. `test/consistency.test.js` bricht ab, wenn Schritt 1 oder 3 vergessen wurde.
9. **Mobile prüfen:** 390 px Breite, kein horizontales Scrollen, untere Tab-Leiste.

## Datenschutz-Regeln (nicht verhandelbar)

- **Keine Personendaten ins Repo:** keine Namen oder Mails von Mitstudierenden oder Dozierenden, keine echten Noten oder Punkte, keine Teilnehmerliste, kein Leistungsausweis. Beispiele nur mit erfundenen Namen (Max Muster, Erika Beispiel).
- **Secrets nur in `.env`** (gitignored): `DB_PASSWORD`, `SESSION_SECRET`, `RESET_PASSWORD`, `SMTP_*`, `GEMINI_API_KEY`, `TEILNEHMER_EMAILS`, `DOZENT_EMAILS`. In `.env.example` nur Platzhalter.
- **Downloads** (HKV-Dokumente, Excel-Stundenpläne) liegen nur lokal in `downloads/`; im Repo nur das eigene Produktblatt.
- **Chat nie persistieren** (nur `src/chat.js` im Arbeitsspeicher), nichts davon in Datenbank, Logs, Audit-Log oder Datenexport.
- **Ranking:** andere nur als „Anonym“, keine User-IDs ausliefern, k-Anonymität ab 3 Personen.
- **An externe Dienste** (z. B. Gemini) nie Namen, Mails, Punkte oder Noten senden.

## Git-Regeln

- Commits auf Deutsch im Stil `feat: …`, `fix: …`, `docs: …`, mit kurzer Begründung im Text.
- Push auf `main` löst GitHub Actions (Tests + Image) aus; Watchtower deployt automatisch.
- **Kein** `git push --force`, `git reset --hard`, `docker compose down -v` oder `docker volume rm` ohne ausdrückliche Zustimmung des Betreibers: Das Volume enthält die Datenbank.
- `.env` niemals committen oder ausgeben.
