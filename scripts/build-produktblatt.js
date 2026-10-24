// Erzeugt docs/produktblatt.html und downloads/HUB-042_Produktblatt.pdf aus src/data/features.json + faq.json
// Aufruf: node scripts/build-produktblatt.js (für das PDF wird Playwright mit Chromium benötigt)
const fs = require('fs');
const path = require('path');
const { renderProduktblatt, ROOT } = require('./produktblatt');

(async () => {
  const htmlPath = path.join(ROOT, 'docs', 'produktblatt.html');
  fs.writeFileSync(htmlPath, renderProduktblatt());
  console.log('docs/produktblatt.html erstellt');
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`);
  await page.pdf({
    path: path.join(ROOT, 'downloads', 'HUB-042_Produktblatt.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:7pt;color:#5d6e72;width:100%;padding:0 15mm;display:flex;justify-content:space-between">'
      + '<span>HUB-042 · Schulprojekt Modul 042 Applications Engineering · HFWI-2504-AA · ohne Gewähr</span>'
      + '<span>Seite <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
  });
  await browser.close();
  console.log('downloads/HUB-042_Produktblatt.pdf erstellt');
})();
