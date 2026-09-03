// ════════════════════════════════════════════════════════════════════════════
// <office-nav> — Web Component vanilla, sem build, sem deps
// Nav global persistente em todas as rotas do Office Engine v3.3+
// Design do Office EPI-USE: 5 seções, logomark à esquerda, controles à direita.
// ════════════════════════════════════════════════════════════════════════════

// Versão atual exposta no chip ao lado do logomark.
// Fonte ÚNICA da verdade: public/api/changelog.json#current via /api/version
// Fallback hardcoded usado SÓ se fetch falhar (offline, etc).
// Sincronização automática — não editar manualmente, basta bumpar changelog.json.
let OFFICE_NAV_VERSION = '0.89.0';
// Promise compartilhada — nav + footer reaproveitam o mesmo fetch
window.__officeVersionPromise = window.__officeVersionPromise || fetch('/api/version')
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d && d.current) { OFFICE_NAV_VERSION = d.current; window.__officeVersion = d.current; } return d; })
  .catch(() => null);

// Tokens CSS globais ERP.ngo (v0.4.12) — injetados em document.head pra ficar
// disponíveis em todas as páginas. Cores oficiais do brand guide ERP.ngo v1.0.
// Doc fonte: vault/00-contexto/branding-erp-ngo.md
(function injectERPNgoTokens() {
  if (document.getElementById('erp-ngo-tokens')) return;
  const style = document.createElement('style');
  style.id = 'erp-ngo-tokens';
  style.textContent = `
    :root {
      --erp-blue-navy:   #131B41;
      --erp-blue-mid:    #0066B2;
      --erp-blue-light:  #BFDCF3;
      --erp-brown-mid:   #74685B;
      --erp-brown-light: #BBA997;
    }
  `;
  document.head.appendChild(style);
})();

// GLOBAL polish stylesheets (v0.24.0) — injeta em TODAS paginas que carregam office-nav.js
// Inclui Poppins + Source Sans 3 (consulting fonts) + polish-pro.css + consulting-dark.css
(function injectGlobalPolish() {
  if (document.getElementById('global-polish-loader')) return;
  const marker = document.createElement('meta');
  marker.id = 'global-polish-loader'; marker.name = 'global-polish'; marker.content = 'loaded';
  document.head.appendChild(marker);

  // Preconnect Google Fonts
  ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].forEach((href, i) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'preconnect'; l.href = href;
    if (i === 1) l.crossOrigin = '';
    document.head.appendChild(l);
  });

  // Google Fonts CSS (Poppins + Source Sans 3 + Fira Code)
  if (!document.querySelector('link[href*="Poppins"]')) {
    const fontsLink = document.createElement('link');
    fontsLink.rel = 'stylesheet';
    fontsLink.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Fira+Code:wght@500;600;700&display=swap';
    document.head.appendChild(fontsLink);
  }

  // FONTE GLOBAL PADRAO = Poppins (sobrepoe Inter/Open Sans/etc das telas).
  // Mono (code/pre) preservado. Aplicado 1x via <style> de alta especificidade.
  if (!document.getElementById('office-global-font')) {
    const fs = document.createElement('style');
    fs.id = 'office-global-font';
    fs.textContent = `
      :root { --font-base: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      html, body, button, input, select, textarea,
      h1, h2, h3, h4, h5, h6, p, a, span, div, li, td, th, label, strong, em, small {
        font-family: var(--font-base) !important;
      }
      code, pre, kbd, samp, .mono, [class*="mono"], [style*="JetBrains"], [style*="Fira"], [style*="Courier"] {
        font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace !important;
      }
      /* icones (emoji/material/etc) nao herdam Poppins */
      .material-icons, .material-symbols-outlined, .ic {
        font-family: revert !important;
      }
      /* FontAwesome: 'revert' apagava a fonte do FA (regra de autor) e os icones
         viravam tofu — reafirmar as familias explicitamente */
      .fa, .fas, .far, .fab, .fal, .fad, [class*="fa-"] {
        font-family: 'Font Awesome 6 Free', 'Font Awesome 6 Brands', 'Font Awesome 5 Free', 'Font Awesome 5 Brands', 'FontAwesome' !important;
      }`;
    document.head.appendChild(fs);
  }

  // polish-pro.css + consulting-dark.css + epiuse-theme.css + atlas-theme.css
  ['/css/polish-pro.css', '/css/consulting-dark.css', '/css/epiuse-theme.css', '/css/atlas-theme.css', '/css/atlas-components.css'].forEach(href => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  });
})();

// Auto-load i18n.js se não estiver presente (idempotente)
(function ensureI18n() {
  if (window.OFFICE_I18N) return;
  if (document.querySelector('script[src="/i18n.js"]')) return;
  const s = document.createElement('script');
  s.src = '/i18n.js';
  s.async = false;
  document.head.appendChild(s);
})();

// Helpers idioma — fallback PT se i18n.js ainda não carregou
function getLangCode() {
  try { var v = localStorage.getItem('office.lang'); if (v === 'en' || v === 'es' || v === 'pt') return v; } catch (e) {}
  return 'pt';
}
function getLangFlag() {
  var c = getLangCode();
  return c === 'en' ? '🇺🇸' : (c === 'es' ? '🇪🇸' : '🇧🇷');
}
function cycleLang() {
  var ORDER = ['pt','en','es'];
  var cur = getLangCode();
  var next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
  if (window.setLang) {
    window.setLang(next);
  } else {
    try { localStorage.setItem('office.lang', next); } catch (e) {}
    location.reload();
  }
}

// NAV POR AREA/DONA (v0.7.x) — cada item = 1 modulo (funil de meta + numeros + projetos + ferramentas).
// Fonte: /api/areas.json. Telas antigas viram "ferramentas" dentro de cada modulo (deep-links seguem valendo).
const OFFICE_NAV_TABS = [
  { id: 'hub',          label: 'Home',             icon: '🏠', href: '/',                  matches: ['hub','home'] },
  { id: 'intelligence', label: 'Intelligence',     icon: '🧠', href: '/area/intelligence', matches: ['area-intelligence','area-growth'] },
  { id: 'field',        label: 'Field Marketing',  icon: '📅', href: '/area/eventos',      matches: ['area-eventos','area-field'] },
  { id: 'pipeline',     label: 'Biz Dev',          icon: '📞', href: '/area/pipeline',     matches: ['area-pipeline','pipeline'] },
  { id: 'brand',        label: 'Brand Experience', icon: '🎨', href: '/area/brand',        matches: ['area-brand','voices','inbound','cases','painel','optimizer','area-conteudo','artigos','jornadas','raccoon'] },
  { id: 'metas',        label: 'Metas FY27',       icon: '🎯', href: '/metas-fy27',        matches: ['metas','metas-fy26','metas-fy27'] },
  { id: 'relatorio',    label: 'Relatório Mensal', icon: '📊', href: '/relatorio',         matches: ['relatorio'] }
];

// Breadcrumbs por rota — aparece sutil abaixo do nav em rotas profundas
const OFFICE_NAV_BREADCRUMBS = {
  'inbound':       ['🎨 Brand Experience', '📡 Inbound'],
  'inbound-brief': ['🎨 Brand Experience', '📡 Inbound', 'Brief → Post'],
  'inbound-carousel': ['🎨 Brand Experience', '📡 Inbound', 'Carrossel + Capa'],
  'inbound-calendar': ['🎨 Brand Experience', '📡 Inbound', 'Calendário Editorial'],
  'inbound-studio': ['🎨 Brand Experience', '📡 Inbound', 'Template Studio'],
  'inbound-playbook': ['🎨 Brand Experience', '📡 Inbound', 'Playbook'],
  'voices': ['🎨 Brand Experience', '🎙️ Voices'],
  'painel': ['🎨 Brand Experience', '🎙️ Voices'],
  'cases': ['🎨 Brand Experience', '🤝 Cases & CS'],
  'artigos': ['🎨 Brand Experience', '📚 Artigos do Blog'],
  'jornadas': ['🎨 Brand Experience', '🗺️ Jornadas de Compra'],
  'raccoon': ['🎨 Brand Experience', '🦝 Raccoon Studio']
};

// Overflow agrupado por seção (Sprint 11.2 — UX/UI melhor)
// Cada item com `section` vira separador. Itens sem section são extras.
const OFFICE_NAV_OVERFLOW = [
  { section: '🤖 Escritório Virtual' },
  { label: '🏢 Marketing Hub (portal)',  href: '/hub' },
  { label: '📣 Campanhas em jogo',       href: '/campanhas' },
  { label: '💡 Mural de Ideias',         href: '/ideias' },

  { section: '📞 Biz Dev' },
  { label: '🤖 JARVIS — Copiloto SDR',   href: '/jarvis' },
  { label: '📞 Pipeline (Apollo/Zoho)',  href: '/pipeline' },

  { section: '📊 Reports & Análises' },
  { label: '🔗 LinkedIn Intelligence',   href: '/linkedin' },
  { label: '📈 Relatório Mensal',        href: '/relatorio' },
  { label: '🗂️ Área de Clientes',        href: '/area-clientes' },
  { label: '📣 Field Marketing',         href: '/field-marketing' },
  { label: '✍️ Pipeline de Conteúdo',     href: '/content-pipeline' },
  { label: '🗺️ Jornadas de Compra',      href: '/jornadas' },
  { label: '📚 Artigos do Blog',         href: '/artigos' },

  { section: '🎙️ Voices & Optimizer' },
  { label: '🦝 Raccoon Studio',          href: '/raccoon' },
  { label: '🪪 Profile Optimizer',        href: '/voices/optimizer-v3' },
  { label: '📨 Seja um Voice (LP)',      href: '/seja-voice' },

  { section: '🎨 Design & Sistema' },
  { label: '🎨 Design System',           href: '/design' },
  { label: '📜 Histórico de versões',   href: '/changelog' },

  { section: '🐘 ERP.ngo' },
  { label: '🐘 Impacto FY26 (ERP.ngo)',  href: '/erp-impacto' },

  { section: '🎮 Extras' },
  { label: '🎮 Modo Game (time MKT)',    href: '/game' },
  { label: '🏢 Game do Colaborador',     href: '/game-hub' },
  { label: '☕ Cafezinho',                href: '/cafezinho' },
  { label: '🧠 Memes do Office',         href: '/memes' },
  { label: '🐘 ERP.ngo',                 href: 'https://erp.ngo', external: true }
];

