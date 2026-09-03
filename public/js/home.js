// home.js — EPI-USE Office HOME (Sprint 20 · v2 pipeline)
// Carrega digest + métricas + áreas + alertas em paralelo
// Tema é gerenciado pelo office-nav (NÃO duplicar — Ressalva R4)

(function() {
  'use strict';
  // marca JS carregado — fallback sem JS mantem sections visiveis (CSS rule)
  document.documentElement.classList.add('js-loaded');

  // ── HELPERS ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const fmt = n => n == null ? '—' : (typeof n === 'number' ? n.toLocaleString('pt-BR') : n);
  const esc = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function saudacao() {
    const h = new Date().getHours();
    if (h < 6) return 'Boa madrugada';
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  // SVG sparkline minimalista (4-8 pontos)
  function spark(pts, cor) {
    if (!pts || pts.length < 2) return '<svg viewBox="0 0 100 28"></svg>';
    const max = Math.max(...pts), min = Math.min(...pts), rng = (max-min) || 1;
    const w = 100, h = 28, pad = 2;
    const xs = pts.map((_, i) => pad + i * (w - 2*pad) / (pts.length-1));
    const ys = pts.map(v => h - pad - (v - min) * (h - 2*pad) / rng);
    const line = pts.map((v, i) => (i ? 'L' : 'M') + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="area-spark" preserveAspectRatio="none">
      <path d="${line}" fill="none" stroke="${cor||'#869ec3'}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  // ── NOME do usuário (SSO > persona ativa > office.user) ─────────
  async function getNome() {
    try {
      const r = await fetch('/api/auth/status');
      const d = await r.json();
      if (d.authenticated && d.user) {
        return (d.user.name || '').split(' ')[0] || 'Rudá';
      }
    } catch {}
    // persona selecionada no "Ver como" tem prioridade sobre office.user
    const ov = (typeof readPersonaOverride === 'function') ? readPersonaOverride() : null;
    const pid = ov && ov.persona;
    if (pid && PERSONAS?.personas?.[pid]?.nome) {
      return PERSONAS.personas[pid].nome.split(' ')[0];
    }
    try {
      let v = localStorage.getItem('office.user') || 'Rudá';
      // migra valor legado JSON {"nome":"X"} salvo por versão antiga
      if (v.startsWith('{')) { const p = JSON.parse(v); v = p.nome || p.name || 'Rudá'; localStorage.setItem('office.user', v); }
      return v.split(' ')[0];
    } catch { return 'Rudá'; }
  }

  // ── HERO ────────────────────────────────────────────────────────
  async function renderHero() {
    const nome = await getNome();
    // saudação traduz (dict); nome é dado real → data-no-translate
    const nomeSafe = String(nome).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    $('hero-saudacao').innerHTML = `${saudacao()}<span data-no-translate>, ${nomeSafe} 👋</span>`;
    const LOC = { pt:'pt-BR', en:'en-US', es:'es-ES' };
    const lang = (window.getLang ? window.getLang() : 'pt');
    const hoje = new Date().toLocaleDateString(LOC[lang] || 'pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    $('hero-data').setAttribute('data-no-translate', ''); // formatada localmente (locale-aware)
    $('hero-data').textContent = hoje;
    // re-formata a data quando trocar idioma
    if (!window.__heroDateHook) {
      window.__heroDateHook = true;
      document.addEventListener('office:langchange', () => { try { renderHero(); } catch(e){} });
    }
  }

  // ── DIGEST (3 cards) ────────────────────────────────────────────
  async function renderDigest() {
    const target = $('digest-grid');
    try {
      const [voicesR, eventosR, pendR] = await Promise.all([
        fetch('/api/voices.json').then(r => r.json()).catch(() => ({})),
        fetch('/api/events.json').then(r => r.json()).catch(() => ({})),
        fetch('/api/pendencias').then(r => r.json()).catch(() => ({}))
      ]);
      const voicesAtivos = (voicesR.voices || []).length;
      const voicesMeta = voicesR.programa?.vagas_total || 5;
      const ev7d = countEventos7d(eventosR);
      const bloqueados = (pendR.buckets?.bloqueadas || []).length + (pendR.buckets?.achados || []).length;
      target.innerHTML = `
        <div class="home-digest-card">
          <div class="label">Voices ativos</div>
          <div class="value">${voicesAtivos}/${voicesMeta}</div>
          <div class="sub">programa MVP em curso</div>
        </div>
        <div class="home-digest-card${ev7d === 0 ? '' : ' warn'}">
          <div class="label">Eventos · próximos 7d</div>
          <div class="value">${ev7d}</div>
          <div class="sub">${ev7d === 0 ? 'sem eventos esta semana' : 'na agenda'}</div>
        </div>
        <div class="home-digest-card${bloqueados > 0 ? ' alert' : ''}">
          <div class="label">Pendências 🔴 / ⚠️</div>
          <div class="value">${bloqueados}</div>
          <div class="sub">${bloqueados === 0 ? 'tudo no eixo' : 'ver Alertas & Bloqueios ↓'}</div>
        </div>`;
    } catch (e) {
      target.innerHTML = '<div class="home-empty">Erro ao carregar digest.</div>';
    }
  }

  function countEventos7d(ev) {
    try {
      const lista = []
        .concat((ev.abas?.brasil?.eventos) || [])
        .concat((ev.abas?.latam?.eventos) || []);
      const hoje = new Date();
      const ymHoje = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
      // contagem aproximada: eventos do mês corrente
      return lista.filter(e => {
        if (e.y && e.m) return (e.y * 100 + e.m) === ymHoje;
        return false;
      }).length;
    } catch { return 0; }
  }

  // ── METAS FY26 STRIP ────────────────────────────────────────────
  async function renderMetas() {
    const target = $('metas-strip');
    try {
      const r = await fetch('/api/areas.json'); const d = await r.json();
      const metas = [];
      (d.areas || []).forEach(a => {
        (a.funil || []).forEach(s => {
          if (s.valor != null && s.meta) {
            const pct = Math.round(100 * s.valor / s.meta);
            metas.push({ nome: a.nome.split(' ')[0], estagio: s.estagio, valor: s.valor, meta: s.meta, pct, cor: a.cor });
          }
        });
      });
      const top = metas.sort((a, b) => b.pct - a.pct).slice(0, 5);
      if (!top.length) { target.innerHTML = '<div class="home-empty">Sem metas com valor real ainda.</div>'; return; }
      target.innerHTML = top.map(m => {
        const cls = m.pct >= 75 ? 'ok' : m.pct >= 50 ? 'warn' : 'off';
        return `<div class="home-meta-cell">
          <div class="nome">${esc(m.nome)} · ${esc(m.estagio.slice(0, 20))}</div>
          <div class="pct ${cls}">${m.pct}%</div>
          <div class="bar"><i class="${cls}" style="width:${Math.min(100,m.pct)}%"></i></div>
        </div>`;
      }).join('');
    } catch {
      target.innerHTML = '<div class="home-empty">⏳ Aguarda integração de metas.</div>';
    }
  }

  // ── GRID 6 ÁREAS + SAP card disabled (7º) ───────────────────────
  async function renderAreas() {
    const target = $('areas-grid');
    try {
      const r = await fetch('/api/areas.json'); const d = await r.json();
      const areas = d.areas || [];
      const cards = areas.map(a => {
        const cor = a.cor || '#869ec3';
        const kpis = (a.kpis || []).slice(0, 2).map(k => {
          const v = k.valor != null ? fmt(k.valor) : '<span style="color:var(--home-text-muted)">⏳</span>';
          return `<div class="area-kpi"><span>${esc(k.label).slice(0, 22)}</span><strong>${v}</strong></div>`;
        }).join('');
        // sparkline: usa valores numéricos do funil se houver, senão omite
        const valoresNum = (a.funil || []).map(s => s.valor).filter(v => typeof v === 'number');
        const sparkSvg = valoresNum.length >= 2 ? spark(valoresNum, cor) : '';
        return `<a class="home-area-card" href="/area/${esc(a.id)}" style="--area-color:${cor}">
          <div>
            <div class="area-head">
              <span class="area-icon">${esc(a.icon||'📂')}</span>
            </div>
            <div class="area-nome">${esc(a.nome)}</div>
            <div class="area-dona">👤 ${esc(a.dona)}</div>
            <div class="area-kpis">${kpis}</div>
            ${sparkSvg}
          </div>
          <div class="area-footer"><span>Abrir módulo</span><span class="arrow">→</span></div>
        </a>`;
      }).join('');
      // SAP Competitor "em breve" (Ressalva: skill não funciona ainda)
      const sapCard = `<div class="home-area-card disabled" style="--area-color:#a37d57" aria-disabled="true">
        <div>
          <div class="area-head">
            <span class="area-icon">🔍</span>
            <span class="area-emcoming">🔜 em breve</span>
          </div>
          <div class="area-nome">SAP Competitor Intel</div>
          <div class="area-dona">👤 Bruna · skill em construção</div>
          <div class="area-kpis">
            <div class="area-kpi"><span>Concorrentes mapeados</span><strong>⏳</strong></div>
            <div class="area-kpi"><span>LinkedIn ranking</span><strong>⏳</strong></div>
          </div>
        </div>
        <div class="area-footer"><span>Indisponível</span><span class="arrow">·</span></div>
      </div>`;
      target.innerHTML = cards + sapCard;
    } catch {
      target.innerHTML = '<div class="home-empty">Erro ao carregar áreas.</div>';
    }
  }

  // ── ALERTAS & BLOQUEIOS (substitui War Room) ────────────────────
  async function renderAlertas() {
    const target = $('alerts-list');
    try {
      const r = await fetch('/api/pendencias'); const d = await r.json();
      const bloq = d.buckets?.bloqueadas || [];
      const ach = d.buckets?.achados || [];
      const items = [
        ...bloq.map(x => ({ ...x, tipo: 'b', tag: '🔴 BLOQ' })),
        ...ach.map(x => ({ ...x, tipo: 'a', tag: '⚠️ ACHADO' }))
      ];
      if (!items.length) {
        target.innerHTML = '<div class="home-empty">🎉 Sem bloqueios ativos.</div>';
        return;
      }
      target.innerHTML = items.map(i => `<div class="home-alert-item">
        <span class="tag ${i.tipo}">${i.tag}</span>
        <div style="flex:1; min-width:0;">
          <div class="titulo">${esc(i.titulo)}</div>
          <div class="desc">${esc((i.descricao||'').slice(0, 140))}</div>
        </div>
      </div>`).join('');
    } catch {
      target.innerHTML = '<div class="home-empty">Erro ao carregar alertas.</div>';
    }
  }

  // ── EVENTOS BR/LATAM/TODOS (grid mensal) ────────────────────────
  const MES_NOMES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const LOB_CORES = {
    HCM:'#60a5fa', ERP:'#34d399', Cross:'#c084fc', BTP:'#fb923c', Cloud:'#22d3ee',
    Branding:'#f472b6', Institucional:'#f87171', WFS:'#fbbf24', SN:'#818cf8', BTM:'#2dd4bf'
  };
  // ── AGENDA UNIFICADA (eventos + posts + artigos + MDF/deadlines + ações) ───
  // Tudo num só lugar, agrupado por mês (layout de cards). Camadas filtráveis.
  const ANO = new Date().getFullYear();
  const CAMADAS = [
    { id:'evento',     label:'🔴 Eventos',        cor:'#cd1543' },
    { id:'artigo',     label:'📰 Artigos',        cor:'#001844' },
    { id:'post',       label:'📝 Posts (Duda)',   cor:'#0369a1' },
    { id:'mdf',        label:'💶 MDF/Deadlines',  cor:'#dc2626' },
    { id:'data',       label:'🎉 Datas',          cor:'#d97706' },
  ];
  let AG_ITEMS = [];                              // itens normalizados
  let AG_ATIVAS = new Set(CAMADAS.map(c => c.id)); // camadas visíveis

  function diaFromISO(iso){ const p=String(iso).split('-'); return p[2]?String(parseInt(p[2])):'?'; }
  function mesFromISO(iso){ const p=String(iso).split('-'); return p[1]?parseInt(p[1]):null; }

  function agGetVisiveis(){ return AG_ITEMS.filter(i => AG_ATIVAS.has(i.camada)); }

  function renderAgMonth(m, items, mode) {
    const evs = items.filter(e => e.m === m).sort((a,b) => String(a.d).localeCompare(String(b.d), undefined, {numeric:true}));
    const isEmpty = evs.length === 0;
    const cls = mode === 'past' ? 'past' : mode === 'current' ? 'current' : (isEmpty ? 'empty' : '');
    const curBadge = mode === 'current' ? ' <span style="font-size:8px;color:#34d399;background:rgba(16,185,129,.18);padding:3px 5px;border-radius:4px;margin-left:6px;letter-spacing:.1em">AGORA</span>' : '';
    const countTxt = mode === 'past' ? 'passou' : `${evs.length} ${evs.length === 1 ? 'item' : 'itens'}`;
    let body = isEmpty ? '<div class="home-evt-empty">— sem itens —</div>' : evs.map(e => {
      const flag = e.flag ? `<span style="margin-right:4px">${e.flag}</span>` : '';
      const tag = e.tag ? `<span class="lob" style="background:${e.cor}22;color:${e.cor}">${esc(e.tag)}</span>` : '';
      return `<div class="home-evt-item" style="border-left:3px solid ${e.cor};padding-left:8px">
        <div class="home-evt-day">${esc(e.d)}</div>
        <div class="home-evt-info">
          <div class="nome">${flag}${esc(e.n)}${tag}</div>
          <div class="who">${esc(e.who||'')}</div>
        </div>
      </div>`;
    }).join('');
    return `<div class="home-evt-month ${cls}">
      <div class="home-evt-month-head">
        <span class="home-evt-month-name">${MES_NOMES[m-1]}${curBadge}</span>
        <span class="home-evt-month-count">${countTxt}</span>
      </div>
      ${body}
    </div>`;
  }

  // Modo de visualização: 'compact' (default, Daily Planner) ou 'full' (cronograma anual)
  let AG_MODE = localStorage.getItem('office.agenda.mode') || 'compact';
  const MES_BR_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  function parseDayNum(d){ const n = parseInt(String(d).replace(/[^0-9]/g,''),10); return isNaN(n)?null:n; }

  // ── COMPACT MODE — mini grid mês corrente + lista top próximos (BR) + sanfona LATAM ──
  function renderEventosCompact(){
    const grid = $('evt-grid');
    const items = agGetVisiveis();
    $('evt-count').textContent = `${items.length} itens · vista compacta`;

    const hoje = new Date();
    const Y = hoje.getFullYear();
    const M = hoje.getMonth() + 1; // 1-12
    const todayD = hoje.getDate();
    const dim = new Date(Y, M, 0).getDate(); // dias do mês
    const firstDow = new Date(Y, M-1, 1).getDay(); // 0=Dom

    // Mapa dia→items do mês corrente (BR/sem país)
    const mesItems = items.filter(i => i.m === M && (!i.country || i.country === 'BR'));
    const byDay = {};
    for (const it of mesItems){
      const d = parseDayNum(it.d); if (!d) continue;
      (byDay[d] = byDay[d] || []).push(it);
    }

    // Mini grid celulas
    let cells = '';
    const DOW = ['D','S','T','Q','Q','S','S'];
    cells += DOW.map(x=>`<div class="dp-dow">${x}</div>`).join('');
    for (let i=0;i<firstDow;i++) cells += `<div class="dp-cell empty"></div>`;
    for (let d=1; d<=dim; d++){
      const list = byDay[d]||[];
      const isToday = d === todayD;
      const dots = list.slice(0,3).map(it=>`<span class="dp-dot" style="background:${it.cor}"></span>`).join('');
      const more = list.length>3 ? `<span class="dp-more">+${list.length-3}</span>` : '';
      cells += `<div class="dp-cell ${isToday?'today':''} ${list.length?'has':''}" data-day="${d}" title="${list.length} item(s)">
        <div class="dp-num">${d}</div>
        <div class="dp-dots">${dots}${more}</div>
      </div>`;
    }

    // Top 8 próximos (BR) — current month em diante, ordenado
    const proximos = items
      .filter(i => (!i.country || i.country === 'BR'))
      .filter(i => i.m > M || (i.m === M && (parseDayNum(i.d)||0) >= todayD))
      .sort((a,b)=> (a.m-b.m) || ((parseDayNum(a.d)||99) - (parseDayNum(b.d)||99)))
      .slice(0, 8);
    const proxHtml = proximos.length ? proximos.map(e=>{
      const flag = e.flag ? `<span style="margin-right:4px">${e.flag}</span>` : '';
      const tag = e.tag ? `<span class="lob" style="background:${e.cor}22;color:${e.cor}">${esc(e.tag)}</span>` : '';
      return `<div class="home-evt-item" style="border-left:3px solid ${e.cor};padding-left:8px">
        <div class="home-evt-day">${esc(e.d)}<span style="display:block;font-size:9px;opacity:.6">${MES_BR_SHORT[e.m-1]}</span></div>
        <div class="home-evt-info">
          <div class="nome">${flag}${esc(e.n)}${tag}</div>
          <div class="who">${esc(e.who||'')}</div>
        </div>
      </div>`;
    }).join('') : '<div class="home-evt-empty">Nada por aqui. ✨</div>';

    // LATAM acordeão (eventos com country !== BR, próximos 90d aproximação por mês)
    const latam = items
      .filter(i => i.camada==='evento' && i.country && i.country !== 'BR')
      .filter(i => i.m >= M)
      .sort((a,b)=> (a.m-b.m) || ((parseDayNum(a.d)||99) - (parseDayNum(b.d)||99)));
    const latamHtml = latam.length ? latam.slice(0,20).map(e=>`
      <div class="home-evt-item" style="border-left:3px solid ${e.cor};padding-left:8px">
        <div class="home-evt-day">${esc(e.d)}<span style="display:block;font-size:9px;opacity:.6">${MES_BR_SHORT[e.m-1]}</span></div>
        <div class="home-evt-info">
          <div class="nome">${e.flag?`<span style="margin-right:4px">${e.flag}</span>`:''}${esc(e.n)}</div>
          <div class="who">${esc(e.who||'')}</div>
        </div>
      </div>`).join('') : '<div class="home-evt-empty">Sem eventos LATAM no horizonte.</div>';

    grid.innerHTML = `
      <style>
        .dp-root { grid-column: 1 / -1; display:block; }
        .dp-wrap { display:grid; grid-template-columns: minmax(280px, 1fr) minmax(260px, 1fr); gap:18px; align-items:start; }
        @media (max-width: 760px){ .dp-wrap { grid-template-columns: 1fr; } }
        .dp-cal { background:var(--dk-surface,rgba(255,255,255,.02)); border:1px solid rgba(96,165,250,.12); border-radius:12px; padding:14px; }
        .dp-cal-h { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
        .dp-cal-h .m { font-weight:700; font-size:14px; color:var(--home-text,#e2e8f0); }
        .dp-cal-h .y { font-size:10px; color:var(--home-text-muted,#64748b); font-family:'JetBrains Mono',monospace; letter-spacing:.1em; }
        .dp-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; }
        .dp-dow { font-size:9px; color:var(--home-text-muted,#64748b); text-align:center; padding:4px 0; font-weight:700; letter-spacing:.1em; }
        .dp-cell { aspect-ratio:1/1; min-height:44px; border-radius:6px; padding:4px 5px; background:rgba(96,165,250,.04); display:flex; flex-direction:column; justify-content:space-between; transition:background .15s; cursor:default; position:relative; }
        .dp-cell.empty { background:transparent; }
        .dp-cell.has { background:rgba(96,165,250,.10); cursor:pointer; }
        .dp-cell.has:hover { background:rgba(96,165,250,.20); }
        .dp-cell.today { outline:2px solid #cd1543; }
        .dp-num { font-size:11px; font-weight:600; color:var(--home-text,#e2e8f0); }
        .dp-cell.today .dp-num { color:#fca5a5; }
        .dp-dots { display:flex; gap:2px; align-items:center; flex-wrap:wrap; }
        .dp-dot { width:5px; height:5px; border-radius:50%; }
        .dp-more { font-size:8px; color:var(--home-text-muted,#64748b); font-family:'JetBrains Mono',monospace; }
        .dp-side { display:flex; flex-direction:column; gap:8px; }
        .dp-side h4 { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--home-text-muted,#94a3b8); margin:0 0 6px; }
        .dp-acc { background:var(--dk-surface,rgba(255,255,255,.02)); border:1px solid rgba(96,165,250,.12); border-radius:10px; margin-top:14px; overflow:hidden; }
        .dp-acc-h { padding:12px 14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; color:var(--home-text,#e2e8f0); user-select:none; }
        .dp-acc-h:hover { background:rgba(96,165,250,.06); }
        .dp-acc-h .arrow { transition:transform .2s; font-size:10px; opacity:.6; }
        .dp-acc[open] .dp-acc-h .arrow { transform:rotate(90deg); }
        .dp-acc-body { padding:0 14px 14px; display:none; }
        .dp-acc[open] .dp-acc-body { display:block; }
      </style>
      <div class="dp-root">
      <div class="dp-wrap">
        <div class="dp-cal" aria-label="Mês corrente">
          <div class="dp-cal-h"><span class="m">${MES_NOMES[M-1]}</span><span class="y">${Y}</span></div>
          <div class="dp-grid">${cells}</div>
        </div>
        <div class="dp-side">
          <h4>📌 Próximos itens (Brasil)</h4>
          ${proxHtml}
        </div>
      </div>
      <div class="dp-acc" id="dp-latam">
        <div class="dp-acc-h" data-acc="latam">
          <span>🌎 LATAM &amp; Internacional — ${latam.length} item${latam.length===1?'':'s'}</span>
          <span class="arrow">▶</span>
        </div>
        <div class="dp-acc-body">${latamHtml}</div>
      </div>
      </div>
    `;
    // Acordeão LATAM
    const acc = grid.querySelector('#dp-latam');
    acc?.querySelector('.dp-acc-h')?.addEventListener('click', ()=>{
      if (acc.hasAttribute('open')) acc.removeAttribute('open'); else acc.setAttribute('open','');
    });
    // Click em dia preenchido scrolla pra sanfona se for LATAM ou expande detalhes
    grid.querySelectorAll('.dp-cell.has').forEach(c=>{
      c.addEventListener('click', ()=>{
        const d = parseInt(c.dataset.day, 10);
        const items2 = byDay[d]||[];
        if (!items2.length) return;
        const sum = items2.map(i=>`${i.flag||''} ${i.n}`).join('\n');
        alert(`${MES_NOMES[M-1]} ${d} · ${items2.length} item(s):\n\n${sum}`);
      });
    });
  }

  // ── FULL MODE — cronograma anual (versão anterior) ──
  function renderEventosFull(){
    const grid = $('evt-grid');
    const items = agGetVisiveis();
    $('evt-count').textContent = `${items.length} itens · vista anual`;
    const cur = new Date().getMonth() + 1;
    const start = Math.max(1, cur - 1);
    let html = '';
    for (let m = start; m <= 12; m++) html += renderAgMonth(m, items, m === cur ? 'current' : 'future');
    if (start > 1) {
      html += `<div class="home-evt-divider"><span></span><span class="txt">↓ Já passou ↓</span><span></span></div>`;
      for (let m = 1; m < start; m++) html += renderAgMonth(m, items, 'past');
    }
    grid.innerHTML = html;
  }

  function renderEventos(){
    if (AG_MODE === 'full') renderEventosFull(); else renderEventosCompact();
  }

  // Toggle compact/full button injection — adiciona ao header da seção
  function ensureAgendaToggle(){
    const sec = document.querySelector('[data-sec="agenda"]');
    if (!sec || sec.querySelector('#ag-mode-toggle')) return;
    const link = sec.querySelector('a[href="/inbound/calendar"]');
    if (!link) return;
    const btn = document.createElement('button');
    btn.id = 'ag-mode-toggle';
    btn.type = 'button';
    btn.style.cssText = 'font-size:11px;color:var(--dk-text-muted,#94a3b8);background:rgba(96,165,250,.06);border:1px solid rgba(96,165,250,.2);border-radius:6px;padding:4px 10px;cursor:pointer;margin-right:6px';
    const label = () => AG_MODE === 'compact' ? '📋 Ver cronograma anual' : '📅 Vista compacta';
    btn.textContent = label();
    btn.addEventListener('click', () => {
      AG_MODE = AG_MODE === 'compact' ? 'full' : 'compact';
      localStorage.setItem('office.agenda.mode', AG_MODE);
      btn.textContent = label();
      renderEventos();
    });
    link.parentNode.insertBefore(btn, link);
  }

  async function initEventos() {
    try {
      const [ev, cal, dl, df, dat] = await Promise.all([
        fetch('/api/events.json').then(r=>r.json()).catch(()=>({abas:{}})),
        fetch(`/api/inbound/calendar?from=${ANO}-01-01&to=${ANO}-12-31`).then(r=>r.json()).catch(()=>({posts:[]})),
        fetch('/api/deadlines-2026.json').then(r=>r.json()).catch(()=>({itens:[]})),
        fetch('/api/development-funds').then(r=>r.json()).catch(()=>({requests:[]})),
        fetch('/api/datas-especiais-2026.json').then(r=>r.json()).catch(()=>({itens:[]})),
      ]);
      const items = [];

      // 1 — Eventos EPI-USE/SAP (BR + LATAM)
      for (const aba of Object.values(ev.abas || {})) {
        for (const e of (aba.eventos || [])) {
          if (!e.m) continue;
          const country = e.country || 'BR';
          items.push({ camada:'evento', m:e.m, d:String(e.d||'TBC'), n:e.n, country,
            who:[e.who, country!=='BR'?country:''].filter(Boolean).join(' · '),
            flag:e.flag||'', tag:e.lob||'', cor: LOB_CORES[e.lob] || '#cd1543' });
        }
      }
      // 2 — Editorial (artigos Redatoria + posts Duda)
      for (const p of (cal.posts || [])) {
        const m = mesFromISO(p.data); if (!m) continue;
        const camada = p.fonte === 'redatoria' ? 'artigo' : 'post';
        const cor = camada === 'artigo' ? '#001844' : '#0369a1';
        items.push({ camada, m, d:diaFromISO(p.data), n:p.titulo||'(sem título)',
          who:[p.autor, p.canal].filter(Boolean).join(' · '), tag:p.pilar||'', cor });
      }
      // 3 — Deadlines MDF gerais
      for (const it of (dl.itens || [])) {
        const m = mesFromISO(it.data); if (!m) continue;
        items.push({ camada:'mdf', m, d:diaFromISO(it.data), n:it.nome, who:'deadline SAP', tag:'MDF', cor:'#dc2626' });
      }
      // 4 — Claims DF a reclamar (expiração) — só não derrubados, claim pendente
      for (const r of (df.requests || [])) {
        if (r.derrubado || (+r.claim||0) > 0 || !r.expiracao) continue;
        const m = mesFromISO(r.expiracao); if (!m) continue;
        items.push({ camada:'mdf', m, d:diaFromISO(r.expiracao), n:`💶 Expira claim: ${r.nome}`,
          who:`€${Number(r.aprovado||0).toLocaleString('pt-BR')} · ${r.status||''}`, tag:'claim', cor:'#dc2626' });
      }
      // 5 — Datas comemorativas (só tipo comemorativa/premiacao, não feriado pra não poluir)
      for (const it of (dat.itens || [])) {
        if (!it.data) continue;
        if (!['comemorativa','premiacao','efemeride'].includes(it.tipo)) continue;
        const m = mesFromISO(it.data); if (!m) continue;
        items.push({ camada:'data', m, d:diaFromISO(it.data), n:it.nome, who:it.descricao||'', tag:'', cor: it.cor||'#d97706' });
      }

      AG_ITEMS = items;

      // Filtros por camada (substitui tabs BR/LATAM/TODOS)
      const tabsEl = $('evt-tabs');
      if (tabsEl) {
        const counts = {}; for (const c of CAMADAS) counts[c.id] = items.filter(i=>i.camada===c.id).length;
        tabsEl.innerHTML = CAMADAS.map(c =>
          `<button class="home-evt-tab active" data-cam="${c.id}" style="border-color:${c.cor}66">${c.label} (${counts[c.id]})</button>`
        ).join('');
        tabsEl.querySelectorAll('.home-evt-tab').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.cam;
            if (AG_ATIVAS.has(id)) { AG_ATIVAS.delete(id); btn.classList.remove('active'); }
            else { AG_ATIVAS.add(id); btn.classList.add('active'); }
            renderEventos();
          });
        });
      }
      ensureAgendaToggle();
      renderEventos();
    } catch (e) {
      $('evt-grid').innerHTML = '<div class="home-empty">Falha ao carregar agenda</div>';
    }
  }

  // ── ANIVERSÁRIOS ────────────────────────────────────────────────
  async function renderBdays() {
    const target = $('bday-grid');
    try {
      const r = await fetch('/api/team.json'); const team = await r.json();
      const all = [
        ...(team.lideranca || []).map(p => ({ nome: p.nome, papel: p.cargo, icon: p.icon, color: '#34d399', aniversario: p.aniversario })),
        ...(team.areas || []).map(a => ({ nome: a.responsavel.nome, papel: a.nome, icon: a.icon, color: a.color, aniversario: a.responsavel.aniversario, avatar_grad: a.responsavel.avatar_grad }))
      ].filter(p => p.aniversario);

      const today = new Date(); const Y = today.getFullYear();
      const nextOcc = ddmm => {
        const [d, m] = ddmm.split('/').map(n => parseInt(n, 10));
        let next = new Date(Y, m-1, d);
        if (next < new Date(Y, today.getMonth(), today.getDate())) next = new Date(Y+1, m-1, d);
        return next;
      };
      const daysUntil = date => Math.floor((date - new Date(Y, today.getMonth(), today.getDate())) / 86400000);
      const sorted = all.map(p => ({...p, _date: nextOcc(p.aniversario), _days: daysUntil(nextOcc(p.aniversario))}))
        .sort((a, b) => a._days - b._days);
      const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

      // ── confete/lembrete de aniversário ──
      const bdayToday = sorted.filter(p => p._days === 0);
      if (bdayToday.length) {
        const me = await getNome();
        const meLower = (me || '').toLowerCase();
        const isMeBday = bdayToday.some(p => p.nome.toLowerCase().startsWith(meLower));
        const todayKey = 'bday-seen-' + today.toISOString().slice(0, 10);

        if (isMeBday && !localStorage.getItem(todayKey)) {
          localStorage.setItem(todayKey, '1');
          const outros = all.filter(p => !p.nome.toLowerCase().startsWith(meLower)).map(p => p.nome.split(' ')[0]);
          showBdayConfetti(me, outros);
        } else if (!isMeBday && !localStorage.getItem(todayKey + '-toast')) {
          localStorage.setItem(todayKey + '-toast', '1');
          const nomes = bdayToday.map(p => p.nome.split(' ')[0]);
          showBdayToast(nomes);
        }
      }

      target.innerHTML = sorted.map(p => {
        const isToday = p._days === 0;
        const isSoon = p._days > 0 && p._days <= 30;
        const badge = isToday ? `<span class="home-bday-badge today">🎉 HOJE</span>`
          : isSoon ? `<span class="home-bday-badge soon">em ${p._days}d</span>`
          : `<span class="home-bday-badge future">em ${p._days}d</span>`;
        const grad = p.avatar_grad ? `linear-gradient(135deg,${p.avatar_grad[0]},${p.avatar_grad[1]})` : `linear-gradient(135deg,${p.color},${p.color}88)`;
        return `<div class="home-bday-card${isToday ? ' today' : ''}">
          <div class="home-bday-head">
            <div class="home-bday-person">
              <div class="home-bday-avatar" style="background:${grad}">${isToday ? '🎂' : '👤'}</div>
              <div class="home-bday-info">
                <div class="nome">${esc(p.nome)}</div>
                <div class="papel">${esc(p.papel||'')}</div>
              </div>
            </div>
            ${badge}
          </div>
          <div class="home-bday-date">🎂 ${p._date.getDate().toString().padStart(2,'0')} ${MESES[p._date.getMonth()].toUpperCase()}</div>
        </div>`;
      }).join('') || '<div class="home-empty">Nenhum aniversário cadastrado.</div>';
    } catch {
      target.innerHTML = '<div class="home-empty">Erro ao carregar aniversários.</div>';
    }
  }

  // ── CONFETE (só pro aniversariante, 1x/dia) ────────────────────
  function showBdayConfetti(nome, outrosNomes) {
    var ov = document.createElement('div');
    ov.id = 'bday-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden';
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    ov.appendChild(cv);
    var assinatura = outrosNomes.length ? outrosNomes.join(', ') : 'Todo o time';
    var banner = document.createElement('div');
    banner.id = 'bday-banner';
    banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);'
      + 'background:linear-gradient(135deg,#001844 0%,#1a3a6e 100%);border:3px solid #cd1543;border-radius:24px;'
      + 'padding:40px 56px;text-align:center;font-family:Poppins,sans-serif;'
      + 'box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 80px rgba(205,21,67,.3);'
      + 'pointer-events:auto;cursor:pointer;opacity:0;'
      + 'transition:transform .6s cubic-bezier(.34,1.56,.64,1),opacity .4s ease';
    banner.innerHTML = '<div style="font-size:52px;margin-bottom:12px">🎂🎉🥳</div>'
      + '<div style="font-size:28px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:8px">'
      + 'Feliz Aniversário, ' + esc(nome) + '!</div>'
      + '<div style="font-size:15px;color:#869ec3;line-height:1.5;max-width:340px;margin:0 auto 16px">'
      + 'O escritório inteiro celebra você hoje.<br>Obrigado por liderar essa manada! 🐘</div>'
      + '<div style="font-size:13px;color:#f472b6;margin-top:12px">' + esc(assinatura) + ' ❤️</div>'
      + '<div style="font-size:11px;color:rgba(134,158,195,.5);margin-top:8px">clique pra fechar</div>';
    ov.appendChild(banner);
    document.body.appendChild(ov);

    var ctx = cv.getContext('2d'), W, H, pieces = [];
    var colors = ['#cd1543','#001844','#869ec3','#fbbf24','#34d399','#f472b6','#60a5fa','#fff'];
    function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);
    function Piece() {
      this.x = Math.random() * W; this.y = Math.random() * H - H;
      this.w = 6 + Math.random() * 8; this.h = 4 + Math.random() * 6;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.vy = 1.5 + Math.random() * 3; this.vx = (Math.random() - .5) * 2;
      this.rot = Math.random() * 360; this.rv = (Math.random() - .5) * 8;
    }
    for (var i = 0; i < 200; i++) pieces.push(new Piece());
    var duration = 8000, started = Date.now();
    function draw() {
      var elapsed = Date.now() - started;
      ctx.clearRect(0, 0, W, H);
      var ga = elapsed > duration - 2000 ? Math.max(0, 1 - (elapsed - (duration - 2000)) / 2000) : 1;
      pieces.forEach(function(p) {
        p.x += p.vx; p.y += p.vy; p.rot += p.rv;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = ga; ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (elapsed < duration) requestAnimationFrame(draw);
      else cv.style.display = 'none';
    }
    draw();
    setTimeout(function() {
      banner.style.transform = 'translate(-50%,-50%) scale(1)'; banner.style.opacity = '1';
    }, 300);
    banner.addEventListener('click', function() {
      ov.style.transition = 'opacity .5s'; ov.style.opacity = '0';
      setTimeout(function() { ov.remove(); }, 600);
    });
  }

  // ── TOAST LEMBRETE (pros demais, 1x/dia) ───────────────────────
  function showBdayToast(nomes) {
    var txt = nomes.length === 1
      ? 'Hoje é aniversário do(a) ' + nomes[0] + '! 🎂🎉'
      : 'Hoje é aniversário de ' + nomes.join(' e ') + '! 🎂🎉';
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-20px);'
      + 'z-index:99998;background:linear-gradient(135deg,#001844,#1a3a6e);border:2px solid #cd1543;'
      + 'border-radius:16px;padding:16px 28px;font-family:Poppins,sans-serif;font-size:15px;color:#fff;'
      + 'box-shadow:0 8px 32px rgba(0,0,0,.4);opacity:0;transition:opacity .4s,transform .4s;cursor:pointer;'
      + 'text-align:center;max-width:400px';
    toast.textContent = txt;
    document.body.appendChild(toast);
    requestAnimationFrame(function() {
      toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    toast.addEventListener('click', function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 400);
    });
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 400);
    }, 8000);
  }

  // ── TIME · 6 ÁREAS (responsáveis) ───────────────────────────────
  async function renderTeam() {
    const target = $('team-grid');
    if (!target) return; // seção 'team' não existe mais na home (substituída por 'areas-grid')
    try {
      const r = await fetch('/api/team.json'); const team = await r.json();
      target.innerHTML = (team.areas || []).map(a => {
        const respGrad = a.responsavel?.avatar_grad
          ? `linear-gradient(135deg,${a.responsavel.avatar_grad[0]},${a.responsavel.avatar_grad[1]})`
          : `linear-gradient(135deg,${a.color},${a.color}88)`;
        const voicesLine = a.voices_connect ? `<div class="home-team-voices">🎙️ Voices: ${esc(a.voices_connect)}</div>` : '';
        return `<div class="home-team-card" style="--team-color:${a.color};--team-bg:${a.color_bg}">
          <div class="home-team-head">
            <div class="home-team-icon">${esc(a.icon||'📂')}</div>
            <div class="home-team-name">${esc(a.nome)}</div>
          </div>
          <div class="home-team-resp">
            <div class="home-team-resp-avatar" style="background:${respGrad}">👤</div>
            <div class="home-team-resp-info">
              <div class="home-team-resp-name">${esc(a.responsavel?.nome||'—')}${a.responsavel?.apelido ? ` <span style="opacity:.7">(${esc(a.responsavel.apelido)})</span>` : ''}</div>
              <div class="home-team-resp-tag">Responsável</div>
            </div>
          </div>
          <div class="home-team-foco">${esc(a.foco||'')}</div>
          ${voicesLine}
        </div>`;
      }).join('');
    } catch {
      target.innerHTML = '<div class="home-empty">Erro ao carregar time.</div>';
    }
  }

  // ── FADE-IN SECTIONS ────────────────────────────────────────────
  function initSectionFadeIn() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.home-section').forEach(s => s.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.home-section').forEach(s => io.observe(s));
  }

  // ── INIT ────────────────────────────────────────────────────────
  // ── HOME POR ROLE (S38 v0.36.0) ─────────────────────────────────
  // personas.json define ordem/visibilidade das seções + KPIs do "Meu foco".
  // Persona vem de: localStorage override > role/persona do SSO (DB) > mapa email (fallback) > visitante.
  let PERSONAS = null;

  // Override manual do "Ver como". Formato novo: JSON {persona, for:<email|null>}.
  // Aceita formato legado (string crua) e migra na leitura.
  function readPersonaOverride() {
    let raw = null;
    try { raw = localStorage.getItem('office.persona'); } catch { return null; }
    if (!raw) return null;
    if (raw[0] === '{') {
      try { const o = JSON.parse(raw); return (o && o.persona) ? { persona: o.persona, for: o.for || null } : null; }
      catch { return null; }
    }
    return { persona: raw, for: null }; // legado
  }
  function writePersonaOverride(persona, email) {
    try { localStorage.setItem('office.persona', JSON.stringify({ persona, for: email || null })); } catch {}
  }
  function clearPersonaOverride() {
    try { localStorage.removeItem('office.persona'); } catch {}
  }

  // Persona vem de: SSO (DB) quando autenticado > override manual ("Ver como") > visitante.
  // Regra-chave: quando logado via SSO, a persona do login é AUTORITATIVA — um override
  // antigo só é honrado se foi escolhido pela MESMA identidade logada (preview do próprio).
  async function getPersonaId() {
    let st = null;
    try { st = await fetch('/api/auth/status').then(r => r.json()); } catch {}
    const ov = readPersonaOverride();
    const ovValid = ov && PERSONAS?.personas?.[ov.persona];

    if (st && st.authenticated) {
      const email = (st.user && st.user.email || '').toLowerCase();
      // Persona do SSO: do DB (st.persona) ou fallback mapa email -> persona.
      let ssoPersona = (st.persona && PERSONAS?.personas?.[st.persona]) ? st.persona : null;
      if (!ssoPersona && email && PERSONAS?.emails?.[email]) ssoPersona = PERSONAS.emails[email];
      // Preview do próprio usuário (override marcado pra este email) tem prioridade.
      if (ovValid && ov.for && ov.for === email) return ov.persona;
      // Override stale (de outra identidade ou legado) não pode sequestrar o login: descarta.
      if (ov && (!ov.for || ov.for !== email)) clearPersonaOverride();
      return ssoPersona || 'visitante';
    }

    // Não autenticado: override manual segue valendo (exploração livre).
    if (ovValid) return ov.persona;
    return 'visitante';
  }

  function applyPersona(pid) {
    const p = PERSONAS?.personas?.[pid];
    if (!p) return;
    const wrap = document.querySelector('.home-wrap');
    // Reordena: appendChild move cada seção pro fim na ordem definida
    (p.ordem || []).forEach(secId => {
      const el = document.querySelector(`[data-sec="${secId}"]`);
      if (el) { el.style.display = ''; wrap.appendChild(el); }
    });
    (p.esconde || []).forEach(secId => {
      const el = document.querySelector(`[data-sec="${secId}"]`);
      if (el) el.style.display = 'none';
    });
    // Seções fora de ordem+esconde ficam visíveis no fim (default)
    const conhecidas = new Set([...(p.ordem||[]), ...(p.esconde||[])]);
    document.querySelectorAll('[data-sec]').forEach(el => {
      if (!conhecidas.has(el.dataset.sec) && !['northstar','hoje','foco'].includes(el.dataset.sec)) el.style.display = '';
    });
    const ft = $('foco-title');
    if (ft) ft.textContent = `${p.icon || '🎯'} Foco · ${p.nome}`;
    if ((p.kpis || []).length) renderFoco(p.kpis);
    else { const f = document.querySelector('[data-sec="foco"]'); if (f) f.style.display = 'none'; }
    renderQuick(p);
    // Reorder via appendChild conflita com o IntersectionObserver do fade-in
    // (seções movidas ficam presas em opacity:0). Força .visible após aplicar.
    document.querySelectorAll('.home-section').forEach(s => s.classList.add('visible'));
  }

  // ── Acessos rápidos por persona (v0.81.0) ───────────────────────
  // Itens vêm de personas.json (persona.quick[] → fallback quick_default[]).
  // Sem dado (fetch falhou), o HTML hardcoded da home.html fica como está.
  function renderQuick(p) {
    const items = (p && p.quick && p.quick.length) ? p.quick : (PERSONAS?.quick_default || []);
    if (!items.length) return;
    const box = document.querySelector('.home-quick');
    if (!box) return;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = items.map(it => {
      if (it.modal) {
        return `<a href="#" onclick="event.preventDefault();openReportModal('${esc(it.modal)}')" class="home-quick-modal"><span class="ico">${esc(it.icon || '🔗')}</span>${esc(it.label)}</a>`;
      }
      const ext = it.external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(it.href)}"${ext}><span class="ico">${esc(it.icon || '🔗')}</span>${esc(it.label)}${it.external ? ' ↗' : ''}</a>`;
    }).join('');
  }

  // ── KPIs por fonte (todas APIs já existentes) ───────────────────
  const KPI_DEFS = {
    pipeline_fy:        { label: 'Pipeline MKT · FY', fonte: 'Zoho CRM', cor: '#60a5fa',
      get: async () => { const d = await fetch('/api/zoho/pipeline?source=all').then(r=>r.json()); const v = d?.kpis?.ultimo_fy?.valor; return v ? 'R$ ' + (v/1e6).toFixed(1) + 'M' : '—'; } },
    linkedin_total:     { label: 'Seguidores LinkedIn', fonte: 'XLS Bruna', cor: '#34d399',
      get: async () => { const d = await fetch('/api/linkedin/historical').then(r=>r.json()); const s = d?.serie_mensal||[]; return fmt(s.length ? s[s.length-1].total_seguidores : null); } },
    linkedin_novos:     { label: 'Novos no mês', fonte: 'LinkedIn', cor: '#34d399',
      get: async () => { const d = await fetch('/api/linkedin/historical').then(r=>r.json()); const s = d?.serie_mensal||[]; const n = s.length ? s[s.length-1].novos : null; return n != null ? '+' + fmt(n) : '—'; } },
    ddf_aprovado:       { label: 'DDF aprovado válido', fonte: 'SAP DF', cor: '#a78bfa',
      get: async () => { const d = await fetch('/api/development-funds').then(r=>r.json()); const v = d?.kpis?.aprovado_valido; return v ? '€ ' + (v/1e3).toFixed(1) + 'k' : '—'; } },
    posts_semana:       { label: 'Posts esta semana', fonte: 'Calendar Duda', cor: '#0ea5e9',
      get: async () => { const hoje = new Date().toISOString().slice(0,10); const fim = new Date(Date.now()+7*864e5).toISOString().slice(0,10); const d = await fetch(`/api/inbound/calendar?from=${hoje}&to=${fim}`).then(r=>r.json()); return fmt((d?.posts||[]).filter(p=>p.fonte!=='redatoria').length); } },
    content_aguardando: { label: 'Conteúdos aguardando', fonte: 'Pipeline Conteúdo', cor: '#fbbf24',
      get: async () => { const d = await fetch('/api/content').then(r=>r.json()); const pe = d?.por_estado||{}; return fmt((pe.seo_geo||0)+(pe.persona||0)+(pe.copy_cta||0)); } },
    voices_ativos:      { label: 'Voices ativos', fonte: 'Voices', cor: '#c084fc',
      get: async () => { const d = await fetch('/api/voices.json').then(r=>r.json()).catch(()=>null); const vs = d?.voices||[]; return fmt(Array.isArray(vs) ? vs.filter(v=>['ativo','piloto','onboarding'].includes(String(v.status||'').toLowerCase())).length : null); } },
    apollo_contatos:    { label: 'Contatos Apollo', fonte: 'Apollo', cor: '#60a5fa',
      get: async () => { const d = await fetch('/api/pipeline').then(r=>r.json()); return fmt(d?.contatos_total); } },
    apollo_sequencias:  { label: 'Sequências ativas', fonte: 'Apollo', cor: '#60a5fa',
      get: async () => { const d = await fetch('/api/pipeline').then(r=>r.json()); return fmt(d?.sequencias_ativas); } },
    ga4_usuarios:       { label: 'Usuários site (mês)', fonte: 'GA4', cor: '#f472b6',
      get: async () => { const d = await fetch('/api/relatorio/snapshot?mes=' + new Date().toISOString().slice(0,7)).then(r=>r.json()).catch(()=>null); return fmt(d?.site?.usuarios); } },
    eventos_30d:        { label: 'Eventos 30 dias', fonte: 'Field Marketing', cor: '#cd1543',
      get: async () => { const d = await fetch('/api/field-marketing').then(r=>r.json()); const hoje = new Date().toISOString().slice(0,10); const fim = new Date(Date.now()+30*864e5).toISOString().slice(0,10); return fmt((d?.eventos||[]).filter(e=>e.data_evento && e.data_evento>=hoje && e.data_evento<=fim).length); } },
    capturas_pendentes: { label: 'Capturas a preencher', fonte: 'Field Marketing', cor: '#fbbf24',
      get: async () => { const d = await fetch('/api/field-marketing').then(r=>r.json()); const hoje = new Date().toISOString().slice(0,10); return fmt((d?.eventos||[]).filter(e=>e.data_evento && e.data_evento<hoje && !(e.captura&&(e.captura.leads||e.captura.deals))).length); } },
    claims_df:          { label: 'Claims DF a reclamar', fonte: 'SAP DF', cor: '#dc2626',
      get: async () => { const d = await fetch('/api/development-funds').then(r=>r.json()); return fmt((d?.a_reclamar||[]).length); } },
    golives_30d:        { label: 'Go-lives SAP 30d', fonte: 'SAP 4 ME', cor: '#a78bfa',
      get: async () => { const d = await fetch('/api/clientes-sap-4me').then(r=>r.json()); const hoje = new Date().toISOString().slice(0,10); const fim = new Date(Date.now()+30*864e5).toISOString().slice(0,10); return fmt((d?.proximos_golive||[]).filter(g=>g.golive>=hoje&&g.golive<=fim).length); } },
    sap_live:           { label: 'Projetos SAP Live', fonte: 'SAP 4 ME', cor: '#34d399',
      get: async () => { const d = await fetch('/api/clientes-sap-4me').then(r=>r.json()); return fmt(d?.kpis?.live); } },
    cases_publicaveis:  { label: 'Cases publicados', fonte: 'Cases CS', cor: '#34d399',
      get: async () => { const d = await fetch('/api/cases').then(r=>r.json()); return fmt(d?.kpis?.case_publicado); } },
    // ── Executivo (CMO View — persona Roberto) ──
    pipeline_mkt_sourced: { label: 'Pipeline gerado por MKT', fonte: 'Zoho · atribuição', cor: '#cd1543',
      get: async () => { const d = await fetch('/api/executivo').then(r=>r.json()); const v = d?.pipeline?.mkt_sourced_total; const pct = d?.pipeline?.mkt_sourced_pct; return v ? 'R$ ' + (v/1e6).toFixed(1) + 'M' + (pct!=null ? ` (${pct}%)` : '') : '—'; } },
    receita_ganha:        { label: 'Receita ganha (won)', fonte: 'Zoho · closed-won', cor: '#10b981',
      get: async () => { const d = await fetch('/api/executivo').then(r=>r.json()); const r2 = d?.resultado; return r2?.ganho_valor ? 'R$ ' + (r2.ganho_valor/1e6).toFixed(1) + 'M · WR ' + (r2.win_rate_pct ?? '—') + '%' : '—'; } },
    df_meta_pct:          { label: 'DF · meta 70% (1/jul)', fonte: 'SAP DF', cor: '#fbbf24',
      get: async () => { const d = await fetch('/api/executivo').then(r=>r.json()); const df = d?.df; return (df && df.meta_70pct_1jul) ? Math.round(100*(df.aprovado_valido||0)/df.meta_70pct_1jul) + '%' : '—'; } },
  };

  // Destinos de ação por KPI — card do foco vira link (S39: acionável, não só info)
  const KPI_LINKS = {
    pipeline_fy: '/relatorio#s6', linkedin_total: '/metas', linkedin_novos: '/metas',
    ddf_aprovado: '/development-funds', claims_df: '/development-funds',
    posts_semana: '/inbound/calendar', content_aguardando: '/content-pipeline',
    voices_ativos: '/voices', apollo_contatos: '/pipeline', apollo_sequencias: '/pipeline',
    ga4_usuarios: '/relatorio', eventos_30d: '/field-marketing', capturas_pendentes: '/field-marketing',
    golives_30d: '/area-clientes', sap_live: '/area-clientes', cases_publicaveis: '/cases',
    pipeline_mkt_sourced: '/executivo', receita_ganha: '/executivo', df_meta_pct: '/executivo',
  };

  async function renderFoco(kpiIds) {
    const grid = $('foco-grid');
    const sec = document.querySelector('[data-sec="foco"]');
    if (!grid || !sec) return;
    sec.style.display = '';
    grid.innerHTML = kpiIds.map(id => {
      const def = KPI_DEFS[id];
      const href = KPI_LINKS[id] || '#';
      return `<a href="${href}" class="dk-glass" style="display:block;padding:16px 18px;border-left:3px solid ${def?.cor||'#60a5fa'};text-decoration:none;color:inherit;cursor:pointer">
        <div style="font-size:10px;color:var(--dk-text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.08em">${esc(def?.label||id)}</div>
        <div id="foco-${id}" style="font-size:26px;font-weight:800;font-family:'JetBrains Mono',monospace;margin-top:6px">…</div>
        <div style="font-size:9px;color:var(--dk-text-muted,#64748b);margin-top:4px">🟢 ${esc(def?.fonte||'')} · abrir →</div>
      </a>`;
    }).join('');
    kpiIds.forEach(async id => {
      const def = KPI_DEFS[id]; if (!def) return;
      try { const v = await def.get(); const el = $('foco-' + id); if (el) el.textContent = v; }
      catch (e) { const el = $('foco-' + id); if (el) el.textContent = '—'; }
    });
  }

  // ── NORTH-STAR (3 números que importam) ─────────────────────────
  async function renderNorthstar() {
    const strip = $('northstar-strip');
    const sec = document.querySelector('[data-sec="northstar"]');
    if (!strip || !sec) return;
    const NS = ['pipeline_fy', 'linkedin_total', 'ddf_aprovado'];
    strip.innerHTML = NS.map(id => {
      const def = KPI_DEFS[id];
      return `<div class="dk-glass" style="padding:20px 24px;text-align:center;border-top:3px solid ${def.cor}">
        <div id="ns-${id}" style="font-size:34px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1">…</div>
        <div style="font-size:11px;color:var(--dk-text-muted,#94a3b8);text-transform:uppercase;letter-spacing:.08em;margin-top:8px">${esc(def.label)}</div>
        <div style="font-size:9px;color:var(--dk-text-muted,#64748b);margin-top:3px">🟢 ${esc(def.fonte)}</div>
      </div>`;
    }).join('');
    NS.forEach(async id => {
      try { const v = await KPI_DEFS[id].get(); const el = $('ns-' + id); if (el) el.textContent = v; }
      catch (e) {}
    });
  }

  // ── HOJE (o que acontece hoje) ──────────────────────────────────
  async function renderHoje() {
    const list = $('hoje-list');
    const sec = document.querySelector('[data-sec="hoje"]');
    if (!list || !sec) return;
    const hoje = new Date().toISOString().slice(0,10);
    try {
      const [cal, fm, df] = await Promise.all([
        fetch(`/api/inbound/calendar?from=${hoje}&to=${hoje}`).then(r=>r.json()).catch(()=>({posts:[]})),
        fetch('/api/field-marketing').then(r=>r.json()).catch(()=>({eventos:[]})),
        fetch('/api/development-funds').then(r=>r.json()).catch(()=>({requests:[]})),
      ]);
      const itens = [];
      for (const p of (cal.posts||[])) itens.push({ ico: p.fonte==='redatoria'?'📰':'📝', txt: p.titulo, sub: [p.autor,p.canal].filter(Boolean).join(' · '), cor: p.fonte==='redatoria'?'#869ec3':'#0ea5e9' });
      for (const e of (fm.eventos||[])) if (e.data_evento === hoje) itens.push({ ico:'🔴', txt: e.nome, sub: 'evento · '+(e.lob||''), cor:'#cd1543' });
      for (const r of (df.requests||[])) if (!r.derrubado && (+r.claim||0)===0 && r.expiracao === hoje) itens.push({ ico:'💶', txt:'Expira HOJE: claim '+r.nome, sub:'€'+Number(r.aprovado||0).toLocaleString('pt-BR'), cor:'#dc2626' });
      list.innerHTML = itens.length ? itens.map(i => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(15,30,53,.4);border:1px solid rgba(96,165,250,.12);border-left:3px solid ${i.cor};border-radius:8px;font-size:13px">
          <span>${i.ico}</span>
          <span style="flex:1;color:var(--dk-text,#e2e8f0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.txt)}</span>
          <span style="font-size:10px;color:var(--dk-text-muted,#64748b);white-space:nowrap">${esc(i.sub)}</span>
        </div>`).join('') : '<div style="font-size:12px;color:var(--dk-text-muted,#64748b);padding:8px 0">Nada agendado pra hoje. ✨</div>';
    } catch (e) { list.innerHTML = ''; }
  }

  // ── BANCO DE HORAS — mini-card na home ──────────────────────────
  async function renderHorasSaldo() {
    try {
      const r = await fetch('/api/horas/saldo');
      if (!r.ok) return;
      const d = await r.json();
      const saldo = d.meu;
      const sign = saldo > 0 ? '+' : '';
      const cor = saldo > 0 ? 'var(--home-success,#10b981)' : saldo < 0 ? 'var(--home-danger,#ef4444)' : 'var(--home-text-muted,#869ec3)';
      const card = document.createElement('a');
      card.href = '/horas';
      card.className = 'home-digest-card';
      card.style.textDecoration = 'none';
      card.style.color = 'inherit';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="label">Banco de Horas</div>
        <div class="value" style="color:${cor}">${sign}${saldo.toFixed(1).replace('.0','')}h</div>
        <div class="sub">${saldo === 0 ? 'saldo zerado' : 'saldo acumulado'}</div>`;
      const grid = $('digest-grid');
      if (grid) grid.appendChild(card);
    } catch {}
  }

  // ── FRESHNESS CHIPS (S39 — Regra 7 automática) ──────────────────
  async function renderFreshness() {
    try {
      const d = await fetch('/api/freshness').then(r => r.json());
      const stale = (d.datasets || []).filter(x => x.stale);
      if (!stale.length) return;
      const hero = document.querySelector('.home-hero');
      if (!hero) return;
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 0;width:100%';
      bar.innerHTML = '<span style="font-size:10px;color:var(--dk-text-muted,#64748b);align-self:center">⚠️ dados desatualizados:</span>' +
        stale.map(x => `<span title="última atualização: ${x.atualizado || 'nunca'}" style="font-size:10px;padding:3px 9px;border-radius:10px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-weight:600">${esc(x.label)} · ${x.dias != null ? x.dias + 'd' : 'sem dado'}</span>`).join('');
      hero.appendChild(bar);
    } catch (e) {}
  }

  async function initPersonas() {
    try {
      PERSONAS = await fetch('/api/personas.json').then(r => r.json());
      const pid = await getPersonaId();
      // Seletor "Ver como…"
      // Email da identidade logada (pra amarrar o override "Ver como" a ela).
      let currentEmail = null;
      try { const st = await fetch('/api/auth/status').then(r => r.json()); currentEmail = (st && st.user && st.user.email || '').toLowerCase() || null; } catch {}
      const sel = $('persona-select');
      if (sel) {
        sel.innerHTML = Object.entries(PERSONAS.personas).map(([id, p]) =>
          `<option value="${id}" ${id===pid?'selected':''}>${p.icon} Ver como: ${p.nome}</option>`).join('');
        sel.addEventListener('change', () => {
          writePersonaOverride(sel.value, currentEmail);
          applyPersona(sel.value);
          renderHero();
        });
      }
      applyPersona(pid);
      renderNorthstar();
      renderHoje();
      renderFreshness();
    } catch (e) { console.warn('personas:', e); }
  }

  function init() {
    renderHero();
    renderDigest();
    renderHorasSaldo();
    renderMetas();
    renderAreas();
    initEventos();
    renderBdays();
    renderTeam();
    renderAlertas();
    initPersonas();
    initSectionFadeIn();
    setInterval(() => { renderDigest(); renderAlertas(); }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
