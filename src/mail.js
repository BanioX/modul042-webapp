const nodemailer = require('nodemailer');

function getPublicBaseUrl(req) {
  if (req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.protocol || 'http');
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = forwardedHost ? forwardedHost.split(',')[0].trim() : (req.get ? req.get('host') : req.headers.host);
    if (host) {
      return `${proto}://${host}`;
    }
  }
  const envUrl = process.env.PUBLIC_URL;
  if (envUrl && !envUrl.includes('example.trycloudflare.com')) {
    return envUrl.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

function getSmtpConfig(req) {
  const host = process.env.SMTP_HOST || '';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.MAIL_FROM || user || 'noreply@atl-arena.local';
  const publicUrl = getPublicBaseUrl(req);

  const isConfigured = Boolean(host && user && pass);

  return {
    host,
    port,
    user,
    pass,
    from,
    publicUrl,
    isConfigured,
  };
}

function getMailStatus() {
  const cfg = getSmtpConfig();
  return {
    configured: cfg.isConfigured,
    host: cfg.host ? cfg.host : 'nicht konfiguriert (Log-Modus)',
    port: cfg.port,
    from: cfg.from,
    mode: cfg.isConfigured ? 'smtp' : 'console-fallback',
  };
}

let transporter = null;
function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.isConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
    });
  }
  return transporter;
}

async function sendVerificationEmail({ email, alias, token, req }) {
  const baseUrl = getPublicBaseUrl(req);
  const verifyUrl = `${baseUrl.replace(/\/$/, '')}/verify?token=${encodeURIComponent(token)}`;

  const subject = 'ATL-Arena: E-Mail-Adresse bestätigen';
  const text = `Hallo ${alias || 'Student'},\n\n`
    + `Willkommen bei der ATL-Arena für die Klasse HFWI-2504-AA!\n\n`
    + `Bitte bestätige deine E-Mail-Adresse durch Klick auf folgenden Link:\n`
    + `${verifyUrl}\n\n`
    + `Viel Erfolg beim Semester!\n`
    + `Dein ATL-Arena Team`;

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
      <h2 style="color: #38bdf8; margin-top: 0;">Willkommen bei der ATL-Arena 🎓</h2>
      <p>Hallo <strong>${alias || 'Student'}</strong>,</p>
      <p>du hast Level 1 & 2 erfolgreich gemeistert! Um deinen Account für die Klasse <strong>HFWI-2504-AA</strong> zu aktivieren, klicke bitte auf den folgenden Button:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${verifyUrl}" style="background: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block;">
          E-Mail-Adresse bestätigen
        </a>
      </div>
      <p style="font-size: 13px; color: #94a3b8;">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
        <a href="${verifyUrl}" style="color: #38bdf8; word-break: break-all;">${verifyUrl}</a>
      </p>
    </div>
  `;

  const transport = getTransporter();
  if (transport) {
    try {
      await transport.sendMail({
        from: (process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@atl-arena.local'),
        to: email,
        subject,
        text,
        html,
      });
      console.log(`[MAIL-BOT] Bestätigungs-E-Mail an ${email} via SMTP versendet.`);
      return { sent: true, mode: 'smtp', devLink: verifyUrl };
    } catch (err) {
      console.error('[MAIL-BOT] SMTP-Fehler beim Versand:', err.message);
      console.log(`[MAIL-BOT-FALLBACK] Aktivierungslink für ${email}: ${verifyUrl}`);
      return { sent: false, mode: 'fallback-error', devLink: verifyUrl, error: err.message };
    }
  }

  // Local/Dev Fallback when SMTP is not configured
  console.log(`[MAIL-BOT-DEV] SMTP nicht konfiguriert. Aktivierungslink für ${email}:`);
  console.log(`  ==> ${verifyUrl}`);
  return { sent: false, mode: 'dev-fallback', devLink: verifyUrl };
}

module.exports = {
  getPublicBaseUrl,
  getSmtpConfig,
  getMailStatus,
  sendVerificationEmail,
};
