// Baut docs/produktblatt.html aus der Vorlage und dem Funktionskatalog (ohne Abhängigkeiten, auch für Tests)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

function renderProduktblatt() {
  const features = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/features.json'), 'utf8'));
  const faq = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/faq.json'), 'utf8'));
  const template = fs.readFileSync(path.join(ROOT, 'docs/produktblatt.template.html'), 'utf8');
  const featureHtml = features
    .map((f) => `    <div class="feat"><b>${f.icon} ${esc(f.title)}</b><p>${esc(f.text)}</p></div>`)
    .join('\n');
  const faqHtml = faq
    .filter((f) => f.sheet)
    .map((f) => `  <div class="faq"><b>${esc(f.question)}</b><p>${esc(f.answer)}</p></div>`)
    .join('\n');
  return template
    .replace('{{FEATURES}}', featureHtml)
    .replace('{{FAQ}}', faqHtml)
    .replace(/\s*<!-- Vorlage:[^>]*-->/, '\n<!-- Automatisch erzeugt aus docs/produktblatt.template.html: node scripts/build-produktblatt.js -->');
}

module.exports = { renderProduktblatt, ROOT };
