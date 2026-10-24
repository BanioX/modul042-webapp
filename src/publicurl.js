/**
 * Öffentliche Adresse von HUB-042 ermitteln:
 * 1. PUBLIC_URL aus der .env (feste Adresse, z. B. Tailscale Funnel oder eigene Domain)
 * 2. sonst die aktuelle Zufallsadresse des Cloudflare Quick Tunnels (Metrics-Endpunkt von cloudflared)
 */
const QRCode = require('qrcode');

const TUNNEL_METRICS = process.env.TUNNEL_METRICS_URL || 'http://tunnel:2000/quicktunnel';

async function quickTunnelUrl() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(TUNNEL_METRICS, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.hostname ? `https://${data.hostname}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function publicUrl() {
  const fixed = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (fixed && !fixed.includes('example')) return { url: fixed, kind: 'fest' };
  const quick = await quickTunnelUrl();
  if (quick) return { url: quick, kind: 'quick' };
  return { url: null, kind: 'keine' };
}

async function qrSvg(text) {
  return QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#173c43', light: '#ffffff' } });
}

module.exports = { publicUrl, qrSvg, quickTunnelUrl };
