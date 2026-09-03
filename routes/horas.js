// ════════════════════════════════════════════════════════════════════════════
// routes/horas.js — Módulo 23: Banco de Horas MKT
// Controle interno de horas extras/a menos do time de marketing.
// Saldo acumulativo, visibilidade pessoal (head vê todos).
// Notifica Rudá via Resend quando alguém ultrapassa +8h.
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { db, resend, requireAuth } = require('../server-context');

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'ruda.costa@epiuse.com.br';
const FROM_EMAIL   = process.env.FROM_EMAIL   || 'voices@resend.dev';
const THRESHOLD_H  = 8;

// ── SCHEMA ───────────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS hour_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email  TEXT    NOT NULL,
  user_name   TEXT    NOT NULL DEFAULT '',
  date        TEXT    NOT NULL,
  hours       REAL    NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  project     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS hour_notifications (
  user_email  TEXT    NOT NULL,
  threshold   REAL    NOT NULL,
  sent_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, threshold)
)`);

// ── HELPERS ──────────────────────────────────────────────────────────────────
function isHead(req) {
  return req.session?.user?.role === 'head';
}

function getEmail(req) {
  return req.session?.user?.email?.toLowerCase();
}

function getSaldo(email) {
  const row = db.prepare('SELECT COALESCE(SUM(hours), 0) AS saldo FROM hour_logs WHERE user_email = ?').get(email);
  return row ? row.saldo : 0;
}

function getSaldoAll() {
  return db.prepare(`
    SELECT user_email, user_name, COALESCE(SUM(hours), 0) AS saldo, COUNT(*) AS registros,
           MAX(date) AS ultimo_registro
    FROM hour_logs GROUP BY user_email ORDER BY user_name
  `).all();
}

async function checkAndNotify(email, name) {
  const saldo = getSaldo(email);
  if (saldo < THRESHOLD_H) return;

  const bucket = Math.floor(saldo / THRESHOLD_H) * THRESHOLD_H;
  const already = db.prepare('SELECT 1 FROM hour_notifications WHERE user_email = ? AND threshold = ?').get(email, bucket);
  if (already) return;

  db.prepare('INSERT OR IGNORE INTO hour_notifications (user_email, threshold) VALUES (?, ?)').run(email, bucket);

  if (!resend) {
    console.log(`[horas] notificação pulada (sem Resend): ${name} atingiu +${saldo}h`);
    return;
  }

  try {
    const displayName = name || email.split('@')[0];
    await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `⏰ Banco de Horas — ${displayName} atingiu +${saldo.toFixed(1)}h acumuladas`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px">
          <h2 style="color:#001844;margin:0 0 16px">⏰ Alerta de Banco de Horas</h2>
          <p style="font-size:15px;line-height:1.6;color:#333">
            <strong>${displayName}</strong> (${email}) atingiu
            <strong style="color:#cd1543">+${saldo.toFixed(1)}h</strong> acumuladas
            no banco de horas.
          </p>
          <p style="font-size:13px;color:#666;margin-top:16px">
            Threshold: a cada +${THRESHOLD_H}h acumuladas.<br>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/horas" style="color:#001844">
              Ver painel completo →
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="font-size:11px;color:#999">EPI-USE Office · Banco de Horas MKT</p>
        </div>
      `
    });
    console.log(`[horas] email enviado: ${name} atingiu +${saldo}h → ${NOTIFY_EMAIL}`);
  } catch (e) {
    console.warn('[horas] falha ao enviar email:', e.message);
  }
}

// ── PAGE ─────────────────────────────────────────────────────────────────────
router.get('/horas', requireAuth, (req, res) => {
  res.sendFile('horas.html', { root: 'public' });
});

// ── API: meu saldo (ou todos, se head) ───────────────────────────────────────
router.get('/api/horas/saldo', requireAuth, (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(401).json({ error: 'auth_required' });

  if (isHead(req)) {
    const all = getSaldoAll();
    const meu = getSaldo(email);
    return res.json({ meu, time: all });
  }

  res.json({ meu: getSaldo(email) });
});

// ── API: listar registros ────────────────────────────────────────────────────
router.get('/api/horas', requireAuth, (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(401).json({ error: 'auth_required' });

  const targetEmail = isHead(req) && req.query.email ? req.query.email.toLowerCase() : email;

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const rows = db.prepare(`
    SELECT * FROM hour_logs WHERE user_email = ?
    ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?
  `).all(targetEmail, limit, offset);

  const total = db.prepare('SELECT COUNT(*) AS c FROM hour_logs WHERE user_email = ?').get(targetEmail).c;
  const saldo = getSaldo(targetEmail);

  res.json({ registros: rows, total, saldo, email: targetEmail });
});

// ── API: novo registro ───────────────────────────────────────────────────────
router.post('/api/horas', requireAuth, (req, res) => {
  const email = getEmail(req);
  const name = req.session?.user?.name || '';
  if (!email) return res.status(401).json({ error: 'auth_required' });

  const { date, hours, reason, project } = req.body;
  if (!date || hours == null) return res.status(400).json({ error: 'date e hours são obrigatórios' });

  const h = parseFloat(hours);
  if (isNaN(h) || h === 0) return res.status(400).json({ error: 'hours deve ser um número diferente de zero' });
  if (Math.abs(h) > 24) return res.status(400).json({ error: 'máximo de ±24h por registro' });

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return res.status(400).json({ error: 'date deve ser YYYY-MM-DD' });

  const result = db.prepare(`
    INSERT INTO hour_logs (user_email, user_name, date, hours, reason, project)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(email, name, date, h, (reason || '').slice(0, 500), (project || '').slice(0, 100));

  checkAndNotify(email, name);

  res.json({ success: true, id: result.lastInsertRowid, saldo: getSaldo(email) });
});

// ── API: apagar registro (só o próprio) ──────────────────────────────────────
router.delete('/api/horas/:id', requireAuth, (req, res) => {
  const email = getEmail(req);
  if (!email) return res.status(401).json({ error: 'auth_required' });

  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT * FROM hour_logs WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'registro não encontrado' });
  if (row.user_email !== email && !isHead(req)) return res.status(403).json({ error: 'só pode apagar registros próprios' });

  db.prepare('DELETE FROM hour_logs WHERE id = ?').run(id);
  res.json({ success: true, saldo: getSaldo(email) });
});

module.exports = router;