// Itens REMOVIDOS do menu por decisão do Rudá (06/jul/2026) — NÃO deletados: as
// rotas/telas seguem acessíveis por URL direta, só saíram da navegação por não
// estarem em uso. A lista aparece também no final do /changelog ("Itens inativos").
// Para reativar, é só devolver o item pro OFFICE_NAV_OVERFLOW na seção certa.
const OFFICE_NAV_INACTIVE = [
  { label: '🤖 Agentes & Contexto',       href: '/agentes' },
  { label: '⚡ Central (pendências+prazos)', href: '/war-room' },
  { label: '📄 PDF-QA (RAG)',             href: '/rag-panel' },
  { label: '📊 Visão Executiva (CMO)',    href: '/executivo' },
  { label: '💶 Development Funds (SAP)',   href: '/development-funds' },
  { label: '📊 Planilhas (Live API)',     href: '/planilhas' }
];
// Fonte única para o /changelog listar os inativos
try { window.OFFICE_NAV_INACTIVE = OFFICE_NAV_INACTIVE; } catch (e) {}

class OfficeNav extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.hookEvents();
    this.loadSSO();
    // Re-render quando versão real chegar do servidor (auto-sync)
    if (window.__officeVersionPromise) {
      window.__officeVersionPromise.then(d => {
        if (d && d.current && d.current !== this._lastVersion) {
          this._lastVersion = d.current;
          this.render();
          this.hookEvents();
        }
      });
    }
  }

  // SSO Microsoft: se autenticado, fixa nome+email do Entra ID (não editável)
  async loadSSO() {
    try {
      const d = await fetch('/api/auth/status').then(r => r.json());
      this._ssoEnabled = !!(d && d.enabled);
      this._authed = !!(d && d.authenticated);
      if (d && d.authenticated && d.user) {
        this._sso = { name: d.user.name || '', email: d.user.email || d.user.preferred_username || '' };
        this._role = d.role || d.user.role || null;
        // Colaborador (role 'hub') é travado no Marketing Hub: esconde a navegação
        // do Office (tabs, overflow, sino) — ele não acessa o resto mesmo.
        try { if (this._role === 'hub') this.setAttribute('data-hublock', '1'); else this.removeAttribute('data-hublock'); } catch {}
        try { if (this._sso.name) localStorage.setItem('office.user', this._sso.name); } catch {}
      }
      // Re-renderiza quando o SSO está ligado: mostra "Entrar" (deslogado) ou nome real (logado).
      if (this._ssoEnabled) { this.render(); this.hookEvents(); }
    } catch {}
  }

  getActiveRoute() {
    // 1. data-route do body tem prioridade
    const bodyRoute = document.body?.dataset?.route;
    if (bodyRoute) return bodyRoute;
    // 2. fallback: detecta da URL
    const path = location.pathname;
    if (path === '/' || path === '/dashboard' || path.startsWith('/game')) return 'hub';
    if (path.startsWith('/painel') || path === '/voices/painel') return 'brand';
    if (path.startsWith('/raccoon')) return 'raccoon';
    if (path.startsWith('/seja-voice') || path.startsWith('/optimizer') || path.startsWith('/erp-impacto')) return 'hub-mkt';
    if (path.startsWith('/voices')) return 'voices';
    if (path === '/inbound/brief') return 'inbound-brief';
    if (path === '/inbound/carousel') return 'inbound-carousel';
    if (path === '/inbound/calendar') return 'inbound-calendar';
    if (path === '/inbound/studio') return 'inbound-studio';
    if (path === '/inbound/playbook') return 'inbound-playbook';
    if (path.startsWith('/inbound')) return 'inbound';
    if (path.startsWith('/cases')) return 'cases';
    if (path.startsWith('/relatorio')) return 'relatorio';
    if (path.startsWith('/artigos') || path.startsWith('/jornadas')) return 'artigos';
    if (path.startsWith('/metas')) return 'metas';
    if (path.startsWith('/pipeline')) return 'pipeline';
    if (path.startsWith('/hub')) return 'hub-mkt';
    if (path.startsWith('/changelog')) return 'changelog';
    return '';
  }

  // Mapa route → tab id (várias rotas mapeiam pro mesmo tab principal)
  getActiveTab() {
    const r = this.getActiveRoute();
    if (r.startsWith('inbound')) return 'brand';
    if (r === 'painel' || r === 'voices' || r === 'raccoon') return 'brand';
    if (r === 'area-growth' || r === 'growth') return 'intelligence';
    if (r === 'area-eventos' || r === 'area-field' || r === 'eventos') return 'field';
    if (r === 'artigos' || r === 'jornadas' || r === 'area-conteudo') return 'brand';
    if (r === 'hub-mkt') return 'hub';
    if (r === 'relatorio') return 'relatorio';
    return r;
  }

  getUser() {
    if (this._sso && this._sso.name) return this._sso.name;
    try { return localStorage.getItem('office.user') || 'Visitante'; }
    catch { return 'Visitante'; }
  }

  getTheme() {
    try {
      const saved = localStorage.getItem('office.theme');
      if (['epiuse-light','epiuse-dark','atlas-light','atlas-dark','dark','light','armory','elephant','aurora','liquid-glass'].includes(saved)) return saved;
      return 'dark';
    } catch { return 'dark'; }
  }

  getScreenV2(name) {
    try {
      return localStorage.getItem('office.v2.' + name) === '1';
    } catch {
      return false;
    }
  }

  render() {
    const activeRoute = this.getActiveRoute();
    const activeTab = this.getActiveTab();
    const breadcrumb = OFFICE_NAV_BREADCRUMBS[activeRoute] || null;
    const user = this.getUser();
    const theme = this.getTheme();
    const THEME_ICON = { 'epiuse-light': '◐', 'epiuse-dark': '◑', 'atlas-light': '◐', 'atlas-dark': '◑', dark: '☾', light: '☀', armory: '◆', elephant: '🐘', aurora: '🔮', 'liquid-glass': '💧' };
    const THEME_LABEL = { 'epiuse-light': 'EPI-USE · claro', 'epiuse-dark': 'EPI-USE · escuro', 'atlas-light': 'nova · claro', 'atlas-dark': 'nova · escuro', dark: 'escuro', light: 'claro', armory: 'armory', elephant: 'elephant', aurora: 'aurora', 'liquid-glass': 'liquid glass' };
    const themeIcon = THEME_ICON[theme] || '☾';

    // Agrupa e distribui os itens em 3 colunas lógicas
    const col1Items = [];
    const col2Items = [];
    const col3Items = [];
    
    let currentSection = '';
    OFFICE_NAV_OVERFLOW.forEach(it => {
      if (it.section) {
        currentSection = it.section;
        const group = { section: it.section, links: [] };
        if (['🤖 Escritório Virtual', '🎙️ Voices & Optimizer'].includes(currentSection)) {
          col1Items.push(group);
        } else if (['📊 Reports & Análises'].includes(currentSection)) {
          col2Items.push(group);
        } else {
          col3Items.push(group);
        }
      } else {
        const targetCols = ['🤖 Escritório Virtual', '🎙️ Voices & Optimizer'].includes(currentSection) ? col1Items 
                         : ['📊 Reports & Análises'].includes(currentSection) ? col2Items 
                         : col3Items;
        if (targetCols.length > 0) {
          targetCols[targetCols.length - 1].links.push(it);
        }
      }
    });

    const renderColumn = (groups) => {
      return groups.map(g => `
        <div class="overflow-group">
          <div class="overflow-section">${g.section}</div>
          ${g.links.map(it => {
            const tgt = it.external ? ' target="_blank" rel="noopener"' : '';
            return `<a class="overflow-item" href="${it.href}"${tgt}>${it.label}</a>`;
          }).join('')}
        </div>
      `).join('');
    };

    // Admin de usuários/perfis — só aparece pro 'head' (Rudá) logado via SSO.
    if (this._role === 'head') {
      const grp = col1Items.find(g => g.section === '🤖 Escritório Virtual');
      if (grp && !grp.links.some(l => l.href === '/admin/usuarios')) {
        grp.links.push({ label: '👥 Usuários & Perfis', href: '/admin/usuarios' });
      }
      if (grp && !grp.links.some(l => l.href === '/admin/inscricoes')) {
        grp.links.push({ label: '🎙️ Inscrições Voices', href: '/admin/inscricoes' });
      }
      if (grp && !grp.links.some(l => l.href === '/admin/comunicados')) {
        grp.links.push({ label: '✉️ Comunicados', href: '/admin/comunicados' });
      }
      if (grp && !grp.links.some(l => l.href === '/admin/coins')) {
        grp.links.push({ label: '🪙 Coins & Resgates', href: '/admin/coins' });
      }
    }
    const grpA = col1Items.find(g => g.section === '🤖 Escritório Virtual');
    // Analytics de uso — exclusivo do dono (ruda.costa@epiuse.com.br).
    if ((this._sso && String(this._sso.email || '').toLowerCase()) === 'ruda.costa@epiuse.com.br') {
      if (grpA && !grpA.links.some(l => l.href === '/admin/analytics')) {
        grpA.links.push({ label: '📊 Analytics de Uso', href: '/admin/analytics' });
      }
    }
    // UTM & Links Rastreados — todo o time de Marketing.
    const MKT_ROLES = ['head', 'intelligence', 'growth', 'field', 'pipeline', 'brand', 'conteudo'];
    if (grpA && MKT_ROLES.includes(this._role) && !grpA.links.some(l => l.href === '/admin/utm')) {
      grpA.links.push({ label: '🔗 UTM & Links Rastreados', href: '/admin/utm' });
    }
    // Pautas dos Voices (módulo 20): o Voice vê as suas; o time editorial vê todas.
    if (grpA && (this._role === 'voice' || ['conteudo','brand','head'].includes(this._role))
        && !grpA.links.some(l => l.href === '/voices/pautas')) {
      grpA.links.push({
        label: this._role === 'voice' ? '📝 Minhas Pautas' : '📝 Pautas dos Voices',
        href: '/voices/pautas'
      });
    }
    // Meus Links (self-service) + Loja de Coins — qualquer usuário autenticado.
    if (grpA && this._authed) {
      if (!grpA.links.some(l => l.href === '/meus-links')) {
        grpA.links.push({ label: '📂 Meus Links & QR', href: '/meus-links' });
      }
      if (!grpA.links.some(l => l.href === '/loja')) {
        grpA.links.push({ label: '🏪 Loja de Coins', href: '/loja' });
      }
      if (!grpA.links.some(l => l.href === '/ranking')) {
        grpA.links.push({ label: '🏆 Ranking do Time', href: '/ranking' });
      }
    }

    const col1Html = renderColumn(col1Items);
    const col2Html = renderColumn(col2Items);
    const col3Html = renderColumn(col3Items);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --nav-bg: rgba(6, 14, 26, 0.92);
          --nav-border: rgba(37, 99, 235, 0.25);
          --nav-text: #e2e8f0;
          --nav-muted: #64748b;
          --nav-accent: #60a5fa;
          --nav-active-bg: rgba(37, 99, 235, 0.18);
          --nav-active-border: rgba(37, 99, 235, 0.5);
          --nav-hover-bg: rgba(255, 255, 255, 0.05);
          display: block;
          position: sticky;
          top: 0;
          z-index: 100;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .nav-bar {
          background: var(--nav-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--nav-border);
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 14px;
          gap: 8px;
          position: relative;
          z-index: 10;
        }
        .logo {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          padding: 6px 10px;
          border-radius: 6px;
          transition: background .15s, filter .15s;
          white-space: nowrap;
          filter: brightness(1) saturate(1);
        }
        .logo:hover { background: var(--nav-hover-bg); }
        /* A barra do nav é sempre fundo escuro (--nav-bg navy) em TODOS os temas,
           então o logo é sempre branco pra ficar legível. Se algum tema futuro
           usar nav-bar clara, adicionar override :host-context([data-theme="X"]) .logo img{filter:none}. */
        .logo img { filter: brightness(0) invert(1); transition: filter .15s; }
        .ver-chip {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(148,163,184,0.18);
          padding: 3px 7px;
          border-radius: 4px;
          letter-spacing: 0.06em;
          text-decoration: none;
          margin-left: -2px;
          transition: color .15s, border-color .15s, background .15s;
          white-space: nowrap;
        }
        .ver-chip:hover { color: var(--nav-accent); border-color: rgba(37,99,235,0.45); background: rgba(37,99,235,0.10); }
        .tabs {
          display: flex;
          gap: 2px;
          margin-left: 6px;
          flex: 1;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .tabs::-webkit-scrollbar { display: none; }
        /* Colaborador travado no Hub: sem tabs/overflow/sino/hamburguer */
        :host([data-hublock]) .tabs,
        :host([data-hublock]) .hamburger,
        :host([data-hublock]) .overflow-wrap,
        :host([data-hublock]) .bell-wrap { display: none !important; }
        /* Sem tabs, os controles colam no logo à esquerda — empurra pro lugar
           natural do menu, à direita da tela. */
        :host([data-hublock]) .controls { margin-left: auto; }
        .tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--nav-muted);
          text-decoration: none;
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          white-space: nowrap;
          transition: all .15s;
          font-weight: 500;
        }
        .tab:hover { background: var(--nav-hover-bg); color: var(--nav-text); }
        .tab.active {
          background: linear-gradient(180deg, rgba(37,99,235,0.42) 0%, rgba(37,99,235,0.28) 100%);
          border-color: rgba(96,165,250,0.85);
          color: #ffffff;
          font-weight: 700;
          box-shadow: 0 0 0 1px rgba(96,165,250,0.45), 0 2px 10px rgba(37,99,235,0.45);
        }
        .tab.active::before {
          content: '';
          width: 6px; height: 6px;
          background: #93c5fd;
          border-radius: 50%;
          box-shadow: 0 0 8px 1px #60a5fa;
          flex-shrink: 0;
        }
        .tab-ico { font-size: 13px; }
        .spacer { flex: 1; }
        .controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ctrl-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--nav-border);
          color: var(--nav-text);
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          transition: background .15s, border-color .15s;
        }
        .ctrl-btn:hover { background: var(--nav-hover-bg); border-color: rgba(37,99,235,0.45); }
        /* Seletor de idioma — 3 bandeiras */
        .lang-select {
          display: inline-flex;
          gap: 2px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--nav-border);
          border-radius: 7px;
          padding: 2px;
        }
        .lang-flag {
          background: transparent;
          border: none;
          cursor: pointer;
          line-height: 0;
          padding: 3px 4px;
          border-radius: 5px;
          opacity: 0.42;
          filter: grayscale(0.7);
          transition: opacity .15s, filter .15s, background .15s;
          display: inline-flex;
          align-items: center;
        }
        .lang-flag svg { display: block; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.18); }
        .lang-flag:hover { opacity: 0.9; filter: grayscale(0); background: var(--nav-hover-bg); }
        .lang-flag.active { opacity: 1; filter: grayscale(0); background: rgba(37,99,235,0.28); }
        .ctrl-btn .kbd {
          display: inline-block;
          background: rgba(0,0,0,0.4);
          padding: 1px 5px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          margin-left: 4px;
        }
        .login-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
          text-decoration: none;
          background: linear-gradient(180deg, rgba(37,99,235,0.95) 0%, rgba(37,99,235,0.8) 100%);
          border: 1px solid rgba(96,165,250,0.85);
          padding: 6px 14px;
          border-radius: 8px;
          white-space: nowrap;
          box-shadow: 0 0 0 1px rgba(96,165,250,0.35), 0 2px 10px rgba(37,99,235,0.4);
          transition: filter .15s, transform .05s;
        }
        .login-btn:hover { filter: brightness(1.1); }
        .login-btn:active { transform: translateY(1px); }
        .user-chip {
          font-size: 12px;
          font-weight: 600;
          color: var(--nav-accent);
          background: rgba(37,99,235,0.12);
          border: 1px solid var(--nav-border);
          padding: 5px 12px;
          border-radius: 14px;
          white-space: nowrap;
          cursor: pointer;
          font-family: inherit;
        }
        .user-chip:hover { background: rgba(37,99,235,0.22); }
        .overflow-wrap { position: relative; }
        .overflow-overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: transparent;
          z-index: 998;
        }
        .overflow-overlay.open {
          display: block;
        }

        .overflow-menu {
          display: none;
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          width: 680px;
          background: rgba(13, 30, 54, 0.98);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--nav-border);
          border-radius: 12px;
          padding: 16px 20px;
          box-shadow: 0 16px 36px rgba(0,0,0,0.6);
          z-index: 999;
        }
        .overflow-menu.open {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .overflow-col {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .overflow-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .overflow-item {
          display: block;
          font-size: 12.5px;
          color: var(--nav-text);
          text-decoration: none;
          padding: 7px 10px;
          border-radius: 6px;
          transition: background .12s, color .12s;
        }
        .overflow-item:hover {
          background: var(--nav-hover-bg);
          color: var(--nav-accent);
        }

        .overflow-section {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--nav-accent, #2563eb);
          padding: 6px 10px 4px;
          opacity: .95;
          border-bottom: 1px solid rgba(134,158,195,.15);
          margin-bottom: 4px;
        }

        @media (max-width: 720px) {
          .overflow-menu {
            width: calc(100vw - 20px);
            right: -60px;
          }
          .overflow-menu.open {
            grid-template-columns: 1fr;
            max-height: 60vh;
            overflow-y: auto;
          }
        }

        /* ── Breadcrumb sutil ── */
        .crumbs {
          background: rgba(6, 14, 26, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(37,99,235,0.10);
          padding: 6px 18px;
          font-size: 11px;
          color: var(--nav-muted);
          display: flex;
          gap: 6px;
          align-items: center;
          letter-spacing: 0.02em;
          position: relative;
          z-index: 9;
        }
        .crumbs .sep { opacity: 0.4; }
        .crumbs .item { color: var(--nav-muted); }
        .crumbs .item.current { color: var(--nav-accent); font-weight: 600; }

        /* ── Notification bell ── */
        .bell-wrap { position: relative; }
        .bell-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--nav-text);
          font-size: 14px;
          padding: 5px 9px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          position: relative;
          transition: background .15s, border-color .15s;
        }
        .bell-btn:hover { background: var(--nav-hover-bg); border-color: var(--nav-border); }
        .bell-badge {
          position: absolute;
          top: 1px; right: 1px;
          background: #ef4444;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          min-width: 14px; height: 14px;
          padding: 0 4px;
          border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          line-height: 1;
        }
        .bell-panel {
          display: none;
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          width: 320px; max-height: 60vh;
          overflow-y: auto;
          background: #0d1e36;
          border: 1px solid var(--nav-border);
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 10;
        }
        .bell-panel.open { display: block; }
        .bell-panel .bp-head {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 11px;
          color: var(--nav-muted);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-family: 'JetBrains Mono', monospace;
          display: flex; justify-content: space-between; align-items: center;
        }
        .bell-panel .bp-item {
          padding: 10px 14px;
          font-size: 12px;
          color: var(--nav-text);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          display: block;
          text-decoration: none;
        }
        .bell-panel .bp-item:hover { background: var(--nav-hover-bg); }
        .bell-panel .bp-item.empty { color: var(--nav-muted); font-style: italic; cursor: default; }
        .bell-panel .bp-item .bp-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 3px;
          margin-right: 6px;
          letter-spacing: 0.06em;
        }
        .bp-tag.warn { background: rgba(251,191,36,0.18); color: #fbbf24; }
        .bp-tag.info { background: rgba(96,165,250,0.18); color: #60a5fa; }

        /* ── User dropdown real (substitui prompt()) ── */
        .user-menu {
          display: none;
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          min-width: 240px;
          background: #0d1e36;
          border: 1px solid var(--nav-border);
          border-radius: 10px;
          padding: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 10;
        }
        .user-menu.open { display: block; }
        .user-menu .um-head {
          padding: 8px 10px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 6px;
        }
        .user-menu .um-name {
          font-size: 13px; font-weight: 600; color: var(--nav-text);
        }
        .user-menu .um-sub {
          font-size: 11px; color: var(--nav-muted); margin-top: 2px;
        }
        .user-menu .um-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          font-size: 12px;
          color: var(--nav-text);
          text-decoration: none;
          border-radius: 6px;
          cursor: pointer;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .user-menu .um-item:hover { background: var(--nav-hover-bg); }
        .user-menu .um-item .ic { font-size: 13px; opacity: 0.85; }
        .user-wrap { position: relative; }
        .theme-wrap { position: relative; }
        .theme-dropdown {
          display: none;
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          min-width: 190px;
          background: #0d1e36;
          border: 1px solid var(--nav-border);
          border-radius: 10px;
          padding: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 10;
        }
        .theme-dropdown.open { display: block; }
        .theme-dropdown .td-head {
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 700;
          color: var(--nav-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 4px;
        }
        .theme-dropdown .td-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px;
          font-size: 12px;
          color: var(--nav-text);
          text-decoration: none;
          border-radius: 6px;
          cursor: pointer;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .theme-dropdown .td-item:hover { background: var(--nav-hover-bg); }
        .theme-dropdown .td-item.active {
          background: var(--nav-active-bg);
          border-left: 3px solid var(--nav-accent);
          font-weight: 600;
        }
        .theme-dropdown .td-item .ic { font-size: 13px; }

        /* ── Skip-to-content a11y ── */
        .skip-link {
          position: absolute;
          left: -9999px;
          top: 8px;
          background: var(--nav-accent);
          color: #06141a;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          z-index: 999;
        }
        .skip-link:focus { left: 8px; }

        /* ── Mobile hamburger ── */
        .hamburger {
          display: none;
          background: transparent;
          border: 1px solid var(--nav-border);
          color: var(--nav-text);
          font-size: 16px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .mobile-tabs {
          display: none;
          background: rgba(6,14,26,0.97);
          border-bottom: 1px solid var(--nav-border);
          padding: 8px;
          flex-direction: column;
          gap: 4px;
        }
        .mobile-tabs.open { display: flex; }
        .mobile-tabs .tab { font-size: 14px; padding: 12px 14px; }

        @media (max-width: 720px) {
          .logo { font-size: 9px; padding: 5px 7px; }
          .ver-chip { font-size: 8px; padding: 2px 5px; }
          .tabs { display: none; }
          .hamburger { display: inline-block; }
          .user-chip .user-name { display: none; }
          .login-btn .login-label { display: none; }
          .login-btn { padding: 6px 10px; }
          .ctrl-btn .kbd { display: none; }
          .bell-panel, .user-menu { width: 92vw; right: -8px; }
        }
      </style>

      <a href="#main" class="skip-link">Pular pro conteúdo</a>

      <nav class="nav-bar" role="navigation" aria-label="Office navigation">
        <a class="logo" href="/" aria-label="Voltar ao Office" title="EPI-USE Brasil Office">
          <img src="/assets/logos-epi-use/epi-use-logo-rgb.svg" alt="EPI-USE" height="20" style="display:block">
        </a>
        <a class="ver-chip" href="/changelog" title="Versão atual — clique para ver histórico">${OFFICE_NAV_VERSION}</a>

        <button class="hamburger" id="hamburger-btn" type="button" aria-label="Menu" title="Menu">☰</button>

        <div class="tabs" role="tablist">
          ${OFFICE_NAV_TABS.map(t => {
            const isActive = t.id === activeTab;
            return `<a class="tab ${isActive ? 'active' : ''}" href="${t.href}" data-tab="${t.id}" role="tab" aria-selected="${isActive}">
              <span class="tab-ico">${t.icon}</span>
              <span class="tab-label">${t.label}</span>
            </a>`;
          }).join('')}
        </div>

        <div class="controls">
          <div class="lang-select" role="group" aria-label="Idioma / Language / Idioma">
            ${[
              ['pt','Português','<svg viewBox="0 0 28 20" width="22" height="16"><rect width="28" height="20" fill="#009b3a"/><polygon points="14,2.5 25.5,10 14,17.5 2.5,10" fill="#fedf00"/><circle cx="14" cy="10" r="4.2" fill="#002776"/></svg>'],
              ['en','English','<svg viewBox="0 0 28 20" width="22" height="16"><rect width="28" height="20" fill="#fff"/><g fill="#b22234"><rect width="28" height="1.54"/><rect y="3.08" width="28" height="1.54"/><rect y="6.15" width="28" height="1.54"/><rect y="9.23" width="28" height="1.54"/><rect y="12.31" width="28" height="1.54"/><rect y="15.38" width="28" height="1.54"/><rect y="18.46" width="28" height="1.54"/></g><rect width="12" height="10.77" fill="#3c3b6e"/></svg>'],
              ['es','Español','<svg viewBox="0 0 28 20" width="22" height="16"><rect width="28" height="20" fill="#c60b1e"/><rect y="5" width="28" height="10" fill="#ffc400"/></svg>']
            ].map(([code,name,svg]) => {
              const active = (typeof getLangCode === 'function' ? getLangCode() : 'pt') === code;
              return `<button class="lang-flag ${active ? 'active' : ''}" data-lang="${code}" title="${name}" aria-label="${name}" aria-pressed="${active}" type="button">${svg}</button>`;
            }).join('')}
          </div>
          <div class="bell-wrap">
            <button class="bell-btn" id="bell-btn" type="button" title="Notificações" aria-label="Notificações">🔔<span class="bell-badge" id="bell-badge" style="display:none">0</span></button>
            <div class="bell-panel" id="bell-panel" role="menu">
              <div class="bp-head"><span>Notificações</span><a href="/area/brand" style="color:var(--nav-accent);text-decoration:none;font-size:10px">Ver tudo →</a></div>
              <div id="bell-items"><div class="bp-item empty">Carregando…</div></div>
            </div>
          </div>
          <div class="theme-wrap">
            <button class="ctrl-btn" id="theme-btn" title="Selecionar tema" type="button">${themeIcon}</button>
            <div class="theme-dropdown" id="theme-dropdown" role="menu">
              <div class="td-head">Selecione o Tema</div>
              <button class="td-item ${theme === 'dark' ? 'active' : ''}" data-theme-val="dark" type="button"><span class="ic">🌑</span> Escuro (Legado)</button>
              <button class="td-item ${theme === 'atlas-dark' ? 'active' : ''}" data-theme-val="atlas-dark" type="button"><span class="ic">◑</span> Nova · Escuro</button>
              <button class="td-item ${theme === 'aurora' ? 'active' : ''}" data-theme-val="aurora" type="button"><span class="ic">🔮</span> Aurora (Legado)</button>
              <button class="td-item ${theme === 'light' ? 'active' : ''}" data-theme-val="light" type="button"><span class="ic">☀️</span> Claro (Light)</button>
              <button class="td-item ${theme === 'liquid-glass' ? 'active' : ''}" data-theme-val="liquid-glass" type="button"><span class="ic">💧</span> Liquid Glass</button>
            </div>
          </div>
          ${(this._ssoEnabled && !this._authed)
            ? `<a class="login-btn" href="/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}" title="Entrar com a conta Microsoft EPI-USE">🔐 <span class="login-label">Entrar</span></a>`
            : ''}
          <div class="user-wrap">
            <button class="user-chip" id="user-btn" type="button">👤 <span class="user-name">${user}</span></button>
            <div class="user-menu" id="user-menu" role="menu">
              <div class="um-head">
                <div class="um-name">👤 ${user}</div>
                <div class="um-sub">${this._sso && this._sso.email ? this._sso.email + ' · 🔒 SSO' : 'EPI-USE Office · ' + OFFICE_NAV_VERSION}</div>
              </div>
              ${this._sso && this._sso.name ? '' : '<button class="um-item" id="um-rename" type="button"><span class="ic">✏️</span>Trocar nome de exibição</button>'}
              <button class="um-item" id="um-theme" type="button"><span class="ic">${themeIcon}</span>Tema: ${THEME_LABEL[theme]||'escuro'}</button>
              ${this._authed ? '<a class="um-item" href="/escolher-visao"><span class="ic">🔀</span>Trocar visualização</a>' : ''}
              <a class="um-item" href="/changelog"><span class="ic">📜</span>Changelog</a>
              <a class="um-item" href="https://erp.ngo" target="_blank" rel="noopener"><span class="ic">🐘</span>ERP.ngo</a>
              <button class="um-item" id="um-logout" type="button"><span class="ic">${this._authed ? '🚪' : '↪'}</span>${this._authed ? 'Sair' : 'Sair (limpa preferências)'}</button>
            </div>
          </div>
          <div class="overflow-wrap">
            <button class="ctrl-btn" id="more-btn" title="Mais opções" type="button">⋯</button>
            <div class="overflow-overlay" id="overflow-overlay"></div>
            <div class="overflow-menu" id="overflow-menu">
              <div class="overflow-col">${col1Html}</div>
              <div class="overflow-col">${col2Html}</div>
              <div class="overflow-col">${col3Html}</div>
            </div>
          </div>
        </div>
      </nav>

      <div class="mobile-tabs" id="mobile-tabs" role="menu">
        ${OFFICE_NAV_TABS.map(t => {
          const isActive = t.id === activeTab;
          return `<a class="tab ${isActive ? 'active' : ''}" href="${t.href}"><span class="tab-ico">${t.icon}</span><span>${t.label}</span></a>`;
        }).join('')}
      </div>

      ${breadcrumb ? `
      <div class="crumbs" role="navigation" aria-label="Breadcrumb">
        ${breadcrumb.map((c, i) => `
          <span class="item ${i === breadcrumb.length - 1 ? 'current' : ''}">${c}</span>
          ${i < breadcrumb.length - 1 ? '<span class="sep">›</span>' : ''}
        `).join('')}
      </div>` : ''}
    `;
    // Traduz o conteúdo do nav (Shadow DOM não é alcançado pelo walker global)
    if (window.translateRoot) { try { window.translateRoot(this.shadowRoot); } catch (e) {} }
  }

  hookEvents() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    const overflowBtn = $('more-btn');
    const overflowMenu = $('overflow-menu');
    const overflowOverlay = $('overflow-overlay');
    const userBtn = $('user-btn');
    const userMenu = $('user-menu');
    const themeBtn = $('theme-btn');
    const bellBtn = $('bell-btn');
    const bellPanel = $('bell-panel');
    const hamburgerBtn = $('hamburger-btn');
    const mobileTabs = $('mobile-tabs');

    const themeDropdown = $('theme-dropdown');
    // Helper: fecha todos os dropdowns exceto o que abriu
    const closeAll = (except) => {
      [overflowMenu, overflowOverlay, userMenu, bellPanel, mobileTabs, themeDropdown].forEach(el => {
        if (el && el !== except) el.classList.remove('open');
      });
    };

    overflowBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = overflowMenu.classList.contains('open');
      closeAll();
      if (!isOpen) {
        overflowMenu.classList.add('open');
        overflowOverlay.classList.add('open');
      }
    });

    overflowOverlay?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAll();
    });

    userBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = userMenu.classList.contains('open');
      closeAll();
      if (!isOpen) userMenu.classList.add('open');
    });

    bellBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = bellPanel.classList.contains('open');
      closeAll();
      if (!isOpen) bellPanel.classList.add('open');
    });

    hamburgerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileTabs.classList.contains('open');
      closeAll();
      if (!isOpen) mobileTabs.classList.add('open');
    });

    // Click fora (no document) fecha tudo
    document.addEventListener('click', () => closeAll());

    // User menu actions
    $('um-rename')?.addEventListener('click', () => {
      const cur = this.getUser();
      const next = prompt('Trocar nome de exibição:', cur === 'Visitante' ? '' : cur);
      if (next !== null) {
        const clean = next.trim().slice(0, 24) || 'Visitante';
        try { localStorage.setItem('office.user', clean); } catch {}
        this.render();
        this.hookEvents();
      }
    });

    $('um-theme')?.addEventListener('click', () => {
      const ORDER = ['dark', 'atlas-dark', 'aurora', 'light', 'liquid-glass'];
      const cur = this.getTheme();
      const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
      try { localStorage.setItem('office.theme', next); } catch {}
      applyTheme(next);
      this.render();
      this.hookEvents();
    });

    $('um-logout')?.addEventListener('click', () => {
      // Autenticado via SSO: logout de verdade (encerra a sessão → /login).
      if (this._authed) { location.href = '/auth/logout'; return; }
      // Anônimo (sem SSO): só limpa preferências locais.
      if (!confirm('Limpar preferências locais (nome, tema, drafts)?')) return;
      try {
        ['office.user', 'office.theme', 'inbound.brief.draft', 'inbound.calendar'].forEach(k => localStorage.removeItem(k));
      } catch {}
      location.reload();
    });

    // Notification bell — busca /api/alerts uma vez
    this.loadAlerts();

    this.shadowRoot.querySelectorAll('.lang-flag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.dataset.lang;
        if (window.setLang) window.setLang(code);
        else { try { localStorage.setItem('office.lang', code); } catch (e2) {} location.reload(); }
        this.render();
        this.hookEvents();
      });
    });

    themeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = themeDropdown.classList.contains('open');
      closeAll();
      if (!isOpen) themeDropdown.classList.add('open');
    });

    this.shadowRoot.querySelectorAll('.td-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = btn.dataset.themeVal;
        if (next) {
          try { localStorage.setItem('office.theme', next); } catch {}
          applyTheme(next);
          this.render();
          this.hookEvents();
        }
      });
    });

    this.shadowRoot.querySelectorAll('[data-screen-val]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.screenVal;
        const next = this.getScreenV2(name) ? '0' : '1';
        try { localStorage.setItem('office.v2.' + name, next); } catch {}
        this.render();
        this.hookEvents();
        // se já estiver na tela afetada, recarrega pra aplicar a v2
        if (location.pathname.startsWith('/' + name)) {
          location.reload();
        }
      });
    });

    // Aplica tema salvo na primeira montagem (idempotente)
    applyTheme(this.getTheme());
  }

  async loadAlerts() {
    const items = this.shadowRoot.getElementById('bell-items');
    const badge = this.shadowRoot.getElementById('bell-badge');
    if (!items) return;
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const alerts = data.alertas || [];
      if (alerts.length === 0) {
        items.innerHTML = '<div class="bp-item empty">Nenhum alerta no momento.</div>';
        badge.style.display = 'none';
        return;
      }
      badge.textContent = alerts.length > 9 ? '9+' : String(alerts.length);
      badge.style.display = 'inline-flex';
      items.innerHTML = alerts.slice(0, 10).map(a => {
        const tagCls = a.tipo === 'warn' ? 'warn' : 'info';
        const tagLbl = a.tipo === 'action' ? '🔥' : (a.tipo === 'warn' ? '⚠' : 'i');
        const href = a.href || '/area/brand';
        return `<a class="bp-item" href="${href}"><span class="bp-tag ${tagCls}">${tagLbl}</span>${(a.msg || '').slice(0, 140)}</a>`;
      }).join('');
    } catch (e) {
      items.innerHTML = '<div class="bp-item empty">Não foi possível carregar alertas.</div>';
      badge.style.display = 'none';
    }
  }
}

customElements.define('office-nav', OfficeNav);

// ════════════════════════════════════════════════════════════════════════════
// THEME APPLY — seta data-theme no <html> + injeta tokens de light mode globais
// (cada página tem suas próprias CSS vars; só sobrescrevemos as comuns)
// ════════════════════════════════════════════════════════════════════════════
function applyTheme(theme) {
  const html = document.documentElement;
  // SEMPRE seta o atributo explicitamente. Páginas como /optimizer dependem
  // do CSS `[data-theme="dark"]` ativar (não funciona se o atributo for removido).
  const valid = ['epiuse-light','epiuse-dark','atlas-light','atlas-dark','dark','light','armory','elephant','aurora','liquid-glass'];
  const t = valid.includes(theme) ? theme : 'atlas-dark';
  html.setAttribute('data-theme', t);

  // Dispara evento de mudança de tema para atualizar gráficos e outros componentes
  window.dispatchEvent(new CustomEvent('office-theme-change', { detail: { theme: t } }));

  // Injeta ou gerencia o background de Liquid Glass (VFX video do open-design)
  let bg = document.getElementById('liquid-glass-bg');
  if (t === 'liquid-glass') {
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'liquid-glass-bg';
      bg.style.cssText = 'position:fixed; inset:0; z-index:-2; pointer-events:none; overflow:hidden; background:#000000;';
      bg.innerHTML = `
        <video autoplay loop muted playsinline style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.32; filter:saturate(0.8) contrast(1.15);">
          <source src="/assets/11760747-uhd_4096_2160_30fps.mp4" type="video/mp4">
        </video>
        <div style="position:absolute; top:0; left:0; right:0; height:200px; background:linear-gradient(to bottom, #000, transparent); pointer-events:none; z-index:1;"></div>
        <div style="position:absolute; bottom:0; left:0; right:0; height:200px; background:linear-gradient(to top, #000, transparent); pointer-events:none; z-index:1;"></div>
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.1); pointer-events:none; z-index:1;"></div>
      `;
      document.body?.insertBefore(bg, document.body.firstChild);
    } else {
      bg.style.display = 'block';
      const vid = bg.querySelector('video');
      if (vid && vid.paused) {
        vid.play().catch(() => {});
      }
    }
  } else {
    if (bg) {
      bg.style.display = 'none';
    }
  }
}

// Garante que o stylesheet de light mode global existe (injetado 1x)
(function ensureLightStyles() {
  if (document.getElementById('office-light-tokens')) return;
  const style = document.createElement('style');
  style.id = 'office-light-tokens';
  style.textContent = `
    /* Office Engine — Light Mode override (apenas onde o token existe globalmente).
       Páginas que usam CSS vars locais escuras hardcoded ficam parcialmente cobertas —
       é o trade-off prático sem reescrever 8 HTMLs. */
    :root[data-theme="light"] {
      --bg: #f8fafc;
      --bg-2: #f1f5f9;
      --surface: #ffffff;
      --surface-2: #f8fafc;
      --border: rgba(15, 23, 42, 0.08);
      --border-light: rgba(15, 23, 42, 0.06);
      --text: #0f172a;
      --text-dim: #334155;
      --text-muted: #64748b;
      --primary: #2563eb;
      --primary-light: #3b82f6;
      color-scheme: light;
    }
    :root[data-theme="light"] body {
      background: #f8fafc !important;
      color: #0f172a !important;
    }

    /* ─── GRID PATTERN GLOBAL — aplica em TODAS rotas com data-route ───────
       Opt-out: seja-voice (LP externa). Standalone — não depende de
       consulting-dark.css estar carregado na página. !important pra vencer
       hardcodes locais nas páginas legadas. */
    @media screen {
      body[data-route]:not([data-route="seja-voice"]) {
        background:
          linear-gradient(rgba(134,158,195,.04) 1px, transparent 1px) 0 0/48px 48px,
          linear-gradient(90deg, rgba(134,158,195,.04) 1px, transparent 1px) 0 0/48px 48px,
          radial-gradient(ellipse 80% 60% at 50% -10%, rgba(205,21,67,.12), transparent 60%),
          radial-gradient(ellipse 60% 50% at 100% 100%, rgba(20,184,166,.05), transparent 60%),
          #050b18 !important;
        background-attachment: fixed !important;
        font-family: 'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif !important;
        color: #e6ebf2 !important;
        -webkit-font-smoothing: antialiased;
        margin: 0 !important;
      }
    }
    body[data-route]:not([data-route="seja-voice"]) h1,
    body[data-route]:not([data-route="seja-voice"]) h2,
    body[data-route]:not([data-route="seja-voice"]) h3 {
      font-family: 'Poppins', 'Source Sans 3', sans-serif;
      letter-spacing: -0.012em;
      font-weight: 600;
    }
    /* Light mode preserva grid mas mais sutil */
    :root[data-theme="light"] body[data-route]:not([data-route="seja-voice"]) {
      background:
        linear-gradient(rgba(0,24,68,.025) 1px, transparent 1px) 0 0/48px 48px,
        linear-gradient(90deg, rgba(0,24,68,.025) 1px, transparent 1px) 0 0/48px 48px,
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(205,21,67,.06), transparent 60%),
        #f4f7fb !important;
      color: #0f172a !important;
    }

    /* ─── ARMORY THEME ─────────────────────────────────────────────────────
       Inspirado em armory.framer.ai — terminal/tech sharp, slate-black bg,
       neon green accents, monospace, edges rectos. Aplica em todas páginas. */
    :root[data-theme="armory"] {
      --bg: #0a0a0a;
      --bg-2: #111111;
      --surface: #161616;
      --surface-2: #1c1c1c;
      --border: rgba(0, 255, 153, 0.18);
      --border-light: rgba(255, 255, 255, 0.06);
      --text: #f5f5f5;
      --text-dim: #c0c0c0;
      --text-muted: #888888;
      --primary: #00ff99;
      --primary-light: #5cffb8;
      --accent: #00ff99;
      --danger: #ff4444;
      --color-primary-500: #00ff99;
      --color-primary-600: #00d985;
      --color-surface-0: #0a0a0a;
      --color-surface-1: #161616;
      --color-surface-2: #1c1c1c;
      --color-text-primary: #f5f5f5;
      --color-text-secondary: #c0c0c0;
      --color-text-muted: #888888;
      --color-border: rgba(255,255,255,0.08);
      --dk-surface: #161616;
      --dk-text: #f5f5f5;
      --dk-text-muted: #888888;
      --home-text: #f5f5f5;
      --home-text-muted: #888888;
      color-scheme: dark;
    }
    :root[data-theme="armory"] body,
    :root[data-theme="armory"] body[data-route]:not([data-route="seja-voice"]) {
      background: #0a0a0a !important;
      color: #f5f5f5 !important;
      font-family: 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', monospace !important;
    }
    :root[data-theme="armory"] h1,
    :root[data-theme="armory"] h2,
    :root[data-theme="armory"] h3,
    :root[data-theme="armory"] h4,
    :root[data-theme="armory"] .home-section-title {
      font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
      letter-spacing: -0.02em !important;
      text-transform: uppercase;
      color: #f5f5f5 !important;
    }
    :root[data-theme="armory"] .kpi,
    :root[data-theme="armory"] .card,
    :root[data-theme="armory"] .home-area-card,
    :root[data-theme="armory"] .home-digest-card,
    :root[data-theme="armory"] .dk-glass {
      background: #161616 !important;
      border: 1px solid rgba(0, 255, 153, 0.15) !important;
      border-radius: 2px !important;
      box-shadow: none !important;
    }
    :root[data-theme="armory"] a { color: #00ff99 !important; }
    :root[data-theme="armory"] button,
    :root[data-theme="armory"] .btn {
      border-radius: 2px !important;
      letter-spacing: 0.05em;
    }

    /* ─── ELEPHANT THEME ───────────────────────────────────────────────────
       Inspirado em groupelephant.com — bege/cream warm bg, deep green primary,
       serif headings, organic/conservation tone, soft edges. */
    :root[data-theme="elephant"] {
      --bg: #f5f1e8;
      --bg-2: #ebe5d4;
      --surface: #ffffff;
      --surface-2: #faf6ec;
      --border: rgba(45, 74, 51, 0.15);
      --border-light: rgba(45, 74, 51, 0.08);
      --text: #1f3024;
      --text-dim: #3d4f3a;
      --text-muted: #6b7464;
      --primary: #2d4a33;
      --primary-light: #4a6b50;
      --accent: #a8723f;
      --color-primary-500: #2d4a33;
      --color-primary-600: #1f3024;
      --color-surface-0: #f5f1e8;
      --color-surface-1: #ffffff;
      --color-surface-2: #faf6ec;
      --color-text-primary: #1f3024;
      --color-text-secondary: #3d4f3a;
      --color-text-muted: #6b7464;
      --color-border: rgba(45,74,51,0.15);
      --dk-surface: #ffffff;
      --dk-text: #1f3024;
      --dk-text-muted: #6b7464;
      --home-text: #1f3024;
      --home-text-muted: #6b7464;
      color-scheme: light;
    }
    :root[data-theme="elephant"] body,
    :root[data-theme="elephant"] body[data-route]:not([data-route="seja-voice"]) {
      background: #f5f1e8 !important;
      color: #1f3024 !important;
      font-family: 'Source Sans 3', 'Inter', sans-serif !important;
    }
    :root[data-theme="elephant"] h1,
    :root[data-theme="elephant"] h2,
    :root[data-theme="elephant"] h3,
    :root[data-theme="elephant"] h4,
    :root[data-theme="elephant"] .home-section-title {
      font-family: 'Poppins', 'Playfair Display', 'Source Serif Pro', Georgia, serif !important;
      color: #1f3024 !important;
      letter-spacing: -0.01em !important;
      font-weight: 600 !important;
    }
    :root[data-theme="elephant"] .kpi,
    :root[data-theme="elephant"] .card,
    :root[data-theme="elephant"] .home-area-card,
    :root[data-theme="elephant"] .home-digest-card,
    :root[data-theme="elephant"] .dk-glass {
      background: #ffffff !important;
      border: 1px solid rgba(45, 74, 51, 0.12) !important;
      border-radius: 14px !important;
      box-shadow: 0 1px 3px rgba(45,74,51,0.04) !important;
      color: #1f3024 !important;
    }
    :root[data-theme="elephant"] a { color: #2d4a33 !important; }
    :root[data-theme="elephant"] .chip-online {
      background: rgba(45,74,51,0.10) !important;
      color: #2d4a33 !important;
    }

    /* ─── AURORA GLASS THEME ───────────────────────────────────────────────
       Tema ultra-premium: desfoque de vidro, fundo gradiente de nebulosa/aurora roxa,
       bordas e sombras neon sutis, realces dourados/amber (SAP consulting vibe). */
    :root[data-theme="aurora"] {
      --bg: #0c081f;
      --bg-2: #140d33;
      --surface: rgba(26, 17, 60, 0.45);
      --surface-2: rgba(35, 23, 80, 0.6);
      --border: rgba(168, 85, 247, 0.3);
      --border-light: rgba(255, 255, 255, 0.08);
      --text: #f3e8ff;
      --text-dim: #d8b4fe;
      --text-muted: #a78bfa;
      --primary: #fbbf24;
      --primary-light: #fde047;
      --accent: #ec4899;
      --color-primary-500: #fbbf24;
      --color-primary-600: #d97706;
      --color-surface-0: #0c081f;
      --color-surface-1: rgba(26, 17, 60, 0.4);
      --color-surface-2: rgba(35, 23, 80, 0.55);
      --color-text-primary: #f3e8ff;
      --color-text-secondary: #d8b4fe;
      --color-text-muted: #a78bfa;
      --color-border: rgba(168, 85, 247, 0.2);
      --dk-surface: rgba(26, 17, 60, 0.45);
      --dk-text: #f3e8ff;
      --dk-text-muted: #a78bfa;
      --home-text: #f3e8ff;
      --home-text-muted: #a78bfa;
      color-scheme: dark;
    }
    :root[data-theme="aurora"] body,
    :root[data-theme="aurora"] body[data-route]:not([data-route="seja-voice"]) {
      background: radial-gradient(circle at 50% 0%, #1c0f3a, #0c081f 60%, #04020a) !important;
      background-attachment: fixed !important;
      color: #f3e8ff !important;
    }
    :root[data-theme="aurora"] .kpi,
    :root[data-theme="aurora"] .card,
    :root[data-theme="aurora"] .home-area-card,
    :root[data-theme="aurora"] .home-digest-card,
    :root[data-theme="aurora"] .dk-glass {
      background: rgba(26, 17, 60, 0.45) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 16px !important;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37) !important;
      position: relative;
      overflow: hidden;
      color: #f3e8ff !important;
    }
    :root[data-theme="aurora"] .kpi::before,
    :root[data-theme="aurora"] .card::before,
    :root[data-theme="aurora"] .home-area-card::before,
    :root[data-theme="aurora"] .dk-glass::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, #fbbf24, #ec4899, #a855f7);
      opacity: 0.8;
      z-index: 1;
    }
    :root[data-theme="aurora"] a { color: #fbbf24 !important; }
    :root[data-theme="aurora"] .chip-online {
      background: rgba(251, 191, 36, 0.15) !important;
      color: #fbbf24 !important;
      border: 1px solid rgba(251, 191, 36, 0.3) !important;
    }

    /* ─── LIQUID GLASS DE VERDADE (Estilo open-design) ───────────────────── */
    :root[data-theme="liquid-glass"] {
      --bg: #000000;
      --bg-2: #05070f;
      --surface: rgba(255, 255, 255, 0.01);
      --surface-2: rgba(255, 255, 255, 0.03);
      --border: rgba(255, 255, 255, 0.2);
      --border-light: rgba(255, 255, 255, 0.06);
      --text: #ffffff;
      --text-dim: rgba(255, 255, 255, 0.9);
      --text-muted: rgba(255, 255, 255, 0.6);
      --primary: #ffffff;
      --primary-light: rgba(255, 255, 255, 0.8);
      --accent: rgba(255, 255, 255, 0.25);
      --color-primary-500: #ffffff;
      --color-primary-600: rgba(255, 255, 255, 0.8);
      --color-surface-0: #000000;
      --color-surface-1: rgba(255, 255, 255, 0.01);
      --color-surface-2: rgba(255, 255, 255, 0.03);
      --color-text-primary: #ffffff;
      --color-text-secondary: rgba(255, 255, 255, 0.9);
      --color-text-muted: rgba(255, 255, 255, 0.6);
      --color-border: rgba(255, 255, 255, 0.15);
      --dk-surface: rgba(255, 255, 255, 0.01);
      --dk-text: #ffffff;
      --dk-text-muted: rgba(255, 255, 255, 0.6);
      --home-text: #ffffff;
      --home-text-muted: rgba(255, 255, 255, 0.6);
      color-scheme: dark;
    }

    :root[data-theme="liquid-glass"] body,
    :root[data-theme="liquid-glass"] body[data-route]:not([data-route="seja-voice"]) {
      background: #000000 !important;
      color: #ffffff !important;
    }

    /* Grid Overlay do Liquid Hero */
    :root[data-theme="liquid-glass"] body[data-route]::before {
      content: '' !important;
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      background-image: 
        linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), 
        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px) !important;
      background-size: 64px 64px !important;
      z-index: -1 !important;
    }

    :root[data-theme="liquid-glass"] .kpi,
    :root[data-theme="liquid-glass"] .card,
    :root[data-theme="liquid-glass"] .home-area-card,
    :root[data-theme="liquid-glass"] .home-digest-card,
    :root[data-theme="liquid-glass"] .dk-glass,
    :root[data-theme="liquid-glass"] .panel,
    :root[data-theme="liquid-glass"] .tbl-wrap,
    :root[data-theme="liquid-glass"] .rep-header,
    :root[data-theme="liquid-glass"] .agenda,
    :root[data-theme="liquid-glass"] .evt-card,
    :root[data-theme="liquid-glass"] .voice-tile,
    :root[data-theme="liquid-glass"] .profile-hdr {
      background: rgba(255, 255, 255, 0.01) !important;
      background-blend-mode: luminosity !important;
      backdrop-filter: blur(50px) saturate(190%) contrast(110%) !important;
      -webkit-backdrop-filter: blur(50px) saturate(190%) contrast(110%) !important;
      border: none !important;
      border-radius: 20px !important;
      box-shadow: 
        inset 0 1px 1px rgba(255, 255, 255, 0.1),
        0 15px 35px -10px rgba(0, 0, 0, 0.45) !important;
      position: relative !important;
      overflow: hidden !important;
      color: #ffffff !important;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s, background-color 0.3s !important;
    }

    /* Specular Glowing Border Gradient using Mask-Composite */
    :root[data-theme="liquid-glass"] .kpi::before,
    :root[data-theme="liquid-glass"] .card::before,
    :root[data-theme="liquid-glass"] .home-area-card::before,
    :root[data-theme="liquid-glass"] .home-digest-card::before,
    :root[data-theme="liquid-glass"] .dk-glass::before,
    :root[data-theme="liquid-glass"] .panel::before,
    :root[data-theme="liquid-glass"] .tbl-wrap::before,
    :root[data-theme="liquid-glass"] .rep-header::before,
    :root[data-theme="liquid-glass"] .agenda::before,
    :root[data-theme="liquid-glass"] .evt-card::before,
    :root[data-theme="liquid-glass"] .voice-tile::before,
    :root[data-theme="liquid-glass"] .profile-hdr::before {
      content: '' !important;
      position: absolute !important;
      inset: 0 !important;
      border-radius: inherit !important;
      padding: 1.4px !important;
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.15) 20%,
        rgba(255, 255, 255, 0) 40%,
        rgba(255, 255, 255, 0) 60%,
        rgba(255, 255, 255, 0.15) 80%,
        rgba(255, 255, 255, 0.5) 100%
      ) !important;
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) !important;
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
      pointer-events: none !important;
      z-index: 2 !important;
      transition: background 0.3s ease !important;
    }

    /* Specular Highlight (Gel Lens) */
    :root[data-theme="liquid-glass"] .kpi::after,
    :root[data-theme="liquid-glass"] .card::after,
    :root[data-theme="liquid-glass"] .home-area-card::after,
    :root[data-theme="liquid-glass"] .home-digest-card::after,
    :root[data-theme="liquid-glass"] .dk-glass::after,
    :root[data-theme="liquid-glass"] .panel::after,
    :root[data-theme="liquid-glass"] .tbl-wrap::after,
    :root[data-theme="liquid-glass"] .rep-header::after,
    :root[data-theme="liquid-glass"] .agenda::after,
    :root[data-theme="liquid-glass"] .evt-card::after,
    :root[data-theme="liquid-glass"] .voice-tile::after,
    :root[data-theme="liquid-glass"] .profile-hdr::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 40% !important;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.02) 80%, transparent 100%) !important;
      border-radius: 20px 20px 120px 120px / 20px 20px 20px 20px !important;
      pointer-events: none !important;
      z-index: 1 !important;
      opacity: 0.9 !important;
      transition: opacity 0.3s, background-color 0.3s !important;
    }

    :root[data-theme="liquid-glass"] .kpi:hover,
    :root[data-theme="liquid-glass"] .card:hover,
    :root[data-theme="liquid-glass"] .home-area-card:hover,
    :root[data-theme="liquid-glass"] .home-digest-card:hover,
    :root[data-theme="liquid-glass"] .dk-glass:hover,
    :root[data-theme="liquid-glass"] .panel:hover,
    :root[data-theme="liquid-glass"] .tbl-wrap:hover,
    :root[data-theme="liquid-glass"] .rep-header:hover,
    :root[data-theme="liquid-glass"] .agenda:hover,
    :root[data-theme="liquid-glass"] .evt-card:hover,
    :root[data-theme="liquid-glass"] .voice-tile:hover,
    :root[data-theme="liquid-glass"] .profile-hdr:hover {
      transform: translateY(-4px) scale(1.006) !important;
      background: rgba(255, 255, 255, 0.03) !important;
      box-shadow: 
        inset 0 1px 1px rgba(255, 255, 255, 0.18),
        0 25px 45px -12px rgba(255, 255, 255, 0.06),
        0 15px 35px -10px rgba(0, 0, 0, 0.65) !important;
    }

    :root[data-theme="liquid-glass"] .kpi:hover::before,
    :root[data-theme="liquid-glass"] .card:hover::before,
    :root[data-theme="liquid-glass"] .home-area-card:hover::before,
    :root[data-theme="liquid-glass"] .home-digest-card:hover::before,
    :root[data-theme="liquid-glass"] .dk-glass:hover::before,
    :root[data-theme="liquid-glass"] .panel:hover::before,
    :root[data-theme="liquid-glass"] .tbl-wrap:hover::before,
    :root[data-theme="liquid-glass"] .rep-header:hover::before,
    :root[data-theme="liquid-glass"] .agenda:hover::before,
    :root[data-theme="liquid-glass"] .evt-card:hover::before,
    :root[data-theme="liquid-glass"] .voice-tile:hover::before,
    :root[data-theme="liquid-glass"] .profile-hdr:hover::before {
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.75) 0%,
        rgba(255, 255, 255, 0.3) 20%,
        rgba(255, 255, 255, 0) 40%,
        rgba(255, 255, 255, 0) 60%,
        rgba(255, 255, 255, 0.3) 80%,
        rgba(255, 255, 255, 0.75) 100%
      ) !important;
    }

    :root[data-theme="liquid-glass"] .kpi:hover::after,
    :root[data-theme="liquid-glass"] .card:hover::after,
    :root[data-theme="liquid-glass"] .home-area-card:hover::after,
    :root[data-theme="liquid-glass"] .home-digest-card:hover::after,
    :root[data-theme="liquid-glass"] .dk-glass:hover::after,
    :root[data-theme="liquid-glass"] .panel:hover::after,
    :root[data-theme="liquid-glass"] .tbl-wrap:hover::after,
    :root[data-theme="liquid-glass"] .rep-header:hover::after,
    :root[data-theme="liquid-glass"] .agenda:hover::after,
    :root[data-theme="liquid-glass"] .evt-card:hover::after,
    :root[data-theme="liquid-glass"] .voice-tile:hover::after,
    :root[data-theme="liquid-glass"] .profile-hdr:hover::after {
      opacity: 1 !important;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.04) 70%, transparent 100%) !important;
    }

    :root[data-theme="liquid-glass"] a { color: #ffffff !important; text-decoration: underline !important; }
    :root[data-theme="liquid-glass"] a:hover { color: rgba(255, 255, 255, 0.8) !important; }
    :root[data-theme="liquid-glass"] .chip-online {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
    }
  `;
  document.head.appendChild(style);
})();

// Aplica o tema salvo o quanto antes (evita FOUC se o nav demorar pra montar)
(function preApplyTheme() {
  try {
    const saved = localStorage.getItem('office.theme') || 'dark';
    const valid = ['epiuse-light','epiuse-dark','atlas-light','atlas-dark','dark','light','armory','elephant','aurora','liquid-glass'].includes(saved) ? saved : 'dark';
    applyTheme(valid);
  } catch {}
})();

// ════════════════════════════════════════════════════════════════════════════
// COMMAND PALETTE — Cmd+K modal global
// ════════════════════════════════════════════════════════════════════════════
const OfficeCommandPalette = (() => {
  let overlay = null;
  let input = null;
  let list = null;
  let items = [];      // [{id, label, hint, icon, action: fn|url, group}]
  let filtered = [];
  let selectedIdx = 0;
  let isOpen = false;

  // Catalog estática + voices carregadas async em build()
  function baseItems() {
    return [
      // Rotas
      { group:'Rotas', icon:'🏠', label:'Home',                 hint:'/',           action:'/' },
      { group:'Rotas', icon:'🎮', label:'Modo Game (mapa 2D)',  hint:'/game',       action:'/game' },
      { group:'Rotas', icon:'🎙️', label:'Voice Agents',         hint:'/voices',     action:'/voices' },
      { group:'Rotas', icon:'🦝', label:'Raccoon Studio',       hint:'/raccoon',    action:'/raccoon' },
      { group:'Rotas', icon:'✎',  label:'Brief → Post',         hint:'/inbound/brief',    action:'/inbound/brief' },
      { group:'Rotas', icon:'▥',  label:'Carrossel Hub',        hint:'/inbound/carousel', action:'/inbound/carousel' },
      { group:'Rotas', icon:'▦',  label:'Calendário Editorial', hint:'/inbound/calendar', action:'/inbound/calendar' },
      { group:'Rotas', icon:'▤',  label:'Playbook (deck 19 slides)', hint:'/inbound/playbook', action:'/inbound/playbook' },
      { group:'Rotas', icon:'🎨', label:'Brand Experience / Voices', hint:'/area/brand', action:'/area/brand' },
      { group:'Rotas', icon:'🪪', label:'Profile Optimizer',    hint:'/voices/optimizer-v3',  action:'/voices/optimizer-v3' },
      { group:'Rotas', icon:'📨', label:'LP Seja um Voice',     hint:'/seja-voice', action:'/seja-voice' },
      { group:'Rotas', icon:'📜', label:'Changelog',            hint:'/changelog',  action:'/changelog' },
      // Ações
      { group:'Ações', icon:'🔮',  label:'Alternar tema (Legado / Atlas / Aurora / Light / Glass)', hint:'persiste', action: () => {
          const ORDER = ['dark', 'atlas-dark', 'aurora', 'light', 'liquid-glass'];
          const cur = (localStorage.getItem('office.theme') || 'dark');
          const next = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
          try { localStorage.setItem('office.theme', next); } catch {}
          applyTheme(next);
        }},
      { group:'Ações', icon:'🐘', label:'ERP.ngo (externo)',    hint:'1% receita global pra conservação', action: () => window.open('https://erp.ngo', '_blank') },
    ];
  }

  async function build() {
    items = baseItems();
    // Tenta carregar voices ativos pra adicionar atalhos diretos
    try {
      const res = await fetch('/api/voices.json');
      const data = await res.json();
      (data.voices || []).forEach(v => {
        items.push({ group:'Voices', icon:'🎙️', label:v.nome, hint:`${v.cargo} · ${v.nicho}`, action:`/voices?v=${v.id}` });
      });
    } catch {}
  }

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'office-cmdk-overlay';
    overlay.innerHTML = `
      <style>
        #office-cmdk-overlay {
          position: fixed; inset: 0; background: rgba(2, 6, 23, .7);
          backdrop-filter: blur(8px); display: none;
          align-items: flex-start; justify-content: center;
          z-index: 9999; padding: 80px 16px 16px;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        #office-cmdk-overlay.open { display: flex; }
        #office-cmdk-box {
          width: min(640px, 100%); max-height: 70vh;
          background: #0d1e36; border: 1px solid rgba(37, 99, 235, 0.35);
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,.5);
          display: flex; flex-direction: column;
        }
        :root[data-theme="light"] #office-cmdk-box {
          background: #ffffff; border-color: rgba(37, 99, 235, 0.25);
          box-shadow: 0 24px 60px rgba(15,23,42,.20);
        }
        #office-cmdk-input {
          width: 100%; background: transparent; color: #e2e8f0;
          border: none; outline: none; padding: 18px 22px;
          font-size: 16px; font-family: inherit;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        :root[data-theme="light"] #office-cmdk-input { color: #0f172a; border-bottom-color: rgba(15,23,42,.10); }
        #office-cmdk-input::placeholder { color: #64748b; }
        #office-cmdk-list {
          overflow-y: auto; padding: 6px 0 8px;
        }
        .cmdk-group {
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: #64748b; padding: 10px 22px 4px;
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .cmdk-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 22px; cursor: pointer;
          color: #cbd5e1; font-size: 14px;
        }
        :root[data-theme="light"] .cmdk-item { color: #334155; }
        .cmdk-item:hover, .cmdk-item.selected {
          background: rgba(37, 99, 235, .15);
          color: #60a5fa;
        }
        :root[data-theme="light"] .cmdk-item:hover, :root[data-theme="light"] .cmdk-item.selected {
          background: rgba(37, 99, 235, .08); color: #2563eb;
        }
        .cmdk-icon { font-size: 16px; min-width: 22px; text-align: center; }
        .cmdk-label { flex: 1; font-weight: 500; }
        .cmdk-hint {
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: #64748b; letter-spacing: 0.04em;
        }
        #office-cmdk-footer {
          padding: 8px 16px; border-top: 1px solid rgba(255,255,255,.06);
          display: flex; justify-content: space-between; align-items: center;
          font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #64748b;
        }
        :root[data-theme="light"] #office-cmdk-footer { border-top-color: rgba(15,23,42,.08); }
        .cmdk-kbd {
          background: rgba(255,255,255,.06); padding: 2px 6px;
          border-radius: 3px; font-size: 10px;
        }
        :root[data-theme="light"] .cmdk-kbd { background: rgba(15,23,42,.06); color: #334155; }
        .cmdk-empty { padding: 30px 22px; color: #64748b; text-align: center; font-size: 13px; }
      </style>
      <div id="office-cmdk-box">
        <input id="office-cmdk-input" placeholder="Buscar rotas, Voices, ações…" autocomplete="off" />
        <div id="office-cmdk-list"></div>
        <div id="office-cmdk-footer">
          <span><span class="cmdk-kbd">↑↓</span> navegar · <span class="cmdk-kbd">Enter</span> abrir · <span class="cmdk-kbd">Esc</span> fechar</span>
          <span>EPI-USE Office · Cmd+K</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    input = overlay.querySelector('#office-cmdk-input');
    list = overlay.querySelector('#office-cmdk-list');

    // Click no overlay fora da box fecha
    overlay.addEventListener('click', e => { if (e.target.id === 'office-cmdk-overlay') close(); });

    input.addEventListener('input', () => { selectedIdx = 0; renderList(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1); renderList(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); renderList(); }
      else if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
    });
  }

  function renderList() {
    const q = (input.value || '').trim().toLowerCase();
    filtered = !q ? items : items.filter(it =>
      it.label.toLowerCase().includes(q) ||
      (it.hint || '').toLowerCase().includes(q) ||
      (it.group || '').toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
      list.innerHTML = '<div class="cmdk-empty">Nada encontrado pra "' + q + '"</div>';
      return;
    }
    // Agrupar por group preservando ordem
    const groups = [];
    const map = new Map();
    filtered.forEach((it, i) => {
      if (!map.has(it.group)) { map.set(it.group, []); groups.push(it.group); }
      map.get(it.group).push({ ...it, _gidx: i });
    });
    let html = '';
    let globalIdx = 0;
    groups.forEach(g => {
      html += `<div class="cmdk-group">${g}</div>`;
      map.get(g).forEach(it => {
        const sel = globalIdx === selectedIdx ? ' selected' : '';
        html += `<div class="cmdk-item${sel}" data-idx="${globalIdx}">
          <span class="cmdk-icon">${it.icon || '•'}</span>
          <span class="cmdk-label">${it.label}</span>
          <span class="cmdk-hint">${it.hint || ''}</span>
        </div>`;
        globalIdx++;
      });
    });
    list.innerHTML = html;
    list.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => { selectedIdx = parseInt(el.dataset.idx, 10); runSelected(); });
      el.addEventListener('mouseenter', () => { selectedIdx = parseInt(el.dataset.idx, 10); list.querySelectorAll('.cmdk-item').forEach(x => x.classList.remove('selected')); el.classList.add('selected'); });
    });
    // Scroll into view
    const sel = list.querySelector('.cmdk-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function runSelected() {
    const it = filtered[selectedIdx];
    if (!it) return;
    close();
    if (typeof it.action === 'function') it.action();
    else if (typeof it.action === 'string') window.location.href = it.action;
  }

  async function open() {
    if (!items.length) await build();
    ensureDom();
    isOpen = true;
    overlay.classList.add('open');
    input.value = '';
    selectedIdx = 0;
    renderList();
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    isOpen = false;
    overlay?.classList.remove('open');
  }

  return { open, close };
})();

