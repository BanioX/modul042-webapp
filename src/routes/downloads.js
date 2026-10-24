const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'downloads');

// Nur diese Dateien werden ausgeliefert (keine Pfade aus der Anfrage)
const FILES = [
  { file: 'HUB-042_Produktblatt.pdf', title: 'HUB-042: Produktblatt & FAQ', group: 'HUB-042', desc: 'Alle Funktionen, FAQ und Kontakt für Feature-Wünsche und Löschanfragen.' },
  { file: 'Stundenplan_HFWI-2504-AA_2_Studienjahr.xlsx', title: 'Stundenplan 2. Studienjahr', group: 'Stundenplan', desc: 'HFWI-2504-AA, Stand 20.10.2026 (Excel)' },
  { file: 'Stundenplan_HFWI-2504-AA_1_Studienjahr.xlsx', title: 'Stundenplan 1. Studienjahr', group: 'Stundenplan', desc: 'HFWI-2504-AA, Stand 23.01.2026 (Excel)' },
  { file: 'Ferienplan_2024-2027.pdf', title: 'Ferienplan 2024–2027', group: 'Organisation', desc: 'Ferien, Feiertage und unterrichtsfreie Tage der HKV Aarau' },
  { file: 'Merkblatt_Englisch_2025.pdf', title: 'Merkblatt Modul Englisch', group: 'Bildungsgang', desc: 'IELTS, Dispensation, LLP-Umrechnungstabelle (Stand Nov. 2025)' },
  { file: 'Broschuere_HFWI.pdf', title: 'Broschüre HFWI', group: 'Bildungsgang', desc: 'Studienübersicht, Eckdaten, Handlungskompetenzen (Mai 2024)' },
  { file: 'HFWI_Factsheet.pdf', title: 'Factsheet HFWI', group: 'Bildungsgang', desc: 'Inhalte, Zulassung, Kosten, Highlights, Online-Unterricht' },
  { file: 'Zimmerplan_Pestalozzi-Schulhaus.pdf', title: 'Zimmerplan Pestalozzi-Schulhaus', group: 'Campus', desc: 'Stockwerke, Treppen, Sekretariate' },
  { file: 'Lageplan_HKV_Aarau.pdf', title: 'Lageplan HKV Aarau', group: 'Campus', desc: 'Anfahrt und Parkhäuser' },
];

module.exports = function downloadRoutes(app, ctx) {
  const { requireAuth } = ctx;

  app.get('/api/downloads', requireAuth, (req, res) => {
    res.json({
      files: FILES.filter((f) => fs.existsSync(path.join(DIR, f.file))).map((f) => ({
        ...f,
        size: fs.statSync(path.join(DIR, f.file)).size,
        url: `/downloads/${encodeURIComponent(f.file)}`,
      })),
    });
  });

  app.get('/downloads/:file', requireAuth, (req, res) => {
    const entry = FILES.find((f) => f.file === req.params.file);
    if (!entry) return res.status(404).send('Nicht gefunden');
    return res.download(path.join(DIR, entry.file), entry.file);
  });
};

module.exports.PRODUCT_SHEET = path.join(DIR, 'HUB-042_Produktblatt.pdf');
