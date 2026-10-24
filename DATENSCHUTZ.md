# Datenschutz-Audit HUB-042

Selbst-Audit nach dem Schweizer Datenschutzgesetz (DSG, in Kraft seit 1.9.2023). Stand: 24.10.2026, Datenschutzerklärung Version `2026-10-24b` (neu: Tailscale Funnel und Oracle Cloud Zürich als Hosting-Option) (`src/access.js` → `PRIVACY_VERSION`).

> HUB-042 ist ein nicht-kommerzielles **Schulprojekt im Modul 042 „Applications Engineering“** der HKV Aarau und kein offizielles Angebot der Schule. Dieses Dokument ersetzt keine Rechtsberatung, zeigt aber nachvollziehbar, welche Daten warum bearbeitet werden und wie sie geschützt sind.

## 1. Verantwortlich

Alban Hyseni (Klasse HFWI-2504-AA), alban.hyseni@stud.hkv.ch. Datenschutzerklärung und Impressum sind in der App ohne Login erreichbar (`#/datenschutz`, `#/impressum`).

## 2. Verzeichnis der Bearbeitungen (Art. 12 DSG)

| Daten | Zweck | Wer sieht es | Speicherdauer |
| :--- | :--- | :--- | :--- |
| HKV-Mail, Anzeigename, Rolle | Konto, Zugangskontrolle | Person selbst; Admins/Dozierende in der Teilnehmerliste | bis Konto gelöscht |
| Passwort | Anmeldung | niemand (nur bcrypt-Hash) | bis Konto gelöscht |
| Persönliche Wiederherstellungs-ID | Absicherung von Passwort-Resets durch den Admin | niemand (nur bcrypt-Hash, Klartext nur einmal für die Person) | bis Konto gelöscht oder neu erzeugt |
| Zeitpunkt + Version der Einwilligung | Nachweis der Einwilligung | Admins (Anzahl) | bis Konto gelöscht |
| Eigene Punkte, Maximalpunkte, Notizen | Notenrechner, Leistungsausweis | **nur die Person selbst**; im Ranking anonym aggregiert | bis Konto gelöscht |
| Check-ins (Lektion) | Präsenz-LLP | nur die Person selbst | bis Konto gelöscht |
| Aktivitätstage (nur Datum) | Streak | nur die Person selbst | 400 Tage für die Berechnung, sonst bis Konto gelöscht |
| Forumsbeiträge, Likes | Austausch in der Klasse | eingeloggte Mitglieder (mit Anzeigename) | bis gelöscht; beim Konto-Löschen anonymisiert |
| Audit-Protokoll (Login, Einwilligung, Verwaltung) | Sicherheit, Nachvollziehbarkeit | nur Admins | 365 Tage; fehlgeschlagene Logins 30 Tage |
| Chat-Nachrichten | Austausch während der Sitzung | Mitglieder des jeweiligen Chats | **nie gespeichert**: nur Arbeitsspeicher; beim Abmelden oder 5 min offline verlassen, gelöscht sobald niemand mehr im Chat ist oder beim Neustart |
| Besucherzähler | Pflicht-Statuszeile Übung 1 | öffentlich (nur Zahl) | unbegrenzt, **ohne IP** |
| Teilnehmerliste | Zugangskontrolle | Admins/Dozierende | nur in `.env` und DB, **nicht im Repo** |

Es werden **keine** besonders schützenswerten Personendaten (Art. 5 lit. c DSG) bearbeitet. Noten sind Leistungsdaten, die die Person selbst einträgt.

## 3. Grundsätze (Art. 6 DSG)

| Grundsatz | Umsetzung |
| :--- | :--- |
| Rechtmässigkeit, Einwilligung | Pflicht-Checkbox bei der Registrierung; bestehende Konten müssen beim nächsten Login zustimmen (`/api/me/consent`) |
| Zweckbindung | nur Studienorganisation der Klasse; keine Werbung, kein Verkauf, kein Profiling |
| Datensparsamkeit | keine IP-Adressen (alte IPs bei der Migration gelöscht), keine Analytics, kein Google Fonts, keine externen Skripte |
| Transparenz | Datenschutzerklärung, Impressum, Produktblatt, dieser Bericht |
| Richtigkeit | Name und Einträge selbst änderbar |
| Speicherbegrenzung | Aufbewahrungsfristen werden beim Start und täglich durchgesetzt; Datenbank wird nach Studienabschluss gelöscht |

## 4. Rechte der Betroffenen

| Recht | Umsetzung |
| :--- | :--- |
| Auskunft (Art. 25) | Profil → „Meine Daten herunterladen“ (`GET /api/me/export`, JSON mit Konto, Punkten, Check-ins, Forum, Aktivität, Audit-Einträgen) |
| Berichtigung (Art. 32) | Anzeigename und Einträge selbst änderbar |
| Löschung / Widerruf | Profil → „Konto löschen“ entfernt sofort Konto, Punkte, Check-ins, Likes und Aktivität; Forumsbeiträge werden anonymisiert. Im Audit-Protokoll bleibt nur der Lösch-Eintrag (max. 365 Tage) |
| Kontakt | alban.hyseni@stud.hkv.ch; Beschwerde beim EDÖB |

## 5. Anonymität im Ranking

- Die API liefert für andere Personen nur `name: "Anonym"`, Rang und Schnitt, **keine User-ID** (Test `ranking.test.js`).
- **k-Anonymität:** Andere werden erst ab **3 Personen** mit Einträgen angezeigt. Darunter gibt die API nur die eigene Zeile **ohne Rang** zurück, damit niemand den Schnitt einer bestimmten Person zurückrechnen kann.
- Dozierende erscheinen nicht im Ranking und sehen keine Punkte.