/* ── SSO Microsoft · bootstrap do menu de usuario (add 31/mai/2026, fix selectors)
   Aditivo: le /api/auth/status e injeta item Entrar/Sair no #user-menu (Shadow DOM).
   Nao trava nada — se SSO off, mantem o comportamento antigo (Visitante).        */
;(function(){
  function setName(sr, txt){
    var n1 = sr.querySelector('.user-name'); if(n1) n1.textContent = txt;
    var n2 = sr.querySelector('.um-name');   if(n2) n2.textContent = txt;
    var av = sr.querySelector('.um-avatar'); if(av) av.textContent = (txt||'V')[0].toUpperCase();
  }
  function addItem(menu, html, href, onClick){
    var el = document.createElement(href ? 'a' : 'button');
    el.className = 'um-item'; el.innerHTML = html;
    if(href){ el.href = href; } else { el.type = 'button'; }
    if(onClick){ el.addEventListener('click', onClick); }
    menu.insertBefore(el, menu.firstChild ? menu.firstChild.nextSibling : null); // logo apos o um-head
    return el;
  }
  function initSSO(tries){
    tries = tries || 0;
    var nav = document.querySelector('office-nav');
    var sr  = nav && nav.shadowRoot;
    var btn = sr && sr.getElementById('user-btn');
    var menu = sr && sr.getElementById('user-menu');
    if(!btn || !menu){ if(tries < 40) return setTimeout(function(){ initSSO(tries+1); }, 150); return; }
    if(menu.dataset.ssoDone) return; // idempotente
    fetch('/api/auth/status').then(function(r){ return r.json(); }).then(function(s){
      if(!s || !s.enabled) return;          // SSO desligado => nada muda
      menu.dataset.ssoDone = '1';
      if(s.authenticated && s.user){
        setName(sr, s.user.given || (s.user.name||'').split(' ')[0] || s.user.email);
        var rn = sr.getElementById('um-rename'); if(rn) rn.style.display='none'; // identidade real, sem renomear
        // Logout é o botão #um-logout (tratado na classe → /auth/logout). Sem item duplicado aqui.
      } else {
        setName(sr, 'Entrar');
        addItem(menu, '🔐 Entrar com Microsoft', '/auth/login?returnTo=' + encodeURIComponent(location.pathname + location.search));
      }
    }).catch(function(){});
  }
  if(document.readyState !== 'loading') initSSO(); else document.addEventListener('DOMContentLoaded', function(){ initSSO(); });
})();

