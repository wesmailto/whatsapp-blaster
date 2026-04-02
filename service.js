/**
 * WhatsApp Blaster — Node.js Service
 * Uses whatsapp-web.js for a real WhatsApp Web integration.
 * Serves the dashboard + REST API on http://localhost:5050
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode');
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const fs      = require('fs');
const path    = require('path');

// ── Paths ─────────────────────────────────────────────────────────────────────
const BASE       = __dirname;
const CONFIG_F   = path.join(BASE, 'config.json');
const LOG_F      = path.join(BASE, 'sent_log.json');

function readJSON(f)       { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function writeJSON(f, d)   { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }

// ── WhatsApp state (in-memory) ────────────────────────────────────────────────
const wa = {
  status:      'disconnected',  // disconnected | qr_ready | connecting | ready
  qrDataUrl:   null,
  groups:      [],
  groupsCache: null,   // cached after first load — null means not loaded yet
  groupsAt:    null,   // timestamp of last cache fill
  client:      null,
};

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(BASE, 'dashboard')));

// ── WA Client setup ───────────────────────────────────────────────────────────
function initWhatsApp() {
  if (wa.client) return;

  wa.client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(BASE, '.wwebjs_auth') }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
  });

  wa.client.on('qr', async (qr) => {
    console.log('📱 QR code ready — open the dashboard to scan it.');
    wa.status    = 'qr_ready';
    wa.qrDataUrl = await qrcode.toDataURL(qr);
  });

  wa.client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated.');
    wa.status = 'connecting';
  });

  wa.client.on('ready', async () => {
    console.log('✅ WhatsApp connected and ready!');
    wa.status = 'ready';
    wa.qrDataUrl = null;
    await refreshGroups();
  });

  wa.client.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp disconnected:', reason);
    wa.status = 'disconnected';
    wa.groups  = [];
    wa.client  = null;
    // Auto-reconnect after 5s
    setTimeout(initWhatsApp, 5000);
  });

  wa.client.initialize();
}

// ── Group helpers ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function refreshGroups(force = false) {
  if (wa.status !== 'ready') return [];

  const now = Date.now();
  // Return cache if fresh and not forced
  if (!force && wa.groupsCache && wa.groupsAt && (now - wa.groupsAt) < CACHE_TTL_MS) {
    return wa.groupsCache;
  }

  try {
    const chats = await wa.client.getChats();
    wa.groupsCache = chats
      .filter(c => c.isGroup)
      .map(c => ({ id: c.id._serialized, name: c.name, participants: c.participants?.length ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    wa.groupsAt = now;
    wa.groups   = wa.groupsCache;
    console.log(`📋 Loaded ${wa.groups.length} groups (cache refreshed).`);
  } catch (e) {
    console.error('Error fetching groups:', e.message);
    // Return stale cache if available
    if (wa.groupsCache) return wa.groupsCache;
  }
  return wa.groups;
}

async function getGroupParticipants(groupId) {
  const chat = await wa.client.getChatById(groupId);
  return (chat.participants || []).map(p => p.id._serialized);
}

// ── Sending ───────────────────────────────────────────────────────────────────
async function runBlast() {
  if (wa.status !== 'ready') throw new Error('WhatsApp not connected');

  const cfg = readJSON(CONFIG_F);
  const log = readJSON(LOG_F);
  const { groups, message, dedup, settings } = cfg;

  if (!groups?.length)  throw new Error('No groups configured');
  if (!message?.trim()) throw new Error('No message set');

  const delay  = (settings?.delay_between_messages_seconds ?? 3) * 1000;
  const dedupe = dedup?.enabled !== false;
  const skip   = settings?.skip_self !== false;
  const myId   = skip ? (await wa.client.getContactById(wa.client.info.wid._serialized))?.id._serialized : null;

  // Collect all unique participants across all selected groups
  const all = new Set();
  for (const gName of groups) {
    const grp = wa.groups.find(g => g.name === gName);
    if (!grp) { console.warn(`Group not found: ${gName}`); continue; }
    const participants = await getGroupParticipants(grp.id);
    participants.forEach(p => all.add(p));
  }

  let sent = 0, skipped = 0;
  const sentContacts    = [];
  const skippedContacts = [];

  for (const contactId of all) {
    if (skip && contactId === myId)              { skipped++; skippedContacts.push({ id: contactId, reason: 'self' }); continue; }
    if (dedupe && log.sent.includes(contactId))  { skipped++; skippedContacts.push({ id: contactId, reason: 'already_sent' }); continue; }

    try {
      const contact = await wa.client.getContactById(contactId);
      const chat    = await contact.getChat();
      await chat.sendMessage(message);
      sentContacts.push(contactId);
      sent++;
      console.log(`  ✉️  Sent to ${contact.name || contactId}`);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    } catch (e) {
      console.error(`  ❌ Failed to send to ${contactId}:`, e.message);
      skipped++;
      skippedContacts.push({ id: contactId, reason: 'error', detail: e.message });
    }
  }

  // Update log
  for (const c of sentContacts) { if (!log.sent.includes(c)) log.sent.push(c); }
  log.runs.push({
    type: 'automation_run',
    timestamp: new Date().toISOString(),
    message,
    sent_count: sent,
    contacts: sentContacts,
    skipped_count: skipped,
    skipped_contacts: skippedContacts,
    notes: '',
  });
  writeJSON(LOG_F, log);

  console.log(`\n📊 Run complete: ${sent} sent, ${skipped} skipped.\n`);
  return { sent, skipped, sentContacts };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let currentCronJob = null;

function applySchedule(cronExpr) {
  if (currentCronJob) { currentCronJob.stop(); currentCronJob = null; }
  if (!cronExpr || cronExpr === 'manual') return;
  if (!cron.validate(cronExpr)) { console.warn('Invalid cron:', cronExpr); return; }
  currentCronJob = cron.schedule(cronExpr, async () => {
    console.log('\n⏰ Scheduled run triggered:', new Date().toISOString());
    try { await runBlast(); } catch (e) { console.error('Scheduled run failed:', e.message); }
  });
  console.log('📅 Schedule set:', cronExpr);
}

// Load schedule from config on start
function loadSchedule() {
  try {
    const cfg = readJSON(CONFIG_F);
    if (cfg.schedule?.cron) applySchedule(cfg.schedule.cron);
  } catch {}
}

// ── REST API ──────────────────────────────────────────────────────────────────

// WhatsApp status
app.get('/api/wa/status', (req, res) => {
  res.json({
    status:      wa.status,
    connected:   wa.status === 'ready',
    qr_ready:    wa.status === 'qr_ready',
    groups_count: wa.groups.length,
  });
});

// QR code image
app.get('/api/wa/qr', (req, res) => {
  if (wa.status !== 'qr_ready' || !wa.qrDataUrl)
    return res.status(404).json({ error: 'No QR code available' });
  res.json({ qr: wa.qrDataUrl });
});

// Groups list — supports ?q=search&page=1&limit=12&force=1
app.get('/api/wa/groups', async (req, res) => {
  const force  = req.query.force === '1';
  if (wa.status === 'ready') await refreshGroups(force);

  const q      = (req.query.q || '').toLowerCase().trim();
  const limit  = Math.min(parseInt(req.query.limit) || 12, 50);
  const page   = Math.max(parseInt(req.query.page)  || 1, 1);

  let filtered = wa.groups;
  if (q) filtered = filtered.filter(g => g.name.toLowerCase().includes(q));

  const total  = filtered.length;
  const pages  = Math.ceil(total / limit) || 1;
  const start  = (page - 1) * limit;
  const items  = filtered.slice(start, start + limit);

  res.json({ groups: items, total, page, pages, limit, cached: !force && !!wa.groupsAt });
});

// Config
app.get('/api/config', (req, res) => res.json(readJSON(CONFIG_F)));
app.put('/api/config', (req, res) => {
  const data = req.body;
  const cfg  = readJSON(CONFIG_F);
  if (data.groups   !== undefined) cfg.groups   = data.groups;
  if (data.message  !== undefined) cfg.message  = data.message;
  if (data.dedup)    Object.assign(cfg.dedup,    data.dedup);
  if (data.settings) Object.assign(cfg.settings, data.settings);
  if (data.schedule) {
    Object.assign(cfg.schedule, data.schedule);
    if (data.schedule.cron !== undefined) applySchedule(data.schedule.cron);
  }
  cfg.schedule.last_updated = new Date().toISOString();
  writeJSON(CONFIG_F, cfg);
  res.json({ ok: true, config: cfg });
});

// Log
app.get('/api/log',        (req, res) => res.json(readJSON(LOG_F)));
app.post('/api/log/clear', (req, res) => {
  const log = readJSON(LOG_F);
  const n   = log.sent.length;
  log.sent  = [];
  log.runs.push({ type: 'manual_clear', timestamp: new Date().toISOString(), cleared_contacts: n });
  writeJSON(LOG_F, log);
  res.json({ ok: true, cleared: n });
});
app.post('/api/log/run', (req, res) => {
  const data = req.body || {};
  const log  = readJSON(LOG_F);
  (data.sent_contacts || []).forEach(c => { if (!log.sent.includes(c)) log.sent.push(c); });
  log.runs.push({ type: 'automation_run', timestamp: new Date().toISOString(),
    message: data.message || '',
    sent_count: (data.sent_contacts||[]).length, contacts: data.sent_contacts||[],
    skipped_count: data.skipped_count||0, skipped_contacts: data.skipped_contacts||[],
    notes: data.notes||'' });
  writeJSON(LOG_F, log);
  res.json({ ok: true });
});

// Status summary
app.get('/api/status', (req, res) => {
  const cfg = readJSON(CONFIG_F);
  const log = readJSON(LOG_F);
  res.json({
    groups_count:  cfg.groups?.length ?? 0,
    message_set:   !!(cfg.message?.trim()),
    sent_total:    log.sent?.length ?? 0,
    runs_total:    log.runs?.length ?? 0,
    last_run:      log.runs?.length ? log.runs[log.runs.length-1].timestamp : null,
    wa_connected:  wa.status === 'ready',
    wa_status:     wa.status,
  });
});

// Logout
app.post('/api/wa/logout', async (req, res) => {
  if (!wa.client) return res.status(400).json({ error: 'No active session' });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('logout timeout')), 5000)
  );
  try {
    // Race logout() against a 5s timeout — it can hang if browser is in a bad state
    await Promise.race([wa.client.logout(), timeout]);
  } catch (e) {
    console.warn('Logout error (ignored):', e.message);
  }
  // Reset state regardless of whether logout() succeeded or timed out
  wa.status      = 'disconnected';
  wa.qrDataUrl   = null;
  wa.groups      = [];
  wa.groupsCache = null;
  wa.groupsAt    = null;
  wa.client      = null;
  // Re-init so a fresh QR is generated
  setTimeout(initWhatsApp, 1000);
  res.json({ ok: true });
});

// Send now
app.post('/api/send-now', async (req, res) => {
  try {
    const result = await runBlast();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   WhatsApp Blaster                   ║`);
  console.log(`║   Dashboard → http://localhost:${PORT}  ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  loadSchedule();
  initWhatsApp();
});
