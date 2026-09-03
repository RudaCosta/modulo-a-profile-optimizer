// ════════════════════════════════════════════════════════════════════════════
// <office-footer> — Web Component global persistente
// Status do sistema + versão atual + dropdown de versões anteriores
// ════════════════════════════════════════════════════════════════════════════

// Fonte ÚNICA da verdade: public/api/changelog.json#current via /api/version
let OFFICE_FOOTER_VERSION = '0.89.0';
const OFFICE_FOOTER_BUILD = '2026-09-03';
window.__officeVersionPromise = window.__officeVersionPromise || fetch('/api/version')
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d && d.current) { OFFICE_FOOTER_VERSION = d.current; window.__officeVersion = d.current; } return d; })
  .catch(() => null);

// SemVer real a partir de v1.0.0 (jun/2026). Versões 0.x eram pré-release.
// Bug fix → 1.0.1 | Feature nova → 1.1.0 | Refactor grande → 2.0.0
// Histórico pré-1.0 preservado abaixo para referência.
const OFFICE_VERSION_HISTORY = [
  // ─── SPRINT 47 · Tema global EPI-USE/Atlas + Raccoon Redesign (21/jun/2026) ───
  { ver: '0.56.4', date: '22/jun/2026', label: 'Persistência visual e animações ativas do mascote Raccoon (Rax) em todas as fases do processamento (pesquisa, redação e revisão).', path: null, status: 'current' },
  { ver: '0.56.3', date: '22/jun/2026', label: 'Unificação dos fluxos de revisão e geração de artigos, integração direta de controles de cópia e CMS WorkControl no AI Writer, e implementação de auditorias estratégicas e widgets dinâmicos de Analytics.', path: null, status: 'snapshot' },
  { ver: '0.56.2', date: '22/jun/2026', label: 'Correção de navegação swappable, estilização do menu lateral, integração completa do AI Revisor (SEO/GEO) e contador estatístico no Raccoon Studio.', path: null, status: 'snapshot' },
  { ver: '0.56.1', date: '21/jun/2026', label: 'Correção do Layout de 3 Colunas no Raccoon Studio (mockup vertical: controles na esquerda, 340px).', path: null, status: 'snapshot' },
  { ver: '0.56.0', date: '21/jun/2026', label: 'Redesign Premium do Raccoon Studio + Suporte Dinâmico a Temas (Claro/Escuro/Aurora/Liquid Glass) + Correção de z-index do mega menu dropdown.', path: null, status: 'snapshot' },
  { ver: '0.55.0', date: '21/jun/2026', label: 'SPRINT 47 — Home = Cockpit executivo (Atlas) com dado real + componentes Atlas globais.', path: null, status: 'snapshot' },
  { ver: '0.54.1', date: '21/jun/2026', label: 'SPRINT 47 — Tema EPI-USE claro/escuro refeito do design (tokens .atlas exatos) + FONTE GLOBAL padronizada para Poppins em todas as telas. Mono preservado em codigo.', path: null, status: 'snapshot' },
  { ver: '0.54.0', date: '21/jun/2026', label: 'SPRINT 47 — Tema global EPI-USE/Atlas (claro+escuro) em todas as 32 páginas. Conserta cards pretos no modo claro (bindings de --card/--bg/--text nos temas) + remap hex->token. Trocar para um modo CLARO no seletor para ver.', path: null, status: 'snapshot' },
  // ─── SPRINT 46 · Revisor SEO/GEO (19/jun/2026) ───
  { ver: '0.53.7', date: '19/jun/2026', label: 'SPRINT 46 — Upgrades de UI/UX no Raccoon Studio (design ECC), inclusão de tema Aurora como padrão e sincronização do artigo de revisão com o Pipeline Editorial.', path: null, status: 'snapshot' },
  { ver: '0.53.6', date: '19/jun/2026', label: 'SPRINT 46 — Adicionados botões de cópia HTML (WorkControl) e Texto Limpo, além de dica para colagem no CMS.', path: null, status: 'snapshot' },
  { ver: '0.53.5', date: '19/jun/2026', label: 'SPRINT 46 — Integração da revisão colada ao Pipeline Editorial do Raccoon e consolidação do tema Aurora como padrão do Office.', path: null, status: 'snapshot' },
  { ver: '0.53.4', date: '19/jun/2026', label: 'SPRINT 46 — Melhorias de UI/UX, Artigo Otimizado e Áudio no Raccoon Studio, com spinner de progresso, cópia de artigo sugerido e chime de sucesso.', path: null, status: 'snapshot' },
  { ver: '0.53.3', date: '19/jun/2026', label: 'SPRINT 46 — Estabilização da API da OpenRouter (Google Gemma), resolvendo erros upstream de rate limit.', path: null, status: 'snapshot' },
  { ver: '0.53.2', date: '19/jun/2026', label: 'SPRINT 46 — Correção do Revisor SEO/GEO local (memória re-sincronizada) e deploy com contingência OpenRouter gratuita.', path: null, status: 'snapshot' },
  { ver: '0.53.1', date: '19/jun/2026', label: 'SPRINT 46 — Revisor SEO/GEO migrado para OpenRouter (IA gratuita Qwen), com tratamento robusto de erros e limites.', path: null, status: 'snapshot' },
  { ver: '0.53.0', date: '19/jun/2026', label: 'SPRINT 46 — Revisor SEO/GEO integrado diretamente no Raccoon Studio, com scorecard analítico, link juice de 693 artigos e sugestão de CTA.', path: null, status: 'snapshot' },
  // ─── SPRINT 43 · RD Station integrado (16/jun/2026) ───
  { ver: '0.50.11', date: '16/jun/2026', label: 'SPRINT 43 — Integração RD Station: Canais de Aquisição & Performance de Campanhas no Relatório Mensal, Visão Executiva e Metas com suporte Aurora e simulação.', path: null, status: 'snapshot' },
  // ─── SPRINT 42 · Tema Aurora padrão (16/jun/2026) ───
  { ver: '0.50.10', date: '16/jun/2026', label: 'SPRINT 42 — Consolidação do tema Aurora padrão e adaptação total de todos os gráficos e dashboards para Light, Elephant, Dark, Aurora e Liquid Glass.', path: null, status: 'snapshot' },
  // ─── SPRINT 18 · RD Station OAuth2 + KPIs e-mail reais (05/jun/2026) ───
  { ver: '0.14.0', date: '05/jun/2026', label: 'SPRINT 18 — RD Station integrado (OAuth2). scripts/integrations/rd_fetch.js + /auth/rd-callback + POST /api/relatorio/rd-refresh. Snapshot popula segmentações com tamanho real (paginação até 1000), workflows ativos, LPs publicadas, emails enviados. Card e-mail no /relatorio mostra: base de leads, enviados no mês, workflows ativos, LPs publicadas (fim do ⏳ "RD pendente"). Top páginas GA4 + duração média ponderada no FY também.', path: null, status: 'snapshot' },
  // ─── SPRINT 17 · Relatório FY + GA4 anual (04/jun/2026) ───
  { ver: '0.13.0', date: '04/jun/2026', label: 'SPRINT 17 — Relatório FY (jul→jun) e GA4 12 meses. /relatorio ganha FY26 + FY27 no seletor · /api/relatorio/snapshot?fy=26|27 agrega site/linkedin/eventos/voices do ano fiscal · ga4_fetch.js ganha refreshFY(fy) (popula 12 meses) · POST /api/relatorio/ga4-refresh-fy. FY26 confirmado: 32.142 usuários · 50.404 visualizações · 36.365 sessões reais agregados do GA4. Regra de ouro 13 (dados automatizados, zero planilha) memorizada.', path: null, status: 'snapshot' },
  // ─── SPRINT 16 · Infra prod + GA4 (04/jun/2026) ───
  { ver: '0.12.0', date: '04/jun/2026', label: 'SPRINT 16 — Infra de produção + GA4. SSO Microsoft ATIVO (login @epiuse) · Railway Volume /data (SQLite persiste) · domínio office.epiuse.com.br · sync cases reescrito em Node.js (sem Python) · integração GA4 Data API (ga4_fetch.js + bloco site no /relatorio, aguarda Service Account). Botão login Microsoft na tela de entrada.', path: null, status: 'snapshot' },
  // ─── SPRINT 15 · Módulo C Painel (04/jun/2026) ───
  { ver: '0.11.0', date: '04/jun/2026', label: 'SPRINT 15 — Módulo C · Daily Digest + Inbox por área no Painel da Duda. APIs /api/painel/digest + /api/painel/inbox-duda. Auto-refresh 60s. Versionamento sincronizado (nav · footer · changelog · package.json).', path: null, status: 'snapshot' },
  { ver: '0.10.1', date: '04/jun/2026', label: 'Fix cowork — auto-cria pasta inbox em workspaces inexistentes. Correção de 5 erros nos pipe-* no Railway.', path: null, status: 'snapshot' },
  // ─── SPRINT 14 · Cowork (04/jun/2026) ───
  { ver: '0.10.0', date: '04/jun/2026', label: 'SPRINT 14 — Cowork + workflows dinâmicos entre agentes. /cowork · workflows JSON · feed unificado · 2 workflows seed (criar-artigo · nova-oferta).', path: null, status: 'snapshot' },
  // ─── SPRINT 9-13 · Optimizer + Agentes (01-03/jun/2026) ───
  { ver: '0.9.5',  date: '03/jun/2026', label: 'Padrão visual Anderson Costa aplicado nos 2 Optimizers (V1+V2) — tema dark navy #0d1b2e · Inter · print A4.', path: null, status: 'snapshot' },
  { ver: '0.9.4',  date: '02/jun/2026', label: 'Optimizer V2 — framework findskill.ai (mantém V1). 5 variáveis + 10 páginas A4 + 3 career goals.', path: null, status: 'snapshot' },
  { ver: '0.9.3',  date: '02/jun/2026', label: 'Optimizer refundado — input transcrição direto + Pág 1 com Voice Index + Resumo executivo.', path: null, status: 'snapshot' },
  { ver: '0.9.2',  date: '02/jun/2026', label: 'Optimizer simplificado — 1 template .md · IA gera artifact final. 3.500 linhas → ~400.', path: null, status: 'snapshot' },
  { ver: '0.9.1',  date: '01/jun/2026', label: 'Optimizer ZERO TOKENS — fluxo copia-prompt → cola-JSON. Office vira coletor + renderizador.', path: null, status: 'snapshot' },
  { ver: '0.9.0',  date: '01/jun/2026', label: 'SPRINT 9 — Optimizer refundado (Voice dropdown · PDF institucional por área A4 · fluxo rascunho→revisão→pronto).', path: null, status: 'snapshot' },
  { ver: '0.8.3',  date: '01/jun/2026', label: 'Pipeline 5 agentes (briefing→artigo→capa+carrossel+copy) · 17 agentes totais · Carrossel busca nos 693 artigos.', path: null, status: 'snapshot' },
  { ver: '0.8.2',  date: '01/jun/2026', label: 'Agente relatorio-mensal completo (skill + workspace + cron dia 1 08:05) · overflow nav agrupado em 5 seções.', path: null, status: 'snapshot' },
  { ver: '0.8.1',  date: '01/jun/2026', label: 'Arquitetura agentes 3-camadas + ciclo inbox/outbox real · 6 agentes de área · F9 duplicar Voice · F10 dark auto OS.', path: null, status: 'snapshot' },
  { ver: '0.8.0',  date: '31/mai/2026', label: 'SSO Microsoft (Entra ID) + 6 módulos por área com dado REAL ao vivo de Apollo/LinkedIn/Artigos/Cases.', path: null, status: 'snapshot' },
  // ─── SPRINT 7 · Estabilização + Design Codex + Dados Reais (30/mai/2026) ───
  { ver: '0.7.1',  date: '30/mai/2026', label: 'DADOS REAIS (Regra 7): /metas KPIs despluguei o fake (era 7.844 chumbado/errado → 10.481 real via API) · auditoria DE/PARA completa (AUDITORIA-DADOS-REAIS.md) · footer history consertado (0.6.1→0.6.4 estavam sumidos)', path: null, status: 'snapshot' },
  { ver: '0.7.0',  date: '30/mai/2026', label: 'ESTABILIZAÇÃO + DESIGN CODEX: localhost always-on (fix better-sqlite3 Node 24 + Tarefa Agendada, aposenta PM2) · /api/health · paleta Codex oficial (#013A6A + Open Sans, dark preservado) · protocolo multi-tool · backup tag v0.6.4-snapshot', path: null, status: 'snapshot' },
  // ─── SPRINT 6 · Design System + Brand oficial (28/mai/2026) ───
  { ver: '0.6.4',  date: '28/mai/2026', label: 'Logos EPI-USE no nav (theme-aware) · refactor 10 telas → design-tokens.css · /design viewer com hierarquia 3 brands', path: null, status: 'snapshot' },
  { ver: '0.6.3',  date: '28/mai/2026', label: 'Brand assets consolidados: ERP.ngo + Group Elephant + Open Sans self-hosted + GE PPT', path: null, status: 'snapshot' },
  { ver: '0.6.2',  date: '28/mai/2026', label: 'Cores REAIS extraídas do PPT Template Jan 2026 (XML do .pptx)', path: null, status: 'snapshot' },
  { ver: '0.6.1',  date: '28/mai/2026', label: 'DESIGN.md REAL (Brand Guide V1.1: Navy #001844 + Red) · setup PM2 · modularização /modulos/', path: null, status: 'snapshot' },
  { ver: '0.6.0',  date: '28/mai/2026', label: 'DESIGN SYSTEM unificado (Google Labs DESIGN.md spec) · /design viewer · gen_tokens.py · Rule 8 (não hardcodar hex)', path: null, status: 'snapshot' },
  { ver: '0.5.1',  date: '28/mai/2026', label: '/metas-fy26 oficial (29 metas × 6 áreas, LinkedIn 69.9% real-time) · Bug fix menu /relatorio (scrollTo shadowing) · Layout encavalado fixado · Rule 7 NO FAKE DATA · mapa-fontes-dados.md auditoria 20+ métricas · Memes-rudugues.md · Hooks lifecycle doc (manual setup)', path: null, status: 'snapshot' },
  { ver: '0.5.0',  date: '27/mai/2026', label: 'SPRINT MONSTRO: /relatorio (espelha PPT mensal) · /artigos (693 do Manus) · /jornadas (matriz LOB×etapa+gaps) · /projecoes (paid media) · /pipeline (Apollo MVP) · Skill relatorio-mensal (auto-PPT) · 5 endpoints novos · 17m história LinkedIn real', path: null, status: 'snapshot' },
  { ver: '0.4.12', date: '27/mai/2026', label: 'Optimizer split em 2 calls (IA da EPI-USE, ~70+70s, sem timeout) · ERP.ngo branding (logo + tokens) · Export PDF do kit (html2pdf)', path: null, status: 'snapshot' },
  { ver: '0.4.11', date: '26/mai/2026', label: 'HOTFIX: extract da transcrição (IA da EPI-USE 5× rápido + AbortController + timer visual)', path: null, status: 'snapshot' },
  { ver: '0.4.10', date: '26/mai/2026', label: 'HOTFIX: + Novo Voice agora cria de verdade (PUT virou upsert)', path: null, status: 'snapshot' },
  { ver: '0.4.9', date: '26/mai/2026', label: 'Optimizer 3 modos: transcrição entrevista (IA da EPI-USE extrai tudo) · roteiro 12 perguntas · manual (fallback)', path: '/_versoes-office/v0.4.9-optimizer.html', status: 'snapshot' },
  { ver: '0.4.8', date: '26/mai/2026', label: 'Painel Metas LinkedIn + footer history corrigido', path: '/_versoes-office/v0.4.8-metas.html', status: 'snapshot' },
  { ver: '0.4.7', date: '26/mai/2026', label: 'Polish pré-apresentação: header /cases EPI-USE Brasil + decisões SSO/RD', path: null, status: 'snapshot' },
  { ver: '0.4.6', date: '26/mai/2026', label: 'Decorator drag-drop real no game + bateria 0.4.1→0.4.6', path: '/_versoes-office/v0.4.6-game.html', status: 'snapshot' },
  { ver: '0.4.5', date: '26/mai/2026', label: 'Sync Cases 1-click (botão OneDrive → Railway)', path: '/_versoes-office/v0.4.6-cases.html', status: 'snapshot' },
  { ver: '0.4.4', date: '26/mai/2026', label: 'Studio merge no Carrossel (mode=single)', path: '/_versoes-office/v0.4.6-inbound-carousel.html', status: 'snapshot' },
  { ver: '0.4.3', date: '26/mai/2026', label: 'RD Station endpoint (bloqueado por token, dropado depois)', path: '/_versoes-office/v0.4.6-inbound-calendar.html', status: 'snapshot' },
  { ver: '0.4.2', date: '26/mai/2026', label: 'Sync real 19 Cases Roberto + KPIs Customer Reference', path: '/_versoes-office/v0.4.6-cases.html', status: 'snapshot' },
  { ver: '0.4.1', date: '26/mai/2026', label: 'Optimizer 7 Pilares × 30 critérios + Voice Index 0-100', path: '/_versoes-office/v0.4.6-optimizer.html', status: 'snapshot' },
  { ver: '0.4.0', date: '25/mai/2026', label: 'Refactor: top menu remodel + Cases & CS Hub + Calendar API + paleta Gather', path: null, status: 'snapshot' },
  { ver: '0.3.5', date: '25/mai/2026', label: 'Quick wins + Optimizer (IA da EPI-USE) + Voices auto-fill via Vision', path: '/_versoes-office/v3.4-inbound-hub.html', status: 'snapshot' },
  { ver: '0.3.4', date: '25/mai/2026', label: 'Inbound Engine + Carrossel Hub + chip de versão + footer dropdown', path: '/_versoes-office/v3.4-inbound-hub.html', status: 'snapshot' },
  { ver: '0.3.3', date: '24/mai/2026', label: 'office-nav + office-footer + SQLite', path: '/_versoes-office/v3.1-game-engine.html', status: 'snapshot' },
  { ver: '0.3.2', date: '24/mai/2026', label: 'Painel da Duda + post tracker', path: '/_versoes-office/v3.2-painel.html', status: 'snapshot' },
  { ver: '0.3.1', date: '23/mai/2026', label: 'Voices + LP Seja um Voice', path: '/_versoes-office/v3.1-voices.html', status: 'snapshot' },
  { ver: '0.3.0', date: '23/mai/2026', label: 'Sprint Maximalist — Painel + Voice Agents + LP', path: '/_versoes-office/v3.0-game-engine.html', status: 'snapshot' },
  { ver: '0.2.2', date: '23/mai/2026', label: 'Optimizer integrado ao Voices + agenda dinâmica', path: '/_versoes-office/v2.2-game-engine.html', status: 'snapshot' },
  { ver: '0.2.1', date: '23/mai/2026', label: 'Game Engine 2D + Dashboard duplo', path: '/_versoes-office/v2.1-game-engine.html', status: 'snapshot' },
  { ver: '0.2.0', date: '23/mai/2026', label: 'Office Engine 2D inaugural', path: '/_versoes-office/v2.0-game-engine.html', status: 'snapshot' }
];