## 5a. Flüchtiger Chat

- Nachrichten existieren nur im Arbeitsspeicher des Node-Prozesses (`src/chat.js`), nie in PostgreSQL, im Audit-Log oder im Datenexport.
- Sitzungsende (Abmelden, Konto gesperrt oder gelöscht, 5 min ohne Lebenszeichen) entfernt die Person aus allen Chats. Ohne Einladung sieht sie den alten Verlauf nicht mehr.
- Ein Chat ohne Mitglieder wird samt Verlauf sofort gelöscht; ein Neustart löscht alles.
- Direktnachrichten sind serverseitig auf die zwei Beteiligten beschränkt (Test `chat.test.js`).
- Abschreckung gegen Weitergabe: Sperrvorhang nach 60 s Inaktivität, schwarzer Schutzschild bei Fokusverlust, Print-Taste oder Drucken, Wasserzeichen mit dem eigenen Namen, kein Kopieren. Ein Browser kann Screenshots technisch nicht vollständig verhindern; darauf weist die App hin.

## 6. Bekanntgabe an Dritte / ins Ausland (Art. 16 DSG)

| Empfänger | Zweck | Land | Grundlage |
| :--- | :--- | :--- | :--- |
| Cloudflare Inc. (Tunnel) | HTTPS-Zugang; verarbeitet technisch IP und Verbindungsdaten | USA | Swiss-U.S. Data Privacy Framework (Angemessenheit durch den Bundesrat seit 15.9.2024) |
| ~~Maildienst (Microsoft 365 oder Gmail)~~ | **derzeit nicht aktiv:** Demo-Modus ohne Mailversand, die Mailadresse dient nur zur Identifikation. Wird SMTP später eingeschaltet, werden Erklärung und `PRIVACY_VERSION` vorher angepasst | – | – |
| Google Gemini (optional) | Hilfe-Bot, **nur** wenn ein API-Key gesetzt ist und jemand fragt | USA | Swiss-U.S. DPF; gesendet wird nur die geschwärzte Frage plus allgemeiner/klassenweiter Kontext |
| Tailscale Inc. (Funnel, in Betrieb seit 24.10.2026) | feste HTTPS-Adresse; verarbeitet technisch IP und Verbindungsdaten | Kanada/USA | Kanada: angemessenes Schutzniveau (Anhang 1 DSV); USA: Swiss-U.S. DPF |
| Oracle Cloud (Always-Free-VM, in Betrieb seit 24.10.2026) | Hosting von App und Datenbank für den Dauerbetrieb | **Schweiz** (Region Zürich) | Auftragsbearbeitung (Art. 9 DSG), Oracle Cloud Agreement inkl. DPA |
| GitHub (Quellcode, Images) | Code und Container-Images | USA | enthält **keine** Personendaten |

Hinweis zum Bot: Beim kostenlosen Gemini-Kontingent kann Google Eingaben zur Verbesserung der Dienste verwenden. Deshalb schwärzt der Server E-Mails und Telefonnummern (`redact()` in `src/routes/assistant.js`), schickt nie Namen, Punkte oder Noten mit, speichert Fragen nicht und zeigt im Chat einen Hinweis „keine persönlichen Daten eingeben“. Ohne Key bleibt alles lokal (FAQ).

## 7. Datensicherheit (Art. 8 DSG)

| Massnahme | Status |
| :--- | :--- |
| HTTPS über Cloudflare Tunnel bzw. Tailscale Funnel, HSTS (Helmet) | umgesetzt |
| Strikte Content-Security-Policy, nur eigene Skripte | umgesetzt |
| Passwörter bcrypt (10 Runden), 8–20 Zeichen | umgesetzt |
| Signierte httpOnly-Session-Cookies (`sameSite=lax`) | umgesetzt |
| Rate-Limits für Login, Registrierung, Schreibzugriffe und Bot | umgesetzt |
| Zugang nur mit HKV-Domain **und** Teilnehmerliste **und** Annahme durch den Admin (Demo-Modus; mit SMTP: bestätigte Mail) | umgesetzt |
| Alle Inhalte, APIs und Downloads nur mit Login (`401` ohne) | umgesetzt |
| Keine Indexierung (`robots.txt`, `X-Robots-Tag`, Meta-Tag) | umgesetzt |
| Datenbank nur im internen Docker-Netz, kein offener Port | umgesetzt |
| Secrets nur in `.env`, nicht im Repo | umgesetzt |
| Container läuft als unprivilegierter Benutzer (`USER node`) | umgesetzt |
| Audit-Protokoll für Logins, Einwilligung und Verwaltung | umgesetzt |
| Verschlüsselte Backups (AES-256, `scripts/admin.sh backup`), nur lokal beim Betreiber, auf dem Server max. 10 | umgesetzt |

## 8. Cookies und lokaler Speicher

Ein technisch notwendiges Session-Cookie (`user_session`, 30 Tage). `localStorage` speichert nur das gewählte Schuljahr. Kein Cookie-Banner nötig, weil keine nicht-notwendigen Cookies gesetzt werden.

## 9. Offene Punkte

- Teilnehmende vor dem Live-Gang über die Plattform informieren: QR-Aushang bzw. Onboarding `#/willkommen` mit Link zur Datenschutzerklärung (ohne Mailversand).
- Nach Studienabschluss: Abschalten nach `docs/ADMIN_HANDBUCH.md` Kapitel 6 (Datenbank, Backups, Oracle-Instanz, Tailscale).
- Bei Änderungen der Datenbearbeitung `PRIVACY_VERSION` erhöhen, dann müssen alle neu zustimmen.
