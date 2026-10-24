# Ideen & Urheberschaft

Dieses Dokument hält eigene Ideen aus HUB-042 mit Datum fest. Die Git-Historie dieses öffentlichen Repositories (Commit-Zeitstempel auf GitHub) belegt zusätzlich, wann sie veröffentlicht wurden.

## Onboarding nach dem Scan des QR-Codes

**Idee von:** Alban Hyseni (Klasse HFWI-2504-AA, HKV Aarau)
**Entstanden am:** 24. Oktober 2026
**Umsetzung:** `public/app.js` (`viewOnboarding`, `ONBOARDING_STEPS`), `src/routes/admin.js` (`/api/admin/public-url`)

Der Admin zeigt der Klasse einen QR-Code aus der Verwaltung. Wer ihn scannt, landet nicht direkt im Login, sondern in einem kurzen Onboarding mit genau drei Schritten:

1. **Das erwartet dich:** was im Dashboard steht (Lektionen, ATL-Aufgaben, Noten/LLP, anonymes Ranking, Chat/Forum).
2. **So registrierst du dich:** HKV-Adresse, Passwort 8–20 Zeichen, Zustimmung, Annahme durch den Admin.
3. **Wiederherstellungs-ID:** deutliche Warnung, dass die ID nur einmal erscheint und sofort kopiert oder notiert werden muss. Erst nach dem Häkchen „Verstanden“ geht es weiter zur Registrierung.

## Chat-Sperrvorhang mit Wisch-/Scroll-Entsperrung

**Idee von:** Alban Hyseni (Klasse HFWI-2504-AA, HKV Aarau)
**Entstanden am:** 24. Oktober 2026, im Rahmen des Moduls 042 „Applications Engineering“
**Umsetzung:** `public/app.js` (Funktion `viewChat`, Abschnitt „Vorhang“) und `public/app.css` (`.chat-curtain`)

### Beschreibung

Ein flüchtiger, nicht gespeicherter Chat wird im Browser nach **60 Sekunden ohne Aktivität** automatisch von einem **schwarzen Sperrbildschirm („Vorhang“)** abgedeckt, damit Umstehende nicht mitlesen können.

> **Anpassung am 24.10.2026 (Betreiber):** Die Wartezeit wurde von 60 auf **15 Sekunden** verkürzt, damit der Chat schneller geschützt ist. Die übrige Mechanik bleibt gleich.

Mechanik im Einzelnen:

1. **Aktivitätserkennung:** Mausbewegung, Klick, Tastendruck, Texteingabe, Scrollen und Touch setzen den 60-Sekunden-Zähler zurück. **Wer gerade eine Nachricht schreibt, gilt als aktiv**, auch wenn das Schreiben länger als 60 Sekunden dauert. Es wird jeder Tastendruck erkannt, nicht nur das Absenden.
2. **Sperren:** Ist die Zeit abgelaufen, **fährt der Vorhang von unten nach oben** über den Chatbereich. Er zeigt Uhrzeit, Schloss-Symbol, „Chat gesperrt“ und einen hüpfenden Pfeil mit „Nach oben wischen zum Entsperren“, im Stil eines Smartphone-Sperrbildschirms.
3. **Entsperren durch Wischen/Scrollen statt Klick:**
   - Auf dem Handy wird der Vorhang mit dem Finger nach oben gewischt. Er **folgt dem Finger live** und wird beim Ziehen leicht transparent.
   - Am PC geht das per Mausrad (Scrollen) oder durch Ziehen mit gedrückter Maustaste.
   - Ab **25 % Wischweg** gleitet er nach oben weg und verschwindet. Darunter bleibt er stehen und federt zurück.
4. **Kombiniert mit flüchtiger Sitzung:** Der Chat existiert nur im Arbeitsspeicher. Beim Abmelden oder nach 5 Minuten offline verlässt man alle Chats; wer noch drin ist, kann einen per Einladung den Verlauf wieder sehen lassen. Sind alle draussen, wird der Verlauf gelöscht.
5. **Datenschutz-Schutzschild:** Bei Fokusverlust (z. B. Snipping-Tool), Print-Taste oder Druckbefehl wird der Chat schwarz überdeckt, und ein Wasserzeichen mit dem Namen der lesenden Person liegt über den Nachrichten.

### Hinweis

Dieses Dokument dient als datierter Nachweis der Idee und ihrer konkreten Umsetzung. Rechtlich geschützt ist in der Schweiz der konkrete Quellcode (Urheberrecht), nicht eine Idee als solche. Für einen weitergehenden Schutz wäre eine Beratung nötig, z. B. beim Eidgenössischen Institut für Geistiges Eigentum (IGE).
