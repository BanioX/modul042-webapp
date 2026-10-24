/* HUB-042 – Single-Page-App ohne Build-Schritt (Hash-Routing, Vanilla JS) */
(function () {
  'use strict';

  const TZ = 'Europe/Zurich';
  const state = {
    meta: null,
    yearId: null,
  };
  const app = document.getElementById('app');

  // ---------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function api(path, options = {}) {
    const opts = { method: 'GET', headers: {}, credentials: 'same-origin', ...options };
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      state.meta = null;
      go('/anmelden');
      throw new Error(data.error || 'Bitte anmelden');
    }
    if (!res.ok) {
      const error = new Error(data.error || `Fehler ${res.status}`);
      error.data = data;
      throw error;
    }
    return data;
  }

  function withYear(path) {
    if (!state.yearId) return path;
    return `${path}${path.includes('?') ? '&' : '?'}year=${state.yearId}`;
  }

  function toast(message, isError) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast${isError ? ' err' : ''}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function go(path) {
    if (location.hash === `#${path}`) route();
    else location.hash = path;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/dashboard';
    const [pathPart, query = ''] = raw.split('?');
    return { parts: pathPart.split('/').filter(Boolean), params: new URLSearchParams(query) };
  }

  const fmt = {
    date(value, opts) {
      return new Intl.DateTimeFormat('de-CH', { timeZone: TZ, ...opts }).format(new Date(value));
    },
    day(iso) { return new Date(`${iso}T12:00:00Z`); },
    dayLabel(value) {
      const d = new Date(value);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return fmt.date(d, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    },
    weekday(value) { return fmt.date(value, { weekday: 'long' }); },
    time(value) { return fmt.date(value, { hour: '2-digit', minute: '2-digit' }); },
    num(n, digits = 1) {
      if (n === null || n === undefined) return '–';
      return Number(n).toLocaleString('de-CH', { maximumFractionDigits: digits });
    },
    grade(g) { return g === null || g === undefined ? '–' : Number(g).toFixed(1); },
    relative(value) {
      const diff = (new Date(value) - new Date()) / 86400000;
      if (Math.abs(diff) < 1) return diff >= 0 ? 'heute' : 'heute';
      const days = Math.round(diff);
      return days > 0 ? `in ${days} Tag${days === 1 ? '' : 'en'}` : `vor ${-days} Tag${days === -1 ? '' : 'en'}`;
    },
    ago(value) {
      const mins = Math.round((new Date() - new Date(value)) / 60000);
      if (mins < 1) return 'gerade eben';
      if (mins < 60) return `vor ${mins} Min.`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `vor ${hours} Std.`;
      return fmt.date(value, { day: 'numeric', month: 'short', year: 'numeric' });
    },
  };

  function zurichDayKey(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(value));
    return parts;
  }

  function gradeClass(g) {
    if (g === null || g === undefined) return '';
    if (g >= 5) return 'grade-good';
    if (g >= 4) return 'grade-ok';
    return 'grade-bad';
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  function kindTag(kind) {
    const cls = { ATL: 'atl', 'Mastery Test': 'mastery', 'Jahresprüfung': 'jp' }[kind] || 'muted';
    return `<span class="tag ${cls}">${icon('tag', 12)} ${esc(kind)}</span>`;
  }

  /** Stockwerk und Treppe gemäss Zimmerplan Pestalozzi-Schulhaus */
  function roomHint(room) {
    const m = String(room || '').match(/(?:Zimmer\s*)?([UE]?)(\d{2,3})\b/i);
    if (!m) return '';
    const prefix = m[1].toUpperCase();
    if (prefix === 'U') return 'Untergeschoss';
    if (prefix === 'E') return 'Erdgeschoss';
    const n = parseInt(m[2], 10);
    if (n < 100) return '';
    const floor = `${Math.floor(n / 100)}. Stock`;
    const suffix = n % 100;
    const stair = suffix >= 26 && suffix <= 41 ? 'Treppe West' : (suffix >= 11 && suffix <= 22 ? 'Treppe Ost' : '');
    return [floor, stair].filter(Boolean).join(', ');
  }

  function roleLabel(role) {
    return { admin: 'Admin', dozent: 'Dozent*in', student: 'Studierende*r' }[role] || role;
  }

  function moduleById(code) {
    return state.meta ? state.meta.modules.find((m) => m.code === code) : null;
  }

  function currentYear() {
    return state.meta ? state.meta.years.find((y) => y.id === state.yearId) : null;
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = value; });
    form.querySelectorAll('input[type=checkbox]').forEach((el) => { data[el.name] = el.checked; });
    return data;
  }

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    forum: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };
  function icon(name, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  // ---------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------
  function openModal({ title, body, foot, onMount }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Schliessen">×</button></div>
          <div class="modal-body">${body}</div>
          ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
        </div>
      </div>`;
    const backdrop = root.querySelector('.modal-backdrop');
    backdrop.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close')) closeModal();
    });
    document.addEventListener('keydown', escClose);
    if (onMount) onMount(root.querySelector('.modal'));
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
    document.removeEventListener('keydown', escClose);
  }

  // ---------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------
  const NAV = [
    ['dashboard', 'Dashboard', 'home'],
    ['aufgaben', 'ATL-Tracker', 'tasks'],
    ['noten', 'Noten', 'trend'],
    ['stundenplan', 'Stundenplan', 'calendar'],
    ['ranking', 'Ranking', 'trophy'],
    ['forum', 'Forum', 'forum'],
    ['gruppen', 'Gruppen', 'users'],
    ['infos', 'Infos', 'info'],
    ['profil', 'Profil', 'user'],
  ];

  function shell(active, content, progress) {
    const { user } = state.meta;
    const nav = [...NAV];
    if (user.role === 'admin') nav.push(['admin', 'Verwaltung', 'settings']);
    const years = state.meta.years.map((y) => `<option value="${y.id}" ${y.id === state.yearId ? 'selected' : ''}>${esc(y.label)}</option>`).join('');
    const chips = progress ? `
        <span class="chip hide-sm"><span class="ico">${icon('flame', 16)}</span>${progress.streak} Tag${progress.streak === 1 ? '' : 'e'} Streak</span>
        <span class="chip"><span class="ico">${icon('star', 16)}</span>Level ${progress.level.level}</span>` : '';
    app.className = '';
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/dashboard">
            <span class="logo-box">042</span>
            <span><div class="brand-title">HUB-042</div><div class="brand-sub">HFWI-2504-AA · HKV Aarau</div></span>
          </a>
          <span class="topbar-spacer"></span>
          <div class="chip-row">
            ${chips}
            <select class="year-select" id="year-select" aria-label="Schuljahr">${years}</select>
            <a class="user-pill" href="#/profil" title="Profil">
              <span class="avatar">${esc(initials(user.display_name))}</span>
              <span class="meta"><div class="name">${esc(user.display_name)}</div><div class="role">${esc(roleLabel(user.role))}</div></span>
            </a>
          </div>
        </div>
      </header>
      <nav class="tabs"><div class="tabs-inner">
        ${nav.map(([key, label, ic]) => `<a class="tab ${key === active ? 'active' : ''}" href="#/${key}">${icon(ic)} ${label}</a>`).join('')}
      </div></nav>
      <main class="page">${content}</main>`;
    document.getElementById('year-select').addEventListener('change', (e) => {
      state.yearId = parseInt(e.target.value, 10);
      try { localStorage.setItem('hub042-year', String(state.yearId)); } catch (err) { /* optional */ }
      route();
    });
  }

  function loading(active) {
    if (state.meta) shell(active, '<div class="empty">Lade …</div>');
    else app.innerHTML = '<div class="boot"><div class="boot-logo"><span class="logo-box">HUB</span> 042</div></div>';
  }

  // ---------------------------------------------------------------
  // Auth-Seiten
  // ---------------------------------------------------------------
  let publicConfig = null;
  async function loadPublicConfig() {
    if (!publicConfig) {
      try { publicConfig = await api('/api/public-config'); } catch (e) { publicConfig = { mailEnabled: false }; }
    }
    return publicConfig;
  }

  const DEMO_NOTE = `<div class="info-box" style="font-size:13px">🧪 <strong>Demo-Modus (Schulprojekt):</strong> Deine HKV-Mailadresse dient nur zur Identifikation,
    es werden <strong>keine Mails verschickt</strong>. Der Admin nimmt neue Konten an und schaltet sie frei. Passwort vergessen? Der Admin setzt es auf das Werkspasswort zurück.
    Einloggen kannst du dich danach nur mit Werkspasswort <strong>und</strong> deiner persönlichen Wiederherstellungs-ID, dann wählst du ein neues Passwort.</div>`;

  function authLayout(inner) {
    app.className = '';
    app.innerHTML = `
      <div class="auth-wrap">
        <section class="auth-hero">
          <div class="boot-logo" style="color:#fff"><span class="logo-box">HUB</span> 042</div>
          <h1>Die Antwort auf alle Fragen<br><span>deiner Klasse: 042.</span></h1>
          <p>Die Lernplattform der HFWI-2504-AA: Stundenplan, ATL-Tracker, anonymes Ranking und ein Forum für alles, was die Klasse weiterbringt.</p>
          <p style="margin-top:14px;font-size:13px;color:var(--sage)">🎓 Entstanden als nicht-kommerzielles Schulprojekt im Modul 042 „Applications Engineering“ der HKV Aarau (2026). Kein offizielles Angebot der HKV Aarau.</p>
          <ul class="feature-list">
            <li><span class="fi">${icon('calendar')}</span><span><strong>Stundenplan</strong><br>Alle Lektionen beider Studienjahre, auch als Kalender-Abo für Outlook &amp; Teams.</span></li>
            <li><span class="fi">${icon('tasks')}</span><span><strong>ATL-Tracker</strong><br>Wie in Teams: Aufgaben, Fristen, Punkte eintragen (z. B. 45/60), Note sofort sehen.</span></li>
            <li><span class="fi">${icon('trophy')}</span><span><strong>Anonymes Ranking</strong><br>Du siehst deinen Platz auf dem Podest, die anderen bleiben anonym.</span></li>
            <li><span class="fi">${icon('forum')}</span><span><strong>Forum &amp; Wissenswertes</strong><br>Fragen, Zusammenfassungen und Lerngruppen.</span></li>
          </ul>
        </section>
        <section class="auth-form"><div class="auth-card">${inner}</div></section>
      </div>`;
  }

  async function viewLogin(params) {
    const status = params.get('status');
    const cfg = await loadPublicConfig();
    authLayout(`
      <h2>Anmelden</h2>
      <p class="lead">Mit deiner HKV-Adresse und deinem Passwort.</p>
      ${status === 'link-ungueltig' ? '<div class="error-box">Der Bestätigungslink ist ungültig oder wurde bereits verwendet.</div>' : ''}
      <div id="auth-msg"></div>
      <form id="login-form">
        <div class="field"><label for="email">HKV-E-Mail</label>
          <input class="input" id="email" name="email" type="email" autocomplete="username" placeholder="vorname.nachname@stud.hkv.ch" required></div>
        <div class="field"><label for="password">Passwort</label>
          <input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
        <div class="field" id="recovery-field" style="display:none"><label for="recovery_id">Persönliche Wiederherstellungs-ID</label>
          <input class="input" id="recovery_id" name="recovery_id" autocomplete="off" placeholder="z. B. K7Q2-M9XA" style="text-transform:uppercase">
          <span class="hint">Die ID hast du beim ersten Login notiert. Verloren? Dann kann dir nur der Admin weiterhelfen.</span></div>
        <button class="btn" style="width:100%" type="submit">Anmelden</button>
      </form>
      <div class="auth-links"><a href="#/registrieren">Konto erstellen</a>${cfg.mailEnabled ? '<a href="#/passwort-vergessen">Passwort vergessen?</a>' : '<span style="color:var(--muted)">Passwort vergessen? → Admin fragen</span>'}</div>
      ${cfg.mailEnabled ? '' : `<div style="margin-top:16px">${DEMO_NOTE}</div>`}`);
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await api('/api/auth/login', { method: 'POST', body: formData(e.target) });
        await loadMeta();
        go('/dashboard');
      } catch (err) {
        if (err.data && err.data.needRecovery) document.getElementById('recovery-field').style.display = '';
        document.getElementById('auth-msg').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  async function viewRegister(params) {
    const cfg = await loadPublicConfig();
    authLayout(`
      <h2>Konto erstellen</h2>
      <p class="lead">Nur für die Teilnehmenden der HFWI-2504-AA und Dozierende, mit der HKV-Adresse.</p>
      ${cfg.mailEnabled ? '' : DEMO_NOTE}
      <div id="auth-msg"></div>
      <form id="register-form">
        <div class="field"><label for="email">HKV-E-Mail</label>
          <input class="input" id="email" name="email" type="email" autocomplete="username" placeholder="vorname.nachname@stud.hkv.ch" value="${esc(params.get('email') || '')}" required>
          <span class="hint">🎓 Studierende: nur mit <strong>vorname.nachname@stud.hkv.ch</strong><br>
            👨‍🏫 Dozent Applications Engineering: <strong>vorname.nachname@hkv.ch</strong><br>
            Andere Adressen (z. B. Gmail) und Personen, die nicht auf der Teilnehmerliste stehen, werden abgewiesen.</span></div>
        <div class="field"><label for="display_name">Anzeigename <span class="hint">(optional)</span></label>
          <input class="input" id="display_name" name="display_name" maxlength="100" placeholder="z. B. Alban H."></div>
        <div class="field"><label for="password">Passwort</label>
          <input class="input" id="password" name="password" type="password" minlength="8" maxlength="20" autocomplete="new-password" required>
          <span class="hint">8 bis 20 Zeichen (empfohlen: mindestens 8 mit Zahl und Sonderzeichen).</span></div>
        <label class="check" style="align-items:flex-start"><input type="checkbox" name="consent" required style="margin-top:4px">
          <span style="font-size:13px">Ich habe die <a href="#/datenschutz" target="_blank">Datenschutzerklärung</a> gelesen und bin einverstanden, dass meine Daten
          für dieses nicht-kommerzielle Schulprojekt verwendet werden. Meine Punkte sieht nur ich, im Ranking bleibe ich für andere anonym.</span></label>
        <button class="btn" style="width:100%" type="submit">Registrieren</button>
      </form>
      <div class="auth-links"><a href="#/anmelden">Ich habe schon ein Konto</a></div>`);
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const res = await api('/api/auth/register', { method: 'POST', body: formData(e.target) });
        document.getElementById('auth-msg').innerHTML = `<div class="info-box">${esc(res.message)}</div>`;
        e.target.reset();
      } catch (err) {
        document.getElementById('auth-msg').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      }
      btn.disabled = false;
    });
  }

  async function viewForgot() {
    const cfg = await loadPublicConfig();
    if (!cfg.mailEnabled) {
      authLayout(`<h2>Passwort vergessen</h2>${DEMO_NOTE}
        <p style="font-size:14px">Melde dich beim Admin (Alban, persönlich im Unterricht oder an alban.hyseni@stud.hkv.ch). Er setzt dein Passwort zurück.
        Danach meldest du dich mit dem Werkspasswort, das er dir persönlich mitteilt, <strong>und</strong> deiner persönlichen Wiederherstellungs-ID an und wählst sofort ein eigenes Passwort.</p>
        <div class="auth-links"><a href="#/anmelden">Zurück zur Anmeldung</a></div>`);
      return;
    }
    authLayout(`
      <h2>Passwort vergessen</h2>
      <p class="lead">Wir schicken dir einen Link an deine HKV-Adresse.</p>
      <div id="auth-msg"></div>
      <form id="forgot-form">
        <div class="field"><label for="email">HKV-E-Mail</label><input class="input" id="email" name="email" type="email" required></div>
        <button class="btn" style="width:100%" type="submit">Link senden</button>
      </form>
      <div class="auth-links"><a href="#/anmelden">Zurück zur Anmeldung</a></div>`);
    document.getElementById('forgot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api('/api/auth/forgot', { method: 'POST', body: formData(e.target) });
        document.getElementById('auth-msg').innerHTML = `<div class="info-box">${esc(res.message)}</div>`;
      } catch (err) {
        document.getElementById('auth-msg').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      }
    });
  }

  function viewReset(params) {
    authLayout(`
      <h2>Neues Passwort</h2>
      <div id="auth-msg"></div>
      <form id="reset-form">
        <div class="field"><label for="password">Neues Passwort</label>
          <input class="input" id="password" name="password" type="password" minlength="8" maxlength="20" autocomplete="new-password" required>
          <span class="hint">8 bis 20 Zeichen.</span></div>
        <button class="btn" style="width:100%" type="submit">Speichern</button>
      </form>`);
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/auth/reset', { method: 'POST', body: { token: params.get('token'), password: e.target.password.value } });
        await loadMeta();
        toast('Passwort geändert');
        go('/dashboard');
      } catch (err) {
        document.getElementById('auth-msg').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      }
    });
  }

  // ---------------------------------------------------------------
  // Datenschutz & Impressum (öffentlich)
  // ---------------------------------------------------------------
  const CONTACT = 'alban.hyseni@stud.hkv.ch';
  const REPO_URL = 'https://github.com/BanioX/hub-042';

  function privacyHtml() {
    return `
      <div class="eyebrow">Version ${esc(state.meta ? state.meta.privacyVersion : '2026-10-24')}</div>
      <h1 class="page-title">Datenschutzerklärung</h1>
      <div class="card legal">
        <div class="info-box"><strong>Kurz gesagt:</strong> Der HUB-042 ist ein nicht-kommerzielles Schulprojekt. Registrieren können sich nur
          Teilnehmende der Klasse HFWI-2504-AA und Dozierende, ausschliesslich mit der Schul-Mailadresse. Deine Punkte und Noten siehst nur du.
          Im Ranking erscheinen alle anderen als „Anonym“. Es gibt keine Werbung, kein Tracking und keine Weitergabe an Dritte.</div>

        <h3>1. Verantwortlich</h3>
        <p>Alban Hyseni, Studierender der Klasse HFWI-2504-AA (HKV Aarau), Kontakt: <a href="mailto:${CONTACT}">${CONTACT}</a>.
          Der HUB-042 ist <strong>kein offizielles Angebot der HKV Aarau</strong>.</p>

        <h3>2. Entstehung und Zweck</h3>
        <p>Der HUB-042 ist als <strong>Schulprojekt im Modul 042 „Applications Engineering“</strong> entstanden.
          In der Übung „Webapplikation“ ging es um Betrieb und Deployment einer Webapplikation mit Docker, GitHub Actions und Cloudflare Tunnel.
          Die Applikation wurde dabei mit KI-Unterstützung entwickelt.</p>
        <p>Die Plattform hilft der Klasse beim Organisieren des Studiums:
          Stundenplan, Fristen, persönliche Punkte und Noten, anonymes Ranking pro Schuljahr und ein Klassenforum.
          Es besteht <strong>kein kommerzielles Interesse</strong>. Daten werden nicht verkauft, nicht für Werbung genutzt und nicht ausgewertet,
          ausser um die genannten Funktionen bereitzustellen.</p>

        <h3>3. Wer sich registrieren kann</h3>
        <p>Nur Personen auf der Teilnehmerliste der Klasse sowie Dozierende, und nur mit der HKV-Adresse (@stud.hkv.ch bzw. @hkv.ch).
          Die Adresse wird per Bestätigungslink überprüft. Alle anderen Adressen werden abgewiesen.</p>

        <h3>4. Welche Daten gespeichert werden</h3>
        <ul>
          <li><strong>Konto:</strong> HKV-Mailadresse, Anzeigename, Rolle, Zeitpunkt der Registrierung und deiner Zustimmung. Das Passwort wird nur als
            nicht umkehrbarer bcrypt-Hash gespeichert.</li>
          <li><strong>Deine Einträge:</strong> selbst eingetragene Punkte, Maximalpunkte und private Notizen zu Aufgaben.</li>
          <li><strong>Forum:</strong> Beiträge, Antworten und „Hilfreich“-Markierungen.</li>
          <li><strong>Aktivitätstage:</strong> nur das Datum, an dem du eingeloggt warst (für den Streak), keine Uhrzeiten und kein Verlauf.</li>
          <li><strong>Audit-Protokoll:</strong> Anmeldungen, fehlgeschlagene Anmeldeversuche, Zustimmungen und Verwaltungsaktionen, zur Sicherheit und Nachvollziehbarkeit.
            Es enthält keine Punkte und keine Passwörter. Einträge werden nach 365 Tagen gelöscht, fehlgeschlagene Anmeldeversuche schon nach 30 Tagen.</li>
          <li><strong>Besucherzähler:</strong> zählt nur Aufrufe, ohne IP-Adresse oder andere Merkmale.</li>
        </ul>
        <p>Es findet <strong>keine Datensammlung darüber hinaus</strong> statt: keine Analyse-Tools, keine Werbe- oder Tracking-Cookies, keine externen Schriften oder Skripte.</p>

        <p><strong>Demo-Modus ohne Mailversand:</strong> Solange kein Mailversand eingerichtet ist, wird deine Adresse nur zur Identifikation verwendet,
          es gehen keine Mails raus. Der Admin nimmt neue Konten an und kann Passwörter auf ein Werkspasswort zurücksetzen; er sieht dabei nie dein eigenes Passwort.
          Nach einem Reset brauchst du beim Login zusätzlich deine persönliche Wiederherstellungs-ID, die nur du kennst (gespeichert wird nur ein bcrypt-Hash), und wählst dann ein neues Passwort.</p>

        <h3>5. Wer was sieht</h3>
        <ul>
          <li><strong>Punkte und Noten</strong> siehst ausschliesslich du.</li>
          <li><strong>Ranking:</strong> Du siehst deinen eigenen Platz. Alle anderen erscheinen nur als „Anonym“ mit Schnitt, ohne Namen oder Kennung.
            Andere werden erst angezeigt, wenn mindestens 3 Personen Einträge haben, damit niemand auf einzelne Noten zurückschliessen kann.</li>
          <li><strong>Forum:</strong> Beiträge sind für eingeloggte Klassenmitglieder mit deinem Anzeigenamen sichtbar.</li>
          <li><strong>Gruppengenerator:</strong> Eingeloggte Klassenmitglieder sehen die Namen der Teilnehmenden (ohne Mailadressen), um Lerngruppen auszulosen. Die Auslosung wird nicht gespeichert.</li>
          <li><strong>Verwaltung:</strong> Klassen-Admins und Dozierende sehen die Teilnehmerliste mit Registrierungsstatus, aber keine Punkte.
            Der technische Betreiber hat Zugriff auf die Datenbank und nutzt ihn nur für Betrieb und Wartung.</li>
        </ul>

        <h3>6. Cookies und lokaler Speicher</h3>
        <p>Ein einziges, technisch notwendiges Session-Cookie hält dich angemeldet (httpOnly, signiert, 30 Tage). Im Browser wird zusätzlich nur
          das gewählte Schuljahr gespeichert.</p>

        <h3>7. Hosting und Empfänger</h3>
        <ul>
          <li>Die Applikation und die Datenbank laufen in Docker-Containern auf einem Rechner des Betreibers in der Schweiz.</li>
          <li>Öffentlich erreichbar ist sie über einen <strong>Cloudflare Tunnel</strong> (Cloudflare Inc., USA). Die Verbindung ist per HTTPS verschlüsselt,
            Cloudflare verarbeitet dabei technisch bedingt IP-Adressen und Verbindungsdaten. Cloudflare ist unter dem Swiss-U.S. Data Privacy Framework zertifiziert,
            das die Schweiz als angemessenes Datenschutzniveau anerkennt. Inhalte wie Punkte werden dort nicht gespeichert.</li>
          <li>Bestätigungs-, Einladungs-, Willkommens- und Passwort-Mails werden über das HKV-Microsoft-365-Konto ${CONTACT} oder über ein Gmail-Konto des Betreibers (Google LLC, USA, Swiss-U.S. Data Privacy Framework) versendet. Dabei werden nur deine Mailadresse und dein Anzeigename übermittelt.</li>
          <li><strong>Hilfe-Bot (freiwillig):</strong> Nur wenn du dem Bot eine Frage stellst und er mit KI läuft, wird der Fragetext an
            <strong>Google Gemini</strong> (Google LLC, USA, zertifiziert unter dem Swiss-U.S. Data Privacy Framework) übermittelt, zusammen mit allgemeinen Infos
            zum HUB-042 und klassenweiten Terminen. Nie mitgesendet werden dein Name, deine E-Mail, Punkte oder Noten. E-Mail-Adressen und Telefonnummern in der Frage
            werden vorher automatisch entfernt. Fragen werden im HUB-042 nicht gespeichert. Bitte gib im Bot keine persönlichen Daten ein.</li>
          <li>Der Quellcode ist öffentlich auf GitHub, enthält aber keine Personendaten.</li>
        </ul>

        <h3>8. Rechtsgrundlage</h3>
        <p>Die Bearbeitung beruht auf deiner freiwilligen Einwilligung nach dem Schweizer Datenschutzgesetz (DSG). Du kannst sie jederzeit widerrufen,
          indem du dein Konto löschst.</p>

        <h3>9. Keine automatisierten Entscheidungen, kein Profiling</h3>
        <p>XP, Level, Abzeichen und Ranking dienen nur der Motivation. Sie haben keinerlei Einfluss auf offizielle Noten oder Entscheide der HKV Aarau.</p>

        <h3>10. Aufbewahrung</h3>
        <p>Deine Daten bleiben gespeichert, bis du dein Konto löschst. Spätestens nach Abschluss des Studiengangs wird die gesamte Datenbank gelöscht.</p>

        <h3>11. Deine Rechte</h3>
        <ul>
          <li><strong>Auskunft:</strong> Im Profil kannst du alle über dich gespeicherten Daten als Datei herunterladen.</li>
          <li><strong>Berichtigung:</strong> Name und Einträge kannst du selbst ändern.</li>
          <li><strong>Löschung:</strong> Im Profil löschst du dein Konto mit allen Punkten, Beiträgen und Aktivitätstagen sofort.</li>
          <li>Fragen und Anliegen an <a href="mailto:${CONTACT}">${CONTACT}</a>. Beschwerden kannst du beim Eidgenössischen Datenschutz- und
            Öffentlichkeitsbeauftragten (EDÖB) einreichen.</li>
        </ul>

        <h3>12. Sicherheit</h3>
        <p>HTTPS, gehashte Passwörter, signierte Cookies, Begrenzung von Login-Versuchen, Sicherheits-Header, Secrets ausserhalb des Codes
          und eine Datenbank ohne öffentlichen Zugang. Details im Repository unter DATENSCHUTZ.md.</p>
      </div>`;
  }

  function imprintHtml() {
    return `
      <h1 class="page-title">Impressum</h1>
      <div class="card legal">
        <h3>Betreiber</h3>
        <p>Alban Hyseni<br>Studierender Dipl. Wirtschaftsinformatiker HF, Klasse HFWI-2504-AA, HKV Aarau<br>
          E-Mail: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
        <h3>Art des Angebots</h3>
        <p><strong>Nicht-kommerzielles Schulprojekt</strong>, entstanden im Modul 042 „Applications Engineering“ an der HKV Aarau,
          Übung „Webapplikation“ vom 21. Oktober 2026: Betrieb und Deployment mit Docker Compose, GitHub Actions und Cloudflare Tunnel.
          Es werden keine Waren oder Dienstleistungen angeboten und keine Einnahmen erzielt.</p>
        <h3>Keine offizielle Seite der HKV Aarau</h3>
        <p>Der HUB-042 ist ein privates Projekt von Studierenden und kein offizielles Angebot der HKV Handelsschule KV Aarau.
          Name und Farben dienen nur der Orientierung für die Klasse.</p>
        <h3>Haftungsausschluss</h3>
        <p>Stundenplan, Fristen und Punkte sind ohne Gewähr. Massgebend sind immer die offiziellen Angaben der HKV Aarau in MS Teams bzw. Tocco.
          Die Notenberechnung (Punkte ÷ Maximum × 5 + 1) dient nur zur Orientierung.</p>
        <h3>Warum „HUB-042“?</h3>
        <p>Die Seite ist <strong>während des Unterrichts im Modul 042</strong> „Applications Engineering“ entstanden, daher der Name.
          Der Macher fand ihn ausserdem passend, weil er Sci-Fi-Fan ist: 42 ist die Antwort auf alle Fragen. Eine Hommage an Douglas Adams’
          <em>Per Anhalter durch die Galaxis</em> (1979): Dort berechnet der Supercomputer Deep Thought in 7,5 Millionen Jahren die Antwort auf die endgültige Frage
          nach dem Leben, dem Universum und dem ganzen Rest:</p>
        <blockquote style="border-left:4px solid var(--green);margin:8px 0;padding:6px 14px;background:var(--mint);border-radius:0 6px 6px 0;font-style:italic">
          „The Answer to the Great Question… Of Life, the Universe and Everything… Is… Forty-two,“ said Deep Thought, with infinite majesty and calm.
          <div style="font-style:normal;font-size:12px;color:var(--muted);margin-top:4px">Douglas Adams, The Hitchhiker’s Guide to the Galaxy, Kapitel 27</div></blockquote>
        <h3>Quellcode</h3>
        <p><a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL}</a></p>
        <p><a href="#/datenschutz">→ Datenschutzerklärung</a></p>
      </div>`;
  }

  function viewLegal(kind) {
    const html = kind === 'impressum' ? imprintHtml() : privacyHtml();
    if (state.meta) {
      shell(kind, html);
      return;
    }
    app.className = '';
    app.innerHTML = `<header class="topbar"><div class="topbar-inner">
        <a class="brand" href="#/anmelden"><span class="logo-box">042</span><span><div class="brand-title">HUB-042</div></span></a>
        <span class="topbar-spacer"></span><a class="btn secondary small" href="#/anmelden">Anmelden</a></div></header>
      <main class="page" style="max-width:860px">${html}</main>`;
  }

  async function showRecoveryId(isNew) {
    const res = await api('/api/me/recovery-id', { method: 'POST' });
    openModal({
      title: 'Deine persönliche Wiederherstellungs-ID',
      body: `<p style="margin-top:0">${isNew ? 'Willkommen! ' : ''}Diese ID kennst <strong>nur du</strong>. Auch der Admin sieht sie nie.
          Setzt der Admin dein Passwort zurück, brauchst du beim Login das Werkspasswort <strong>und</strong> diese ID.</p>
        <div style="font-family:ui-monospace,Consolas,monospace;font-size:30px;font-weight:800;text-align:center;letter-spacing:3px;background:var(--mint);color:var(--petrol);border-radius:8px;padding:14px;margin:10px 0">${esc(res.recovery_id)}</div>
        <p style="font-size:13px;color:var(--muted)">Notiere sie z. B. im Passwort-Manager oder auf Papier. Sie wird nur jetzt angezeigt. Im Profil kannst du jederzeit eine neue erzeugen, dann gilt die alte nicht mehr.</p>
        <label class="check"><input type="checkbox" id="rec-ok"> Ich habe die ID notiert</label>`,
      foot: '<button class="btn secondary" id="rec-copy">Kopieren</button><button class="btn" id="rec-done" disabled>Fertig</button>',
      onMount(modal) {
        modal.querySelector('[data-close]').remove();
        modal.parentElement.removeAttribute('data-close');
        modal.querySelector('#rec-ok').addEventListener('change', (e) => { modal.querySelector('#rec-done').disabled = !e.target.checked; });
        modal.querySelector('#rec-copy').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(res.recovery_id); toast('ID kopiert'); } catch (e) { toast('Bitte abschreiben'); }
        });
        modal.querySelector('#rec-done').addEventListener('click', () => {
          state.meta.user.needsRecoveryId = false;
          closeModal();
          if (state.meta.user.mustChangePassword) forcePasswordChange();
        });
      },
    });
  }

  function forcePasswordChange() {
    openModal({
      title: 'Neues Passwort wählen',
      body: `<p style="margin-top:0">Dein Passwort wurde vom Admin zurückgesetzt. Bitte wähle jetzt ein eigenes Passwort.</p>
        <form id="force-pw">
          <div class="field"><label>Aktuelles Passwort (Werkspasswort)</label><input class="input" type="password" name="current_password" autocomplete="current-password" required></div>
          <div class="field"><label>Neues Passwort</label><input class="input" type="password" name="new_password" minlength="8" maxlength="20" autocomplete="new-password" required><span class="hint">8 bis 20 Zeichen</span></div>
        </form>`,
      foot: '<button class="btn" id="force-pw-save">Speichern</button>',
      onMount(modal) {
        modal.querySelector('[data-close]').remove();
        modal.parentElement.removeAttribute('data-close');
        modal.querySelector('#force-pw-save').addEventListener('click', async () => {
          try {
            await api('/api/me', { method: 'PATCH', body: formData(modal.querySelector('#force-pw')) });
            state.meta.user.mustChangePassword = false;
            closeModal();
            toast('Neues Passwort gespeichert');
            route();
          } catch (err) { toast(err.message, true); }
        });
      },
    });
  }

  function askConsent() {
    openModal({
      title: 'Datenschutz: kurz bestätigen',
      body: `<p style="margin-top:0">Bevor es weitergeht, bestätige bitte die (aktualisierte) Datenschutzerklärung.</p>
        <ul style="font-size:14px;padding-left:18px">
          <li>Nicht-kommerzielles Schulprojekt, keine Werbung, kein Tracking.</li>
          <li>Deine Punkte siehst nur du, im Ranking bist du für andere anonym.</li>
          <li>Zugang nur mit HKV-Schuladresse von der Teilnehmerliste.</li>
          <li>Du kannst deine Daten jederzeit herunterladen oder dein Konto löschen.</li>
        </ul>
        <p><a href="#/datenschutz" target="_blank">Vollständige Datenschutzerklärung lesen</a></p>`,
      foot: '<button class="btn secondary" id="consent-no">Abmelden</button><button class="btn" id="consent-yes">Ich stimme zu</button>',
      onMount(modal) {
        modal.querySelector('[data-close]').remove();
        modal.parentElement.removeAttribute('data-close');
        modal.querySelector('#consent-yes').addEventListener('click', async () => {
          await api('/api/me/consent', { method: 'POST', body: { consent: true } });
          state.meta.user.needsConsent = false;
          closeModal();
          toast('Danke!');
          if (state.meta.user.needsRecoveryId) showRecoveryId(true);
          else if (state.meta.user.mustChangePassword) forcePasswordChange();
        });
        modal.querySelector('#consent-no').addEventListener('click', async () => {
          await api('/api/auth/logout', { method: 'POST' });
          state.meta = null;
          closeModal();
          go('/anmelden');
        });
      },
    });
  }

  // ---------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------
  async function viewDashboard(params) {
    loading('dashboard');
    const [d, llp] = await Promise.all([api(withYear('/api/dashboard')), api(withYear('/api/llp'))]);
    const p = d.progress;
    const year = d.year;
    const tasksRes = await api(withYear('/api/tasks'));
    const byModule = {};
    tasksRes.tasks.forEach((t) => {
      if (!t.module_code) return;
      if (!byModule[t.module_code]) byModule[t.module_code] = { total: 0, done: 0, grades: [] };
      const b = byModule[t.module_code];
      b.total += 1;
      if (t.submission) b.done += 1;
      if (t.submission && t.submission.grade) b.grades.push(t.submission.grade);
    });
    const modules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    const welcome = params.get('willkommen') ? '<div class="info-box">🎉 Willkommen im HUB-042! Dein Konto ist aktiviert.</div>' : '';
    const firstName = String(state.meta.user.display_name).split(' ')[0];

    const lessons = d.nextLessons.length ? d.nextLessons.map((l) => {
      const day = fmt.day(l.date);
      return `<div class="list-item" style="--accent:${esc(l.color || '#9aa7ad')}">
        <div class="date-badge"><div class="d">${day.getUTCDate()}</div><div class="m">${esc(fmt.date(day, { month: 'short' }))}</div></div>
        <div class="grow"><div class="title">${esc(l.module_code ? `${l.module_code} · ${l.module_name}` : l.title)}</div>
          <div class="meta">${esc(fmt.weekday(day))}${l.start_time ? ` · ${esc(l.start_time.slice(0, 5))}–${esc((l.end_time || '').slice(0, 5))}` : ''}${l.room ? ` · ${esc(l.room)}` : ''}</div></div>
      </div>`;
    }).join('') : '<div class="empty">Keine kommenden Lektionen.</div>';

    const upcoming = d.upcoming.length ? d.upcoming.map((t) => `
      <a class="list-item" href="#/aufgaben?task=${t.id}" style="--accent:${esc(t.color || '#2f7d5b')}">
        <span class="dot"></span>
        <div class="grow"><div class="title">${esc(t.module_code ? `${t.module_code} · ` : '')}${esc(t.title)}</div>
          <div class="meta">${t.due_at ? `fällig ${esc(fmt.relative(t.due_at))} · ${esc(fmt.date(t.due_at, { day: 'numeric', month: 'short' }))}` : 'ohne Frist'}${t.max_points ? ` · ${fmt.num(t.max_points)} Punkte` : ''}</div></div>
        ${t.due_at && new Date(t.due_at) < new Date() ? '<span class="tag late">überfällig</span>' : kindTag(t.kind)}
      </a>`).join('') : '<div class="empty">Alles erledigt. Stark! ✅</div>';

    const threads = d.threads.length ? d.threads.map((t) => `
      <a class="list-item" href="#/forum/${t.id}">
        <span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(t.author || 'HKV'))}</span>
        <div class="grow"><div class="title">${esc(t.title)}</div><div class="meta">${esc(t.category)} · ${t.replies} Antworten · ${esc(fmt.ago(t.last_activity_at))}</div></div>
      </a>`).join('') : '<div class="empty">Noch keine Beiträge.</div>';

    const countdown = d.nextExam ? (() => {
      const days = Math.max(0, Math.ceil((new Date(d.nextExam.due_at) - new Date()) / 86400000));
      return `<div class="countdown">
        <div class="eyebrow">Nächste Prüfung</div>
        <div class="big"><span>${days}</span> Tag${days === 1 ? '' : 'e'}</div>
        <div>${esc(d.nextExam.module_code ? `${d.nextExam.module_code} · ` : '')}${esc(d.nextExam.title)}</div>
        <div style="color:#cfe0db;font-size:13px;margin-top:4px">${esc(fmt.date(d.nextExam.due_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      </div>`;
    })() : '';

    const moduleCards = modules.map((m) => {
      const b = byModule[m.code] || { total: 0, done: 0, grades: [] };
      const avg = b.grades.length ? b.grades.reduce((s, g) => s + g, 0) / b.grades.length : null;
      const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      return `<a class="card accent" style="--accent:${esc(m.color || '#2f7d5b')};text-decoration:none;color:inherit" href="#/aufgaben?module=${encodeURIComponent(m.code)}">
        <div class="eyebrow" style="color:${esc(m.color || '#2f7d5b')}">${esc(m.code)}</div>
        <div style="font-weight:700;font-size:17px;margin:4px 0 2px">${esc(m.name)}</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px">${esc(m.dozent || '')}${m.lektionen ? ` · ${m.lektionen} Lektionen` : ''}</div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px">
          <span>${b.done}/${b.total} erledigt</span><span class="${gradeClass(avg)}" style="font-weight:700">${avg ? `Ø ${fmt.grade(avg)}` : ''}</span></div>
      </a>`;
    }).join('');

    shell('dashboard', `
      ${welcome}
      <div class="eyebrow">${esc(year ? `${year.label} · ${year.klasse}` : '')}</div>
      <h1 class="page-title">Hoi ${esc(firstName)} 👋</h1>
      <div class="grid grid-4">
        <div class="card accent stat" style="--accent:#2f7d5b"><div class="stat-ico">${icon('check')}</div>
          <div class="label">Erledigte Aufgaben</div><div class="value">${p.tasksDone}<span style="font-size:18px;color:var(--muted)">/${p.tasksTotal}</span></div></div>
        <div class="card accent stat" style="--accent:#3d6f8e"><div class="stat-ico">${icon('trend')}</div>
          <div class="label">Notenschnitt</div><div class="value ${gradeClass(p.avgGrade)}">${p.avgGrade ? fmt.grade(p.avgGrade) : '–'}</div></div>
        <div class="card accent stat" style="--accent:#b9783f"><div class="stat-ico">${icon('trophy')}</div>
          <div class="label">Rang im Schuljahr</div><div class="value">${d.rank ? `#${d.rank.rank}<span style="font-size:18px;color:var(--muted)">/${d.rank.total}</span>` : '–'}</div>
          <div class="sub">${d.rank && d.rank.betterThan !== null ? `besser als ${d.rank.betterThan}% der Klasse` : (p.avgGrade ? 'sichtbar ab 3 Personen mit Einträgen' : 'Punkte eintragen, um zu ranken')}</div></div>
        <div class="card accent stat" style="--accent:#c98a2b"><div class="stat-ico">${icon('bolt')}</div>
          <div class="label">XP gesammelt</div><div class="value">${p.xp}</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="level-head">
          <div><div class="eyebrow">Level-Fortschritt · ${esc(p.level.title)}</div><h3>Level ${p.level.level} → Level ${p.level.level + 1}</h3></div>
          <div style="font-size:13px;color:var(--muted)">noch <strong style="color:var(--text)">${p.level.needed} XP</strong></div>
        </div>
        <div class="progress"><span style="width:${p.level.progress}%"></span></div>
      </div>

      ${llp.program ? `<a class="card" href="#/noten" style="display:block;margin-top:16px;text-decoration:none;color:inherit">
        <div class="level-head"><div><div class="eyebrow">Lernleistungspunkte · ${esc(year ? year.label : '')}: ${fmt.num(llp.total.earned)}/${fmt.num(llp.total.possible)} LLP</div>
          <h3>${fmt.num(llp.program.earned)} / ${fmt.num(llp.program.max, 0)} LLP im Bildungsgang</h3></div>
          <div style="font-size:13px;color:var(--muted)">Leistungsausweis →</div></div>
        <div class="progress"><span style="width:${Math.min(100, (llp.program.earned / llp.program.max) * 100)}%"></span></div></a>` : ''}

      <div class="grid grid-3" style="margin-top:16px">
        <div class="card"><div class="card-title">Nächste Lektionen <a href="#/stundenplan">Stundenplan →</a></div><div class="list">${lessons}</div></div>
        <div class="card"><div class="card-title">Offene Aufgaben <a href="#/aufgaben">Alle →</a></div><div class="list">${upcoming}</div></div>
        <div>${countdown}
          <div class="card" style="margin-top:${countdown ? '16px' : '0'}"><div class="card-title">Neu im Forum <a href="#/forum">Forum →</a></div><div class="list">${threads}</div></div>
        </div>
      </div>

      <h2 class="section-title">Deine Fächer</h2>
      <div class="grid grid-3">${moduleCards || '<div class="empty">Für dieses Schuljahr sind noch keine Module erfasst.</div>'}</div>
    `, p);
  }

  // ---------------------------------------------------------------
  // ATL-Tracker (Aufgaben im Teams-Stil)
  // ---------------------------------------------------------------
  let taskTab = 'bevorstehend';
  async function viewTasks(params) {
    loading('aufgaben');
    const data = await api(withYear('/api/tasks'));
    const moduleFilter = params.get('module') || '';
    const manage = state.meta.user.canManage;
    const now = new Date();
    let tasks = data.tasks;
    if (moduleFilter) tasks = tasks.filter((t) => t.module_code === moduleFilter);

    const groups = {
      bevorstehend: tasks.filter((t) => t.status === 'offen'),
      ueberfaellig: tasks.filter((t) => t.status === 'überfällig'),
      erledigt: tasks.filter((t) => t.status === 'erledigt').reverse(),
    };
    const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
    const list = groups[taskTab];

    const byDay = [];
    list.forEach((t) => {
      const key = t.due_at ? zurichDayKey(t.due_at) : 'ohne';
      let group = byDay.find((g) => g.key === key);
      if (!group) { group = { key, due: t.due_at, items: [] }; byDay.push(group); }
      group.items.push(t);
    });

    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    const moduleOptions = yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === moduleFilter ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('');

    const taskCard = (t) => {
      const sub = t.submission;
      let right;
      if (sub && sub.points !== null) {
        right = `<div class="pts">${fmt.num(sub.points)}/${fmt.num(sub.max_points)} Punkte</div><div class="grade ${gradeClass(sub.grade)}">Note ${fmt.grade(sub.grade)}</div>`;
      } else if (sub) {
        right = '<span class="tag done">✓ Abgegeben</span>';
      } else {
        right = t.max_points ? `<div>${fmt.num(t.max_points)} Punkte</div>` : '';
      }
      const dueText = t.due_at
        ? (sub ? `Eingetragen ${esc(fmt.ago(sub.submitted_at))}` : `Fällig um ${esc(fmt.time(t.due_at))}`)
        : 'Ohne Frist';
      return `<button class="task-card" data-task="${t.id}" style="--accent:${esc(t.color || '#5a6b73')}">
        <span class="task-ico">${esc(t.module_code || (t.kind === 'Jahresprüfung' ? 'JP' : 'HKV'))}</span>
        <span class="task-body">
          <div class="task-title">${esc(t.module_name ? `Modul ${t.module_name}, ` : '')}${esc(t.title)}</div>
          <div class="task-meta">${dueText} ${kindTag(t.kind)} ${t.status === 'überfällig' ? '<span class="tag late">überfällig</span>' : ''}
            ${!t.counts_for_ranking ? '<span class="tag muted">zählt nicht fürs Ranking</span>' : ''}</div>
          <div class="task-meta">HFWI-2504-AA · ${t.done_count}/${data.students} erledigt</div>
        </span>
        <span class="task-points">${right}</span>
      </button>`;
    };

    const body = byDay.length ? byDay.map((g) => `
      <div class="day-group">
        <h3 class="day-label">${g.due ? `${esc(fmt.dayLabel(g.due))}<span>${esc(fmt.weekday(g.due))}</span>` : 'Ohne Frist'}</h3>
        ${g.items.map(taskCard).join('')}
      </div>`).join('') : `<div class="card empty">${{
      bevorstehend: 'Keine bevorstehenden Aufgaben. 🎉',
      ueberfaellig: 'Nichts überfällig. Weiter so!',
      erledigt: 'Noch nichts erledigt. Trage deine ersten Punkte ein.',
    }[taskTab]}</div>`;

    shell('aufgaben', `
      <div class="page-head">
        <div><div class="eyebrow">ATL-Tracker · ${esc(currentYear() ? currentYear().label : '')}</div><h1 class="page-title">Aufgaben</h1></div>
        ${manage ? `<button class="btn" id="new-task">${icon('plus', 16)} Aufgabe erstellen</button>` : ''}
      </div>
      <div class="toolbar">
        <div class="segmented" role="tablist">
          <button data-tab="bevorstehend" class="${taskTab === 'bevorstehend' ? 'active' : ''}">Bevorstehend (${counts.bevorstehend})</button>
          <button data-tab="ueberfaellig" class="${taskTab === 'ueberfaellig' ? 'active' : ''}">Überfällig (${counts.ueberfaellig})</button>
          <button data-tab="erledigt" class="${taskTab === 'erledigt' ? 'active' : ''}">Erledigt (${counts.erledigt})</button>
        </div>
        <select class="input" id="module-filter" aria-label="Modul filtern"><option value="">Alle Module</option>${moduleOptions}</select>
      </div>
      ${taskTab === 'ueberfaellig' && counts.ueberfaellig ? '<div class="info-box">Tipp: Hast du die Aufgabe schon in Teams abgegeben? Öffne sie und trage deine Punkte ein, sobald sie bewertet ist.</div>' : ''}
      ${body}
    `);

    app.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
      taskTab = btn.dataset.tab;
      viewTasks(params);
    }));
    document.getElementById('module-filter').addEventListener('change', (e) => {
      go(e.target.value ? `/aufgaben?module=${encodeURIComponent(e.target.value)}` : '/aufgaben');
    });
    app.querySelectorAll('[data-task]').forEach((el) => el.addEventListener('click', () => {
      const task = data.tasks.find((t) => t.id === parseInt(el.dataset.task, 10));
      openSubmission(task, () => viewTasks(params));
    }));
    if (manage) document.getElementById('new-task').addEventListener('click', () => openTaskEditor(null, () => viewTasks(params)));

    const deepLink = parseInt(params.get('task'), 10);
    if (deepLink) {
      const task = data.tasks.find((t) => t.id === deepLink);
      if (task) openSubmission(task, () => viewTasks(new URLSearchParams()));
    }
    void now;
  }

  function openSubmission(task, refresh) {
    const sub = task.submission;
    const fixedMax = task.max_points;
    const manage = state.meta.user.canManage;
    openModal({
      title: `${task.module_code ? `${task.module_code} · ` : ''}${task.title}`,
      body: `
        <div class="task-meta" style="margin:0 0 12px">${kindTag(task.kind)}
          ${task.due_at ? `<span>Fällig ${esc(fmt.date(task.due_at, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}</div>
        ${task.description ? `<p style="white-space:pre-wrap;margin-top:0">${esc(task.description)}</p>` : ''}
        <form id="sub-form">
          <div class="row">
            <div class="field"><label for="points">Erreichte Punkte</label>
              <input class="input" id="points" name="points" inputmode="decimal" placeholder="z. B. 45" value="${sub && sub.points !== null ? esc(sub.points) : ''}"></div>
            <div class="field"><label for="max_points">von</label>
              <input class="input" id="max_points" name="max_points" inputmode="decimal" placeholder="z. B. 60" value="${esc(fixedMax || (sub && sub.max_points) || '')}" ${fixedMax ? 'readonly' : ''}></div>
          </div>
          <div class="grade-preview" id="grade-preview">–</div>
          <div class="field"><label>Was brauche ich?</label><div class="needed" id="needed"></div></div>
          <div class="field"><label for="note">Private Notiz <span class="hint">(nur für dich)</span></label>
            <input class="input" id="note" name="note" maxlength="1000" value="${esc(sub ? sub.note || '' : '')}" placeholder="z. B. Feedback vom Dozenten"></div>
          <p class="hint" style="font-size:12px;color:var(--muted);margin:0">Leer lassen und speichern = als erledigt markieren (ohne Note). Im Ranking zählen nur Aufgaben mit Punkten, und die anderen sehen nie deinen Namen.</p>
        </form>`,
      foot: `
        ${manage ? '<button class="btn secondary" id="edit-task">Aufgabe bearbeiten</button>' : ''}
        ${sub ? '<button class="btn danger" id="del-sub">Eintrag entfernen</button>' : ''}
        <span style="flex:1"></span>
        <button class="btn secondary" data-close>Abbrechen</button>
        <button class="btn" id="save-sub">${sub ? 'Aktualisieren' : 'Speichern'}</button>`,
      onMount(modal) {
        const pts = modal.querySelector('#points');
        const max = modal.querySelector('#max_points');
        const update = () => {
          const p = parseFloat(String(pts.value).replace(',', '.'));
          const m = parseFloat(String(max.value).replace(',', '.'));
          const preview = modal.querySelector('#grade-preview');
          if (Number.isFinite(p) && Number.isFinite(m) && m > 0) {
            const g = Math.max(1, Math.min(6, Math.round(((p / m) * 5 + 1) * 10) / 10));
            preview.innerHTML = `<span class="${gradeClass(g)}">Note ${g.toFixed(1)}</span>`;
          } else {
            preview.textContent = '–';
          }
          modal.querySelector('#needed').innerHTML = Number.isFinite(m) && m > 0
            ? [4, 5, 5.5, 6].map((g) => `<div><strong>${fmt.num(Math.max(0, ((g - 1) / 5) * m))}</strong>für ${g.toFixed(1)}</div>`).join('')
            : '<div style="grid-column:1/-1">Maximalpunkte eingeben</div>';
        };
        pts.addEventListener('input', update);
        max.addEventListener('input', update);
        update();
        pts.focus();
        const save = async () => {
          try {
            const body = { points: pts.value, note: modal.querySelector('#note').value };
            if (!fixedMax) body.max_points = max.value;
            const res = await api(`/api/tasks/${task.id}/submission`, { method: 'PUT', body });
            closeModal();
            toast(res.grade ? `Gespeichert · Note ${res.grade.toFixed(1)} · +XP` : 'Als erledigt markiert · +XP');
            refresh();
          } catch (err) { toast(err.message, true); }
        };
        modal.querySelector('#save-sub').addEventListener('click', save);
        modal.querySelector('#sub-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
        const del = modal.querySelector('#del-sub');
        if (del) {
          del.addEventListener('click', async () => {
            await api(`/api/tasks/${task.id}/submission`, { method: 'DELETE' });
            closeModal();
            toast('Eintrag entfernt');
            refresh();
          });
        }
        const edit = modal.querySelector('#edit-task');
        if (edit) edit.addEventListener('click', () => openTaskEditor(task, refresh));
      },
    });
  }

  function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function openTaskEditor(task, refresh) {
    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    const t = task || {
      kind: 'ATL', counts_for_ranking: true, due_at: null, module_code: '',
    };
    openModal({
      title: task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
      body: `<form id="task-form">
        <div class="field"><label>Titel</label><input class="input" name="title" required maxlength="200" value="${esc(t.title || '')}" placeholder="z. B. ATL 2"></div>
        <div class="row">
          <div class="field"><label>Modul</label><select class="input" name="module_code"><option value="">– kein Modul –</option>
            ${yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === t.module_code ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Art</label><select class="input" name="kind">
            ${state.meta.taskKinds.map((k) => `<option ${k === t.kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div class="field"><label>Fällig am</label><input class="input" type="datetime-local" name="due_at" value="${esc(toLocalInput(t.due_at))}"></div>
          <div class="field"><label>Maximalpunkte</label><input class="input" name="max_points" inputmode="decimal" value="${esc(t.max_points || '')}" placeholder="leer = ohne Punkte"></div>
        </div>
        <div class="field"><label>Beschreibung</label><textarea class="input" name="description" maxlength="5000">${esc(t.description || '')}</textarea></div>
        <label class="check"><input type="checkbox" name="counts_for_ranking" ${t.counts_for_ranking ? 'checked' : ''}> Zählt fürs Ranking</label>
      </form>`,
      foot: `${task ? '<button class="btn danger" id="del-task">Löschen</button><span style="flex:1"></span>' : ''}
        <button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="save-task">Speichern</button>`,
      onMount(modal) {
        modal.querySelector('#save-task').addEventListener('click', async () => {
          const data = formData(modal.querySelector('#task-form'));
          data.due_at = data.due_at ? new Date(data.due_at).toISOString() : null;
          data.school_year_id = state.yearId;
          try {
            if (task) await api(`/api/tasks/${task.id}`, { method: 'PUT', body: data });
            else await api(withYear('/api/tasks'), { method: 'POST', body: data });
            closeModal();
            toast('Aufgabe gespeichert');
            refresh();
          } catch (err) { toast(err.message, true); }
        });
        const del = modal.querySelector('#del-task');
        if (del) {
          del.addEventListener('click', async () => {
            if (!window.confirm('Aufgabe inkl. aller eingetragenen Punkte löschen?')) return;
            await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
            closeModal();
            toast('Aufgabe gelöscht');
            refresh();
          });
        }
      },
    });
  }

  // ---------------------------------------------------------------
  // Noten (Schweizer Notenrechner: Note = Punkte × 5 / Max + 1)
  // ---------------------------------------------------------------
  let gradeStep = 0.1;
  function swissGrade(points, max, step = gradeStep) {
    if (!Number.isFinite(points) || !Number.isFinite(max) || max <= 0) return null;
    const raw = Math.max(1, Math.min(6, (points * 5) / max + 1));
    return Math.round(raw / step) * step;
  }
  function showGrade(g) {
    if (g === null || g === undefined) return '–';
    return gradeStep === 0.25 ? g.toFixed(2) : g.toFixed(1);
  }
  function parseNum(v) { return parseFloat(String(v).replace(',', '.')); }

  function llpCard(llp) {
    if (!llp || !llp.modules) return '';
    const name = (code) => (code === 'JP' ? 'Jahresprüfung' : ((moduleById(code) || {}).name || code));
    const remark = (r) => {
      if (r.grade !== null) return r.grade >= 4 ? '<span class="tag done">Bestanden</span>' : '<span class="tag late">ungenügend</span>';
      if (r.gradeSoFar !== null) return `<span class="tag muted">Zwischenstand ${fmt.grade(r.gradeSoFar)}</span>`;
      return '<span class="tag muted">offen</span>';
    };
    const rows = llp.modules.map((r) => `<tr>
        <td><strong>${esc(name(r.code))}</strong><br><span style="font-size:12px;color:var(--muted)">Präsenz ${fmt.num(r.presence.earned)}/${fmt.num(r.presence.possible)} · Aufgaben ${fmt.num(r.tasks.earned)}/${fmt.num(r.tasks.possible)}${r.tasks.open ? ` · ${r.tasks.open} offen` : ''}</span></td>
        <td style="text-align:right">${fmt.num(r.possible)}</td>
        <td style="text-align:right;font-weight:700">${fmt.num(r.earned)}</td>
        <td class="${gradeClass(r.grade !== null ? r.grade : r.gradeSoFar)}" style="text-align:center;font-weight:800">${fmt.grade(r.grade !== null ? r.grade : r.gradeSoFar)}</td>
        <td>${remark(r)}</td></tr>`).join('');
    const prog = llp.program;
    const pct = Math.min(100, Math.round((prog.earned / prog.max) * 100));
    return `<div class="card">
      <div class="level-head"><div><div class="eyebrow">Bildungsgang Dipl. Wirtschaftsinformatiker*in HF</div>
        <h3>${fmt.num(prog.earned)} von ${fmt.num(prog.max, 0)} LLP</h3></div>
        <div style="font-size:13px;color:var(--muted)">${prog.years.map((y) => `${esc(y.label)}: <strong style="color:var(--text)">${fmt.num(y.earned)}</strong>/${fmt.num(y.possible)}`).join(' · ')}</div></div>
      <div class="progress" style="height:12px"><span style="width:${pct}%"></span></div>
      <div class="table-wrap" style="margin-top:18px"><table class="table">
        <thead><tr><th>Modul</th><th style="text-align:right">LLP möglich</th><th style="text-align:right">LLP erreicht</th><th style="text-align:center">Note</th><th>Bemerkung</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="empty">Noch keine Daten.</td></tr>'}
          <tr style="background:#f5f8f7"><td><strong>Promotion</strong></td><td style="text-align:right"><strong>${fmt.num(llp.total.possible)}</strong></td>
            <td style="text-align:right"><strong>${fmt.num(llp.total.earned)}</strong></td><td colspan="2">${llp.total.percent !== null ? `${llp.total.percent}% der Gesamtleistungspunkte` : ''}</td></tr>
        </tbody></table></div>
      <p style="font-size:12px;color:var(--muted);margin:10px 0 0">LLP möglich = Präsenz (0.5 LLP pro Lektion, über Check-in im Stundenplan) + Maximalpunkte der ATL und Mastery Tests.
        Note = erreicht ÷ möglich × 5 + 1. Ohne Gewähr: massgebend ist der offizielle Leistungsausweis der HKV.</p>
    </div>`;
  }

  async function viewGrades(params) {
    loading('noten');
    const [data, llp] = await Promise.all([api(withYear('/api/tasks')), api(withYear('/api/llp'))]);
    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    const selected = params.get('module') || '';

    const graded = (t) => t.submission && t.submission.points !== null && t.submission.max_points;
    const summary = yearModules.map((m) => {
      const tasks = data.tasks.filter((t) => t.module_code === m.code);
      const done = tasks.filter(graded);
      const grades = done.map((t) => swissGrade(t.submission.points, t.submission.max_points));
      const pts = done.reduce((sum, t) => sum + t.submission.points, 0);
      const max = done.reduce((sum, t) => sum + t.submission.max_points, 0);
      return {
        m,
        tasks,
        done,
        avg: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null,
        total: max ? swissGrade(pts, max) : null,
        pts,
        max,
      };
    });
    const withGrade = summary.filter((r) => r.avg !== null);
    const yearAvg = withGrade.length ? withGrade.reduce((a, r) => a + r.avg, 0) / withGrade.length : null;
    const allGrades = data.tasks.filter(graded).map((t) => swissGrade(t.submission.points, t.submission.max_points));
    const insufficient = withGrade.filter((r) => r.avg < 4).length;

    const moduleOptions = yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === selected ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('');
    const calcTasks = data.tasks.filter((t) => !selected || t.module_code === selected).filter((t) => t.max_points || (t.submission && t.submission.max_points));

    const table = summary.map((r) => `
      <tr data-module-row="${esc(r.m.code)}" style="cursor:pointer">
        <td><span class="dot" style="--accent:${esc(r.m.color || '#2f7d5b')};display:inline-block;margin-right:8px"></span><strong>${esc(r.m.code)}</strong> ${esc(r.m.name)}</td>
        <td>${r.done.length}/${r.tasks.length}</td>
        <td>${r.max ? `${fmt.num(r.pts)}/${fmt.num(r.max)}` : '–'}</td>
        <td class="${gradeClass(r.total)}" style="font-weight:700">${showGrade(r.total)}</td>
        <td class="${gradeClass(r.avg)}" style="font-weight:800;font-size:16px">${showGrade(r.avg === null ? null : Math.round(r.avg / gradeStep) * gradeStep)}</td>
      </tr>`).join('');

    const detail = selected ? (() => {
      const r = summary.find((x) => x.m.code === selected);
      if (!r) return '';
      return `<div class="card" style="margin-top:16px"><div class="card-title">${esc(r.m.code)} · ${esc(r.m.name)}
          <span class="${gradeClass(r.avg)}" style="font-size:15px">Ø ${showGrade(r.avg === null ? null : Math.round(r.avg / gradeStep) * gradeStep)}</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Aufgabe</th><th>Fällig</th><th>Punkte</th><th>Note</th><th></th></tr></thead><tbody>
        ${r.tasks.map((t) => {
          const g = graded(t) ? swissGrade(t.submission.points, t.submission.max_points) : null;
          return `<tr><td>${esc(t.title)} ${kindTag(t.kind)}</td>
            <td style="white-space:nowrap">${t.due_at ? esc(fmt.date(t.due_at, { day: 'numeric', month: 'short', year: 'numeric' })) : '–'}</td>
            <td>${graded(t) ? `${fmt.num(t.submission.points)}/${fmt.num(t.submission.max_points)}` : (t.max_points ? `–/${fmt.num(t.max_points)}` : '–')}</td>
            <td class="${gradeClass(g)}" style="font-weight:700">${showGrade(g)}</td>
            <td><button class="btn ghost small" data-open-task="${t.id}">${graded(t) ? 'Ändern' : 'Eintragen'}</button></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="empty">Keine Aufgaben in diesem Modul.</td></tr>'}
        </tbody></table></div></div>`;
    })() : '';

    shell('noten', `
      <div class="page-head">
        <div><div class="eyebrow">Notenrechner · ${esc(currentYear() ? currentYear().label : '')}</div><h1 class="page-title">Noten</h1></div>
        <div class="segmented" title="Rundung">
          ${[0.1, 0.25, 0.5].map((st) => `<button data-step="${st}" class="${st === gradeStep ? 'active' : ''}">auf ${String(st).replace('.', ',')}</button>`).join('')}
        </div>
      </div>

      <div class="grid grid-4">
        <div class="card accent stat" style="--accent:#2f7d5b"><div class="label">Jahresschnitt</div><div class="value ${gradeClass(yearAvg)}">${showGrade(yearAvg === null ? null : Math.round(yearAvg / gradeStep) * gradeStep)}</div><div class="sub">Ø der Modulnoten</div></div>
        <div class="card accent stat" style="--accent:#3d6f8e"><div class="label">Bewertete Aufgaben</div><div class="value">${allGrades.length}</div><div class="sub">in ${withGrade.length} Modulen</div></div>
        <div class="card accent stat" style="--accent:#d4a62a"><div class="label">Beste Note</div><div class="value grade-good">${allGrades.length ? showGrade(Math.max(...allGrades)) : '–'}</div></div>
        <div class="card accent stat" style="--accent:#c0504d"><div class="label">Module unter 4.0</div><div class="value ${insufficient ? 'grade-bad' : ''}">${insufficient}</div></div>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-title">Note berechnen</div>
          <form id="calc">
            <div class="field"><label for="calc-module">Modul</label>
              <select class="input" id="calc-module"><option value="">Alle Module</option>${moduleOptions}</select></div>
            <div class="field"><label for="calc-task">Aufgabe</label>
              <select class="input" id="calc-task"><option value="">Freie Berechnung (eigenes Maximum)</option>
                ${calcTasks.map((t) => `<option value="${t.id}">${esc(t.module_code ? `${t.module_code} · ` : '')}${esc(t.title)} (max. ${fmt.num(t.max_points || t.submission.max_points)})</option>`).join('')}</select></div>
            <div class="row">
              <div class="field"><label for="calc-points">Erreichte Punkte</label><input class="input" id="calc-points" inputmode="decimal" placeholder="z. B. 45"></div>
              <div class="field"><label for="calc-max">Maximale Punkte</label><input class="input" id="calc-max" inputmode="decimal" placeholder="z. B. 60"></div>
            </div>
            <div class="grade-preview" id="calc-result">–</div>
            <div class="needed" id="calc-needed"></div>
            <p style="font-size:12px;color:var(--muted)">Formel: Note = Punkte × 5 / Maximum + 1, gerundet auf ${String(gradeStep).replace('.', ',')}.</p>
            <button class="btn" id="calc-save" type="submit" disabled>Punkte für diese Aufgabe speichern</button>
          </form>
        </div>
        <div class="card"><div class="card-title">Notenskala</div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Note</th><th>Bedeutung</th><th>Anteil der Punkte</th></tr></thead><tbody>
            ${[[6, 'sehr gut', 100], [5.5, 'gut bis sehr gut', 90], [5, 'gut', 80], [4.5, 'befriedigend', 70], [4, 'genügend', 60], [3.5, 'ungenügend', 50], [3, 'schwach', 40]]
    .map(([g, label, pct]) => `<tr><td class="${gradeClass(g)}" style="font-weight:700">${g.toFixed(1)}</td><td>${label}</td><td>${pct}%</td></tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>

      <h2 class="section-title">Leistungsausweis ${esc(currentYear() ? currentYear().label : '')}</h2>
      ${llpCard(llp)}

      <h2 class="section-title">Noten pro Aufgabe &amp; Modul</h2>
      <div class="card" style="padding:8px 12px"><div class="table-wrap"><table class="table">
        <thead><tr><th>Modul</th><th>Bewertet</th><th>Punkte gesamt</th><th>Note aus Gesamtpunkten</th><th>Ø Note</th></tr></thead>
        <tbody>${table || '<tr><td colspan="5" class="empty">Keine Module in diesem Schuljahr.</td></tr>'}</tbody></table></div></div>
      ${detail}
    `);

    app.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { gradeStep = parseFloat(b.dataset.step); viewGrades(params); }));
    app.querySelectorAll('[data-module-row]').forEach((row) => row.addEventListener('click', () => go(`/noten?module=${encodeURIComponent(row.dataset.moduleRow)}`)));
    app.querySelectorAll('[data-open-task]').forEach((b) => b.addEventListener('click', () => {
      openSubmission(data.tasks.find((t) => t.id === parseInt(b.dataset.openTask, 10)), () => viewGrades(params));
    }));

    const modSel = document.getElementById('calc-module');
    const taskSel = document.getElementById('calc-task');
    const ptsIn = document.getElementById('calc-points');
    const maxIn = document.getElementById('calc-max');
    const saveBtn = document.getElementById('calc-save');
    modSel.addEventListener('change', () => go(modSel.value ? `/noten?module=${encodeURIComponent(modSel.value)}` : '/noten'));
    const recalc = () => {
      const p = parseNum(ptsIn.value);
      const m = parseNum(maxIn.value);
      const g = swissGrade(p, m);
      const over = Number.isFinite(p) && Number.isFinite(m) && p > m;
      document.getElementById('calc-result').innerHTML = over
        ? '<span class="grade-bad" style="font-size:16px">Mehr Punkte als das Maximum</span>'
        : (g === null ? '–' : `<span class="${gradeClass(g)}">Note ${showGrade(g)}</span>`);
      document.getElementById('calc-needed').innerHTML = Number.isFinite(m) && m > 0
        ? [4, 5, 5.5, 6].map((target) => `<div><strong>${fmt.num(((target - 1) / 5) * m)}</strong>für ${target.toFixed(1)}</div>`).join('')
        : '';
      saveBtn.disabled = !taskSel.value || g === null || over;
    };
    taskSel.addEventListener('change', () => {
      const t = data.tasks.find((x) => x.id === parseInt(taskSel.value, 10));
      if (t) {
        maxIn.value = t.max_points || t.submission.max_points;
        maxIn.readOnly = Boolean(t.max_points);
        ptsIn.value = t.submission && t.submission.points !== null ? t.submission.points : '';
        ptsIn.focus();
      } else {
        maxIn.readOnly = false;
      }
      recalc();
    });
    ptsIn.addEventListener('input', recalc);
    maxIn.addEventListener('input', recalc);
    document.getElementById('calc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = data.tasks.find((x) => x.id === parseInt(taskSel.value, 10));
      if (!t) return;
      try {
        const body = { points: ptsIn.value, note: t.submission ? t.submission.note || '' : '' };
        if (!t.max_points) body.max_points = maxIn.value;
        await api(`/api/tasks/${t.id}/submission`, { method: 'PUT', body });
        toast('Punkte gespeichert · +XP');
        viewGrades(params);
      } catch (err) { toast(err.message, true); }
    });
  }

  // ---------------------------------------------------------------
  // Stundenplan
  // ---------------------------------------------------------------
  let showPast = false;
  async function viewSchedule(params) {
    loading('stundenplan');
    const data = await api(withYear('/api/schedule'));
    const moduleFilter = params.get('module') || '';
    const today = zurichDayKey(new Date());
    const manage = state.meta.user.canManage;

    const items = [
      ...data.lessons.map((l) => ({ type: 'lesson', date: l.date, sort: `${l.date} ${l.start_time || '00:00'}`, l })),
      ...data.deadlines.map((t) => ({ type: 'deadline', date: zurichDayKey(t.due_at), sort: `${zurichDayKey(t.due_at)} ${fmt.time(t.due_at)}`, t })),
      ...(moduleFilter ? [] : data.holidays.map((h) => ({ type: 'holiday', date: h.end, sort: `${h.start} 00:00`, h }))),
    ].filter((it) => it.type === 'holiday' || !moduleFilter || (it.l ? it.l.module_code : it.t.module_code) === moduleFilter)
      .filter((it) => showPast || it.date >= today)
      .sort((a, b) => a.sort.localeCompare(b.sort));

    const presence = data.lessons.filter((l) => l.module_code && l.date <= today).reduce((acc, l) => {
      const sum = acc;
      sum.possible += (l.lektionen || 0) * 0.5;
      if (l.attended) sum.earned += (l.lektionen || 0) * 0.5;
      return sum;
    }, { possible: 0, earned: 0 });

    const lektionen = data.lessons
      .filter((l) => !moduleFilter || l.module_code === moduleFilter)
      .reduce((acc, l) => {
        const sum = acc;
        if (l.date < today) sum.past += l.lektionen || 0;
        sum.total += l.lektionen || 0;
        return sum;
      }, { past: 0, total: 0 });

    let lastMonth = '';
    const rows = items.map((it) => {
      const day = fmt.day(it.type === 'holiday' ? it.h.start : it.date);
      const month = fmt.date(day, { month: 'long', year: 'numeric' });
      const head = month !== lastMonth ? `<div class="month-title">${esc(month)}</div>` : '';
      lastMonth = month;
      const cls = `${it.date < today ? 'past' : ''} ${it.date === today ? 'today' : ''}`;
      const when = `<div class="when">${esc(fmt.date(day, { day: 'numeric', month: 'short' }))}<small>${esc(fmt.date(day, { weekday: 'short' }))}</small></div>`;
      if (it.type === 'holiday') {
        const h = it.h;
        const single = h.start === h.end;
        return `${head}<div class="lesson holiday ${cls}">
          ${when}<div class="time">${single ? 'ganztägig' : `bis ${esc(fmt.date(fmt.day(h.end), { day: 'numeric', month: 'short' }))}`}</div>
          <div class="what"><strong>🌴 ${esc(h.name)}</strong><span>${single ? 'unterrichtsfrei' : 'Ferien HKV Aarau'}</span></div><div class="side"></div></div>`;
      }
      if (it.type === 'deadline') {
        const t = it.t;
        return `${head}<a class="lesson deadline ${cls}" href="#/aufgaben?task=${t.id}" style="--accent:${esc(t.color || '#c98a2b')};text-decoration:none;color:inherit">
          ${when}<div class="time">⏰ ${esc(fmt.time(t.due_at))}</div>
          <div class="what"><strong>${esc(t.module_code ? `${t.module_code} · ` : '')}${esc(t.title)}</strong><span>Frist</span></div>
          <div class="side">${kindTag(t.kind)}</div></a>`;
      }
      const l = it.l;
      const title = l.module_code ? `${l.module_code} · ${l.module_name || ''}` : (l.title || 'Lektion');
      return `${head}<div class="lesson ${cls}" style="--accent:${esc(l.color || '#c7d2cd')}" ${manage ? `data-lesson="${l.id}"` : ''}>
        ${when}<div class="time">${l.start_time ? `${esc(l.start_time)}–${esc(l.end_time || '')}` : 'ganztägig'}</div>
        <div class="what"><strong>${esc(title)}</strong><span>${esc([l.dozent, l.room ? `${l.room}${roomHint(l.room) ? ` (${roomHint(l.room)})` : ''}` : null, l.note && l.note !== l.room ? l.note : null].filter(Boolean).join(' · '))}</span></div>
        <div class="side">${l.module_code && it.date <= today ? `<button class="btn small ${l.attended ? '' : 'secondary'}" data-checkin="${l.id}" title="Präsenz: ${(l.lektionen || 0) * 0.5} LLP">${l.attended ? '✓ anwesend' : 'Check-in'}</button> ` : ''}${l.lektionen ? `<span class="tag muted">${l.lektionen} Lekt. · ${(l.lektionen * 0.5).toLocaleString('de-CH')} LLP</span>` : ''}${manage ? ' <button class="btn ghost small" data-edit-lesson="' + l.id + '">Bearbeiten</button>' : ''}</div>
      </div>`;
    }).join('');

    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    shell('stundenplan', `
      <div class="page-head">
        <div><div class="eyebrow">${esc(data.year ? `${data.year.label} · Zimmer Mittwoch 126` : '')}</div><h1 class="page-title">Stundenplan</h1></div>
        <div class="row">
          <button class="btn secondary" id="ics">${icon('calendar', 16)} Kalender abonnieren</button>
          ${manage ? `<button class="btn secondary" id="import">Excel-Zeilen importieren</button><button class="btn" id="new-lesson">${icon('plus', 16)} Lektion</button>` : ''}
        </div>
      </div>
      <div class="toolbar">
        <select class="input" id="module-filter"><option value="">Alle Module</option>
          ${yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === moduleFilter ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('')}</select>
        <label class="check" style="margin:0"><input type="checkbox" id="past" ${showPast ? 'checked' : ''}> Vergangene anzeigen</label>
        <span style="flex:1"></span>
        <span class="tag muted">${lektionen.past}/${lektionen.total} Lektionen absolviert</span>
        <span class="tag done">Präsenz ${fmt.num(presence.earned)}/${fmt.num(presence.possible)} LLP</span>
        <button class="btn secondary small" id="bulk-checkin">Alle vergangenen bestätigen</button>
      </div>
      <details class="card" style="margin-bottom:16px;padding:14px 18px"><summary style="cursor:pointer;font-weight:700;color:var(--petrol)">📍 ${esc(data.campus.name)}: Anfahrt &amp; Zimmerplan</summary>
        <div class="grid grid-2" style="margin-top:12px;font-size:14px">
          <div><strong>${esc(data.campus.address)}</strong><br>${esc(data.campus.hint)}<br><br>
            <strong>Parkhäuser:</strong> ${esc(data.campus.parking.join(', '))}<br><strong>Zweiräder:</strong> ${esc(data.campus.bikes)}<br><br>${esc(data.campus.contact)}</div>
          <div><strong>Zimmer finden</strong><ul style="padding-left:18px;margin:6px 0">
            <li>1xx = 1. Stock, 2xx = 2. Stock, 3xx = 3. Stock (Dachstock), Exx = Erdgeschoss, Uxx = Untergeschoss</li>
            <li>Zimmer 226 bis 341: Treppe West · Zimmer 211 bis 222: Treppe Ost</li>
            <li>Aula: 2. Stock (224) · Sekretariat Weiterbildung beim Eingang Ost</li>
            <li>Unser Mittwochszimmer: <strong>126</strong> (1. Stock, Westseite)</li></ul></div>
        </div></details>
      ${rows || '<div class="card empty">Keine Einträge in diesem Zeitraum.</div>'}
    `);

    document.getElementById('module-filter').addEventListener('change', (e) => {
      go(e.target.value ? `/stundenplan?module=${encodeURIComponent(e.target.value)}` : '/stundenplan');
    });
    document.getElementById('past').addEventListener('change', (e) => { showPast = e.target.checked; viewSchedule(params); });
    app.querySelectorAll('[data-checkin]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/lessons/${btn.dataset.checkin}/checkin`, { method: 'POST' });
        toast(res.attended ? 'Check-in gespeichert' : 'Check-in entfernt');
        viewSchedule(params);
      } catch (err) { toast(err.message, true); }
    }));
    document.getElementById('bulk-checkin').addEventListener('click', async () => {
      if (!window.confirm('Alle vergangenen Lektionen dieses Schuljahres als anwesend markieren? Absenzen kannst du danach einzeln entfernen.')) return;
      const res = await api(withYear('/api/attendance/bulk'), { method: 'POST', body: { school_year_id: state.yearId } });
      toast(`${res.added} Lektionen bestätigt`);
      viewSchedule(params);
    });
    document.getElementById('ics').addEventListener('click', () => openModal({
      title: 'Kalender abonnieren',
      body: `<p>Füge diese Adresse in Outlook (Kalender hinzufügen → Aus dem Internet), Google oder Apple Kalender ein. Lektionen und Fristen werden automatisch aktualisiert.</p>
        <input class="input" readonly value="${esc(data.calendarUrl)}" id="ics-url">
        <p class="hint" style="font-size:12px;color:var(--muted)">Der Link ist persönlich. Im Profil kannst du ihn jederzeit neu erzeugen.</p>`,
      foot: '<button class="btn" id="copy-ics">Link kopieren</button>',
      onMount(modal) {
        modal.querySelector('#copy-ics').addEventListener('click', async () => {
          const input = modal.querySelector('#ics-url');
          input.select();
          try { await navigator.clipboard.writeText(input.value); toast('Link kopiert'); } catch (e) { document.execCommand('copy'); }
        });
      },
    }));
    if (manage) {
      document.getElementById('new-lesson').addEventListener('click', () => openLessonEditor(null, () => viewSchedule(params)));
      document.getElementById('import').addEventListener('click', () => openLessonImport(() => viewSchedule(params)));
      app.querySelectorAll('[data-edit-lesson]').forEach((btn) => btn.addEventListener('click', () => {
        const lesson = data.lessons.find((l) => l.id === parseInt(btn.dataset.editLesson, 10));
        openLessonEditor(lesson, () => viewSchedule(params));
      }));
    }
  }

  function openLessonEditor(lesson, refresh) {
    const l = lesson || {};
    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    openModal({
      title: lesson ? 'Lektion bearbeiten' : 'Neue Lektion',
      body: `<form id="lesson-form">
        <div class="row">
          <div class="field"><label>Datum</label><input class="input" type="date" name="date" required value="${esc(l.date || '')}"></div>
          <div class="field"><label>Beginn</label><input class="input" type="time" name="start_time" value="${esc(l.start_time || '13:00')}"></div>
          <div class="field"><label>Ende</label><input class="input" type="time" name="end_time" value="${esc(l.end_time || '16:10')}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Modul</label><select class="input" name="module_code"><option value="">– anderes –</option>
            ${yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === l.module_code ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Titel (falls kein Modul)</label><input class="input" name="title" value="${esc(l.title || '')}" placeholder="z. B. Jahresprüfung"></div>
        </div>
        <div class="row">
          <div class="field"><label>Lektionen</label><input class="input" name="lektionen" inputmode="numeric" value="${esc(l.lektionen || 4)}"></div>
          <div class="field"><label>Dozent*in</label><input class="input" name="dozent" value="${esc(l.dozent || '')}"></div>
          <div class="field"><label>Raum</label><input class="input" name="room" value="${esc(l.room || '')}" placeholder="Zimmer 126"></div>
        </div>
        <div class="field"><label>Bemerkung</label><input class="input" name="note" value="${esc(l.note || '')}"></div>
      </form>`,
      foot: `${lesson ? '<button class="btn danger" id="del-lesson">Löschen</button><span style="flex:1"></span>' : ''}
        <button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="save-lesson">Speichern</button>`,
      onMount(modal) {
        modal.querySelector('#save-lesson').addEventListener('click', async () => {
          const data = formData(modal.querySelector('#lesson-form'));
          try {
            if (lesson) await api(`/api/lessons/${lesson.id}`, { method: 'PUT', body: data });
            else await api(withYear('/api/lessons'), { method: 'POST', body: data });
            closeModal();
            toast('Gespeichert');
            refresh();
          } catch (err) { toast(err.message, true); }
        });
        const del = modal.querySelector('#del-lesson');
        if (del) {
          del.addEventListener('click', async () => {
            await api(`/api/lessons/${lesson.id}`, { method: 'DELETE' });
            closeModal();
            refresh();
          });
        }
      },
    });
  }

  function openLessonImport(refresh) {
    openModal({
      title: 'Stundenplan importieren',
      body: `<p>Markiere im Excel-Stundenplan die Spalten <strong>Datum bis Bemerkungen (A–G)</strong>, kopiere sie und füge sie hier ein.</p>
        <textarea class="input" id="import-text" style="min-height:200px" placeholder="26.08.2026	13:00	16:10	4	APPL	Dozent*in	"></textarea>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="replace"> Bestehende Lektionen dieses Schuljahres ersetzen</label>`,
      foot: '<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="do-import">Importieren</button>',
      onMount(modal) {
        modal.querySelector('#do-import').addEventListener('click', async () => {
          try {
            const res = await api(withYear('/api/lessons/import'), {
              method: 'POST',
              body: { text: modal.querySelector('#import-text').value, replace: modal.querySelector('#replace').checked },
            });
            closeModal();
            toast(`${res.imported} Lektionen importiert${res.errors.length ? `, ${res.errors.length} Zeilen übersprungen` : ''}`);
            refresh();
          } catch (err) { toast(err.message, true); }
        });
      },
    });
  }

  // ---------------------------------------------------------------
  // Ranking (anonym)
  // ---------------------------------------------------------------
  let rankMode = 'noten';
  async function viewRanking(params) {
    loading('ranking');
    const moduleFilter = params.get('module') || '';
    const data = await api(withYear(`/api/ranking?mode=${rankMode}${moduleFilter ? `&module=${encodeURIComponent(moduleFilter)}` : ''}`));
    const isXp = data.mode === 'xp';
    const score = (r) => (isXp ? `${r.xp} XP` : `Ø ${fmt.grade(r.avgGrade)} · ${fmt.num(r.avgPercent)}%`);
    const medals = ['🥇', '🥈', '🥉'];

    const top = [1, 0, 2].map((idx) => {
      const r = data.ranking[idx];
      if (!r) return '<div></div>';
      const place = r.rank;
      return `<div class="podium-place p${Math.min(place, 3)} ${r.isMe ? 'me' : 'anon'}">
        <div class="medal">${medals[Math.min(place, 3) - 1]}</div>
        <div class="who">${r.isMe ? `⭐ ${esc(r.name)}` : `${icon('lock', 14)} Anonym`}</div>
        <div class="score">${esc(score(r))}</div>
        <div class="block">${place}</div>
      </div>`;
    }).join('');

    const rows = data.ranking.map((r) => `
      <div class="rank-row ${r.isMe ? 'me' : ''}">
        <div class="r">#${r.rank}</div>
        <div>${r.isMe ? `⭐ ${esc(r.name)} <span class="tag done">Du</span>` : `<span class="anon">${icon('lock', 14)} Anonym</span>`}</div>
        <div class="${isXp ? '' : gradeClass(r.avgGrade)}" style="font-weight:700">${isXp ? `${r.xp} XP` : fmt.grade(r.avgGrade)}</div>
        <div style="font-size:13px;color:var(--muted)">${isXp ? '' : `${fmt.num(r.avgPercent)}% · ${r.count} Noten`}</div>
      </div>`).join('');

    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    const meLine = data.me
      ? `Du bist auf <strong>Platz ${data.me.rank}</strong> von ${data.total}${data.betterThan !== null && data.betterThan !== undefined ? ` und damit besser als ${data.betterThan}% der Klasse` : ''}.`
      : (state.meta.user.role === 'student' ? 'Trag im ATL-Tracker deine Punkte ein, dann erscheinst du im Ranking.' : 'Dozierende und Admins ohne Studierenden-Rolle erscheinen nicht im Ranking.');

    shell('ranking', `
      <div class="page-head">
        <div><div class="eyebrow">Ranking · ${esc(data.year ? data.year.label : '')}</div><h1 class="page-title">Podest</h1></div>
        <div class="segmented">
          <button data-mode="noten" class="${!isXp ? 'active' : ''}">Notenschnitt</button>
          <button data-mode="xp" class="${isXp ? 'active' : ''}">XP / Aktivität</button>
        </div>
      </div>
      ${!isXp ? `<div class="toolbar"><select class="input" id="module-filter"><option value="">Alle Module</option>
        ${yearModules.map((m) => `<option value="${esc(m.code)}" ${m.code === moduleFilter ? 'selected' : ''}>${esc(m.code)} · ${esc(m.name)}</option>`).join('')}</select>
        ${data.classAvg ? `<span class="tag muted">Klassenschnitt ${fmt.grade(data.classAvg)}</span>` : ''}</div>` : ''}
      <div class="info-box">${icon('lock', 14)} ${meLine} Namen der anderen sind immer verborgen, nur du siehst dich selbst.</div>
      ${data.hidden ? `<div class="card empty">🔒 Erst ab ${data.minGroup} Personen mit Einträgen werden andere (anonym) angezeigt. Sonst könnte man auf einzelne Noten zurückschliessen.</div>` : ''}
      ${data.hidden ? '' : (data.ranking.length ? `<div class="podium">${top}</div><div class="card" style="padding:6px">${rows}</div>` : '<div class="card empty">Noch keine Einträge für dieses Schuljahr.</div>')}
    `);

    app.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
      rankMode = btn.dataset.mode;
      viewRanking(params);
    }));
    const mf = document.getElementById('module-filter');
    if (mf) mf.addEventListener('change', (e) => go(e.target.value ? `/ranking?module=${encodeURIComponent(e.target.value)}` : '/ranking'));
  }

  // ---------------------------------------------------------------
  // Forum
  // ---------------------------------------------------------------
  async function viewForum(params) {
    loading('forum');
    const category = params.get('kategorie') || '';
    const q = params.get('q') || '';
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (q) qs.set('q', q);
    const data = await api(`/api/forum?${qs.toString()}`);

    const threads = data.threads.map((t) => {
      const mod = t.module_code ? moduleById(t.module_code) : null;
      return `<a class="thread" href="#/forum/${t.id}">
        <span class="avatar">${esc(initials(t.author || 'HKV'))}</span>
        <div style="flex:1;min-width:0">
          <div class="t-title">${t.pinned ? '📌 ' : ''}${esc(t.title)}</div>
          <div class="t-ex">${esc(t.excerpt)}</div>
          <div class="t-meta">
            <span class="tag muted">${esc(t.category)}</span>
            ${mod ? `<span class="tag" style="background:${esc(mod.color)}22;color:${esc(mod.color)}">${esc(mod.code)}</span>` : ''}
            ${t.solved ? '<span class="tag done">✓ gelöst</span>' : ''}
            <span>${esc(t.author || 'HUB-042')}${t.author_role === 'dozent' ? ' (Dozent)' : ''}</span>
            <span>${esc(fmt.ago(t.last_activity_at))}</span>
          </div>
        </div>
        <div class="counts"><strong>${t.replies}</strong>Antw.<br><strong style="margin-top:4px">${t.likes}</strong>💚</div>
      </a>`;
    }).join('');

    shell('forum', `
      <div class="page-head">
        <div><div class="eyebrow">Diskussionen &amp; Wissenswertes</div><h1 class="page-title">Forum</h1></div>
        <button class="btn" id="new-thread">${icon('plus', 16)} Neuer Beitrag</button>
      </div>
      <div class="toolbar">
        <div class="segmented">
          <button data-cat="" class="${!category ? 'active' : ''}">Alle</button>
          ${data.categories.map((c) => `<button data-cat="${esc(c)}" class="${c === category ? 'active' : ''}">${esc(c)}</button>`).join('')}
        </div>
        <form id="search" style="display:flex;gap:6px"><input class="input" name="q" placeholder="Suchen …" value="${esc(q)}"></form>
      </div>
      ${threads || '<div class="card empty">Noch keine Beiträge in dieser Kategorie. Mach den Anfang!</div>'}
    `);

    const nav = (cat, query) => {
      const p = new URLSearchParams();
      if (cat) p.set('kategorie', cat);
      if (query) p.set('q', query);
      go(`/forum${p.toString() ? `?${p}` : ''}`);
    };
    app.querySelectorAll('[data-cat]').forEach((btn) => btn.addEventListener('click', () => nav(btn.dataset.cat, q)));
    document.getElementById('search').addEventListener('submit', (e) => { e.preventDefault(); nav(category, e.target.q.value.trim()); });
    document.getElementById('new-thread').addEventListener('click', () => openThreadEditor(category));
  }

  function openThreadEditor(category) {
    const yearModules = state.meta.modules.filter((m) => m.school_year_id === state.yearId);
    openModal({
      title: 'Neuer Beitrag',
      body: `<form id="thread-form">
        <div class="field"><label>Titel</label><input class="input" name="title" required maxlength="200"></div>
        <div class="row">
          <div class="field"><label>Kategorie</label><select class="input" name="category">
            ${state.meta.forumCategories.map((c) => `<option ${c === (category || 'Fragen') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Modul <span class="hint">(optional)</span></label><select class="input" name="module_code"><option value="">–</option>
            ${yearModules.map((m) => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Text</label><textarea class="input" name="body" required maxlength="10000" style="min-height:160px" placeholder="Frage, Zusammenfassung, Link-Tipp …"></textarea></div>
      </form>`,
      foot: '<button class="btn secondary" data-close>Abbrechen</button><button class="btn" id="post-thread">Veröffentlichen</button>',
      onMount(modal) {
        modal.querySelector('#post-thread').addEventListener('click', async () => {
          try {
            const res = await api(withYear('/api/forum'), { method: 'POST', body: formData(modal.querySelector('#thread-form')) });
            closeModal();
            toast('Beitrag veröffentlicht · +10 XP');
            go(`/forum/${res.id}`);
          } catch (err) { toast(err.message, true); }
        });
      },
    });
  }

  async function viewThread(id) {
    loading('forum');
    const data = await api(`/api/forum/${id}`);
    const t = data.thread;
    const posts = data.posts.map((p) => `
      <div class="post">
        <div class="post-head"><span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(p.author || '?'))}</span>
          <strong>${esc(p.author || 'Gelöschtes Konto')}</strong>${p.author_role === 'dozent' ? ' <span class="tag">Dozent</span>' : ''}
          <span class="when">${esc(fmt.ago(p.created_at))}</span>
          <span style="flex:1"></span>${p.canEdit ? `<button class="btn ghost small" data-del-post="${p.id}">Löschen</button>` : ''}</div>
        <div class="post-body">${esc(p.body)}</div>
      </div>`).join('');

    shell('forum', `
      <a href="#/forum" style="font-size:14px;text-decoration:none">← Zurück zum Forum</a>
      <div class="card" style="margin-top:12px">
        <div class="task-meta" style="margin:0 0 8px"><span class="tag muted">${esc(t.category)}</span>${t.module_code ? `<span class="tag">${esc(t.module_code)}</span>` : ''}${t.solved ? '<span class="tag done">✓ gelöst</span>' : ''}</div>
        <h1 style="font-size:24px;color:var(--petrol)">${t.pinned ? '📌 ' : ''}${esc(t.title)}</h1>
        <div class="post-head" style="margin-top:10px"><span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(t.author || 'HKV'))}</span>
          <strong>${esc(t.author || 'HUB-042')}</strong><span class="when">${esc(fmt.ago(t.created_at))}</span></div>
        <div class="post-body" style="margin:12px 0 16px">${esc(t.body)}</div>
        <div class="row" style="align-items:center">
          <button class="like-btn ${t.liked ? 'on' : ''}" id="like">💚 ${t.likes} Hilfreich</button>
          ${t.canEdit ? `<button class="btn secondary small" id="solve">${t.solved ? 'Als offen markieren' : '✓ Als gelöst markieren'}</button>` : ''}
          ${data.canPin ? `<button class="btn secondary small" id="pin">${t.pinned ? 'Lösen' : '📌 Anheften'}</button>` : ''}
          ${t.canEdit ? '<button class="btn danger small" id="del-thread">Löschen</button>' : ''}
        </div>
      </div>
      <h2 class="section-title">${data.posts.length} Antwort${data.posts.length === 1 ? '' : 'en'}</h2>
      <div class="card">${posts || '<div class="empty">Noch keine Antworten.</div>'}
        <form id="reply" style="margin-top:16px">
          <div class="field"><label for="reply-body">Deine Antwort</label><textarea class="input" id="reply-body" name="body" required maxlength="10000"></textarea></div>
          <button class="btn" type="submit">Antworten</button>
        </form>
      </div>`);

    document.getElementById('like').addEventListener('click', async () => { await api(`/api/forum/${id}/like`, { method: 'POST' }); viewThread(id); });
    const solve = document.getElementById('solve');
    if (solve) solve.addEventListener('click', async () => { await api(`/api/forum/${id}`, { method: 'PATCH', body: { solved: !t.solved } }); viewThread(id); });
    const pin = document.getElementById('pin');
    if (pin) pin.addEventListener('click', async () => { await api(`/api/forum/${id}`, { method: 'PATCH', body: { pinned: !t.pinned } }); viewThread(id); });
    const del = document.getElementById('del-thread');
    if (del) {
      del.addEventListener('click', async () => {
        if (!window.confirm('Beitrag mit allen Antworten löschen?')) return;
        await api(`/api/forum/${id}`, { method: 'DELETE' });
        go('/forum');
      });
    }
    app.querySelectorAll('[data-del-post]').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`/api/forum/posts/${btn.dataset.delPost}`, { method: 'DELETE' });
      viewThread(id);
    }));
    document.getElementById('reply').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/api/forum/${id}/posts`, { method: 'POST', body: formData(e.target) });
        toast('Antwort gepostet · +5 XP');
        viewThread(id);
      } catch (err) { toast(err.message, true); }
    });
  }

  // ---------------------------------------------------------------
  // Zufalls-Gruppengenerator (läuft nur im Browser, nichts wird gespeichert)
  // ---------------------------------------------------------------
  const groupState = { size: 3, rest: 'verteilen', unchecked: new Set(), extra: [], result: null };
  async function viewGroups() {
    loading('gruppen');
    const data = await api('/api/groups/people');
    const all = [...data.people, ...groupState.extra];
    const selected = () => all.filter((n) => !groupState.unchecked.has(n));
    const render = () => {
      const sel = selected();
      const preview = HubGroups.makeGroups(sel.map((_, i) => i), groupState.size, groupState.rest).map((g) => g.length);
      document.getElementById('group-count').textContent = sel.length
        ? `${sel.length} Personen → ${preview.length} Gruppe${preview.length === 1 ? '' : 'n'} (${preview.join(' / ')})`
        : 'Niemand ausgewählt';
      const out = document.getElementById('group-result');
      out.innerHTML = groupState.result ? `<div class="grid grid-3">${groupState.result.map((g, i) => `
        <div class="card accent" style="--accent:${['#2f7d5b', '#3d6f8e', '#b9783f', '#7a5c99', '#c0504d', '#2b6f74', '#9a7b2f'][i % 7]}">
          <div class="card-title">Gruppe ${i + 1} <span class="tag muted">${g.length}</span></div>
          <ul style="margin:0;padding-left:18px">${g.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('')}</div>` : '';
      document.getElementById('group-copy').style.display = groupState.result ? '' : 'none';
    };
    shell('gruppen', `
      <div class="eyebrow">Lerngruppen</div>
      <h1 class="page-title">Zufalls-Gruppen</h1>
      <div class="grid grid-2">
        <div class="card"><div class="card-title">Wer ist da?
            <span><button class="btn ghost small" id="all-on">alle</button><button class="btn ghost small" id="all-off">keine</button></span></div>
          <div id="people" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px">
            ${all.map((n, i) => `<label class="check" style="margin:0"><input type="checkbox" data-person="${i}" ${groupState.unchecked.has(n) ? '' : 'checked'}> ${esc(n)}</label>`).join('') || '<div class="empty">Noch niemand auf der Teilnehmerliste.</div>'}
          </div>
          <form id="extra-form" class="row" style="margin-top:12px"><div class="field" style="margin:0"><label>Weitere Person (z. B. Gast)</label><input class="input" name="name" maxlength="60" placeholder="Name"></div>
            <button class="btn secondary" type="submit">Hinzufügen</button></form>
        </div>
        <div class="card"><div class="card-title">Einstellungen</div>
          <div class="field"><label>Gruppengrösse</label>
            <div class="segmented">${[2, 3, 4, 5, 6].map((n) => `<button type="button" data-size="${n}" class="${n === groupState.size ? 'active' : ''}">${n}er</button>`).join('')}</div></div>
          <div class="field"><label>Wenn es nicht aufgeht</label>
            <select class="input" id="rest"><option value="verteilen" ${groupState.rest === 'verteilen' ? 'selected' : ''}>Übrige auf Gruppen verteilen (z. B. eine 4er-Gruppe)</option>
              <option value="eigene" ${groupState.rest === 'eigene' ? 'selected' : ''}>Eigene kleinere Restgruppe</option></select></div>
          <p id="group-count" style="font-weight:600;color:var(--petrol)"></p>
          <div class="row"><button class="btn" id="generate">${icon('shuffle', 16)} Gruppen auslosen</button>
            <button class="btn secondary" id="group-copy" style="display:none">Kopieren (für Teams)</button></div>
          <p style="font-size:12px;color:var(--muted);margin-bottom:0">Die Auslosung passiert nur in deinem Browser mit echtem Zufall (Web Crypto) und wird nirgends gespeichert.</p>
        </div>
      </div>
      <h2 class="section-title">Ergebnis</h2>
      <div id="group-result"><div class="empty">Noch nicht ausgelost.</div></div>
    `);
    app.querySelectorAll('[data-person]').forEach((cb) => cb.addEventListener('change', () => {
      const name = all[parseInt(cb.dataset.person, 10)];
      if (cb.checked) groupState.unchecked.delete(name); else groupState.unchecked.add(name);
      render();
    }));
    document.getElementById('all-on').addEventListener('click', () => { groupState.unchecked.clear(); viewGroups(); });
    document.getElementById('all-off').addEventListener('click', () => { all.forEach((n) => groupState.unchecked.add(n)); viewGroups(); });
    app.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { groupState.size = parseInt(b.dataset.size, 10); viewGroups(); }));
    document.getElementById('rest').addEventListener('change', (e) => { groupState.rest = e.target.value; render(); });
    document.getElementById('extra-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (name && !all.includes(name)) groupState.extra.push(name);
      viewGroups();
    });
    document.getElementById('generate').addEventListener('click', () => {
      const sel = selected();
      if (sel.length < 2) { toast('Mindestens 2 Personen auswählen', true); return; }
      groupState.result = HubGroups.makeGroups(sel, groupState.size, groupState.rest);
      render();
      document.getElementById('group-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('group-copy').addEventListener('click', async () => {
      const text = groupState.result.map((g, i) => `Gruppe ${i + 1}: ${g.join(', ')}`).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Gruppen kopiert'); } catch (e) { toast('Kopieren nicht möglich', true); }
    });
    render();
  }

  // ---------------------------------------------------------------
  // Infos zum Bildungsgang, Zertifikate, Weg zum Bachelor
  // ---------------------------------------------------------------
  async function viewInfos() {
    loading('infos');
    const [d, dl] = await Promise.all([api('/api/infos'), api('/api/downloads')]);
    const h = d.hfwi;
    const groups = [...new Set(dl.files.map((f) => f.group))];
    const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
    const link = (label, url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
    const today = zurichDayKey(new Date());
    const ferien = d.ferien.filter((f) => f.end >= today).sort((a, b) => a.start.localeCompare(b.start))
      .map((f) => `<tr><td>${esc(f.name)}</td><td>${esc(fmt.date(fmt.day(f.start), { dateStyle: 'medium' }))} – ${esc(fmt.date(fmt.day(f.end), { dateStyle: 'medium' }))}</td></tr>`).join('');

    shell('infos', `
      <div class="eyebrow">${esc(h.untertitel)}</div>
      <h1 class="page-title">${esc(h.titel)}</h1>
      <div class="toolbar">${[['downloads', 'Downloads'], ['bildungsgang', 'Bildungsgang'], ['lehrplan', 'Lehrplan'], ['zertifikate', 'Zertifikate'], ['bachelor', 'Nach dem HF'], ['kontakte', 'Kontakte'], ['ferien', 'Ferien & Anfahrt']]
    .map(([id, label]) => `<a class="btn secondary small" href="#/infos" data-jump="${id}">${label}</a>`).join('')}</div>

      <h2 class="section-title" id="sec-downloads" style="margin-top:8px">Downloads</h2>
      <div class="grid grid-2">${groups.map((g) => `<div class="card"><div class="card-title">${esc(g)}</div><div class="list">
        ${dl.files.filter((f) => f.group === g).map((f) => `<a class="list-item" href="${esc(f.url)}" download>
          <span class="date-badge" style="width:46px"><div class="d" style="font-size:13px">${f.file.endsWith('.xlsx') ? 'XLSX' : 'PDF'}</div><div class="m">${esc(size(f.size))}</div></span>
          <div class="grow"><div class="title">${esc(f.title)}</div><div class="meta" style="white-space:normal">${esc(f.desc)}</div></div><span>⬇</span></a>`).join('')}
      </div></div>`).join('')}</div>
      <p style="font-size:12px;color:var(--muted)">Nur für eingeloggte Mitglieder. Dokumente der HKV Aarau © HKV Aarau, nur für den persönlichen Gebrauch im Studium.</p>

      <h2 class="section-title">Bildungsgang</h2>
      <div class="grid grid-2" id="sec-bildungsgang">
        <div class="card"><div class="card-title">Eckdaten</div>
          <div class="table-wrap"><table class="table"><tbody>${h.eckdaten.map(([k, v]) => `<tr><td style="font-weight:600;width:38%">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
          <p style="font-size:12px;color:var(--muted);margin-bottom:0">Englischer Titel: ${esc(h.englisch)}</p></div>
        <div class="card"><div class="card-title">Handlungskompetenzen</div>
          <ol style="padding-left:20px;margin:0;font-size:14px">${h.kompetenzen.map(([t, x]) => `<li style="margin-bottom:8px"><strong>${esc(t)}</strong><br><span style="color:var(--muted)">${esc(x)}</span></li>`).join('')}</ol>
          <div class="card-title" style="margin-top:14px">Highlights</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${h.highlights.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>
      </div>

      <h2 class="section-title" id="sec-lehrplan">Lehrplan (Lektionen | Lernstunden)</h2>
      <div class="grid grid-3">${h.lehrplan.map((y) => `<div class="card"><div class="card-title">${esc(y.jahr)}
          <span class="tag muted">${y.module.reduce((a, m) => a + m[1], 0)} Lekt.</span></div>
        <table class="table"><tbody>${y.module.map(([n, l, s]) => `<tr><td>${esc(n)}</td><td style="text-align:right;white-space:nowrap">${l} | ${s}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-title">Englisch / IELTS</div><ul style="padding-left:18px;margin:0;font-size:14px">${h.englischRegel.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="card"><div class="card-title">Online-Unterricht in MS Teams</div><ul style="padding-left:18px;margin:0;font-size:14px">${h.online.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="card-title" style="margin-top:14px">Vorteile als Studierende*r</div><ul style="padding-left:18px;margin:0;font-size:14px">${h.benefits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>

      <h2 class="section-title" id="sec-zertifikate">Optionale Zertifikate</h2>
      <p style="margin-top:-6px;color:var(--muted);font-size:14px">${esc(d.zertifikate.intro)}</p>
      <div class="grid grid-2">${d.zertifikate.liste.map((z) => `<div class="card accent" style="--accent:#2f7d5b">
        <div class="eyebrow" style="color:var(--green-dark)">${esc(z.kuerzel)} · ${esc(z.thema)}</div>
        <div style="font-weight:700;font-size:16px;margin:4px 0 8px">${esc(z.name)}</div>
        <p style="font-size:14px;margin:0 0 8px">${esc(z.was)}</p>
        <table class="table" style="font-size:13px;table-layout:fixed"><tbody>
          <tr><td style="font-weight:600;width:30%">Passt zu</td><td>${esc(z.modul)}</td></tr>
          <tr><td style="font-weight:600">Prüfung</td><td>${esc(z.pruefung)}</td></tr>
          <tr><td style="font-weight:600">Nutzen</td><td>${esc(z.nutzen)}</td></tr></tbody></table>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:14px">${z.links.map(([l, u]) => link(l, u)).join('')}</div></div>`).join('')}</div>
      <div class="info-box" style="margin-top:12px">💡 ${esc(d.zertifikate.tipp)}</div>

      <h2 class="section-title" id="sec-bachelor">Nach dem HF: Weiter zum Bachelor</h2>
      <p style="margin-top:-6px;font-size:14px">${esc(d.bachelor.intro)}</p>
      <div class="card" style="padding:8px 12px"><div class="table-wrap"><table class="table">
        <thead><tr><th>Hochschule</th><th>Anrechnung</th><th>Dauer</th><th>Kosten</th><th>Pro / Contra</th></tr></thead>
        <tbody>${d.bachelor.optionen.map((o) => `<tr>
          <td style="min-width:200px"><strong>${esc(o.schule)}</strong> <span class="tag ${o.typ === 'privat' ? 'jp' : 'muted'}">${esc(o.typ)}</span><br>
            <span style="font-size:12px;color:var(--muted)">${esc(o.ort)}</span><br><span style="font-size:13px">${esc(o.studiengang)}</span><br>
            <span style="font-size:12px">${link('Website', o.url)}</span></td>
          <td style="min-width:170px">${esc(o.anrechnung)}<br><span style="font-size:12px;color:var(--muted)">Zulassung: ${esc(o.zulassung)}</span></td>
          <td style="min-width:120px">${esc(o.dauer)}</td>
          <td style="min-width:150px">${esc(o.kosten)}</td>
          <td style="min-width:170px"><span class="grade-good">＋ ${esc(o.plus)}</span><br><span class="grade-bad">－ ${esc(o.minus)}</span></td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid grid-2" style="margin-top:12px">
        <div class="card"><div class="card-title">Tipps</div><ul style="padding-left:18px;margin:0;font-size:14px">${d.bachelor.tipps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="card"><div class="card-title">Faustregel</div>
          <p style="margin:0;font-size:14px"><strong>Schnell und flexibel:</strong> Kalaidos (ca. 2 Jahre, online möglich, ca. CHF 26'500).<br>
          <strong>Günstig und staatlich:</strong> ZHAW Winterthur (ca. 3 Jahre berufsbegleitend, ca. CHF 5'000).<br>
          <strong>Nah bei Aarau:</strong> FHNW Olten / Brugg-Windisch (Anrechnung individuell anfragen).</p>
          <p style="font-size:12px;color:var(--muted);margin-bottom:0">${esc(d.bachelor.stand)}</p></div>
      </div>

      <h2 class="section-title" id="sec-kontakte">Kontakte HKV Aarau</h2>
      <div class="grid grid-4">${h.kontakte.map((k) => `<div class="card"><div class="eyebrow">${esc(k.rolle)}</div>
        <div style="font-weight:700;margin:4px 0">${esc(k.name)}</div>
        <div style="font-size:14px"><a href="mailto:${esc(k.mail)}">${esc(k.mail)}</a>${k.tel ? `<br>${esc(k.tel)}` : ''}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:12px;font-size:14px"><strong>Sekretariat Weiterbildung:</strong> ${h.oeffnungszeiten.map(esc).join(' · ')}</div>

      <h2 class="section-title" id="sec-ferien">Ferien &amp; Anfahrt</h2>
      <div class="grid grid-2">
        <div class="card"><div class="card-title">Kommende Ferien HKV Aarau</div><table class="table"><tbody>${ferien || '<tr><td class="empty">Keine Daten</td></tr>'}</tbody></table></div>
        <div class="card"><div class="card-title">${esc(d.campus.name)}</div>
          <p style="margin-top:0;font-size:14px"><strong>${esc(d.campus.address)}</strong><br>${esc(d.campus.hint)}</p>
          <p style="font-size:14px"><strong>Parkhäuser:</strong> ${esc(d.campus.parking.join(', '))}<br><strong>Zweiräder:</strong> ${esc(d.campus.bikes)}</p>
          <p style="font-size:14px;margin-bottom:0"><strong>Zimmer:</strong> 1xx/2xx/3xx = Stockwerk · 226–341 Treppe West · 211–222 Treppe Ost · Aula 224 im 2. Stock</p></div>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:20px">Quellen: ${esc(h.quelle)}. Alle Angaben ohne Gewähr, massgebend sind die offiziellen Unterlagen der HKV Aarau.</p>
    `);
    app.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const el = document.getElementById(`sec-${a.dataset.jump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // ---------------------------------------------------------------
  // Profil
  // ---------------------------------------------------------------
  async function viewProfile() {
    loading('profil');
    const d = await api(withYear('/api/dashboard'));
    const p = d.progress;
    const user = state.meta.user;
    const badges = p.badges.map((b) => `<div class="badge ${b.earned ? '' : 'locked'}"><div class="bi">${b.icon}</div><div class="bn">${esc(b.name)}</div><div class="bd">${esc(b.desc)}</div></div>`).join('');

    shell('profil', `
      <div class="eyebrow">Profil</div>
      <h1 class="page-title">${esc(user.display_name)}</h1>
      <div class="grid grid-3">
        <div class="card accent stat" style="--accent:#c98a2b"><div class="label">Level</div><div class="value">${p.level.level}</div><div class="sub">${esc(p.level.title)} · ${p.xp} XP</div></div>
        <div class="card accent stat" style="--accent:#c0504d"><div class="label">Streak</div><div class="value">🔥 ${p.streak}</div><div class="sub">Tage in Folge aktiv</div></div>
        <div class="card accent stat" style="--accent:#2f7d5b"><div class="label">Abzeichen</div><div class="value">${p.badges.filter((b) => b.earned).length}/${p.badges.length}</div><div class="sub">im ${esc(d.year ? d.year.label : '')}</div></div>
      </div>
      <div class="card install-hint" style="margin-top:16px"><div class="card-title">📱 HUB-042 auf den Homescreen</div>
        <p style="margin:0;font-size:14px"><strong>iPhone (Safari):</strong> Teilen-Symbol ↑ antippen → „Zum Home-Bildschirm“.<br>
        <strong>Android (Chrome):</strong> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.<br>
        Danach öffnet sich der HUB-042 im Vollbild wie eine App.</p></div>
      <h2 class="section-title">Abzeichen</h2>
      <div class="badges">${badges}</div>
      <div class="grid grid-2" style="margin-top:24px">
        <div class="card"><div class="card-title">Konto</div>
          <form id="name-form">
            <div class="field"><label>E-Mail</label><input class="input" value="${esc(user.email)}" disabled></div>
            <div class="field"><label>Anzeigename</label><input class="input" name="display_name" maxlength="100" value="${esc(user.display_name)}"></div>
            <button class="btn" type="submit">Speichern</button>
          </form>
        </div>
        <div class="card"><div class="card-title">Passwort ändern</div>
          <form id="pw-form">
            <div class="field"><label>Aktuelles Passwort</label><input class="input" type="password" name="current_password" autocomplete="current-password" required></div>
            <div class="field"><label>Neues Passwort</label><input class="input" type="password" name="new_password" minlength="8" maxlength="20" autocomplete="new-password" required><span class="hint">8 bis 20 Zeichen</span></div>
            <button class="btn" type="submit">Ändern</button>
          </form>
        </div>
        <div class="card"><div class="card-title">Kalender-Abo</div>
          <p style="margin-top:0;font-size:14px;color:var(--muted)">Falls jemand deinen Kalender-Link kennt, kannst du einen neuen erzeugen. Der alte funktioniert dann nicht mehr.</p>
          <button class="btn secondary" id="new-cal">Neuen Kalender-Link erzeugen</button>
        </div>
        <div class="card"><div class="card-title">Wiederherstellungs-ID</div>
          <p style="margin-top:0;font-size:14px;color:var(--muted)">Brauchst du nach einem Passwort-Reset durch den Admin zusammen mit dem Werkspasswort. Nur du kennst sie.
            Eine neue ID ersetzt die alte sofort.</p>
          <button class="btn secondary" id="new-recovery">Neue Wiederherstellungs-ID erzeugen</button>
        </div>
        <div class="card"><div class="card-title">Datenschutz</div>
          <p style="margin-top:0;font-size:14px;color:var(--muted)">Im Ranking sehen andere nur „Anonym“. Im Forum erscheint dein Anzeigename. Du kannst deine Daten jederzeit herunterladen oder dein Konto mit allen Punkten und Beiträgen löschen.
            <a href="#/datenschutz">Datenschutzerklärung</a></p>
          <div class="row"><a class="btn secondary" href="/api/me/export" download>Meine Daten herunterladen</a>
            <button class="btn secondary" id="logout">${icon('logout', 16)} Abmelden</button><button class="btn danger" id="delete-me">Konto löschen</button></div>
        </div>
      </div>
    `, p);

    document.getElementById('name-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/me', { method: 'PATCH', body: formData(e.target) }); await loadMeta(); toast('Gespeichert'); viewProfile(); } catch (err) { toast(err.message, true); }
    });
    document.getElementById('pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/me', { method: 'PATCH', body: formData(e.target) }); e.target.reset(); toast('Passwort geändert'); } catch (err) { toast(err.message, true); }
    });
    document.getElementById('new-recovery').addEventListener('click', () => {
      if (window.confirm('Neue ID erzeugen? Die bisherige ist danach ungültig.')) showRecoveryId(false);
    });
    document.getElementById('new-cal').addEventListener('click', async () => { await api('/api/me/calendar-token', { method: 'POST' }); toast('Neuer Kalender-Link erzeugt'); });
    document.getElementById('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); state.meta = null; go('/anmelden'); });
    document.getElementById('delete-me').addEventListener('click', async () => {
      if (!window.confirm('Konto und alle deine Daten endgültig löschen?')) return;
      await api('/api/me', { method: 'DELETE' });
      state.meta = null;
      go('/anmelden');
    });
  }

  // ---------------------------------------------------------------
  // Verwaltung (Dozierende & Admins)
  // ---------------------------------------------------------------
  async function viewAdmin() {
    if (state.meta.user.role !== 'admin') { go('/dashboard'); return; }
    loading('admin');
    const data = await api('/api/admin/participants');
    const isAdmin = state.meta.user.role === 'admin';
    const locked = [...data.configured.admins, ...data.configured.dozenten];
    const rows = data.participants.map((p) => {
      const status = !p.user_id ? '<span class="tag muted">nicht registriert</span>'
        : p.email_verified ? '<span class="tag done">aktiv</span>' : '<span class="tag jp">Bestätigung offen</span>';
      const fixed = locked.includes(p.email);
      return `<tr style="${p.active ? '' : 'opacity:.5'}">
        <td><strong>${esc(p.full_name)}</strong><br><span style="font-size:12px;color:var(--muted)">${esc(p.email)}</span></td>
        <td>${fixed ? `<span class="tag">${esc(roleLabel(p.role))}</span>` : `<select class="input" style="padding:5px" data-role="${esc(p.email)}">
          ${['student', 'dozent', 'admin'].filter((r) => isAdmin || r !== 'admin' || p.role === 'admin').map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select>`}</td>
        <td>${status}${p.last_active ? `<br><span style="font-size:12px;color:var(--muted)">zuletzt ${esc(fmt.date(fmt.day(p.last_active), { day: 'numeric', month: 'short' }))}</span>` : ''}</td>
        <td style="white-space:nowrap">
          ${!p.user_id && p.active ? `<button class="btn secondary small" data-invite="${esc(p.email)}">Einladen</button>` : ''}
          ${p.user_id && !p.email_verified ? `<button class="btn small" data-verify="${p.user_id}">Annehmen</button>` : ''}
          ${p.user_id && p.email_verified && p.user_id !== state.meta.user.id ? `<button class="btn ghost small" data-reset="${p.user_id}" data-mail="${esc(p.email)}">Passwort zurücksetzen</button>
            <button class="btn ghost small" data-reset-id="${p.user_id}" data-mail="${esc(p.email)}" title="Wenn die Person ihre Wiederherstellungs-ID verloren hat">Passwort + ID zurücksetzen</button>` : ''}
          ${fixed ? '' : `<button class="btn ghost small" data-toggle="${esc(p.email)}" data-active="${p.active}">${p.active ? 'Sperren' : 'Aktivieren'}</button>`}
        </td></tr>`;
    }).join('');

    const years = state.meta.years.map((y) => `<tr><td>${esc(y.label)}</td><td>${esc(y.klasse)}</td><td>${esc(fmt.date(fmt.day(y.start_date), { dateStyle: 'medium' }))} – ${esc(fmt.date(fmt.day(y.end_date), { dateStyle: 'medium' }))}</td></tr>`).join('');

    let auditHtml = '';
    if (isAdmin) {
      const auditData = await api('/api/admin/audit');
      const labels = {
        login: 'Anmeldung', login_failed: 'Anmeldung fehlgeschlagen', logout: 'Abmeldung', register: 'Registrierung', consent: 'Zustimmung Datenschutz',
        email_verified: 'E-Mail bestätigt', password_reset_requested: 'Passwort-Reset angefordert', password_reset: 'Passwort zurückgesetzt',
        password_changed: 'Passwort geändert', profile_updated: 'Profil geändert', data_export: 'Datenexport', account_deleted: 'Konto gelöscht',
        participants_added: 'Teilnehmende hinzugefügt', participant_updated: 'Teilnehmende*r geändert', participant_removed: 'Teilnehmende*r entfernt',
        invitation_sent: 'Einladung versendet', user_verified_manually: 'Manuell freigeschaltet', task_created: 'Aufgabe erstellt',
        task_updated: 'Aufgabe geändert', mail_test: 'Test-Mail', password_reset_by_admin: 'Passwort durch Admin zurückgesetzt', password_and_id_reset_by_admin: 'Passwort + ID durch Admin zurückgesetzt',
        recovery_id_created: 'Wiederherstellungs-ID erzeugt', recovery_id_failed: 'Wiederherstellungs-ID falsch', task_deleted: 'Aufgabe gelöscht', lessons_imported: 'Stundenplan importiert',
      };
      auditHtml = `<div class="card" style="margin-top:16px"><div class="card-title">Audit-Protokoll <span class="tag muted">${auditData.consent.with_consent}/${auditData.consent.total} Konten mit Zustimmung</span></div>
        <p style="margin-top:0;font-size:13px;color:var(--muted)">Letzte 300 Ereignisse · automatische Löschung nach 365 Tagen · keine Punkte oder Passwörter.</p>
        <div class="table-wrap" style="max-height:420px;overflow:auto"><table class="table"><thead><tr><th>Zeit</th><th>Wer</th><th>Aktion</th><th>Ziel</th></tr></thead><tbody>
        ${auditData.entries.map((e) => `<tr><td style="white-space:nowrap">${esc(fmt.date(e.at, { dateStyle: 'short', timeStyle: 'short' }))}</td>
          <td>${esc(e.actor_email || '–')}</td><td>${esc(labels[e.action] || e.action)}</td><td style="font-size:12px;color:var(--muted)">${esc(e.target || '')}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    }

    shell('admin', `
      <div class="eyebrow">Verwaltung</div>
      <h1 class="page-title">Teilnehmerliste &amp; Einstellungen</h1>
      <div class="info-box">
        ${data.mail.configured ? '' : '<strong>Demo-Modus:</strong> Neue Konten erscheinen hier als „Bestätigung offen“ → <strong>Annehmen</strong>. Passwort vergessen → <strong>Passwort zurücksetzen</strong> (Werkspasswort aus RESET_PASSWORD in der .env' + (data.resetConfigured ? '' : ', <strong>noch nicht gesetzt</strong>') + ').<br>'}
        Mailversand: ${data.mail.configured ? `eingerichtet über ${esc(data.mail.host)} als ${esc(data.mail.from)}` : 'aus (Demo-Modus). Optional später über SMTP_* in der .env einschalten.'}
        ${data.mail.configured ? '<button class="btn secondary small" id="mail-test" style="margin-left:8px">Test-Mail an mich senden</button>' : ''}
      </div>
      <div class="card"><div class="card-title">Teilnehmende (${data.participants.filter((p) => p.active).length} aktiv)</div>
        <p style="margin-top:0;font-size:14px;color:var(--muted)">Nur Adressen auf dieser Liste mit der Endung ${data.domains.map((d) => `@${esc(d)}`).join(' oder ')} können sich registrieren und anmelden.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Person</th><th>Rolle</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-title">Personen hinzufügen</div>
          <form id="add-form">
            <div class="field"><label>Eine Person pro Zeile</label><textarea class="input" name="text" placeholder="Vorname Nachname; vorname.nachname@stud.hkv.ch"></textarea></div>
            <div class="field"><label>Rolle</label><select class="input" name="role"><option value="student">Studierende*r</option><option value="dozent">Dozent*in</option>${isAdmin ? '<option value="admin">Admin</option>' : ''}</select></div>
            <button class="btn" type="submit">Hinzufügen</button>
          </form>
        </div>
        <div class="card"><div class="card-title">Schuljahre</div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Schuljahr</th><th>Klasse</th><th>Zeitraum</th></tr></thead><tbody>${years}</tbody></table></div>
          <form id="year-form" style="margin-top:14px">
            <div class="row">
              <div class="field"><label>Neues Schuljahr</label><input class="input" name="label" placeholder="3. Studienjahr" required></div>
              <div class="field"><label>Start</label><input class="input" type="date" name="start_date" required></div>
              <div class="field"><label>Ende</label><input class="input" type="date" name="end_date" required></div>
            </div>
            <button class="btn secondary" type="submit">Schuljahr anlegen</button>
          </form>
        </div>
      </div>
      ${auditHtml}
    `);

    const refresh = () => viewAdmin();
    const mailTest = document.getElementById('mail-test');
    if (mailTest) {
      mailTest.addEventListener('click', async () => {
        mailTest.disabled = true;
        try { toast((await api('/api/admin/mail-test', { method: 'POST' })).message); } catch (err) { toast(err.message, true); }
        mailTest.disabled = false;
      });
    }
    document.getElementById('add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api('/api/admin/participants', { method: 'POST', body: formData(e.target) });
        toast(`${res.added} hinzugefügt${res.errors.length ? ` · ${res.errors.join(', ')}` : ''}`, res.errors.length > 0);
        refresh();
      } catch (err) { toast(err.message, true); }
    });
    document.getElementById('year-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/admin/years', { method: 'POST', body: formData(e.target) }); await loadMeta(); toast('Schuljahr angelegt'); refresh(); } catch (err) { toast(err.message, true); }
    });
    app.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api(`/api/admin/participants/${encodeURIComponent(sel.dataset.role)}`, { method: 'PATCH', body: { role: sel.value } }); toast('Rolle geändert'); } catch (err) { toast(err.message, true); refresh(); }
    }));
    app.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`/api/admin/participants/${encodeURIComponent(btn.dataset.toggle)}`, { method: 'PATCH', body: { active: btn.dataset.active !== 'true' } });
      refresh();
    }));
    app.querySelectorAll('[data-invite]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await api(`/api/admin/participants/${encodeURIComponent(btn.dataset.invite)}/invite`, { method: 'POST' }); toast(`Einladung an ${btn.dataset.invite} versendet`); } catch (err) { toast(err.message, true); }
      btn.disabled = false;
    }));
    app.querySelectorAll('[data-reset-id]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm(`Passwort UND Wiederherstellungs-ID von ${btn.dataset.mail} zurücksetzen?\n\nDann kann sich die Person (oder wer das Werkspasswort kennt) einmalig nur mit dem Werkspasswort einloggen. Sag es ihr persönlich und lass sie sich sofort einloggen. Sie bekommt dabei eine neue ID und muss ein neues Passwort wählen.`)) return;
      try { toast((await api(`/api/admin/users/${btn.dataset.resetId}/reset-password`, { method: 'POST', body: { withId: true } })).message); } catch (err) { toast(err.message, true); }
    }));
    app.querySelectorAll('[data-reset]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm(`Passwort von ${btn.dataset.mail} auf das Werkspasswort zurücksetzen? Die Person muss danach beim Login ein neues wählen.`)) return;
      try { toast((await api(`/api/admin/users/${btn.dataset.reset}/reset-password`, { method: 'POST' })).message); } catch (err) { toast(err.message, true); }
    }));
    app.querySelectorAll('[data-verify]').forEach((btn) => btn.addEventListener('click', async () => {
      await api(`/api/admin/users/${btn.dataset.verify}/verify`, { method: 'POST' });
      toast('Angenommen und freigeschaltet');
      refresh();
    }));
  }

  // ---------------------------------------------------------------
  // Hilfe-Bot (schwebender Button, kontextbezogen zur aktuellen Seite)
  // ---------------------------------------------------------------
  const bot = { open: false, history: [], ai: null };
  function renderBot() {
    let root = document.getElementById('bot-root');
    if (!state.meta) { if (root) root.remove(); return; }
    if (!root) {
      root = document.createElement('div');
      root.id = 'bot-root';
      document.body.appendChild(root);
    }
    const page = parseHash().parts[0] || 'dashboard';
    root.innerHTML = bot.open ? `
      <div class="bot-panel" role="dialog" aria-label="Hilfe-Bot">
        <div class="bot-head"><strong>🤖 HUB-042 Hilfe</strong><button class="icon-btn" id="bot-close" aria-label="Schliessen" style="color:#fff">×</button></div>
        <div class="bot-msgs" id="bot-msgs">
          <div class="bot-msg bot">Hoi! Frag mich zum HUB-042, zu Noten, LLP, Stundenplan oder zum Studium. Ich sehe, dass du gerade auf „${esc(page)}“ bist.</div>
          ${bot.history.map((m) => `<div class="bot-msg ${m.role}">${esc(m.text)}</div>`).join('')}
        </div>
        <form class="bot-form" id="bot-form"><input class="input" id="bot-input" maxlength="500" placeholder="Frage eingeben …" autocomplete="off"><button class="btn" type="submit">➤</button></form>
        <div class="bot-note">${bot.ai ? 'Antworten von Google Gemini, ohne Gewähr.' : 'Antworten aus der HKV-Hub-FAQ.'} Bitte keine persönlichen Daten eingeben.</div>
      </div>` : '<button class="bot-fab" id="bot-open" aria-label="Hilfe-Bot öffnen">🤖</button>';
    const openBtn = document.getElementById('bot-open');
    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        bot.open = true;
        if (bot.ai === null) { try { bot.ai = (await api('/api/assistant')).ai; } catch (e) { bot.ai = false; } }
        renderBot();
        document.getElementById('bot-input').focus();
      });
      return;
    }
    document.getElementById('bot-close').addEventListener('click', () => { bot.open = false; renderBot(); });
    const msgs = document.getElementById('bot-msgs');
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById('bot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('bot-input');
      const text = input.value.trim();
      if (!text) return;
      bot.history.push({ role: 'me', text });
      bot.history.push({ role: 'bot', text: '…' });
      renderBot();
      try {
        const res = await api('/api/assistant', { method: 'POST', body: { message: text, page } });
        bot.history[bot.history.length - 1].text = res.answer;
      } catch (err) {
        bot.history[bot.history.length - 1].text = err.message;
      }
      renderBot();
      document.getElementById('bot-input').focus();
    });
  }

  // ---------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------
  async function loadMeta() {
    try {
      const meta = await api('/api/meta');
      state.meta = meta;
      let stored = null;
      try { stored = parseInt(localStorage.getItem('hub042-year'), 10); } catch (e) { stored = null; }
      const valid = meta.years.some((y) => y.id === stored);
      if (!state.yearId || !meta.years.some((y) => y.id === state.yearId)) {
        state.yearId = valid ? stored : meta.currentYearId;
      }
    } catch (err) {
      state.meta = null;
    }
  }

  const PUBLIC_ROUTES = ['anmelden', 'registrieren', 'passwort-vergessen', 'passwort-neu'];

  async function route() {
    closeModal();
    const { parts, params } = parseHash();
    const page = parts[0] || 'dashboard';
    if (page === 'datenschutz' || page === 'impressum') {
      if (!state.meta) await loadMeta();
      window.scrollTo(0, 0);
      viewLegal(page);
      return;
    }
    if (PUBLIC_ROUTES.includes(page)) {
      if (!state.meta) renderBot();
      if (state.meta && page !== 'passwort-neu') { go('/dashboard'); return; }
      ({
        anmelden: viewLogin, registrieren: viewRegister, 'passwort-vergessen': viewForgot, 'passwort-neu': viewReset,
      })[page](params);
      return;
    }
    if (!state.meta) await loadMeta();
    if (!state.meta) { go('/anmelden'); return; }
    window.scrollTo(0, 0);
    try {
      switch (page) {
        case 'aufgaben': await viewTasks(params); break;
        case 'noten': await viewGrades(params); break;
        case 'stundenplan': await viewSchedule(params); break;
        case 'ranking': await viewRanking(params); break;
        case 'forum': if (parts[1]) await viewThread(parseInt(parts[1], 10)); else await viewForum(params); break;
        case 'profil': await viewProfile(); break;
        case 'infos': await viewInfos(); break;
        case 'gruppen': await viewGroups(); break;
        case 'admin': await viewAdmin(); break;
        default: await viewDashboard(params);
      }
    } catch (err) {
      if (state.meta) shell(page, `<div class="error-box">${esc(err.message)}</div>`);
    }
    if (state.meta && state.meta.user.needsConsent) askConsent();
    else if (state.meta && state.meta.user.needsRecoveryId) showRecoveryId(true);
    else if (state.meta && state.meta.user.mustChangePassword) forcePasswordChange();
    renderBot();
  }

  window.addEventListener('hashchange', route);
  route();
}());