// ════════════════════════════════════════════════════════════════════════════
// <hub-submenu> — Barra de atalhos do MKT Hub, persistente em todas as
// páginas que a incluem (hub, seja-voice, optimizer, game, erp-impacto).
// ERP.ngo fica alinhado à direita (margin-left:auto).
// ════════════════════════════════════════════════════════════════════════════
const HUB_SUBMENU_ITEMS = [
  { id: 'hub',        label: 'MKT Hub',                icon: '📈', href: '/hub' },
  { id: 'institucional', label: 'Apresentação Institucional', icon: '🏢', href: '/hub', tab: 'institucional' },
  { id: 'seja-voice', label: 'Seja um Voice',           icon: '🎙️', href: '/seja-voice' },
  { id: 'optimizer',  label: 'LinkedIn Optimizer',      icon: '🪪', href: '/optimizer' },
  { id: 'brindes',    label: 'Brindes',                 icon: '🎁', href: '/hub/brindes' },
  { id: 'game',       label: 'Game do Office',          icon: '🎮', href: '/game-hub' },
  { id: 'impacto',    label: 'Impacto ERP.ngo',         icon: '🐘', href: '/erp-impacto', right: true },
];

class HubSubmenu extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }

  connectedCallback() {
    const path = location.pathname;
    const activeId = this._detectActive(path);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: rgba(6, 14, 26, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(37, 99, 235, 0.12);
          position: sticky;
          top: 48px;
          z-index: 99;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 14px;
          max-width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .bar::-webkit-scrollbar { display: none; }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
          text-decoration: none;
          padding: 7px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          white-space: nowrap;
          cursor: pointer;
          background: transparent;
          font-family: inherit;
          transition: all .15s;
        }
        .pill:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #e2e8f0;
        }
        .pill.active {
          background: rgba(37, 99, 235, 0.18);
          border-color: rgba(37, 99, 235, 0.5);
          color: #ffffff;
          font-weight: 600;
        }
        .right { margin-left: auto; }
        @media (max-width: 720px) {
          .pill { font-size: 11px; padding: 6px 10px; }
        }
      </style>
      <div class="bar">
        ${HUB_SUBMENU_ITEMS.map(it => {
          const isActive = it.id === activeId;
          const cls = (isActive ? 'pill active' : 'pill') + (it.right ? ' right' : '');
          const href = it.tab ? it.href + '?tab=' + it.tab : it.href;
          return `<a class="${cls}" href="${href}">${it.icon} ${it.label}</a>`;
        }).join('')}
      </div>
    `;
    // Traduz o shadow root se o idioma ativo não for PT (i18n.js pode ter
    // carregado antes ou depois deste componente).
    if (window.translateRoot) { try { window.translateRoot(this.shadowRoot); } catch (e) {} }
  }

  _detectActive(path) {
    if (path === '/hub' || path === '/hub/') {
      const tab = new URLSearchParams(location.search).get('tab');
      if (tab === 'institucional') return 'institucional';
      return 'hub';
    }
    if (path.startsWith('/seja-voice')) return 'seja-voice';
    if (path.startsWith('/optimizer') || path.startsWith('/voices/optimizer')) return 'optimizer';
    if (path.startsWith('/hub/brindes') || path === '/brindes') return 'brindes';
    if (path.startsWith('/game')) return 'game';
    if (path.startsWith('/erp-impacto')) return 'impacto';
    return 'hub';
  }
}

customElements.define('hub-submenu', HubSubmenu);

// ════════════════════════════════════════════════════════════════════════════
// Analytics de uso — tempo ativo na página (Módulo 17)
// O QUEM/QUE-PÁGINA/QUANDO é logado server-side (routes/analytics.js). Aqui só
// medimos o tempo ATIVO na página (descontando quando a aba fica em background)
// e mandamos no pagehide/ocultar via sendBeacon (não bloqueia a navegação).
// ════════════════════════════════════════════════════════════════════════════
(function officeUsageBeacon() {
  if (window.__officeUsageBeacon) return;
  window.__officeUsageBeacon = true;
  var active = 0, last = Date.now(), visible = !document.hidden;
  function tick() { var now = Date.now(); if (visible) active += now - last; last = now; }
  function send() {
    tick();
    if (active < 1000) return;              // ignora < 1s
    var body = JSON.stringify({ path: location.pathname, dur_ms: Math.round(active) });
    active = 0;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/analytics/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    tick();
    if (document.hidden) { visible = false; send(); }
    else { visible = true; last = Date.now(); }
  });
  window.addEventListener('pagehide', send);
  setInterval(tick, 15000); // acumula em sessões longas na mesma aba
})();
