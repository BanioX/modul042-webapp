// Erzeugt downloads/HUB-042_Produktblatt.pdf aus docs/produktblatt.html
// Aufruf: node scripts/build-produktblatt.js (benötigt Playwright mit Chromium)
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${path.join(root, 'docs', 'produktblatt.html')}`);
  await page.pdf({
    path: path.join(root, 'downloads', 'HUB-042_Produktblatt.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log('downloads/HUB-042_Produktblatt.pdf erstellt');
})();
