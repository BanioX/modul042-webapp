const test = require('node:test');
const assert = require('node:assert');
const { publicUrl, qrSvg } = require('../src/publicurl');

test('PUBLIC_URL hat Vorrang und wird ohne Schrägstrich geliefert', async () => {
  process.env.PUBLIC_URL = 'https://hub-042.tail1234.ts.net/';
  const info = await publicUrl();
  assert.deepEqual(info, { url: 'https://hub-042.tail1234.ts.net', kind: 'fest' });
  delete process.env.PUBLIC_URL;
});

test('ohne PUBLIC_URL und ohne Tunnel: keine Adresse', async () => {
  process.env.TUNNEL_METRICS_URL = 'http://127.0.0.1:9/quicktunnel';
  delete require.cache[require.resolve('../src/publicurl')];
  const { publicUrl: fresh } = require('../src/publicurl');
  assert.equal((await fresh()).url, null);
});

test('QR-Code wird als SVG erzeugt', async () => {
  const svg = await qrSvg('https://example.org');
  assert.match(svg, /^<svg/);
});