class OfficeFooter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.hookEvents();
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

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          margin-top: 32px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .foot {
          background: rgba(6, 14, 26, 0.85);
          border-top: 1px solid rgba(37, 99, 235, 0.18);
          padding: 14px 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          font-size: 11px;
          color: #475569;
        }
        .foot a { color: #60a5fa; text-decoration: none; cursor: pointer; }
        .foot a:hover { text-decoration: underline; }
        .foot a.erp-link { display: inline-flex; align-items: center; gap: 5px; }
        .foot a.erp-link img { display: block; opacity: 0.9; transition: opacity .15s; }
        .foot a.erp-link:hover img { opacity: 1; }
        .foot .sep { opacity: 0.4; }
        .foot .sap-partner { color: #94a3b8; font-family: 'JetBrains Mono','Courier New',monospace; font-size: 10px; letter-spacing: .04em; }
        .foot .sap-partner b { color: #cbd5e1; font-weight: 700; }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #10b981;
        }
        .status::before {
          content: '';
          width: 6px; height: 6px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 6px #10b981;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .ver-tag {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 10px;
          color: #94a3b8;
          letter-spacing: 0.08em;
        }
        /* Dropdown de versões */
        .ver-picker {
          position: relative;
          display: inline-block;
        }
        .ver-trigger {
          background: rgba(37,99,235,0.10);
          border: 1px solid rgba(37,99,235,0.25);
          color: #60a5fa;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          padding: 4px 9px;
          border-radius: 5px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: background .15s, border-color .15s;
        }
        .ver-trigger:hover { background: rgba(37,99,235,0.20); border-color: rgba(37,99,235,0.50); }
        .ver-trigger .arrow { font-size: 8px; opacity: 0.7; }
        .ver-menu {
          display: none;
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          min-width: 320px;
          max-width: 92vw;
          background: #0d1e36;
          border: 1px solid rgba(37,99,235,0.30);
          border-radius: 10px;
          padding: 6px;
          box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
          z-index: 50;
          max-height: 60vh;
          overflow-y: auto;
        }
        .ver-menu.open { display: block; }
        .ver-menu .ver-head {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 9px;
          color: #64748b;
          padding: 8px 10px 6px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .ver-menu .ver-item {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 6px;
          text-decoration: none;
          color: #cbd5e1;
          font-size: 12px;
          transition: background .12s;
          cursor: pointer;
        }
        .ver-menu .ver-item:hover { background: rgba(37,99,235,0.10); text-decoration: none; }
        .ver-menu .ver-item.disabled {
          color: #64748b;
          cursor: default;
          pointer-events: none;
        }
        .ver-menu .ver-item .v {
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 11px;
          font-weight: 700;
          color: #60a5fa;
          min-width: 40px;
        }
        .ver-menu .ver-item.disabled .v { color: #94a3b8; }
        .ver-menu .ver-item.current .v {
          color: #10b981;
        }
        .ver-menu .ver-item.current::after {
          content: 'atual';
          font-size: 9px;
          font-family: 'JetBrains Mono', monospace;
          color: #10b981;
          background: rgba(16,185,129,0.12);
          padding: 1px 6px;
          border-radius: 3px;
          margin-left: auto;
        }
        .ver-menu .ver-item .lbl { flex: 1; line-height: 1.3; }
        .ver-menu .ver-item .lbl .meta { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
        .ver-menu .ver-foot {
          padding: 8px 10px;
          border-top: 1px solid rgba(148,163,184,0.10);
          margin-top: 4px;
          font-size: 11px;
        }
        .ver-menu .ver-foot a {
          color: #60a5fa;
          text-decoration: none;
        }
        .ver-menu .ver-foot a:hover { text-decoration: underline; }

        /* TRUST STRIP — compact line above main footer row */
        .trust {
          background: rgba(6, 14, 26, 0.65);
          border-top: 1px solid rgba(37, 99, 235, 0.10);
          padding: 8px 20px;
          display: flex; justify-content: center; align-items: center;
          gap: 18px; flex-wrap: wrap;
          font-size: 10px; color: #64748b;
          letter-spacing: 0.02em;
        }
        .trust .ti { display: inline-flex; align-items: center; gap: 6px; }
        .trust .ti svg { color: #60a5fa; opacity: 0.75; flex-shrink: 0; }
        .trust .ti b { color: #94a3b8; font-weight: 600; }
        .trust .ti .sub { color: #475569; font-size: 9px; }
        @media (max-width: 580px) {
          .foot { font-size: 10px; gap: 8px; padding: 12px 14px; }
          .ver-tag, .ver-trigger { font-size: 9px; }
          .ver-menu { min-width: 280px; }
          .trust { gap: 10px; padding: 8px 12px; font-size: 9px; }
          .trust .ti .sub { display: none; }
        }
      </style>
      <div class="trust" aria-label="Compliance e infraestrutura">
        <span class="ti"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L3 7l9 5 9-5-9-5z"/><path d="M3 17l9 5 9-5"/><path d="M3 12l9 5 9-5"/></svg><b>SSO Microsoft</b><span class="sub">Entra ID</span></span>
        <span class="ti"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><b>TLS 1.3</b><span class="sub">Railway Volume</span></span>
        <span class="ti"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg><b>WCAG AAA</b></span>
        <span class="ti"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><b>Real-time</b><span class="sub">GA4 · RD · Zoho</span></span>
        <span class="ti"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg><b>LGPD</b><span class="sub">dados off-repo</span></span>
      </div>
      <footer class="foot" role="contentinfo">
        <span class="ver-tag">EPI-USE OFFICE</span>
        <a class="ver-trigger" href="/changelog" title="Ver changelog completo" style="text-decoration:none">
          <span>${OFFICE_FOOTER_VERSION}</span>
          <span id="ver-status-chip" style="font-size:9px;padding:2px 6px;border-radius:99px;margin-left:6px;background:rgba(134,158,195,.12);color:#869ec3" title="status do ambiente">…</span>
        </a>
        <span class="sep">·</span>
        <span class="status">sistemas online</span>
        <span class="sep">·</span>
        <a href="https://erp.ngo" target="_blank" rel="noopener" class="erp-link" title="ERP.ngo · 1% receita global → conservação de elefantes e combate à pobreza rural"><img src="/assets/erp-ngo/erp-logo-white.svg" alt="ERP.ngo" height="14"> erp.ngo</a>
        <span class="sep">·</span>
        <span>build ${OFFICE_FOOTER_BUILD}</span>
        <span class="sep">·</span>
        <span class="sap-partner" title="EPI-USE — SAP Partner oficial" data-no-translate>SAP Partner ID <b>1426872</b></span>
      </footer>
    `;
    if (window.translateRoot) { try { window.translateRoot(this.shadowRoot); } catch (e) {} }
  }

  hookEvents() {
    // Status chip: detecta se essa versao é prod (live) ou local (snapshot)
    fetch('/api/changelog.json?t=' + Date.now())
      .then(r => r && r.ok ? r.json() : null)
      .then(cl => {
        if (!cl || !cl.releases) return;
        const me = cl.releases.find(r => r.version === OFFICE_FOOTER_VERSION);
        const chip = this.shadowRoot.getElementById('ver-status-chip');
        if (!chip || !me) return;
        if (me.status === 'live') {
          chip.textContent = '● live';
          chip.style.background = 'rgba(16,185,129,.18)';
          chip.style.color = '#6ee7b7';
          chip.title = 'Esta versão está em produção (Railway)';
        } else {
          chip.textContent = '◐ local';
          chip.style.background = 'rgba(251,191,36,.18)';
          chip.style.color = '#fcd34d';
          chip.title = 'Versão local — ainda não foi pra produção (commit pendente)';
        }
      })
      .catch(() => {});
  }
}

customElements.define('office-footer', OfficeFooter);
