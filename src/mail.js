const nodemailer = require('nodemailer');

const APP_TITLE = 'HUB-042';

function getPublicBaseUrl(req) {
  const envUrl = process.env.PUBLIC_URL;
  if (envUrl && !envUrl.includes('example.trycloudflare.com')) {
    return envUrl.replace(/\/$/, '');
  }
  if (req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.protocol || 'http');
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = forwardedHost ? forwardedHost.split(',')[0].trim() : (req.get ? req.get('host') : req.headers.host);
    if (host) return `${proto}://${host}`;
  }
  return 'http://localhost:3000';
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.MAIL_FROM || (user ? `${APP_TITLE} <${user}>` : `noreply@hub-042.local`);
  // Antworten landen z. B. im Schulpostfach, auch wenn über Gmail versendet wird
  const replyTo = process.env.MAIL_REPLY_TO || '';
  return {
    host, port, user, pass, from, replyTo, isConfigured: Boolean(host && user && pass),
  };
}

function getMailStatus() {
  const cfg = getSmtpConfig();
  return {
    configured: cfg.isConfigured,
    host: cfg.host || 'nicht konfiguriert (Log-Modus)',
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
      requireTLS: cfg.port === 587,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** HTML-Mail im HKV-Stil (Petrol + Grün). */
function layout({ heading, paragraphs, buttonLabel, url }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p}</p>`).join('');
  return `
  <div style="background:#eef3f1;padding:28px 12px;font-family:Segoe UI,Arial,sans-serif;color:#173c43">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #d6e3de">
      <div style="background:#173c43;padding:18px 24px;border-bottom:4px solid #6ebd91">
        <span style="color:#ffffff;font-weight:800;font-size:20px;letter-spacing:.5px">HUB</span>
        <span style="color:#89bd99;font-weight:600;font-size:20px">-042</span>
      </div>
      <div style="padding:24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#173c43">${heading}</h2>
        ${body}
        <div style="text-align:center;margin:26px 0">
          <a href="${url}" style="background:#2f7d5b;color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">${buttonLabel}</a>
        </div>
        <p style="font-size:12px;color:#5a6b73;margin:0">Falls der Button nicht funktioniert:<br>
          <a href="${url}" style="color:#2f7d5b;word-break:break-all">${url}</a></p>
      </div>
      <div style="background:#f5f8f7;padding:12px 24px;font-size:11px;color:#5a6b73">
        HUB-042 · Schulprojekt Modul 042 Applications Engineering · Klasse HFWI-2504-AA · HKV Aarau
      </div>
    </div>
  </div>`;
}

async function deliver({
  to, subject, text, html, logLabel, url, attachments,
}) {
  const transport = getTransporter();
  if (transport) {
    try {
      const cfg = getSmtpConfig();
      await transport.sendMail({
        from: cfg.from, replyTo: cfg.replyTo || undefined, to, subject, text, html, attachments,
      });
      console.log(`[MAIL] ${logLabel} an ${to} versendet.`);
      return { sent: true, mode: 'smtp' };
    } catch (err) {
      console.error(`[MAIL] SMTP-Fehler (${logLabel} an ${to}):`, err.message);
      console.log(`[MAIL-FALLBACK] Link für ${to}: ${url}`);
      return { sent: false, mode: 'fallback-error', error: err.message };
    }
  }
  console.log(`[MAIL-DEV] SMTP nicht konfiguriert. ${logLabel} für ${to}: ${url}`);
  return { sent: false, mode: 'dev-fallback' };
}

async function sendVerificationEmail({
  email, name, token, req,
}) {
  const url = `${getPublicBaseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  return deliver({
    to: email,
    subject: `${APP_TITLE}: E-Mail-Adresse bestätigen`,
    text: `Hallo ${name}\n\nBitte bestätige deine HKV-Adresse für den ${APP_TITLE}:\n${url}\n\nBis bald im Hub!`,
    html: layout({
      heading: 'Fast geschafft 🎓',
      paragraphs: [
        `Hallo <strong>${escapeHtml(name)}</strong>,`,
        `bitte bestätige deine HKV-Adresse, damit dein Konto im ${APP_TITLE} aktiviert wird.`,
      ],
      buttonLabel: 'E-Mail bestätigen',
      url,
    }),
    logLabel: 'Bestätigungslink',
    url,
  });
}

async function sendInvitationEmail({
  email, name, inviter, req,
}) {
  const url = `${getPublicBaseUrl(req)}/#/registrieren?email=${encodeURIComponent(email)}`;
  return deliver({
    to: email,
    subject: `Einladung in den ${APP_TITLE} der HFWI-2504-AA`,
    text: `Hallo ${name}\n\n${inviter} lädt dich in den ${APP_TITLE} ein: Stundenplan, ATL-Tracker, `
      + `anonymes Ranking und Klassenforum.\n\nRegistrieren: ${url}\n\nDie Registrierung funktioniert nur mit dieser HKV-Adresse.`,
    html: layout({
      heading: 'Du bist eingeladen! 👋',
      paragraphs: [
        `Hallo <strong>${escapeHtml(name)}</strong>,`,
        `<strong>${escapeHtml(inviter)}</strong> lädt dich in den ${APP_TITLE} der Klasse HFWI-2504-AA ein.`,
        'Dort findest du den Stundenplan, alle Aufgaben und Prüfungstermine, ein anonymes Ranking pro Schuljahr und das Klassenforum.',
        'Die Registrierung funktioniert nur mit dieser HKV-Adresse.',
      ],
      buttonLabel: 'Jetzt registrieren',
      url,
    }),
    logLabel: 'Einladung',
    url,
  });
}

async function sendPasswordResetEmail({
  email, name, token, req,
}) {
  const url = `${getPublicBaseUrl(req)}/#/passwort-neu?token=${encodeURIComponent(token)}`;
  return deliver({
    to: email,
    subject: `${APP_TITLE}: Passwort zurücksetzen`,
    text: `Hallo ${name}\n\nNeues Passwort setzen (1 Stunde gültig):\n${url}\n\nFalls du das nicht angefordert hast, ignoriere diese Mail.`,
    html: layout({
      heading: 'Passwort zurücksetzen',
      paragraphs: [
        `Hallo <strong>${escapeHtml(name)}</strong>,`,
        'mit dem Button setzt du ein neues Passwort. Der Link ist eine Stunde gültig.',
        'Falls du das nicht angefordert hast, kannst du diese Mail ignorieren.',
      ],
      buttonLabel: 'Neues Passwort setzen',
      url,
    }),
    logLabel: 'Passwort-Reset',
    url,
  });
}

async function sendWelcomeEmail({
  email, name, req, attachmentPath,
}) {
  const url = `${getPublicBaseUrl(req)}/#/dashboard`;
  const fs = require('fs');
  const attachments = attachmentPath && fs.existsSync(attachmentPath)
    ? [{ filename: 'HUB-042_Produktblatt.pdf', path: attachmentPath, contentType: 'application/pdf' }]
    : undefined;
  return deliver({
    to: email,
    subject: `Willkommen im ${APP_TITLE} 🎓`,
    text: `Hallo ${name}\n\nDanke fürs Registrieren! Im Anhang findest du das Produktblatt mit allen Funktionen und einer FAQ.\n\n`
      + `Feature-Wünsche, Fragen und Löschanfragen an alban.hyseni@stud.hkv.ch oder persönlich im Unterricht.\n\n${url}`,
    html: layout({
      heading: 'Willkommen im HUB-042 🎓',
      paragraphs: [
        `Hallo <strong>${escapeHtml(name)}</strong>,`,
        'danke fürs Registrieren! Im Anhang findest du das <strong>Produktblatt</strong> mit allen Funktionen und einer FAQ.',
        'Tipp: Leg den HUB-042 auf den Homescreen (iPhone: Safari → Teilen → „Zum Home-Bildschirm“) und abonniere den Stundenplan im Kalender.',
        'Feature-Wünsche, Fragen und Löschanfragen an <a href="mailto:alban.hyseni@stud.hkv.ch" style="color:#2f7d5b">alban.hyseni@stud.hkv.ch</a> oder persönlich im Unterricht.',
      ],
      buttonLabel: 'Zum HUB-042',
      url,
    }),
    logLabel: 'Willkommens-Mail',
    url,
    attachments,
  });
}

async function sendTestEmail({ email, name, req }) {
  const url = `${getPublicBaseUrl(req)}/#/admin`;
  return deliver({
    to: email,
    subject: `${APP_TITLE}: Test-Mail ✅`,
    text: `Hallo ${name}\n\nDer Mailversand von ${APP_TITLE} funktioniert.\n\n${url}`,
    html: layout({
      heading: 'Mailversand funktioniert ✅',
      paragraphs: [`Hallo <strong>${escapeHtml(name)}</strong>,`, `diese Test-Mail kommt von ${APP_TITLE}. Bestätigungen, Einladungen und Willkommens-Mails können jetzt verschickt werden.`],
      buttonLabel: 'Zur Verwaltung',
      url,
    }),
    logLabel: 'Test-Mail',
    url,
  });
}

module.exports = {
  sendTestEmail,
  sendWelcomeEmail,
  getPublicBaseUrl,
  getSmtpConfig,
  getMailStatus,
  sendVerificationEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
};
