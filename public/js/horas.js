// horas.js — Banco de Horas MKT (Módulo 23)
(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  let isHead = false;
  let myEmail = '';
  let viewingEmail = '';

  function fmtHours(h) {
    const sign = h > 0 ? '+' : '';
    return sign + h.toFixed(1).replace('.0', '') + 'h';
  }

  function cls(h) {
    if (h > 0) return 'pos';
    if (h < 0) return 'neg';
    return 'zero';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function toast(msg, err) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'hr-toast show' + (err ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = 'hr-toast', 3000);
  }

  // set default date to today
  function initForm() {
    const today = new Date().toISOString().slice(0, 10);
    $('f-date').value = today;
  }

  // ── SALDO ────────────────────────────────────────────────
  async function loadSaldo() {
    try {
      const r = await fetch('/api/horas/saldo');
      if (r.status === 401) { window.location.href = '/login?returnTo=/horas'; return; }
      const d = await r.json();

      const num = $('saldo-num');
      num.textContent = fmtHours(d.meu);
      num.className = 'hr-saldo-num ' + cls(d.meu);

      // detect auth status
      const authR = await fetch('/api/auth/status');
      const auth = await authR.json();
      if (auth.authenticated && auth.user) {
        myEmail = (auth.user.email || '').toLowerCase();
        isHead = auth.user.role === 'head';
      }
      viewingEmail = myEmail;

      // team panel
      if (isHead && d.time) {
        $('team-section').style.display = '';
        renderTeam(d.time);
      }
    } catch (e) {
      console.error('[horas] saldo:', e);
    }
  }

  // ── TEAM GRID (head only) ────────────────────────────────
  function renderTeam(time) {
    const grid = $('team-grid');
    if (!time || !time.length) {
      grid.innerHTML = '<div style="color:var(--hr-text-muted);font-size:13px">Nenhum registro no time ainda.</div>';
      return;
    }
    grid.innerHTML = time.map(p => {
      const name = p.user_name || p.user_email.split('@')[0];
      const alert = p.saldo >= 8
        ? `<div class="hr-team-alert">⚠️ +${p.saldo.toFixed(1)}h acumuladas</div>`
        : '';
      return `<div class="hr-team-card${p.user_email === viewingEmail ? ' active' : ''}"
                   data-email="${esc(p.user_email)}">
        <div class="hr-team-name">${esc(name)}</div>
        <div class="hr-team-saldo ${cls(p.saldo)}">${fmtHours(p.saldo)}</div>
        <div class="hr-team-sub">${p.registros} registros · último: ${fmtDate(p.ultimo_registro)}</div>
        ${alert}
      </div>`;
    }).join('');

    grid.querySelectorAll('.hr-team-card').forEach(card => {
      card.addEventListener('click', () => {
        viewingEmail = card.dataset.email;
        grid.querySelectorAll('.hr-team-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const name = card.querySelector('.hr-team-name').textContent;
        $('hist-title').textContent = `📋 Histórico · ${name}`;
        loadHistory();
      });
    });
  }

  // ── HISTORY ──────────────────────────────────────────────
  async function loadHistory() {
    const body = $('hist-body');
    try {
      const url = isHead && viewingEmail !== myEmail
        ? `/api/horas?email=${encodeURIComponent(viewingEmail)}`
        : '/api/horas';
      const r = await fetch(url);
      const d = await r.json();

      if (!d.registros || !d.registros.length) {
        body.innerHTML = '<tr><td colspan="4" class="hr-empty">Nenhum registro ainda. Use o formulário acima!</td></tr>';
        return;
      }

      body.innerHTML = d.registros.map(row => {
        const canDelete = row.user_email === myEmail || isHead;
        return `<tr>
          <td style="white-space:nowrap">${fmtDate(row.date)}</td>
          <td class="hr-hours-cell ${cls(row.hours)}">${fmtHours(row.hours)}</td>
          <td>${esc(row.reason)}${row.project ? ' <span style="color:var(--hr-text-muted);font-size:11px">· ' + esc(row.project) + '</span>' : ''}</td>
          <td>${canDelete ? `<button class="hr-del-btn" data-id="${row.id}">apagar</button>` : ''}</td>
        </tr>`;
      }).join('');

      body.querySelectorAll('.hr-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Apagar este registro?')) return;
          try {
            const r = await fetch('/api/horas/' + btn.dataset.id, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) {
              toast('Registro apagado');
              loadSaldo();
              loadHistory();
            } else {
              toast(d.error || 'Erro ao apagar', true);
            }
          } catch { toast('Erro de conexão', true); }
        });
      });
    } catch (e) {
      body.innerHTML = '<tr><td colspan="4" class="hr-empty">Erro ao carregar histórico.</td></tr>';
    }
  }

  // ── FORM SUBMIT ──────────────────────────────────────────
  $('horas-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('f-submit');
    btn.disabled = true;

    const payload = {
      date: $('f-date').value,
      hours: parseFloat($('f-hours').value),
      reason: $('f-reason').value.trim()
    };

    try {
      const r = await fetch('/api/horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (d.success) {
        toast(`Registrado! Saldo: ${fmtHours(d.saldo)}`);
        $('f-hours').value = '';
        $('f-reason').value = '';
        loadSaldo();
        loadHistory();
      } else {
        toast(d.error || 'Erro ao registrar', true);
      }
    } catch {
      toast('Erro de conexão', true);
    } finally {
      btn.disabled = false;
    }
  });

  // ── INIT ─────────────────────────────────────────────────
  initForm();
  loadSaldo().then(() => loadHistory());
})();
