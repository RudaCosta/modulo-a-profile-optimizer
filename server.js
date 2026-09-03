// ── AMBIENTE ──────────────────────────────────────────────────────────────────
// Local Windows dev: carrega modulos e .env de fora do OneDrive (evita clobber)
// Railway Linux: usa node_modules normais instalados pelo npm install
// Detecta o usuario atual automaticamente (Ruds, rudac, ou qualquer outro)
const fs0 = require('fs');
const os0 = require('os');
const _winUser = os0.userInfo().username; // rudac, Ruds, etc.
const _localCandidates = [
  `C:/Users/${_winUser}/.epiuse-optimizer/node_modules`,
  'C:/Users/Ruds/.epiuse-optimizer/node_modules',
];
const localModules = _localCandidates.find(p => fs0.existsSync(p)) || '';
const IS_LOCAL_DEV = process.platform === 'win32' && !!localModules;

// Carrega .env off-repo (API keys nao vao no git)
const _envCandidates = [
  `C:/Users/${_winUser}/.epiuse-optimizer/.env`,
  'C:/Users/Ruds/.epiuse-optimizer/.env',
  require('path').resolve(__dirname, '.env'),
];
for (const _ep of _envCandidates) {
  if (fs0.existsSync(_ep)) {
    try {
      const _lines = fs0.readFileSync(_ep, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
      _lines.forEach(l => {
        const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      });
      console.log(`[boot] .env carregado: ${_ep}`);
    } catch {}
    break;
  }
}
if (IS_LOCAL_DEV) {
  require('module').Module._nodeModulePaths = () => [localModules, 'node_modules'];
}
// Railway: variaveis de ambiente vem das env vars do projeto (sem .env)

const express   = IS_LOCAL_DEV ? require(localModules + '/express')            : require('express');
const multer    = IS_LOCAL_DEV ? require(localModules + '/multer')             : require('multer');
const Anthropic = IS_LOCAL_DEV ? require(localModules + '/@anthropic-ai/sdk')  : require('@anthropic-ai/sdk');
const rateLimit = IS_LOCAL_DEV ? require(localModules + '/express-rate-limit') : require('express-rate-limit');
// Resend é opcional — se require falhar, segue sem email
let Resend;
try { Resend = (IS_LOCAL_DEV ? require(localModules + '/resend') : require('resend')).Resend; }
catch (e) { console.warn('[boot] resend não instalado — emails serão skipped:', e.message); }
const fs = require('fs');
const path = require('path');
const seoChecker = require('./scripts/integrations/seo_checker'); // SEO+GEO determinístico (sem deps)

// ── RESILIÊNCIA: handlers globais de erro ───────────────────────────────────────
// Sem isto, QUALQUER erro async não tratado mata o processo Node → 502 até o
// Railway reiniciar (janela em que "as páginas não funcionam"). Aqui logamos e
// mantemos o processo vivo — um bug pontual numa rota não derruba o app inteiro.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] processo MANTIDO vivo:', err && err.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] processo MANTIDO vivo:', reason && reason.stack || reason);
});

// ── EDITOR AUTH E CONTEXTO COMPARTILHADO ───────────────────────────────────────
const { ACTIVE_EDITOR_TOKEN, requireEditorToken, requireAuth } = require('./server-context');
const EDITOR_TOKEN = ACTIVE_EDITOR_TOKEN;

// ── PATHS DE DADOS ────────────────────────────────────────────────────────────
const VOICES_JSON_PATH = path.join(__dirname, 'public/api/voices.json');
const VOICES_MD_DIR    = path.join(__dirname, 'public/api/voices');

// ── SQLite DATABASE ───────────────────────────────────────────────────────────
// ── SQLite DATABASE ───────────────────────────────────────────────────────────
const { db, DB_DIR, DB_PATH } = require('./server-context');
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id        TEXT NOT NULL,
    post_url        TEXT NOT NULL,
    post_id         TEXT DEFAULT '',
    published_at    TEXT DEFAULT '',
    captured_at     TEXT NOT NULL,
    content_type    TEXT DEFAULT 'post',
    content_preview TEXT DEFAULT '',
    pillar          TEXT,
    likes           INTEGER DEFAULT 0,
    comments        INTEGER DEFAULT 0,
    reposts         INTEGER DEFAULT 0,
    views           INTEGER,
    created_at      TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_voice ON posts(voice_id);
  CREATE INDEX IF NOT EXISTS idx_posts_url   ON posts(post_url);
  CREATE TABLE IF NOT EXISTS recruitment_applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nome         TEXT NOT NULL,
    email        TEXT NOT NULL,
    linkedin     TEXT NOT NULL,
    area         TEXT NOT NULL,
    motivo       TEXT DEFAULT '',
    cargo        TEXT DEFAULT '',
    endereco     TEXT DEFAULT '',
    tempo_epiuse TEXT DEFAULT '',
    dia_a_dia    TEXT DEFAULT '',
    dominio_tecnico TEXT DEFAULT '',
    trajetoria   TEXT DEFAULT '',
    palestras    TEXT DEFAULT '',
    videos       TEXT DEFAULT '',
    lado_humano  TEXT DEFAULT '',
    tem_fotos    TEXT DEFAULT '',
    projeto_orgulho TEXT DEFAULT '',
    desafio      TEXT DEFAULT '',
    lideranca    TEXT DEFAULT '',
    competencias TEXT DEFAULT '',
    exposicoes   TEXT DEFAULT '',
    tom          TEXT DEFAULT '',
    publico_alvo TEXT DEFAULT '',
    tema_adoraria TEXT DEFAULT '',
    tema_evitar  TEXT DEFAULT '',
    artigos_ref  TEXT DEFAULT '',
    dia_tipico   TEXT DEFAULT '',
    bastidores   TEXT DEFAULT '',
    fora_trabalho TEXT DEFAULT '',
    utm_source   TEXT DEFAULT '',
    utm_medium   TEXT DEFAULT '',
    utm_campaign TEXT DEFAULT '',
    utm_voice    TEXT DEFAULT '',
    timestamp    TEXT NOT NULL,
    ip           TEXT DEFAULT '',
    status       TEXT DEFAULT 'novo',
    created_at   TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cs_clientes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sharepoint_id   TEXT UNIQUE,
    conta           TEXT NOT NULL,
    cliente_nome    TEXT NOT NULL,
    contato_principal TEXT DEFAULT '',
    contato_email   TEXT DEFAULT '',
    csm             TEXT DEFAULT '',
    lob             TEXT DEFAULT '',
    status          TEXT DEFAULT 'live',
    nps             INTEGER,
    valor_anual     REAL,
    ultimo_contato  TEXT,
    observacoes     TEXT DEFAULT '',
    case_publicavel INTEGER DEFAULT 0,
    case_resumo     TEXT DEFAULT '',
    updated_at      TEXT DEFAULT (datetime('now')),
    synced_at       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cs_status ON cs_clientes(status);
  CREATE INDEX IF NOT EXISTS idx_cs_csm    ON cs_clientes(csm);
  CREATE TABLE IF NOT EXISTS editorial_calendar (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id     TEXT UNIQUE,
    fonte           TEXT NOT NULL,
    data            TEXT NOT NULL,
    canal           TEXT DEFAULT 'linkedin',
    autor           TEXT DEFAULT '',
    titulo          TEXT NOT NULL,
    resumo          TEXT DEFAULT '',
    pilar           TEXT DEFAULT '',
    status          TEXT DEFAULT 'planned',
    url_post        TEXT DEFAULT '',
    updated_at      TEXT DEFAULT (datetime('now')),
    synced_at       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cal_data ON editorial_calendar(data);
  CREATE TABLE IF NOT EXISTS metas_linkedin (
    area_id         TEXT PRIMARY KEY,
    seg_30d         INTEGER,
    seg_90d         INTEGER,
    eventos_q       INTEGER,
    acoes           TEXT DEFAULT '',
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS zoho_deals (
    deal_id          TEXT PRIMARY KEY,
    conta            TEXT,
    nome_deal        TEXT,
    valor            REAL DEFAULT 0,
    stage            TEXT,
    campanha         TEXT,
    solution         TEXT,
    deal_scope       TEXT,
    opportunity_source TEXT,
    data_criacao     TEXT,
    data_fechamento  TEXT,
    synced_at        TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_zoho_source ON zoho_deals(opportunity_source);
  CREATE INDEX IF NOT EXISTS idx_zoho_criacao ON zoho_deals(data_criacao);
  CREATE INDEX IF NOT EXISTS idx_zoho_campanha ON zoho_deals(campanha);

  CREATE TABLE IF NOT EXISTS clientes_sap_4me (
    pkg_id           TEXT PRIMARY KEY,
    projeto_id       TEXT,
    conta_parceiro   TEXT,
    nome_cliente     TEXT,
    pais             TEXT,
    area_subsolucao  TEXT,
    pacotes          TEXT,
    escopo_pacote    TEXT,
    etapa            TEXT,
    data_kickoff     TEXT,
    golive_planejado TEXT,
    golive_confirmado TEXT,
    relevante_nivel  TEXT,
    gerente_projeto  TEXT,
    synced_at        TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sap4me_pais  ON clientes_sap_4me(pais);
  CREATE INDEX IF NOT EXISTS idx_sap4me_etapa ON clientes_sap_4me(etapa);
  CREATE INDEX IF NOT EXISTS idx_sap4me_area  ON clientes_sap_4me(area_subsolucao);

  CREATE TABLE IF NOT EXISTS field_events (
    event_id      TEXT PRIMARY KEY,      -- ex: brasil-1-NRF-Retail (slug do events.json)
    nome          TEXT,
    data_evento   TEXT,                  -- ISO se conhecida
    local         TEXT,
    lob           TEXT,
    pais          TEXT,
    responsavel   TEXT,
    porte         TEXT,                  -- Pequeno / Médio / Grande
    orcamento     REAL DEFAULT 0,
    status        TEXT DEFAULT 'planejamento', -- planejamento|pre-evento|live|pos-evento|concluido
    brindes_json  TEXT DEFAULT '[]',     -- [{item, qtd_planejada, qtd_distribuida}]
    captura_json  TEXT DEFAULT '{}',     -- {leads, qualificados, deals, custo, obs}
    briefing_json TEXT DEFAULT '{}',     -- {mensagem_chave, speakers, materiais, obs}
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_field_status ON field_events(status);
  CREATE INDEX IF NOT EXISTS idx_field_data   ON field_events(data_evento);

  CREATE TABLE IF NOT EXISTS content_pipeline (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id   TEXT,                  -- link opcional com editorial_calendar
    titulo        TEXT NOT NULL,
    tema_keyword  TEXT,
    lob           TEXT,
    pilar         TEXT,
    persona_alvo  TEXT,
    autor         TEXT,
    estado        TEXT DEFAULT 'recebido', -- recebido|seo_geo|persona|copy_cta|carrossel|agendado|publicado
    corpo         TEXT DEFAULT '',
    seo_json      TEXT DEFAULT '{}',     -- {score, checklist:[{item,ok,nota}]}
    geo_json      TEXT DEFAULT '{}',     -- {score, checklist GEO/AIO/AEO/LLMO}
    copy_text     TEXT DEFAULT '',
    cta_sugerido  TEXT DEFAULT '',
    carrossel_url TEXT DEFAULT '',
    agendado_para TEXT,
    publicado_em  TEXT,
    url_publicado TEXT DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_content_estado ON content_pipeline(estado);
`);
// migration idempotente: colunas novas do formulário expandido de recrutamento Voices
for (const _col of ['telefone','cidade','cargo','tempo_epiuse','experiencia_sap','especialidades','seguidores_faixa','frequencia_post','temas_interesse','horas_semanais','disponibilidade_inicio','gestor','observacoes','status','endereco','dia_a_dia','dominio_tecnico','trajetoria','palestras','videos','lado_humano','tem_fotos','projeto_orgulho','desafio','lideranca','competencias','exposicoes','tom','publico_alvo','tema_adoraria','tema_evitar','artigos_ref','dia_tipico','bastidores','fora_trabalho']) {
  try { db.exec(`ALTER TABLE recruitment_applications ADD COLUMN ${_col} TEXT DEFAULT ''`); } catch (_e) { /* ja existe */ }
}

// migration idempotente: colunas do produto completo do Raccoon (carrossel estruturado + arte)
for (const _col of ['carrossel_json', 'capa_url']) {
  try { db.exec(`ALTER TABLE content_pipeline ADD COLUMN ${_col} TEXT DEFAULT ''`); } catch (_e) { /* ja existe */ }
}

// ── USERS & ROLES (SSO Microsoft) ─────────────────────────────────────────────
// Fonte de verdade do perfil/role de cada pessoa que loga via SSO.
// role -> persona (home) + landing. Quem nao esta cadastrado entra como 'hub'
// (cai no Marketing Hub central). Gerenciavel via /admin/usuarios.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    name       TEXT DEFAULT '',
    azure_oid  TEXT DEFAULT '',
    role       TEXT DEFAULT 'hub',   -- head|intelligence|growth|field|pipeline|brand|conteudo|country-manager|hub
    persona    TEXT DEFAULT '',      -- override opcional; se vazio resolve do role
    active     INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`);
// Visualização preferida (office|game) escolhida pós-login. Vazio = ainda não
// escolheu → cai na tela /escolher-visao. Migração idempotente.
try { db.exec(`ALTER TABLE users ADD COLUMN default_view TEXT DEFAULT ''`); } catch (_e) { /* ja existe */ }
// Seed do time. Padrao de email inferido do confirmado (ruda.costa@epiuse.com.br):
// nome.sobrenome@epiuse.com.br. INSERT OR IGNORE = idempotente e NAO sobrescreve
// ajustes feitos no /admin/usuarios. Roberto (sobrenome desconhecido), Lisiane
// (parceira externa) e Alexandre Ormigo (papel desconhecido) ficam pro admin UI.
try {
  const _seedUsers = [
    ['ruda.costa@epiuse.com.br',        'Rudá Costa',         'head'],
    ['bruna.yamagami@epiuse.com.br',    'Bruna Yamagami',     'intelligence'],
    ['guilherme.marques@epiuse.com.br', 'Guilherme Marques',  'growth'],
    // Fernanda Mattos Tavares (Field Marketing, entrou no lugar da Isabela em jul/2026)
    // entra via /admin/usuarios — email @epiuse ainda a confirmar; role 'field'.
    ['marlison.estrela@epiuse.com.br',  'Marlison Estrela',   'pipeline'],
    ['eduarda.hirose@epiuse.com.br',    'Eduarda Hirose',     'brand'],
    ['roberto.medeiros@epiuse.com.br',  'Roberto Medeiros',   'country-manager'],
    // Alexandre Ormigo (Country Manager Stratview) entra via /admin/usuarios —
    // dominio de email (Stratview/Group Elephant) ainda a confirmar; role 'diretoria'.
  ];
  const _seedStmt = db.prepare(`INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, ?)`);
  for (const [_em, _nm, _rl] of _seedUsers) _seedStmt.run(_em, _nm, _rl);
} catch (e) { console.warn('[users] seed falhou:', e.message); }

// app_blobs: KV de blobs JSON persistidos no volume (sobrevive a deploy).
// Usado pelo events.json editado ao vivo (POST /api/events.json) p/ o prod
// refletir sem precisar de novo deploy. (Opcao B)
db.exec(`CREATE TABLE IF NOT EXISTS app_blobs (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`);
// Boot-restore: se o DB (volume) tem events.json salvo, regrava o arquivo
// (um deploy reseta public/ para a versao do repo — isto traz de volta a edicao ao vivo).
try {
  const _ev = db.prepare("SELECT value FROM app_blobs WHERE key = 'events.json'").get();
  if (_ev && _ev.value) {
    fs0.writeFileSync(require('path').join(__dirname, 'public/api/events.json'), _ev.value);
    console.log('[boot] events.json restaurado do volume (app_blobs)');
  }
} catch (e) { console.warn('[boot] restore events.json falhou:', e.message); }

// Repositório de Ideias de Marketing (mural criativo)
db.exec(`
  CREATE TABLE IF NOT EXISTS ideias_mkt (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT NOT NULL,
    descricao   TEXT DEFAULT '',
    categoria   TEXT DEFAULT 'geral',
    autor       TEXT DEFAULT 'Anônimo',
    impacto     TEXT DEFAULT 'medio',     -- baixo|medio|alto|moonshot
    esforco     TEXT DEFAULT 'medio',     -- baixo|medio|alto
    emoji       TEXT DEFAULT '💡',
    cor         TEXT DEFAULT '#fbbf24',
    votos       INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'nova',      -- nova|avaliando|aprovada|feita|arquivada
    sincronizada INTEGER DEFAULT 0,       -- 1 = replicada na planilha (webhook OK)
    created_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ideias_status ON ideias_mkt(status);
`);

// ── STRATVIEW ARTICLES HISTORY ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS stratview_articles (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    keywords     TEXT DEFAULT '[]',
    content      TEXT DEFAULT '',
    persona      TEXT DEFAULT 'Geral',
    status       TEXT DEFAULT 'gerado',
    generated_at TEXT DEFAULT (datetime('now')),
    published_at TEXT
  );
`);

// ── BRINDES (table only — routes and helpers are defined after app is created) ─
db.exec(`
  CREATE TABLE IF NOT EXISTS brindes_requests (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migração clientes_sap_4me: PK antiga era projeto_id (não-único → colapsava 705→500
// pacotes). Agora pkg_id (id-pacote). Dado é espelho re-sincronizável → drop+recreate.
(function migrateSap4me() {
  try {
    const cols = db.prepare("PRAGMA table_info(clientes_sap_4me)").all();
    const hasPkgId = cols.some(c => c.name === 'pkg_id');
    if (!hasPkgId) {
      db.exec('DROP TABLE IF EXISTS clientes_sap_4me');
      db.exec(`
        CREATE TABLE clientes_sap_4me (
          pkg_id TEXT PRIMARY KEY, projeto_id TEXT, conta_parceiro TEXT, nome_cliente TEXT,
          pais TEXT, area_subsolucao TEXT, pacotes TEXT, escopo_pacote TEXT, etapa TEXT,
          data_kickoff TEXT, golive_planejado TEXT, golive_confirmado TEXT,
          relevante_nivel TEXT, gerente_projeto TEXT, synced_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_sap4me_pais  ON clientes_sap_4me(pais);
        CREATE INDEX idx_sap4me_etapa ON clientes_sap_4me(etapa);
        CREATE INDEX idx_sap4me_area  ON clientes_sap_4me(area_subsolucao);
      `);
      console.log('[migrate] clientes_sap_4me recriada com PK pkg_id (re-sync necessário)');
    }
  } catch (e) { console.warn('[migrate] sap4me:', e.message); }
})();

// Migra JSONL legado → SQLite (roda só uma vez se as tabelas estiverem vazias)
(function migrateJSONL() {
  const postsFile = path.join(__dirname, 'posts.jsonl');
  if (fs0.existsSync(postsFile) && db.prepare('SELECT COUNT(*) as n FROM posts').get().n === 0) {
    const lines = fs0.readFileSync(postsFile, 'utf8').trim().split('\n').filter(Boolean);
    const ins = db.prepare('INSERT OR IGNORE INTO posts (voice_id,post_url,post_id,published_at,captured_at,content_type,content_preview,pillar,likes,comments,reposts,views) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const line of lines) {
        try {
          const p = JSON.parse(line);
          ins.run(p.voice_id,p.post_url,p.post_id||'',p.published_at||'',p.captured_at||new Date().toISOString(),p.content_type||'post',p.content_preview||'',p.pillar??null,p.metrics?.likes||0,p.metrics?.comments||0,p.metrics?.reposts||0,p.metrics?.views??null);
        } catch {}
      }
    })();
    console.log(`[migrate] ${lines.length} post(s) migrado(s) de JSONL → SQLite`);
    fs0.renameSync(postsFile, postsFile + '.migrated');
  }

  const recruitFile = path.join(__dirname, 'recruitment-applications.jsonl');
  if (fs0.existsSync(recruitFile) && db.prepare('SELECT COUNT(*) as n FROM recruitment_applications').get().n === 0) {
    const lines = fs0.readFileSync(recruitFile, 'utf8').trim().split('\n').filter(Boolean);
    const ins = db.prepare('INSERT OR IGNORE INTO recruitment_applications (nome,email,linkedin,area,motivo,utm_source,utm_medium,utm_campaign,utm_voice,timestamp,ip) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          ins.run(r.nome,r.email,r.linkedin,r.area,r.motivo||'',r.utm_source||'',r.utm_medium||'',r.utm_campaign||'',r.utm_voice||'',r.timestamp,r.ip||'');
        } catch {}
      }
    })();
    console.log(`[migrate] ${lines.length} inscrição(ões) migrada(s) de JSONL → SQLite`);
    fs0.renameSync(recruitFile, recruitFile + '.migrated');
  }
})();

console.log(`[boot] SQLite: ${DB_PATH}`);
// Persistência: em produção (não-local) o DB SÓ persiste entre deploys se DATA_DIR
// apontar para um Railway Volume montado (ex: /data). Sem isso, reseta a cada push.
if (!IS_LOCAL_DEV) {
  if (process.env.DATA_DIR && process.env.DATA_DIR.startsWith('/')) {
    console.log(`[boot] ✅ Persistência: usando volume DATA_DIR=${process.env.DATA_DIR}`);
  } else {
    console.warn('[boot] ⚠️  ATENÇÃO: DATA_DIR não setado para volume — SQLite vai RESETAR a cada deploy! Monte um Railway Volume e set DATA_DIR=/data.');
  }
}

function backupFile(p) {
  if (!fs.existsSync(p)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${p}.bak.${ts}`;
  try { fs.copyFileSync(p, bak); } catch (e) { console.warn('[backup-fail]', p, e.message); }
}

// ── EMAIL (opcional via Resend) ───────────────────────────────────────────────
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'ruda.costa@epiuse.com.br';
const FROM_EMAIL   = process.env.FROM_EMAIL   || 'voices@resend.dev';
const resend = (Resend && process.env.RESEND_API_KEY) ? new Resend(process.env.RESEND_API_KEY) : null;
if (resend) console.log(`[boot] email pronto: from=${FROM_EMAIL} to=${NOTIFY_EMAIL}`);
else        console.log(`[boot] email desabilitado (sem RESEND_API_KEY) — inscrições só em JSONL + console`);

function buildEmailHTML(app) {
  const safe = (s) => String(s||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  const row = (label, val) => val ? `<tr><td style="padding:5px 0;color:#64748b;width:180px;vertical-align:top;font-size:13px">${label}</td><td style="padding:5px 0;font-size:13px">${safe(val)}</td></tr>` : '';
  const section = (title) => `<tr><td colspan="2" style="padding:14px 0 6px;font-size:11px;letter-spacing:.16em;color:#2563EB;text-transform:uppercase;font-weight:700;border-bottom:1px solid #e2e8f0">${title}</td></tr>`;
  const block = (label, val) => val ? `<div style="margin:10px 0 4px;color:#64748b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">${label}</div><div style="background:#f8fafc;border-left:3px solid #2563EB;padding:10px 14px;border-radius:4px;font-size:13px;color:#334155;line-height:1.5;white-space:pre-wrap">${safe(val)}</div>` : '';
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px">
  <table cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="background:linear-gradient(135deg,#0a1628,#2563EB);padding:24px;color:#fff">
      <div style="font-size:11px;letter-spacing:.2em;opacity:.7;text-transform:uppercase;margin-bottom:6px">EPI-USE Voices · Briefing Redatoria</div>
      <div style="font-size:20px;font-weight:700">🎙️ Nova inscrição: ${safe(app.nome)}</div>
      <div style="font-size:13px;opacity:.8;margin-top:4px">${safe(app.cargo)} · ${safe(app.tempo_epiuse)} na EPI-USE</div>
    </td></tr>
    <tr><td style="padding:20px 24px">
      <table cellpadding="0" cellspacing="0" style="width:100%;color:#1e293b">
        ${section('1. Sobre a pessoa')}
        ${row('Nome', app.nome)}
        ${row('E-mail', app.email)}
        ${row('Cargo', app.cargo)}
        ${row('Endereço (kit)', app.endereco)}
        ${row('Tempo na EPI-USE', app.tempo_epiuse)}
        ${row('Palestras', app.palestras)}
        ${row('Vídeos', app.videos)}
        ${row('Tem fotos', app.tem_fotos)}
        ${row('LinkedIn', app.linkedin)}
      </table>
      ${block('O que faz no dia a dia (sem jargão)', app.dia_a_dia)}
      ${block('Domínio técnico / certificações', app.dominio_tecnico)}
      ${block('Trajetória até a EPI-USE', app.trajetoria)}
      ${block('Lado humano', app.lado_humano)}
      <table cellpadding="0" cellspacing="0" style="width:100%;color:#1e293b">
        ${section('2. Projetos & experiência')}
        ${row('Competências', app.competencias)}
      </table>
      ${block('Projeto de maior orgulho', app.projeto_orgulho)}
      ${block('Desafio técnico/equipe', app.desafio)}
      ${block('Liderança', app.lideranca)}
      ${block('Exposições / premiações', app.exposicoes)}
      <table cellpadding="0" cellspacing="0" style="width:100%;color:#1e293b">
        ${section('3. Estilo & público')}
        ${row('Tom', app.tom)}
      </table>
      ${block('Público-alvo', app.publico_alvo)}
      ${block('Tema que adoraria falar', app.tema_adoraria)}
      ${block('Tema que prefere evitar', app.tema_evitar)}
      ${block('Artigos de referência', app.artigos_ref)}
      <table cellpadding="0" cellspacing="0" style="width:100%;color:#1e293b">
        ${section('4. Rotina & bastidores')}
      </table>
      ${block('Dia típico', app.dia_tipico)}
      ${block('Bastidores da área', app.bastidores)}
      ${block('Fora do trabalho', app.fora_trabalho)}
    </td></tr>
    <tr><td style="padding:14px 24px 22px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
      <div>Recebido em ${safe(app.timestamp)} · IP ${safe(app.ip)}</div>
      <div style="margin-top:6px"><a href="https://epiuse-voices-optimizer.up.railway.app/painel" style="color:#2563EB;text-decoration:none">→ Ver todas inscrições no Painel</a></div>
    </td></tr>
  </table>
  </body></html>`;
}

// ── WEBHOOK (opcional — alimenta planilha Excel via Power Automate) ──────────
const WEBHOOK_RECRUITMENT_URL = process.env.WEBHOOK_RECRUITMENT_URL || '';
async function sendRecruitmentWebhook(data) {
  if (!WEBHOOK_RECRUITMENT_URL) { console.log('[WEBHOOK-SKIPPED] sem WEBHOOK_RECRUITMENT_URL'); return; }
  const payload = JSON.stringify({
    nome: data.nome, email: data.email, cargo: data.cargo, endereco: data.endereco,
    tempo_epiuse: data.tempo_epiuse, dia_a_dia: data.dia_a_dia, dominio_tecnico: data.dominio_tecnico,
    trajetoria: data.trajetoria, palestras: data.palestras, videos: data.videos,
    lado_humano: data.lado_humano, tem_fotos: data.tem_fotos, linkedin: data.linkedin,
    projeto_orgulho: data.projeto_orgulho, desafio: data.desafio, lideranca: data.lideranca,
    competencias: data.competencias, exposicoes: data.exposicoes,
    tom: data.tom, publico_alvo: data.publico_alvo, tema_adoraria: data.tema_adoraria,
    tema_evitar: data.tema_evitar, artigos_ref: data.artigos_ref,
    dia_tipico: data.dia_tipico, bastidores: data.bastidores, fora_trabalho: data.fora_trabalho,
    utm_source: data.utm_source, utm_medium: data.utm_medium, timestamp: data.timestamp
  });
  return new Promise(resolve => {
    try {
      const url = new URL(WEBHOOK_RECRUITMENT_URL);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const req = mod.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
        console.log(`[WEBHOOK-SENT] status=${res.statusCode}`);
        res.resume();
        resolve();
      });
      req.on('error', e => { console.error(`[WEBHOOK-FAIL] ${e.message}`); resolve(); });
      req.write(payload);
      req.end();
    } catch (e) { console.error(`[WEBHOOK-FAIL] ${e.message}`); resolve(); }
  });
}

async function sendRecruitmentEmail(app) {
  if (!resend) { console.log('[EMAIL-SKIPPED] sem RESEND_API_KEY'); return; }
  try {
    const r = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `🎙️ Nova inscrição EPI-USE Voices — ${app.nome}`,
      html: buildEmailHTML(app),
      reply_to: app.email
    });
    console.log(`[EMAIL-SENT] id=${r.data?.id || 'unknown'} to=${NOTIFY_EMAIL}`);
  } catch (e) {
    console.error(`[EMAIL-FAIL] ${e.message}`);
  }
}

const app = express();
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Trust proxy 1 hop pra Railway (rate limit reconhece IP real)
app.set('trust proxy', 1);

// ── /api/areas.json — overlay de valores LIVE em serve-time (fonte unica, v0.52) ──
// Registrado ANTES do express.static p/ sobrepor o arquivo estatico.
// Sobrepoe: seguidores (linkedin-routine) + contatos/empresas (apollo pipeline-snapshot).
// Mantem null como pendente (regra 7) — nunca chumba numero.
app.get('/api/areas.json', (req, res) => {
  try {
    const fsx = require('fs');
    const apiPath = (f) => path.join(__dirname, 'public/api', f);
    const readJSON = (f) => { try { return JSON.parse(fsx.readFileSync(apiPath(f), 'utf8')); } catch (_) { return null; } };
    const areas = readJSON('areas.json');
    if (!areas) return res.status(404).json({ error: 'areas.json nao encontrado' });
    const rt = readJSON('linkedin-routine.json');
    const pl = readJSON('pipeline-snapshot.json');
    const seguidores = rt && rt.seguidores_atual != null ? rt.seguidores_atual : null;
    const contatos = pl && pl.contatos_total != null ? pl.contatos_total : null;
    const contas = pl && pl.contas_total != null ? pl.contas_total : null;
    // fontes extras: eventos (events.json, aba brasil) + reunioes (relatorio-outreach Apollo)
    const ev = readJSON('events.json');
    const outreach = readJSON('relatorio-outreach.json');
    let evTotal = null, evPast = null;
    const evs = (ev && ev.abas && ev.abas.brasil && ev.abas.brasil.eventos) || [];
    if (evs.length) { evTotal = evs.length; const cm = new Date().getMonth() + 1; evPast = evs.filter(e => (e.m || 99) < cm).length; }
    const reunioes = outreach && outreach.kpis ? (outreach.kpis.reunioes_realizadas ?? null) : null;
    // posts do mes (linkedin-routine, ignora a meta-row sem resumo) — 0 vira pendente
    const _pc = rt && Array.isArray(rt.posts) ? rt.posts.filter(p => p && p.resumo).length : 0;
    const postsCount = _pc > 0 ? _pc : null;
    // oportunidades (zoho_deals) + cases publicaveis (cs_clientes) — 0/erro vira pendente (regra 7)
    let zohoOpps = null, casesCount = null;
    try { const r = db.prepare('SELECT COUNT(*) AS n FROM zoho_deals').get(); if (r && r.n > 0) zohoOpps = r.n; } catch (_) {}
    try { const r = db.prepare('SELECT COUNT(*) AS n FROM cs_clientes').get(); if (r && r.n > 0) casesCount = r.n; } catch (_) {}
    let activeOpps = null;
    try { const r = db.prepare("SELECT COUNT(*) AS n FROM zoho_deals WHERE stage IN ('Probable (50): Med Prob - Opportunity Response', 'Prospect: No Proposal yet', 'ROM: Without Prob - Ballpark Estimation', 'Upside (25): Low Prob - Qualified Opportunity')").get(); if (r && r.n >= 0) activeOpps = r.n; } catch (_) {}
    let wonDeals = null;
    try { const r = db.prepare("SELECT COUNT(*) AS n FROM zoho_deals WHERE stage = 'Fechado Ganhamos'").get(); if (r && r.n >= 0) wonDeals = r.n; } catch (_) {}
    let n = 0;
    const apply = (item) => {
      if (!item || item.valor == null) return; // mantem pendente (regra 7)
      const lbl = (item.estagio || item.label || '').toLowerCase();
      if (/seguidor/.test(lbl) && !/(novo|ganho|atribu)/.test(lbl) && seguidores != null) { item.valor = seguidores; item._live = 'linkedin-routine'; n++; }
      else if (/(contato|base crm)/.test(lbl) && contatos != null) { item.valor = contatos; item._live = 'apollo'; n++; }
      else if (/(empresa|conta mapead)/.test(lbl) && contas != null) { item.valor = contas; item._live = 'apollo'; n++; }
    };
    (areas.areas || []).forEach(a => {
      (a.funil || []).forEach(apply); (a.kpis || []).forEach(apply);
      // overlays especificos por area (label-exato pra nao cruzar com outras areas)
      const items = [...(a.funil || []), ...(a.kpis || [])];
      if (a.id === 'eventos') items.forEach(f => {
        const l = (f.estagio || f.label || '').toLowerCase();
        if (l === 'eventos planejados' && evTotal != null) { f.valor = evTotal; f._live = 'events.json'; n++; }
        else if (l === 'executados' && evPast != null) { f.valor = evPast; f._live = 'events.json'; n++; }
        else if (l === 'eventos planejados fy' && evTotal != null) { f.valor = evTotal; f._live = 'events.json'; n++; }
      });
      if (a.id === 'pipeline') items.forEach(f => {
        const l = (f.estagio || f.label || '').toLowerCase();
        if (l === 'contatos na base' && contatos != null) { f.valor = contatos; f._live = 'apollo'; n++; }
        else if (l === 'sequências ativas' && pl && pl.sequencias_ativas != null) { f.valor = pl.sequencias_ativas; f._live = 'apollo'; n++; }
        else if (l === 'e-mails enviados' && outreach && outreach.kpis && outreach.kpis.emails_enviados != null) { f.valor = outreach.kpis.emails_enviados; f._live = 'apollo-outreach'; f.obs = `Média: ${Math.round(outreach.kpis.emails_enviados/22)}/dia (meta 30)`; n++; }
        else if (l === 'reuniões realizadas' && reunioes != null) { f.valor = reunioes; f._live = 'apollo-meetings'; f.obs = 'Apollo reuniões realizadas (30d)'; n++; }
        else if (l === 'oportunidades ativas' && activeOpps != null) { f.valor = activeOpps; f._live = 'zoho-deals'; f.obs = 'Deals em aberto no CRM Zoho'; n++; }
        else if (l === 'vendas origem mkt' && wonDeals != null) { f.valor = wonDeals; f._live = 'zoho-deals'; f.obs = 'Deals ganhos no CRM Zoho'; n++; }
        else if (l === 'empresas mapeadas' && contas != null) { f.valor = contas; f._live = 'apollo'; n++; }
      });
      if (a.id === 'brand') items.forEach(f => {
        const l = (f.estagio || f.label || '').toLowerCase();
        if (l === 'posts/mês' && postsCount != null) { f.valor = postsCount; f._live = 'linkedin-routine'; n++; }
        else if (l === 'cases publicáveis' && casesCount != null) { f.valor = casesCount; f._live = 'cs_clientes'; n++; }
      });
    });
    areas._overlay = { aplicado_em: new Date().toISOString(), live_count: n, seguidores, contatos, contas, eventos_total: evTotal, eventos_exec: evPast, reunioes, posts_mes: postsCount, oportunidades: zohoOpps, cases: casesCount };
    res.set('Cache-Control', 'no-store');
    return res.json(areas);
  } catch (e) {
    return res.status(500).json({ error: 'overlay areas falhou', detail: String(e) });
  }
});

// ── /api/voices.json — overlay: arquivo base + Voices publicados de inscrições ──
// Registrado ANTES do express.static (mesmo padrão do areas.json). Os Voices
// vindos de inscrição vivem na tabela voices_publicados (persiste no volume) e
// são mesclados aqui — assim aparecem em /voices sem depender de escrever no
// arquivo (que é efêmero a cada deploy).
db.exec(`CREATE TABLE IF NOT EXISTS voices_publicados (
  id           TEXT PRIMARY KEY,   -- slug do Voice
  inscricao_id INTEGER,            -- id da recruitment_applications de origem
  data         TEXT,               -- JSON da ficha do Voice
  created_at   TEXT DEFAULT (datetime('now'))
);`);
function slugifyVoice(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}
function readVoicesFile() {
  try { return JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8')); } catch (e) { return { voices: [] }; }
}
function publishedVoices() {
  try { return db.prepare('SELECT data FROM voices_publicados ORDER BY id ASC').all().map(r => JSON.parse(r.data)); }
  catch (e) { return []; }
}
function voiceFromApp(app_, numero, slug) {
  return {
    id: slug, numero,
    nome: app_.nome, cargo: app_.cargo || '', empresa: 'EPI-USE Brasil',
    nicho: app_.dominio_tecnico || app_.area || '', tags: [],
    status: 'novo', status_label: 'Novo',
    audiencia: app_.publico_alvo ? [app_.publico_alvo] : [],
    linkedin: app_.linkedin || null,
    ssi_baseline: null, seguidores_baseline: null,
    posts_mes_atual: 0, kit_gerado: false, ultimo_post: null,
    pendencia: 'Onboarding — coletar SSI/seguidores, validar tom e temas',
    tom_voz: app_.tom || null, lado_humano: app_.lado_humano || null, resultados: null,
    dados_a_confirmar: ['ssi_baseline', 'seguidores_baseline', 'resultados'],
    baia: { x: 10, y: 8 }, avatar_grad: ['#2563EB', '#a855f7'], spawn_color: '#2563EB',
    origem: 'inscricao', inscricao_id: app_.id,
  };
}
app.get('/api/voices.json', (req, res) => {
  try {
    const base = readVoicesFile();
    const baseIds = new Set((base.voices || []).map(v => v.id || v.slug));
    const extra = publishedVoices().filter(v => !baseIds.has(v.id));
    base.voices = (base.voices || []).concat(extra);
    res.set('Cache-Control', 'no-store');
    return res.json(base);
  } catch (e) { return res.status(500).json({ error: 'overlay voices falhou', detail: String(e) }); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '4mb' })); // 4mb cobre syncs grandes (SAP 4 ME 705 projetos ~370KB)

// ── SSO MICROSOFT & SESSÃO (ECC Security Guidelines) ─────────────────────────
const session = IS_LOCAL_DEV ? require(localModules + '/express-session') : require('express-session');
const { ACTIVE_SESSION_SECRET, SSO_ENABLED, SSO_REDIRECT, SSO_DOMAINS, msalClient } = require('./server-context');

let sessionStore;
try {
  const SQLiteStore = (IS_LOCAL_DEV ? require(localModules + '/connect-sqlite3') : require('connect-sqlite3'))(session);
  sessionStore = new SQLiteStore({ db: 'sessions.sqlite', dir: DB_DIR });
} catch(e){ console.warn('[sso] connect-sqlite3 ausente, usando MemoryStore:', e.message); sessionStore = undefined; }

app.use(session({
  name: 'eubr.sid',
  secret: ACTIVE_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { httpOnly: true, sameSite: 'lax', secure: !IS_LOCAL_DEV, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

if (SSO_ENABLED) {
  console.log('[sso] Microsoft SSO ATIVO · redirect=' + SSO_REDIRECT + ' · dominios=' + SSO_DOMAINS.join(','));
} else {
  console.log('[sso] Microsoft SSO inativo (faltam credenciais ou modulo)');
}

// ── RE-HIDRATAÇÃO DE ROLE/PERSONA A PARTIR DO BANCO ───────────────────────────
// O login (routes/auth.js) grava role/persona/admin na SESSÃO. Sem isto, uma
// mudança no /admin/usuarios só valeria depois da pessoa deslogar e relogar
// (a sessão viva mantém o role antigo). Aqui, a cada navegação de página,
// relemos a linha do usuário no SQLite e sincronizamos a sessão — assim um
// cadastro/edição de perfil passa a valer no PRÓXIMO carregamento, sem relogin.
// Barato: 1 SELECT por PK (email) só em rotas dinâmicas (assets estáticos já
// foram servidos por express.static acima e não chegam aqui). Seguro: se a
// leitura falhar/retornar nulo (erro transitório ou usuário removido), NÃO
// mexe na sessão — evita rebaixar o head por um erro momentâneo de DB.
const { getUserByEmail: _rhGetUser, profileFor: _rhProfileFor } = require('./routes/users');
app.use((req, res, next) => {
  try {
    const u = req.session && req.session.user;
    if (u && u.email) {
      const row = _rhGetUser(u.email);
      if (row) {
        const prof = _rhProfileFor(row);
        if (u.role !== prof.role || u.persona !== prof.persona || u.admin !== prof.admin) {
          u.role = prof.role;
          u.persona = prof.persona;
          u.admin = prof.admin;
        }
      }
    }
  } catch (_e) { /* nunca quebra a request por causa disto */ }
  next();
});

// ── ENFORCEMENT GLOBAL (SSO_ENFORCE) ──────────────────────────────────────────
// Exige login nas PÁGINAS (navegação humana) quando SSO_ENFORCE=true E o SSO
// estiver configurado (env AZURE_*). requireAuth (server-context) já é seguro:
// sem as credenciais ele deixa passar — então em prod o acesso só tranca depois
// das env vars entrarem no Railway (migração segura). Assets estáticos já foram
// servidos por express.static acima e não chegam aqui.
//
// Escopo: só páginas. As rotas /api/* NÃO passam por aqui — cada uma tem seu
// próprio guard (requireAuth em cases/inbound, requireEditorToken nos syncs,
// requireAdmin no admin). Isso preserva os fluxos server-to-server por
// X-Editor-Token (ex: resync-railway-all) mesmo com enforcement ligado.
// Allowlist abaixo evita loop no fluxo de login.
const ENFORCE_PUBLIC = ['/login', '/auth/login', '/auth/callback', '/auth/logout', '/auth/rd-callback'];
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/go/')) return next(); // link rastreado UTM — público (clicker externo não loga)
  if (ENFORCE_PUBLIC.includes(req.path)) return next();
  return requireAuth(req, res, next);
});

// ── HARD-LOCK DO COLABORADOR (role 'hub') ─────────────────────────────────────
// Quem não é do time de marketing nem country manager (role 'hub') só acessa o
// Marketing Hub (+ o game do colaborador). Qualquer outra PÁGINA -> redirect /hub.
// Time de MKT, head e country-manager/diretoria NÃO são afetados.
// APIs (/api/*) e /auth/* passam (o /hub e /game-hub precisam de /api/auth/status).
// Páginas que o colaborador (role hub) PODE acessar: o hub, o game dele, e os
// destinos do menu de acesso rápido do portal. O resto do Office segue bloqueado.
const HUB_LOCK_PAGES = new Set([
  '/hub', '/game', '/game-hub', '/login', '/escolher-visao', '/brand',
  '/design', '/erp-impacto', '/seja-voice', '/artigos', '/optimizer',
  '/optimizer-v3', '/voices/optimizer-v3',
  '/campanhas', '/brindes', '/hub/brindes', '/hub/solicitacao-brindes',
  '/hub/solicitar-brindes', '/meus-links', '/loja', '/ranking',
  '/voices/pautas', '/voices/pauta', '/cafezinho'
]);
// nota: '/game' passa pelo lock só pra rota fazer o redirect por role → /game-hub.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/go/')) return next();
  const u = req.session && req.session.user;
  if (u && u.role === 'hub' && !HUB_LOCK_PAGES.has(req.path)) return res.redirect('/hub');
  next();
});

// ── ANALYTICS DE USO (Módulo 15) — log de navegação de página ─────────────────
// Roda após session/enforce/hub-lock: só loga páginas que o usuário realmente
// alcançou, já com o email da sessão resolvido. O tempo na página vem do beacon
// do cliente (office-nav.js → POST /api/analytics/track). Report: /admin/analytics.
const analyticsRouter = require('./routes/analytics');
app.use(analyticsRouter.logPageView);

// ── PRESENÇA MULTIPLAYER DO GAME (v0.60.0) ────────────────────────────────────
// Estado EFÊMERO em memória (nada no SQLite — presença zera a cada deploy, ok).
// Clientes dos games (/game e /game-hub) POSTam posição a cada ~2s e recebem
// os demais jogadores do mesmo mundo ativos nos últimos 8s.
const _gamePresence = new Map(); // id -> {world,x,y,dir,moving,name,shirt,emote,emoteT,ts}
const _PRESENCE_TTL = 8000, _PRESENCE_CAP = 600;
app.post('/api/game/presence', express.json({ limit: '4kb' }), (req, res) => {
  const b = req.body || {};
  const sessEmail = req.session && req.session.user && req.session.user.email;
  const anon = String(b.anonId || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  const id = sessEmail || (anon ? 'anon:' + anon : '');
  if (!id) return res.status(400).json({ error: 'sem_id' });
  const now = Date.now();
  if (b.bye) { _gamePresence.delete(id); return res.status(204).end(); }
  const world = b.world === 'hub' ? 'hub' : 'mkt';
  const dir = ['up','down','left','right'].includes(b.dir) ? b.dir : 'down';
  const shirt = /^#[0-9a-f]{6}$/i.test(String(b.shirt || '')) ? b.shirt : '#cd1543';
  const emote = ['👋','❤️','😄','🎉'].includes(b.emote) ? b.emote : null;
  if (!_gamePresence.has(id) && _gamePresence.size >= _PRESENCE_CAP) {
    for (const [k, v] of _gamePresence) if (now - v.ts > _PRESENCE_TTL) _gamePresence.delete(k);
  }
  if (_gamePresence.has(id) || _gamePresence.size < _PRESENCE_CAP) {
    _gamePresence.set(id, {
      world, dir, shirt, emote,
      x: Math.max(0, Math.min(1920, Math.round(+b.x || 0))),
      y: Math.max(0, Math.min(1152, Math.round(+b.y || 0))),
      moving: !!b.moving,
      name: String(b.name || '').slice(0, 24),
      emoteT: emote ? (Math.round(+b.emoteT) || now) : 0,
      ts: now,
    });
  }
  const others = [];
  for (const [k, v] of _gamePresence) {
    if (now - v.ts > _PRESENCE_TTL) { _gamePresence.delete(k); continue; }
    if (k !== id && v.world === world) {
      others.push({ id: k, x: v.x, y: v.y, dir: v.dir, moving: v.moving, name: v.name, shirt: v.shirt, emote: v.emote, emoteT: v.emoteT });
    }
  }
  res.json({ others });
});

// ── ERP COINS (v0.72.0) — acúmulo SILENCIOSO de participação ─────────────────
// Cada ação (compartilhar campanha, marcar Gol de Placa, completar quest do
// game) credita coins pro email da sessão SSO. O usuário NÃO vê saldo em
// lugar nenhum (decisão do Rudá — resgate por brindes/dinheiro vem depois).
// Anti-farm: UNIQUE(email,evento,ref,dia) = 1 crédito por ação/campanha/dia.
// ⚠️ Persiste no SQLite → precisa do Railway Volume (DATA_DIR) pra sobreviver
// a deploys. Enquanto não houver, usar backup/restore abaixo (editor token).
db.exec(`
  CREATE TABLE IF NOT EXISTS erp_coins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    evento     TEXT NOT NULL,             -- share | golplaca | quest | egg
    ref        TEXT DEFAULT '',           -- id da campanha / mundo do game
    coins      INTEGER NOT NULL,
    dia        TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(email, evento, ref, dia)
  );
  CREATE INDEX IF NOT EXISTS idx_coins_email ON erp_coins(email);
`);
const COIN_VALUES = { share: 10, golplaca: 10, quest: 50 }; // valores só no server

app.post('/api/game/coins', express.json({ limit: '2kb' }), (req, res) => {
  const u = req.session && req.session.user;
  if (!u || !u.email) return res.status(401).json({ error: 'auth_required' });
  const evento = String((req.body || {}).evento || '');
  if (!COIN_VALUES[evento]) return res.status(400).json({ error: 'evento_invalido' });
  const ref = String((req.body || {}).ref || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  try {
    db.prepare(`INSERT OR IGNORE INTO erp_coins (email, evento, ref, coins) VALUES (?,?,?,?)`)
      .run(u.email, evento, ref, COIN_VALUES[evento]);
  } catch (e) { console.warn('[coins]', e.message); }
  res.json({ ok: true });   // silencioso: sem saldo, sem "ganhou X"
});

// 🥚 Easter egg dos elefantes — quem achar o filhote escondido no jardim
// desbloqueia a conquista "Guardião dos Elefantes". Na 1ª descoberta de cada
// pessoa: registra no ledger (1x por vida — dia fixo '∀') e avisa o Rudá por
// email. Descobertas repetidas não geram email nem coins (INSERT OR IGNORE).
const EGG_NOTIFY = process.env.EGG_NOTIFY_EMAIL || 'ruda.costa@epiuse.com.br';
app.post('/api/game/egg', express.json({ limit: '2kb' }), async (req, res) => {
  const u = req.session && req.session.user;
  if (!u || !u.email) return res.status(401).json({ error: 'auth_required' });
  const world = String((req.body || {}).world || '').replace(/[^a-z0-9-]/gi, '').slice(0, 20);
  let first = false;
  try {
    const r = db.prepare(`INSERT OR IGNORE INTO erp_coins (email, evento, ref, coins, dia) VALUES (?,?,?,?,?)`)
      .run(u.email, 'egg', 'elefantes', 100, '∀');
    first = r.changes > 0;
  } catch (e) { console.warn('[egg]', e.message); }
  if (first) {
    console.log(`[egg] 🐘 ${u.email} achou o filhote (mundo: ${world || '?'})`);
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: EGG_NOTIFY,
          subject: `🐘 Easter egg encontrado! ${u.name || u.email} achou o filhote`,
          html: `<div style="font-family:sans-serif;line-height:1.6;max-width:520px">
            <h2 style="margin:0 0 8px">🐘🏆 Guardião dos Elefantes</h2>
            <p><b>${String(u.name || u.email).replace(/[<>&]/g, '')}</b> (${String(u.email).replace(/[<>&]/g, '')}) encontrou o filhote de elefante escondido no Office game (mundo: <b>${world || '?'}</b>).</p>
            <p>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
            <p style="color:#64748b;font-size:13px">Conquista registrada no ledger de ERP Coins (evento "egg", 1x por pessoa, +100).</p>
          </div>`,
        });
        console.log(`[egg-email] enviado pra ${EGG_NOTIFY}`);
      } catch (e) { console.warn('[egg-email]', e.message); }
    } else console.log('[egg-email] skipped (sem RESEND_API_KEY)');
  }
  res.json({ ok: true });
});

// Painel do head: ranking + ledger (não linkado em nenhum menu de usuário)
const { requireAdmin: _coinsAdmin, requireExec: _requireExec } = require('./routes/users');
app.get('/api/admin/coins', _coinsAdmin, (req, res) => {
  try {
    const ranking = db.prepare(`SELECT email, SUM(coins) total, COUNT(*) acoes, MAX(created_at) ultimo
                                FROM erp_coins GROUP BY email ORDER BY total DESC`).all();
    const ledger = db.prepare(`SELECT * FROM erp_coins ORDER BY id DESC LIMIT 500`).all();
    res.json({ valores: COIN_VALUES, ranking, ledger });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/admin/coins', _coinsAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public/admin-coins.html')));

// Backup/restore do ledger (workaround do P0 do SQLite sem volume no Railway)
app.get('/api/admin/coins/backup', requireEditorToken, (req, res) => {
  try { res.json({ exportado_em: new Date().toISOString(), rows: db.prepare('SELECT * FROM erp_coins').all() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/coins/restore', requireEditorToken, express.json({ limit: '4mb' }), (req, res) => {
  try {
    const rows = (req.body || {}).rows || [];
    const ins = db.prepare(`INSERT OR IGNORE INTO erp_coins (email, evento, ref, coins, dia, created_at) VALUES (?,?,?,?,?,?)`);
    let n = 0;
    for (const r of rows) { const c = ins.run(r.email, r.evento, r.ref || '', r.coins, r.dia, r.created_at); n += c.changes; }
    res.json({ ok: true, restaurados: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
// Optimizer é caro (Claude Vision tokens): 10 análises por hora por IP
const optimizerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 10 análises/hora atingido. Tente novamente em uma hora.' }
});

// Form da LP de recrutamento: 5 inscrições por hora por IP (anti-spam)
const recruitmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 5 inscrições/hora atingido.' }
});

// Inbound Brief→Post: 20 gerações por hora por IP (suficiente p/ uso normal, anti-abuse de Claude API)
const inboundGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 20 gerações/hora atingido. Aguarde 1h.' }
});

// ── BRINDES — helpers e rotas ─────────────────────────────────────────────────
function buildBrindesEmailHTML(rec) {
  const safe = s => String(s||'—').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const row = (label, val) => val ? `<tr><td style="padding:5px 0;color:#64748b;width:160px;font-size:13px;vertical-align:top">${label}</td><td style="padding:5px 0;font-size:13px"><b>${safe(val)}</b></td></tr>` : '';
  const tierColor = rec.tier === 'Diamond' ? '#7c3aed' : rec.tier === 'Premium' ? '#2563eb' : '#059669';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:24px">
  <table cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="background:linear-gradient(135deg,#001844,#003080);padding:28px 24px;color:#fff">
      <div style="font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.15em;margin-bottom:8px">EPI-USE · Gestão de Brindes</div>
      <div style="font-size:22px;font-weight:700">🎁 Nova Solicitação: #${safe(rec.id)}</div>
      <div style="margin-top:10px">
        <span style="background:${tierColor};color:#fff;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700">${safe(rec.tier)}</span>
        ${rec.isUrgent ? '<span style="background:#dc2626;color:#fff;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-left:6px">⚡ URGENTE</span>' : ''}
      </div>
    </td></tr>
    <tr><td style="padding:24px">
      <div style="font-size:11px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;font-weight:700">Solicitante</div>
      <table cellpadding="0" cellspacing="0" style="width:100%">
        ${row('Nome', rec.nome)}${row('E-mail', rec.email)}${row('Setor', rec.setor)}${row('Gestor(a)', rec.gestorResponsavel)}
      </table>
      <div style="border-top:1px solid #e2e8f0;margin:18px 0"></div>
      <div style="font-size:11px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;font-weight:700">Pedido</div>
      <table cellpadding="0" cellspacing="0" style="width:100%">
        ${row('Cliente', rec.nomeCliente)}${row('Projeto', rec.codigoProjeto)}
        ${row('Ocasião', rec.ocasiao + (rec.detalheOcasiao ? ' — ' + rec.detalheOcasiao : ''))}
        ${row('Data evento', rec.dataEvento)}${row('Local entrega', rec.localEntrega)}
        ${row('Quantidade', rec.qtd)}${row('Perfil público', rec.perfil)}
        ${row('Relacionamento', rec.relacionamento)}${row('Verba', rec.verba)}
        ${row('Restrições', (rec.restricoes||[]).join(', '))}
      </table>
      <div style="margin-top:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px">
        <div style="font-size:11px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;font-weight:700">Sugestão IA</div>
        <div style="font-size:14px;font-weight:600;color:#1e293b">${safe(rec.tier)} — ${safe(rec.itensSugeridos)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:20px 24px;background:#f8fafc;border-top:2px solid #e2e8f0">
      <div style="text-align:center">
        <div style="font-size:10px;color:#94a3b8;letter-spacing:.15em;text-transform:uppercase;margin-bottom:6px;font-weight:700">Protocolo de Rastreamento</div>
        <div style="font-family:monospace;font-size:28px;font-weight:900;color:#001844;letter-spacing:.15em">#${safe(rec.id)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">Recebido em ${safe(rec.date)} · <a href="https://office.epiuse.com.br/hub/brindes/painel-admin" style="color:#001844;font-weight:700">Ver no Office →</a></div>
      </div>
    </td></tr>
  </table></body></html>`;
}

async function sendBrindesEmail(rec) {
  if (!resend) { console.log('[BRINDES-EMAIL-SKIPPED] sem RESEND_API_KEY'); return; }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: process.env.BRINDES_NOTIFY_EMAIL || 'bruna.yamagami@epiuse.com.br',
      subject: `🎁 Brindes #${rec.id} — ${rec.nomeCliente} · ${rec.tier}${rec.isUrgent ? ' ⚡ URGENTE' : ''}`,
      html: buildBrindesEmailHTML(rec),
      reply_to: rec.email
    });
    console.log(`[BRINDES-EMAIL-SENT] #${rec.id}`);
  } catch (e) { console.error(`[BRINDES-EMAIL-FAIL] ${e.message}`); }
}

// Formulário de solicitação de brindes — página dedicada com URL própria
app.get('/hub/brindes', (req, res) => res.sendFile(path.join(__dirname, 'public/brindes.html')));
// Painel admin como página própria — o brindes.html detecta o path e abre a view
// admin; quem pode ver é controlado pelo SSO role (role !== 'hub')
app.get('/hub/brindes/painel-admin', (req, res) => res.sendFile(path.join(__dirname, 'public/brindes.html')));
// URLs antigas/variações → redirect permanente pras canônicas
app.get(['/brindes', '/hub/solicitacao-brindes', '/hub/solicitar-brindes'],
  (req, res) => res.redirect(301, '/hub/brindes'));
app.get(['/hub/solicitacao-brindes/painel-admin', '/hub/solicitar-brindes/painel-admin'],
  (req, res) => res.redirect(301, '/hub/brindes/painel-admin'));

// ── BRINDES: backup JSON para sobreviver a restarts (complementa o SQLite) ──────
// Em produção sem Railway Volume, o SQLite reseta a cada deploy. O backup JSON
// fica no mesmo DB_DIR — se DATA_DIR apontar para um Volume, tudo persiste.
const BRINDES_BACKUP = path.join(DB_DIR, 'brindes-backup.json');

function brindesWriteBackup() {
  try {
    const rows = db.prepare('SELECT data, created_at FROM brindes_requests ORDER BY created_at DESC').all();
    const records = rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
    fs.writeFileSync(BRINDES_BACKUP, JSON.stringify(records, null, 2), 'utf8');
  } catch (e) { console.warn('[BRINDES-BACKUP-WRITE]', e.message); }
}

// Na inicialização, restaura do JSON se o SQLite estiver vazio
;(function restoreBrindesIfEmpty() {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM brindes_requests').get().n;
    if (count > 0 || !fs.existsSync(BRINDES_BACKUP)) return;
    const records = JSON.parse(fs.readFileSync(BRINDES_BACKUP, 'utf8'));
    const ins = db.prepare('INSERT OR IGNORE INTO brindes_requests (id, data, created_at) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      for (const rec of records) {
        if (rec && rec.id) ins.run(rec.id, JSON.stringify(rec), rec.date || new Date().toISOString());
      }
    });
    tx();
    console.log(`[BRINDES-RESTORE] ${records.length} registro(s) restaurados do backup JSON`);
  } catch (e) { console.warn('[BRINDES-RESTORE]', e.message); }
})();

app.post('/api/brindes', (req, res) => {
  try {
    const rec = req.body;
    if (!rec || !rec.id || !rec.nome || !rec.email) return res.status(400).json({ error: 'campos obrigatorios ausentes' });
    db.prepare('INSERT OR REPLACE INTO brindes_requests (id, data, created_at) VALUES (?, ?, datetime("now"))').run(rec.id, JSON.stringify(rec));
    brindesWriteBackup();
    sendBrindesEmail(rec);
    res.json({ ok: true, id: rec.id });
  } catch (e) { console.error('[BRINDES-POST]', e); res.status(500).json({ error: e.message }); }
});

app.get('/api/brindes', (req, res) => {
  const auth = (req.headers.authorization || '');
  if (!auth.includes('MKt123') && req.query.token !== 'MKt123') return res.status(401).json({ error: 'nao autorizado' });
  try {
    const rows = db.prepare('SELECT data FROM brindes_requests ORDER BY created_at DESC').all();
    res.json(rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/brindes/export-csv', (req, res) => {
  const auth = (req.headers.authorization || '');
  if (!auth.includes('MKt123') && req.query.token !== 'MKt123') return res.status(401).json({ error: 'nao autorizado' });
  try {
    const rows = db.prepare('SELECT data, created_at FROM brindes_requests ORDER BY created_at DESC').all();
    const records = rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
    const cols = ['id','date','nome','email','setor','gestorResponsavel','nomeCliente','codigoProjeto','ocasiao','dataEvento','localEntrega','qtd','perfil','relacionamento','verba','restricoes','tier','itensSugeridos','status'];
    const esc = v => `"${String(v == null ? '' : Array.isArray(v) ? v.join('; ') : v).replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...records.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="brindes-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/brindes/:id', (req, res) => {
  const auth = (req.headers.authorization || '');
  if (!auth.includes('MKt123') && req.query.token !== 'MKt123') return res.status(401).json({ error: 'nao autorizado' });
  try {
    const row = db.prepare('SELECT data FROM brindes_requests WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'nao encontrado' });
    const updated = { ...JSON.parse(row.data), ...req.body };
    db.prepare('UPDATE brindes_requests SET data = ?, updated_at = datetime("now") WHERE id = ?').run(JSON.stringify(updated), req.params.id);
    brindesWriteBackup();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ARTIGOS GENERATOR — proxy Gemini API (chave nunca exposta no front) ───────
app.get('/generator-stratview', (req, res) => res.sendFile(path.join(__dirname, 'public/artigos-generator.html')));

async function geminiPost(model, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada. Adicione ao .env local.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const err = await r.text(); const e = new Error(`Gemini ${r.status}: ${err.slice(0, 300)}`); e.status = r.status; throw e; }
  return r.json();
}

// Cota do free tier é POR MODELO — no 429, cai pro próximo da cadeia em vez de falhar.
// 404 (modelo descontinuado/inexistente) também pula — permite listar candidatos novos sem risco.
const GEMINI_FALLBACK_CHAIN = ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-3.1-flash', 'gemini-3-flash-lite', 'gemini-2.0-flash'];
async function geminiPostComFallback(body, chain = GEMINI_FALLBACK_CHAIN) {
  let ultimoErro = null;
  for (const model of chain) {
    try { return { result: await geminiPost(model, body), model }; }
    catch (e) {
      ultimoErro = e;
      if (e.status !== 429 && e.status !== 503 && e.status !== 404) throw e; // só cota/indisponível/descontinuado justificam fallback
      console.warn(`[GEMINI-FALLBACK] ${model} indisponível (${e.status}) — tentando próximo`);
    }
  }
  if (ultimoErro && ultimoErro.status === 429)
    throw new Error('Cota da API Gemini esgotada em todos os modelos (plano gratuito). Aguarde 1-2 minutos e tente de novo; se persistir, é o limite DIÁRIO (reseta ~4h da manhã BRT) — ou ative billing no Google AI Studio.');
  throw ultimoErro;
}

async function imagenPredict(model, body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const err = await r.text(); throw new Error(`Imagen ${r.status}: ${err.slice(0, 300)}`); }
  return r.json();
}

// Regras de escrita compartilhadas (gerar + refinar) — calibradas pro Yoast SEO (legibilidade)
const ARTIGOS_REGRAS_ESTILO = `REGRAS DE PORTUGUÊS (INEGOCIÁVEIS — ZERO ERRO):
- Português do Brasil impecável: gramática, ortografia (Acordo Ortográfico vigente), acentuação, crase, concordância verbal e nominal, regência.
- Nunca misture inglês e português na mesma frase sem necessidade. Termos técnicos consagrados (cloud, workload) podem ficar em inglês, mas o texto ao redor é pt-BR correto.
- Antes de finalizar, releia o texto inteiro procurando erros de digitação, palavras trocadas e vírgulas faltando.

REGRAS DE LEGIBILIDADE (calibradas pro Yoast SEO — cumprir TODAS):
1. FRASES CURTAS: a maioria das frases deve ter até 20 palavras. NO MÁXIMO 1 em cada 5 frases pode passar de 25 palavras. Prefira dividir em duas frases a usar orações longas encadeadas.
2. PALAVRAS DE TRANSIÇÃO: pelo menos 35% das frases devem começar ou conter palavras/expressões de transição — por exemplo: além disso, no entanto, portanto, ou seja, por isso, em primeiro lugar, na prática, como resultado, da mesma forma, em resumo, afinal, enquanto isso, apesar disso, assim.
3. SUBTÍTULOS: NENHUMA seção pode ter mais de 250 palavras sem um <h2> ou <h3>. Distribua subtítulos a cada 2-4 parágrafos.
4. PARÁGRAFOS CURTOS: máximo 4 frases (ou ~90 palavras) por parágrafo.
5. VOZ ATIVA: prefira voz ativa; use voz passiva em menos de 10% das frases.
6. Não comece 3 frases seguidas com a mesma palavra.`;

// Anti-repetição entre artigos: clichês de IA proibidos + formatos/aberturas sorteados a cada geração
const ARTIGOS_CLICHES_PROIBIDOS = `VOCABULÁRIO PROIBIDO (clichês de IA que aparecem em todo artigo — NÃO use nenhum):
"no cenário atual", "em um mundo cada vez mais", "no dinâmico mundo de", "na era digital", "não é apenas X, é Y", "mais do que nunca", "desvendar", "revolucionar", "robusto(a)", "alavancar", "impulsionar" (mais de 1x), "seamless", "game-changer", "divisor de águas", "verdadeiro diferencial", "é fundamental" (mais de 1x), "papel crucial", "abordagem holística", "sinergia" (fora do título), "jornada" (mais de 2x), "transformação digital" (mais de 1x).
Frases de fechamento proibidas: "Em resumo/Em suma/Concluindo, ..." iniciando a última seção.`;

const ARTIGOS_FORMATOS = [
  'GUIA PRÁTICO: seções numeradas com passos acionáveis; cada seção termina com uma recomendação concreta.',
  'MITOS vs REALIDADE: cada seção H2 confronta uma crença comum do mercado com o que a prática mostra.',
  'CENÁRIO NARRATIVO: abra cada seção com uma situação real de empresa (anonimizada) e extraia a lição.',
  'DADOS E DECISÃO: cada seção parte de um número/tendência de mercado e mostra a decisão executiva que ele pede.',
  'PERGUNTAS DO BOARD: cada H2 é uma pergunta que um conselho/CEO faria; o texto responde com posição firme.',
  'ERROS COMUNS: cada seção disseca um erro recorrente do mercado e mostra como evitá-lo.'
];
const ARTIGOS_ABERTURAS = [
  'termine a 1ª frase com um dado ou consequência concreta de negócio (a frase ainda COMEÇA com a frase-chave)',
  'siga a frase-chave com uma tensão/paradoxo do mercado que o artigo vai resolver',
  'siga a frase-chave com um mini-cenário de empresa (2ª frase: "Imagine..." ou situação real)',
  'siga a frase-chave com uma afirmação contrária ao senso comum, que o artigo defende'
];

// Artigo completo = 3 FAQs fechados + HTML terminando em tag fechada (detecta resposta cortada por limite de tokens)
function artigosHtmlCompleto(html) {
  if (!html) return false;
  const fechados = (html.match(/<\/details>/g) || []).length;
  const abertos = (html.match(/<details/g) || []).length;
  return fechados >= 3 && fechados === abertos && html.trim().endsWith('>');
}

// Passo de revisão: segunda chamada só pra caçar erro de português (barato no Flash, elimina typo/concordância)
async function artigosRevisarPortugues(html) {
  try {
    const { result } = await geminiPostComFallback({
      contents: [{ parts: [{ text: `Você é um revisor profissional de português do Brasil (norma culta, Acordo Ortográfico vigente).

Revise o HTML abaixo corrigindo APENAS: erros de ortografia, acentuação, crase, concordância verbal/nominal, regência, pontuação e palavras digitadas errado.
NÃO reescreva frases corretas. NÃO altere estrutura HTML, tags, classes ou conteúdo técnico. NÃO adicione nem remova seções.
Se uma frase tiver mais de 25 palavras, divida-a em duas mantendo o sentido.
EXCEÇÃO OBRIGATÓRIA — Meta description: no bloco seo-meta, se o texto após "<strong>Meta:</strong>" tiver mais de 130 caracteres, REESCREVA-O com no máximo 130 caracteres (conte!), mantendo a frase-chave no início e a chamada pra ação.

Retorne APENAS o HTML corrigido, sem \`\`\`.

${html}` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 16384 }
    });
    const revised = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!revised) return html;
    const clean = revised.replace(/^```(?:html)?\n?|\n?```$/g, '').trim();
    // Sanidade: se a revisão encolheu demais (>30%) ou saiu truncada (FAQ cortado), mantém o original
    if (clean.length <= html.length * 0.7) return html;
    if (artigosHtmlCompleto(html) && !artigosHtmlCompleto(clean)) return html;
    return clean;
  } catch (e) {
    console.warn('[ARTIGOS-REVISAO] falhou, mantendo original:', e.message.slice(0, 100));
    return html;
  }
}

// Pós-processamento: trunca meta description pra <=130 chars (feedback Duda — LLM não conta chars direito)
function artigosForcarMetaDescription(html) {
  return html.replace(
    /(<strong>Meta:<\/strong>\s*)([^<]+)/i,
    (match, tag, meta) => {
      meta = meta.trim();
      if (meta.length <= 130) return tag + meta;
      let truncated = meta.slice(0, 127);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 80) truncated = truncated.slice(0, lastSpace);
      truncated = truncated.replace(/[,;:\s]+$/, '') + '...';
      console.log(`[META-DESC] truncada: ${meta.length} → ${truncated.length} chars`);
      return tag + truncated;
    }
  );
}

// Pós-processamento: injeta inline styles no FAQ pra sobreviver ao WordPress (sem CSS externo)
function artigosInjectFaqStyles(html) {
  const ds = 'background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;width:100%;box-sizing:border-box;';
  const ss = 'padding:18px 20px;font-weight:700;color:#1e293b;cursor:pointer;display:flex;justify-content:space-between;align-items:center;list-style:none;font-size:15px;outline:none;';
  const as = 'padding:16px 20px 18px;color:#475569;line-height:1.7;font-size:14px;border-top:1px solid #f1f5f9;font-weight:normal;';
  return html
    .replace(/<details\s+class="faq-item">/gi, `<details class="faq-item" style="${ds}">`)
    .replace(/(<details[^>]*faq-item[^>]*>)\s*<summary>/gi, `$1<summary style="${ss}">`)
    .replace(/<div\s+class="faq-answer">/gi, `<div class="faq-answer" style="${as}">`);
}

// Pool de ângulos temáticos — 4 são sorteados por rodada, quebrando os 4 baldes fixos que repetiam pauta
const STRATVIEW_ANGULOS = [
  'FinOps na prática: fatura OCI, custos ocultos, rightsizing e chargeback por área',
  'Migração pra OCI: lift-and-shift vs re-arquitetura, janelas de corte, riscos reais',
  'Segurança e compliance na nuvem Oracle: LGPD, soberania de dados, Zero Trust',
  'Alta disponibilidade e disaster recovery: RTO/RPO que o board entende',
  'Multicloud e lock-in: quando OCI convive com AWS/Azure e quando não vale',
  'Licenciamento Oracle e TCO: o que ninguém explica antes do contrato',
  'Observabilidade e performance: latência, sizing e gargalos em workloads Oracle',
  'Oracle HCM Redwood: o que muda de verdade na experiência do usuário',
  'People Analytics com Oracle HCM: métricas de RH que viram decisão de negócio',
  'Folha de pagamento e compliance trabalhista Brasil no Oracle HCM',
  'Agentic Apps no RH: casos concretos de agentes de IA em recrutamento e onboarding',
  'IA generativa com governança: vieses, auditoria e supervisão humana',
  'Gestão da mudança em projetos Oracle: por que projetos tecnicamente perfeitos falham',
  'Talent marketplace e skills-based organization com Oracle HCM',
  'Integrações Oracle: HCM + ERP + sistemas legados sem gambiarras',
  'Upgrade e releases trimestrais Oracle (25A/25B...): como absorver sem caos',
  'RH e TI dividindo o mesmo roadmap: orçamento, prioridades e atritos',
  'Employee experience além do app: o que os dados de uso do HCM revelam',
  'Automação de processos de RH: do formulário ao fluxo inteligente',
  'Shadow IT no RH: planilhas paralelas como sintoma de implementação ruim',
  'Sustentação pós-go-live: por que o go-live é o começo (AMS / Serviços Gerenciados)',
  'Benchmarks de mercado Brasil: cloud, RH tech e o que o C-Level está priorizando'
];

app.post('/api/stratview/ideias', async (req, res) => {
  try {
    // Memória anti-repetição: últimos títulos gerados entram no prompt como proibidos
    let jaGerados = '';
    try {
      const rows = db.prepare('SELECT title, keywords FROM stratview_articles ORDER BY generated_at DESC LIMIT 40').all();
      if (rows.length) jaGerados = `\nARTIGOS JÁ GERADOS (PROIBIDO repetir tema, ângulo ou título parecido — traga assuntos NOVOS):\n${rows.map(r => '- ' + r.title).join('\n')}\n`;
    } catch (e) { console.warn('[STRATVIEW-IDEIAS] histórico indisponível:', e.message.slice(0, 80)); }

    // Sorteia 6 ângulos candidatos da rodada (o modelo escolhe 4 conforme o que a pesquisa render)
    const angulos = [...STRATVIEW_ANGULOS].sort(() => Math.random() - 0.5).slice(0, 6);

    const prompt = `Você é o Diretor de Marketing de Conteúdo da Stratview (uma consultoria boutique líder em Oracle Cloud no Brasil, especializada em HCM, Inteligência Artificial e OCI).

Gere 4 ideias de artigos para o blog corporativo.

PESQUISA PROFUNDA OBRIGATÓRIA (use a busca do Google ANTES de propor qualquer ideia):
1. Novidades Oracle dos últimos 60 dias: releases (25A/25B/26A...), anúncios de OCI, Redwood, agentes de IA, eventos (Oracle CloudWorld, etc).
2. Notícias do mercado brasileiro: custos de nuvem, RH tech, IA nas empresas, regulação (LGPD, reforma trabalhista/tributária quando tocar TI/RH).
3. O que executivos estão buscando agora (tendências de busca reais).
CADA ideia deve nascer de um ACHADO REAL dessa pesquisa — nada de tema genérico atemporal. Registre o achado no campo "trendsInfo" (fato + por que agora).

ÂNGULOS SORTEADOS DESTA RODADA — escolha 4 dos 6, um por ideia (é PROIBIDO propor ideia fora destes ângulos):
${angulos.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Equilíbrio mínimo: pelo menos 1 ideia de infraestrutura/OCI e pelo menos 1 de HCM/pessoas.

DIRETRIZ ANTI-REPETIÇÃO: Não crie temas repetitivos entre si nem parecidos com os já gerados.
PROIBIDO o padrão "Substantivo X: N Estratégias/Dicas para Y" em mais de 1 dos 4 títulos — varie o formato (pergunta, afirmação contrária, causa-efeito, comparação).
${jaGerados}

OBRIGATÓRIO: Títulos e descrições em português do Brasil impecável — gramática, acentuação e concordância perfeitas.

REGRAS DE TÍTULO (SEO — cumprir TODAS):
- MÁXIMO 60 caracteres (pra não cortar na SERP do Google). Conte antes de responder.
- Palavra-chave principal no INÍCIO do título (primeiras 3-4 palavras).
- Concreto e específico: prefira número, benefício ou pergunta direta ("Como reduzir custos de OCI em 30%") a abstrações ("Desvendando o futuro da nuvem").
- No máximo UM dois-pontos. Proibido travessão decorativo, reticências e clickbait vazio ("Você não vai acreditar").
- Sem jargão interno da Stratview no título (CSS só se o artigo for sobre isso).

FRASE-CHAVE DE FOCO (campo "keyphrase"):
- Cada ideia tem UMA frase-chave de foco: 2-4 palavras, termo REAL que um executivo digitaria no Google (ex: "otimizar custos OCI", "Oracle HCM IA").
- O título DEVE começar com a frase-chave (ou variação mínima dela).
- Sem nome de marca na frase-chave (exceto Oracle/OCI quando for o assunto).

Retorne APENAS JSON válido neste formato:
{"ideas":[{"id":"string_unica","title":"título","keyphrase":"frase-chave 2-4 palavras","description":"resumo 1-2 frases","keywords":["5","palavras","chave","seo","aqui"],"score":9.5,"volume":"Alto","competition":"Média","trendsInfo":"insight trends max 20 palavras","imagePrompt":"prompt em inglês sem texto"}]}`;

    // google_search é incompatível com responseMimeType:json — deixar a IA retornar JSON como texto
    const { result } = await geminiPostComFallback({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.9 }
    });
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Sem resposta da IA');
    const clean = text.replace(/^```(?:json)?\n?|\n?```$/gm,'').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON não encontrado na resposta');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (e) { console.error('[ARTIGOS-IDEIAS]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/stratview/gerar', async (req, res) => {
  try {
    const { idea } = req.body;
    if (!idea || !idea.title) return res.status(400).json({ error: 'idea.title obrigatório' });
    const keyphrase = (idea.keyphrase || (idea.keywords || [])[0] || '').trim();
    // Sorteio de formato/abertura a cada geração — quebra o molde único entre artigos
    const formato = ARTIGOS_FORMATOS[Math.floor(Math.random() * ARTIGOS_FORMATOS.length)];
    const abertura = ARTIGOS_ABERTURAS[Math.floor(Math.random() * ARTIGOS_ABERTURAS.length)];

    // Detecta o serviço correto baseado no tema (feedback Alexandre — CSS NÃO é pra tudo)
    const temaLower = (idea.title + ' ' + (idea.description || '') + ' ' + (idea.keywords || []).join(' ')).toLowerCase();
    const isHCM = /\b(hcm|human capital|recrutamento|onboarding|folha|payroll|talent|rh\b|recursos humanos|people analytics|redwood|employee experience|gestão de pessoas|workforce)/i.test(temaLower);
    const isAMS = /\b(sustentação|sustentacao|pós-go-live|pos-go-live|maintenance|support|ams\b|evolução contínua|evoluç)/i.test(temaLower);
    const servicoCorreto = isHCM ? 'CSS' : isAMS ? 'AMS' : 'TECH';
    const servicoLabel = isHCM
      ? 'Client Side Services (CSS) — o modelo "guardião do cliente" em projetos Oracle HCM'
      : isAMS
      ? 'AMS (Application Maintenance & Support) — sustentação e evolução contínua de aplicações Oracle'
      : 'Serviços Gerenciados de TECH — gestão, otimização, operação e monitoramento de OCI, FinOps e CloudOps';
    const servicoAntiRegra = isHCM
      ? 'NÃO mencione TECH nem AMS — este artigo é sobre projetos HCM, o serviço é CSS.'
      : isAMS
      ? 'NÃO mencione CSS nem TECH — este artigo é sobre sustentação, o serviço é AMS.'
      : 'NÃO mencione CSS (Client Side Services) — CSS é EXCLUSIVO pra projetos de implementação HCM. Este artigo é sobre infraestrutura/OCI/FinOps/IA, o serviço correto é TECH.';

    const systemPrompt = `Você é um Consultor Estratégico Sênior da Stratview focado na tríade: Oracle HCM, IA (Agentic Apps) e OCI.

⚠️ SERVIÇO DESTE ARTIGO: **${servicoLabel}** (determinado pelo tema)
${servicoAntiRegra}

REGRA ABSOLUTA (feedback direto do Country Manager Alexandre Ormigo — INEGOCIÁVEL, violação = artigo reprovado):
A Stratview tem 3 serviços distintos. Cada artigo posiciona APENAS UM, conforme o tema:
1. Tema de OCI / FinOps / CloudOps / infraestrutura / IA / nuvem → **Serviços Gerenciados de TECH**
2. Tema de implementação / projetos Oracle HCM / advocacia do cliente → **Client Side Services (CSS)**
3. Tema de sustentação / pós-go-live / evolução de aplicações Oracle → **AMS**
O serviço deste artigo é **${servicoCorreto}**. Mencione SOMENTE ele. Se você mencionar CSS em um artigo que não é sobre HCM, o artigo será REPROVADO.`;

    const userPrompt = `Escreva um artigo premium (~1000-1200 palavras) para o blog da Stratview sobre: "${idea.title}".

FRASE-CHAVE DE FOCO: "${keyphrase}"
Esta é a frase que o Yoast SEO vai auditar. Regras OBRIGATÓRIAS sobre ela (correspondência EXATA, não só sinônimos):
- O primeiro parágrafo COMEÇA LITERALMENTE com a frase-chave: as primeiras palavras do texto são "${keyphrase ? keyphrase.charAt(0).toUpperCase() + keyphrase.slice(1) : '[frase-chave]'}..." (ex: "Otimizar custos OCI é fundamental para..."). Não vale no meio da frase.
- De 4 a 6 vezes no corpo do texto, distribuídas naturalmente (nunca 2x no mesmo parágrafo).
- SUBTÍTULOS (siga à risca): dos <h2> do corpo, PELO MENOS 3 contêm a frase-chave exata (ex: "Estratégia 1 para ${keyphrase || '[frase-chave]'}: automação"). Das 3 perguntas do FAQ, PELO MENOS 1 contém a frase-chave exata. Os demais subtítulos ficam SEM (over-optimization penaliza se for em todos).
- No Título SEO (no início), na Meta description (no início), no Alt text e no Slug.

FORMATO EDITORIAL DESTE ARTIGO (sorteado — siga-o, é o que diferencia este artigo dos demais do blog):
${formato}

ABERTURA: ${abertura}.

DIRETRIZ DE QUALIDADE E ESTILO (ANTI-REPETIÇÃO):
- Seja criativo, dinâmico e agradável de ler. Pareça um ser humano experiente.
- NÃO seja repetitivo. Evite usar os mesmos jargões em todos os parágrafos.
- Traga exemplos práticos, analogias de mercado e varie o vocabulário.
- Cada seção deve ter conteúdo DIFERENTE de verdade — se duas seções dizem o mesmo com palavras trocadas, corte uma e aprofunde a outra (números, trade-offs, exemplos).

${ARTIGOS_CLICHES_PROIBIDOS}

${ARTIGOS_REGRAS_ESTILO}

DIRETRIZES SEO/GEO (Google AI Optimization):
1. Perspectiva Exclusiva: experiência em primeira mão. Fuja do senso comum. Traga a visão especialista da Stratview.
2. HTML Semântico Claro: use <h1>, <h2> e <h3> claramente hierarquizados.
3. Pessoas em 1º Lugar: escreva para líderes reais (C-Level). Fluência e utilidade.

REGRAS DE TÍTULO (SEO):
- <h1> com NO MÁXIMO 60 caracteres, frase-chave nas primeiras 3-4 palavras.
- Se o tema recebido for longo demais, REESCREVA o título pra caber em 60 caracteres sem perder a frase-chave.
- Concreto e específico (número, benefício ou pergunta direta). No máximo um dois-pontos, sem clickbait.
- <h2>/<h3> também curtos (até 8 palavras), descritivos.

LINKS (obrigatório — Yoast exige internos E externos; use SOMENTE as URLs desta lista, não invente outras):
- 2 links internos no corpo, escolhidos pelo tema:
  · CSS (projetos HCM) → https://stratview.com.br/project/client-side-services-css/
  · Oracle HCM → https://stratview.com.br/oracle-fusion-cloud-hcm/
  · OCI → https://stratview.com.br/oracle-cloud-infrastructure-oci/
  · Gestão de nuvem / Serviços Gerenciados TECH → https://stratview.com.br/cloudops/
  · Sustentação AMS → https://stratview.com.br/project/application-maintenance-support-ams/
  · FinOps → https://stratview.com.br/finops/
  · IA/ML → https://stratview.com.br/artificial-intelligence-e-machine-learning/
- CTA final SEMPRE pra <a href="https://stratview.com.br/contato/">fale com a Stratview</a>.
- 1 link externo de autoridade com target="_blank" rel="noopener": https://www.oracle.com/br/cloud/ (OCI) ou https://www.oracle.com/br/human-capital-management/ (HCM).
- Âncoras descritivas (nunca "clique aqui").

ESTRUTURA HTML OBRIGATÓRIA (siga o padrão editorial do blog da Stratview):
1. Bloco de meta tags:
<div class="seo-meta"><p><strong>Frase-chave de foco:</strong> ${keyphrase || '[frase-chave 2-4 palavras]'}</p><p><strong>Título SEO:</strong> [máx 60 chars, frase-chave no início]</p><p><strong>Slug:</strong> [slug curto com a frase-chave, sem stopwords]</p><p><strong>Meta:</strong> [de 100 a 130 caracteres — escreva CURTO, 2 frases no máximo — COMEÇANDO com a frase-chave + chamada pra ação]</p><p><strong>Alt text:</strong> [descrição da imagem contendo a frase-chave]</p></div>

2. Título em <h1>. Introdução: NO MÁXIMO 3 parágrafos antes do primeiro <h2> (o Yoast conta a introdução como seção — se passar de 250 palavras, quebra com <h2>). Primeiro parágrafo em <p class="lead"> abrindo com a frase-chave.
3. 1 <blockquote> de tese/citação de marca logo na introdução ou primeira seção (1-2 frases fortes).
4. Corpo: 4 a 5 seções <h2> (use <h3> pra subdividir quando natural). NENHUMA seção com mais de 200 palavras sem novo <h2>/<h3>.
5. Penúltima seção: o diferencial Stratview conectado ao tema, posicionando EXCLUSIVAMENTE o serviço **${servicoCorreto}** (${servicoLabel}). ${servicoAntiRegra}
6. Parágrafo de CTA convidando o leitor a falar com a Stratview (link de contato acima).
7. FAQ ao final, em <h2>Perguntas Frequentes (FAQ)</h2>, com EXATAMENTE 3 perguntas (pelo menos 1 contendo a frase-chave):
<details class="faq-item"><summary>[PERGUNTA]</summary><div class="faq-answer">[RESPOSTA COM EXPERTISE]</div></details>

⚠️ FAQ — RESPOSTAS COMPLETAS (CRÍTICO): cada resposta do FAQ tem de 2 a 4 frases COMPLETAS, terminadas com ponto final. É PROIBIDO cortar uma resposta no meio. Feche TODAS as tags HTML (</div></details>) — o HTML precisa terminar completo e válido.

Retorne APENAS HTML puro. Sem \`\`\`html.`;

    // Até 2 tentativas — se o FAQ vier cortado (limite de tokens/thinking do Flash), regenera
    let html = null;
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const { result } = await geminiPostComFallback({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 16384, temperature: 0.95, topP: 0.95 }
      });
      const cand = result.candidates?.[0];
      let out = cand?.content?.parts?.[0]?.text;
      if (!out) continue;
      out = out.replace(/^```(?:html)?\n?|\n?```$/g,'').trim();
      if (artigosHtmlCompleto(out) && cand.finishReason !== 'MAX_TOKENS') { html = out; break; }
      console.warn(`[ARTIGOS-GERAR] tentativa ${tentativa} truncada (finishReason=${cand.finishReason}) — ${tentativa < 2 ? 'regenerando' : 'desistindo'}`);
    }
    if (!html) throw new Error('A IA retornou o artigo incompleto (FAQ cortado) 2 vezes. Tente gerar de novo.');
    html = await artigosRevisarPortugues(html);
    html = artigosForcarMetaDescription(html);
    html = artigosInjectFaqStyles(html);
    res.json({ html });
  } catch (e) { console.error('[ARTIGOS-GERAR]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/stratview/imagem', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt obrigatório' });

    // Composição sorteada a cada geração — quebra a "mesma imagem sempre" e segue a
    // direção de arte das referências aprovadas (navy profundo + luz ciano + hologramas)
    const composicoesPorTema = {
      oci: [
        'A vast dark server room with rows of glowing blue racks, a transparent holographic cloud structure hovering in the center emitting cyan light beams upward, cinematic perspective.',
        'Aerial view of a futuristic cloud data center with interconnected translucent spheres glowing in blue and cyan, thin golden network lines linking them, deep navy background.',
        'A luminous digital globe made of circuit traces floating above a dark reflective floor, orbited by glowing infrastructure icons — server, shield, cost meter — deep blue palette with cyan accents.'
      ],
      hcm: [
        'A stylized team of professional silhouettes connected by glowing talent-network lines, warm amber highlights on each person, a large holographic org chart floating behind them, dark navy background.',
        'An elegant holographic employee dashboard showing people metrics and engagement graphs, floating above a modern executive desk, warm amber and cool blue dual-tone lighting.',
        'Abstract visualization of a talent pipeline — luminous human silhouettes flowing through transparent glass stages, each stage glowing warmer, dark corporate blue background.'
      ],
      ia: [
        'A glowing neural network structure with pulsing nodes and synaptic connections, a professional hand reaching toward it, deep navy background with electric blue and subtle amber sparks.',
        'An autonomous AI agent represented as a luminous geometric brain, surrounded by orbiting task icons — document, chart, gear, calendar — dark premium tech environment.',
        'Split scene: on the left a traditional office with warm amber light, on the right a digital twin made of glowing blue particles — a bridge of light connecting both halves.'
      ],
      geral: [
        'Close-up of professional hands interacting with floating translucent holographic charts and KPI cards above a sleek desk, dark blue ambience with cyan rim light, blurred executive office behind.',
        'A luminous cloud made of glowing particles hovering above a dark reflective surface, orbited by thin holographic rings and floating glass icons, server bokeh lights in the dark background.',
        'Isometric miniature smart city built from circuit boards and glowing blue traces, with a bright vertical beam of light rising into a stylized particle cloud, dark navy atmosphere.'
      ]
    };
    const promptLower = prompt.toLowerCase();
    const temaImg = /\b(oci|cloud|infra|nuvem|finops|cloudops|servidor|migra)/i.test(promptLower) ? 'oci'
      : /\b(hcm|rh\b|talent|recrutamento|folha|payroll|pessoas|employee|workforce|onboarding)/i.test(promptLower) ? 'hcm'
      : /\b(ia\b|intelig[eê]ncia artificial|agentic|machine learning|ml\b|automa[çc])/i.test(promptLower) ? 'ia'
      : 'geral';
    const composicoes = composicoesPorTema[temaImg];
    // A cena é escrita pelo modelo de texto A PARTIR DO TEMA do artigo — antes a composição
    // fixa sorteada ditava a imagem inteira e o tema era ignorado (todas as capas saíam iguais)
    let composicao = null;
    try {
      const { result } = await geminiPostComFallback({
        contents: [{ parts: [{ text: `Write ONE scene description (in English, 40-70 words) for a premium B2B editorial illustration about this article:
${prompt}

Rules: the scene must VISUALLY represent this specific topic through a concrete visual metaphor (objects, environments and elements drawn from the subject itself — not generic office imagery). Corporate technology setting, no identifiable faces, no text, no logos. Answer with ONLY the scene description.` }] }],
        generationConfig: { temperature: 1.1, maxOutputTokens: 1024 }
      });
      const cena = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (cena && cena.length > 40) composicao = cena;
    } catch (e) { console.warn('[ARTIGOS-IMAGEM] cena via texto falhou, usando composição fixa:', e.message.slice(0, 80)); }
    if (!composicao) composicao = composicoes[Math.floor(Math.random() * composicoes.length)];

    const enhancedPrompt = `Premium enterprise-technology editorial illustration for a business blog article about: ${prompt}

SCENE (the image must depict this):
${composicao}

ART DIRECTION — follow exactly:
- Style: high-end digital illustration / concept art (NOT stock photography), cinematic lighting, ultra-detailed, subtle film grain, professional editorial quality
- Palette: deep navy blue background (#0A1230 to #1a237e), glowing cyan and electric-blue light accents, luminous particle networks and thin connection lines; a restrained warm amber/orange accent is allowed only as secondary highlight
- Mood: sophisticated, futuristic, trustworthy — enterprise cloud & AI consulting
- Format: 16:9 landscape, generous negative space, strong focal point
- NO text, NO words, NO letters, NO numbers, NO logos, NO watermarks, NO UI labels
- NO nature landscapes, NO cartoon style, NO clip-art, NO plastic 3D render look`;

    const imageModels = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'];
    for (const model of imageModels) {
      try {
        const result = await geminiPost(model, {
          contents: [{ parts: [{ text: enhancedPrompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        });
        const base64 = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (base64) return res.json({ base64, model });
      } catch (e) { console.warn(`[ARTIGOS-IMAGEM] ${model} falhou:`, e.message.slice(0,80)); }
    }

    // Fallback: Imagen 4.0 via predict
    try {
      const result = await imagenPredict('imagen-4.0-fast-generate-001', { instances: [{ prompt: enhancedPrompt }], parameters: { sampleCount: 1 } });
      if (result.predictions?.[0]?.bytesBase64Encoded)
        return res.json({ base64: result.predictions[0].bytesBase64Encoded, model: 'imagen-4.0-fast' });
    } catch (e) { console.warn('[ARTIGOS-IMAGEM] Imagen falhou:', e.message.slice(0,80)); }

    // Fallback 2: Pollinations (Flux) — gratuito, sem chave. Prompt CURTO (Flux ignora prompts longos)
    try {
      const pollinationsPrompt = `${composicao}. Style: premium digital illustration, deep navy blue background, glowing cyan accents, cinematic lighting, 16:9, no text, no logos, no watermarks, ultra detailed`;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 90000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(pollinationsPrompt.slice(0, 800))}?width=1200&height=630&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e9)}`;
      const r = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 10000) return res.json({ base64: buf.toString('base64'), model: 'pollinations-flux' });
      }
      console.warn('[ARTIGOS-IMAGEM] Pollinations respondeu', r.status);
    } catch (e) { console.warn('[ARTIGOS-IMAGEM] Pollinations falhou:', e.message.slice(0,80)); }

    throw new Error('Todos os modelos de imagem indisponíveis');
  } catch (e) { console.error('[ARTIGOS-IMAGEM]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/stratview/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text obrigatório' });
    const result = await geminiPost('gemini-2.5-flash-preview-tts', {
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } } }
    });
    const audioBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) throw new Error('Áudio não retornado');
    res.json({ audioBase64, sampleRate: 24000 });
  } catch (e) { console.error('[ARTIGOS-TTS]', e.message); res.status(500).json({ error: e.message }); }
});

// POST /api/stratview/historico — salva artigo gerado
app.post('/api/stratview/historico', (req, res) => {
  try {
    const { id, title, description, keywords, content, persona } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'id e title obrigatórios' });
    db.prepare(`INSERT OR REPLACE INTO stratview_articles (id, title, description, keywords, content, persona, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'gerado', datetime('now'))`)
      .run(id, title, description || '', JSON.stringify(keywords || []), content || '', persona || 'Geral');
    res.json({ ok: true });
  } catch (e) { console.error('[ARTIGOS-HIST-POST]', e.message); res.status(500).json({ error: e.message }); }
});

// PATCH /api/stratview/historico/:id — marca como publicado
app.patch('/api/stratview/historico/:id', (req, res) => {
  try {
    const result = db.prepare(`UPDATE stratview_articles SET status = 'publicado', published_at = datetime('now') WHERE id = ?`)
      .run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'não encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error('[ARTIGOS-HIST-PATCH]', e.message); res.status(500).json({ error: e.message }); }
});

// GET /api/stratview/historico — lista histórico (últimos 50)
app.get('/api/stratview/historico', (req, res) => {
  try {
    const rows = db.prepare(`SELECT id, title, description, keywords, content, persona, status, generated_at, published_at
      FROM stratview_articles ORDER BY generated_at DESC LIMIT 50`).all();
    res.json(rows.map(r => ({ ...r, keywords: JSON.parse(r.keywords || '[]') })));
  } catch (e) { console.error('[ARTIGOS-HIST-GET]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/stratview/refinar', async (req, res) => {
  try {
    const { content, persona } = req.body;
    if (!content || !persona) return res.status(400).json({ error: 'content e persona obrigatórios' });
    const ctx = persona === 'CIO'
      ? 'Foque agressivamente em infraestrutura (OCI), segurança, mitigação de riscos técnicos, latência, e transição de Opex vs Capex.'
      : 'Foque agressivamente na jornada do colaborador, modernização do RH com HCM Redwood, retenção de talentos e eliminação de burocracia com IA.';
    const prompt = `Reescreva o artigo para a perspectiva de um ${persona}.
${ctx}

QUALIDADE: Não seja repetitivo. Exemplos concretos do mercado brasileiro e do ecossistema Oracle. Tom de consultor experiente. Mantenha o formato editorial do artigo original (não reescreva pro molde genérico).

${ARTIGOS_CLICHES_PROIBIDOS}

${ARTIGOS_REGRAS_ESTILO}

ESTRUTURA: Mantenha div.seo-meta, h1, h2, h3, blockquote e obrigatoriamente o FAQ com <details class="faq-item"> e <summary> no final.
TÍTULO: se ajustar o <h1> pra persona, mantenha NO MÁXIMO 60 caracteres, keyword no início, sem clickbait. Atualize o "Título SEO" do seo-meta junto.
SEO (NÃO REGREDIR): preserve a frase-chave de foco do seo-meta com a MESMA densidade (4-6 ocorrências exatas no corpo, 1ª frase do 1º parágrafo, 2 subtítulos). Preserve TODOS os links <a> internos e externos. Nenhuma seção pode ficar com mais de 200 palavras sem <h2>/<h3>.

Artigo original:
${content}`;
    const { result } = await geminiPostComFallback({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 }
    });
    let html = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!html) throw new Error('Sem resposta');
    html = html.replace(/^```(?:html)?\n?|\n?```$/g,'').trim();
    if (!artigosHtmlCompleto(html)) throw new Error('O refino retornou o artigo incompleto (FAQ cortado). Tente refinar de novo.');
    html = await artigosRevisarPortugues(html);
    html = artigosForcarMetaDescription(html);
    html = artigosInjectFaqStyles(html);
    res.json({ html });
  } catch (e) { console.error('[ARTIGOS-REFINAR]', e.message); res.status(500).json({ error: e.message }); }
});

// ── ROTAS DO OFFICE ENGINE ────────────────────────────────────────────────────
const OPTIMIZER_PATH = path.join(__dirname, 'public/optimizer.html');
app.get('/optimizer', (req, res) => res.sendFile(OPTIMIZER_PATH));
app.get('/optimizer-v2', (req, res) => res.sendFile(path.join(__dirname, 'public/optimizer-v2.html')));

// SPRINT 9.1 — serve o template canônico do prompt (fonte da verdade no vault)
app.get('/api/optimizer/template', (req, res) => {
  try {
    const tplPath = path.join(__dirname, 'vault/00-contexto/prompts/kit-voice-template.md');
    if (!fs.existsSync(tplPath)) return res.status(404).type('text/plain').send('Template não encontrado em ' + tplPath);
    res.type('text/markdown; charset=utf-8').sendFile(tplPath);
  } catch (e) {
    res.status(500).type('text/plain').send('Erro: ' + e.message);
  }
});

// V2 — framework findskill.ai
app.get('/api/optimizer/template-v2', (req, res) => {
  try {
    const tplPath = path.join(__dirname, 'vault/00-contexto/prompts/kit-voice-template-v2.md');
    if (!fs.existsSync(tplPath)) return res.status(404).type('text/plain').send('Template V2 não encontrado em ' + tplPath);
    res.type('text/markdown; charset=utf-8').sendFile(tplPath);
  } catch (e) {
    res.status(500).type('text/plain').send('Erro: ' + e.message);
  }
});

// Páginas v3.0 — servem do public/ em qualquer ambiente
const VOICES_PATH     = path.join(__dirname, 'public/voices.html');
const SEJA_VOICE_PATH = path.join(__dirname, 'public/seja-voice.html');
const CHANGELOG_PATH  = path.join(__dirname, 'public/changelog.html');
app.get('/painel',     (req, res) => res.redirect(301, '/area/brand'));
// /voices/painel é o caminho canônico (Painel da Duda é parte do projeto Voices) —
// redireciona pro módulo de Brand Experience.
app.get('/voices/painel', (req, res) => res.redirect(301, '/area/brand'));
app.get('/voices',     (req, res) => res.sendFile(VOICES_PATH));
app.get('/seja-voice', (req, res) => res.sendFile(SEJA_VOICE_PATH));
app.get('/changelog',  (req, res) => res.sendFile(CHANGELOG_PATH));

// /api/version — single source of truth (lê current de public/api/changelog.json)
// nav/footer fetcham esse endpoint em runtime para evitar drift de versão.
app.get('/api/version', (req, res) => {
  try {
    const cl = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/api/changelog.json'), 'utf8'));
    // Diagnóstico de persistência (D1): volume Railway montado em DATA_DIR?
    const usandoVolume = !IS_LOCAL_DEV && !!process.env.DATA_DIR && process.env.DATA_DIR.startsWith('/');
    res.json({
      current: cl.current, atualizado_em: cl.atualizado_em,
      persistencia: {
        db_path: DB_PATH,
        data_dir: process.env.DATA_DIR || null,
        volume_ativo: usandoVolume,
        status: IS_LOCAL_DEV ? 'local-dev' : (usandoVolume ? 'volume-persistente' : 'efemero-reseta-no-deploy'),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// /api/translate — proxy pro LibreTranslate self-host + cache persistente
// Env: LIBRETRANSLATE_URL (ex: https://libretranslate.up.railway.app)
//      LIBRETRANSLATE_API_KEY (opcional)
// Sem URL configurada → responde { disabled:true } e o cliente cai no dicionário.
// Cache: memória + arquivo TRANSLATE_CACHE_PATH (sobrevive deploy via volume).
// ════════════════════════════════════════════════════════════════════════════
const LIBRETRANSLATE_URL = (process.env.LIBRETRANSLATE_URL || '').replace(/\/+$/, '');
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || '';
const TRANSLATE_CACHE_PATH = path.join(
  (!IS_LOCAL_DEV && process.env.DATA_DIR && process.env.DATA_DIR.startsWith('/')) ? process.env.DATA_DIR : __dirname,
  'translate-cache.json'
);
let TRANSLATE_CACHE = {};
try { if (fs.existsSync(TRANSLATE_CACHE_PATH)) TRANSLATE_CACHE = JSON.parse(fs.readFileSync(TRANSLATE_CACHE_PATH, 'utf8')) || {}; } catch (e) { TRANSLATE_CACHE = {}; }
let _translateCacheDirty = false;
setInterval(() => {
  if (!_translateCacheDirty) return;
  _translateCacheDirty = false;
  try { fs.writeFileSync(TRANSLATE_CACHE_PATH, JSON.stringify(TRANSLATE_CACHE), 'utf8'); } catch (e) {}
}, 5000);

app.get('/api/translate/status', (req, res) => {
  res.json({
    enabled: !!LIBRETRANSLATE_URL,
    url: LIBRETRANSLATE_URL ? LIBRETRANSLATE_URL.replace(/^(https?:\/\/[^/]+).*/, '$1') : null,
    cache_entries: Object.keys(TRANSLATE_CACHE).length,
  });
});

app.post('/api/translate', async (req, res) => {
  try {
    const body = req.body || {};
    const target = String(body.target || '').slice(0, 5);
    const source = String(body.source || 'pt').slice(0, 5);
    if (!['en', 'es', 'pt'].includes(target)) return res.status(400).json({ error: 'target inválido (en|es|pt)' });
    let items = body.q;
    if (typeof items === 'string') items = [items];
    if (!Array.isArray(items)) return res.status(400).json({ error: 'q deve ser string ou array' });
    items = items.slice(0, 200).map(s => String(s == null ? '' : s));

    if (target === source || target === 'pt') {
      return res.json({ translations: items, cached: items.length, fetched: 0 });
    }

    const out = new Array(items.length);
    const toFetch = []; const toFetchIdx = [];
    for (let i = 0; i < items.length; i++) {
      const key = target + ' ' + items[i];
      if (TRANSLATE_CACHE[key] != null) { out[i] = TRANSLATE_CACHE[key]; }
      else if (!items[i].trim()) { out[i] = items[i]; }
      else { toFetch.push(items[i]); toFetchIdx.push(i); }
    }

    if (toFetch.length && !LIBRETRANSLATE_URL) {
      // Sem backend: devolve original nos misses + sinaliza disabled
      for (let j = 0; j < toFetch.length; j++) out[toFetchIdx[j]] = toFetch[j];
      return res.json({ translations: out, disabled: true, cached: items.length - toFetch.length, fetched: 0 });
    }

    if (toFetch.length) {
      const payload = { q: toFetch, source, target, format: 'text' };
      if (LIBRETRANSLATE_API_KEY) payload.api_key = LIBRETRANSLATE_API_KEY;
      const r = await fetch(LIBRETRANSLATE_URL + '/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        for (let j = 0; j < toFetch.length; j++) out[toFetchIdx[j]] = toFetch[j];
        return res.status(502).json({ error: 'LibreTranslate ' + r.status, detail: txt.slice(0, 200), translations: out });
      }
      const data = await r.json();
      // LibreTranslate batch retorna { translatedText: [...] } ou objeto único
      let translated = data.translatedText;
      if (!Array.isArray(translated)) translated = [translated];
      for (let j = 0; j < toFetch.length; j++) {
        const t = translated[j] != null ? translated[j] : toFetch[j];
        out[toFetchIdx[j]] = t;
        TRANSLATE_CACHE[target + ' ' + toFetch[j]] = t;
      }
      _translateCacheDirty = true;
    }

    res.json({ translations: out, cached: items.length - toFetch.length, fetched: toFetch.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// /api/freshness — idade de cada dataset (Regra 7 automática: chips stale na home)
// JSONs estáticos: mtime do arquivo. Tabelas SQLite: MAX(synced_at/updated_at).
app.get('/api/freshness', (req, res) => {
  try {
    const hoje = Date.now();
    const out = [];
    const addFile = (id, label, file, staleDias) => {
      try {
        const fp = path.join(__dirname, 'public/api', file);
        // mtime reseta a cada deploy no Railway — preferir campo interno do JSON
        let ts = null;
        try {
          const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
          const campo = j.atualizado_em || j.gerado_em || j.ultima_sync_ts || j.ultima_sync;
          if (campo) ts = Date.parse(String(campo).length === 10 ? campo + 'T12:00:00Z' : campo);
        } catch (e2) {}
        if (!ts || isNaN(ts)) ts = fs.statSync(fp).mtimeMs;
        const dias = Math.floor((hoje - ts) / 864e5);
        out.push({ id, label, fonte: 'json', atualizado: new Date(ts).toISOString().slice(0,10), dias, stale: dias > staleDias });
      } catch (e) { out.push({ id, label, fonte: 'json', atualizado: null, dias: null, stale: true }); }
    };
    const addTable = (id, label, sql, staleDias) => {
      try {
        const r = db.prepare(sql).get();
        const ts = r && r.s ? Date.parse(r.s.replace(' ', 'T') + 'Z') : null;
        const dias = ts ? Math.floor((hoje - ts) / 864e5) : null;
        out.push({ id, label, fonte: 'sqlite', atualizado: ts ? new Date(ts).toISOString().slice(0,10) : null, dias, stale: dias == null || dias > staleDias });
      } catch (e) { out.push({ id, label, fonte: 'sqlite', atualizado: null, dias: null, stale: true }); }
    };
    addFile('linkedin', 'LinkedIn', 'linkedin-historical.json', 35);
    addFile('ga4', 'GA4 Site', 'ga4-snapshot.json', 35);
    addFile('apollo', 'Apollo', 'pipeline-snapshot.json', 3);
    addFile('df', 'Dev Funds', 'development-funds.json', 30);
    addFile('voices', 'Voices', 'voices.json', 45);
    addFile('events', 'Eventos', 'events.json', 60);
    addTable('zoho', 'Zoho CRM', 'SELECT MAX(synced_at) AS s FROM zoho_deals', 45);
    addTable('sap4me', 'SAP 4 ME', 'SELECT MAX(synced_at) AS s FROM clientes_sap_4me', 45);
    addTable('cases', 'Cases CS', 'SELECT MAX(synced_at) AS s FROM cs_clientes', 7);
    addTable('calendar', 'Calendário', 'SELECT MAX(synced_at) AS s FROM editorial_calendar', 30);
    res.json({ gerado_em: new Date().toISOString(), datasets: out, stale_count: out.filter(d => d.stale).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/planilhas', (req, res) => res.sendFile(path.join(__dirname, 'public/planilhas.html')));

// ════════════════════════════════════════════════════════════════════════════
// REPOSITÓRIO DE IDEIAS DE MARKETING — mural criativo + replicação na planilha
// Replicação SharePoint via Power Automate webhook (env IDEIAS_WEBHOOK_URL).
// Sem webhook → idea fica local (sincronizada=0), ⏳ aguarda integração.
// ════════════════════════════════════════════════════════════════════════════
const IDEIAS_WEBHOOK_URL = process.env.IDEIAS_WEBHOOK_URL || '';

app.get('/ideias', (req, res) => res.sendFile(path.join(__dirname, 'public/ideias.html')));

app.get('/api/ideias', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ideias_mkt ORDER BY votos DESC, created_at DESC').all();
    res.json({ total: rows.length, sync_enabled: !!IDEIAS_WEBHOOK_URL, ideias: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ideias', async (req, res) => {
  try {
    const b = req.body || {};
    const titulo = String(b.titulo || '').trim().slice(0, 160);
    if (!titulo) return res.status(400).json({ success: false, error: 'título obrigatório' });
    const clean = (v, def, max) => String(v == null ? def : v).trim().slice(0, max || 60);
    const row = {
      titulo,
      descricao: String(b.descricao || '').trim().slice(0, 2000),
      categoria: clean(b.categoria, 'geral'),
      autor: clean(b.autor, 'Anônimo', 60),
      impacto: ['baixo','medio','alto','moonshot'].includes(b.impacto) ? b.impacto : 'medio',
      esforco: ['baixo','medio','alto'].includes(b.esforco) ? b.esforco : 'medio',
      emoji: clean(b.emoji, '💡', 8),
      cor: /^#[0-9a-fA-F]{6}$/.test(b.cor || '') ? b.cor : '#fbbf24',
    };
    const info = db.prepare(`INSERT INTO ideias_mkt (titulo,descricao,categoria,autor,impacto,esforco,emoji,cor)
      VALUES (@titulo,@descricao,@categoria,@autor,@impacto,@esforco,@emoji,@cor)`).run(row);
    const id = info.lastInsertRowid;

    // Replica na planilha via Power Automate (fire-and-forget)
    let sincronizada = 0;
    if (IDEIAS_WEBHOOK_URL) {
      try {
        const r = await fetch(IDEIAS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...row, data: new Date().toISOString() }),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) { sincronizada = 1; db.prepare('UPDATE ideias_mkt SET sincronizada=1 WHERE id=?').run(id); }
      } catch (e) { /* webhook caiu — fica local, sincronizada=0 */ }
    }
    const ideia = db.prepare('SELECT * FROM ideias_mkt WHERE id=?').get(id);
    res.json({ success: true, ideia, sincronizada: !!sincronizada, sync_enabled: !!IDEIAS_WEBHOOK_URL });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/ideias/:id/voto', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dir = req.body && req.body.dir === 'down' ? -1 : 1;
    const r = db.prepare('UPDATE ideias_mkt SET votos = MAX(0, votos + ?) WHERE id=?').run(dir, id);
    if (!r.changes) return res.status(404).json({ success: false, error: 'ideia não encontrada' });
    const ideia = db.prepare('SELECT id, votos FROM ideias_mkt WHERE id=?').get(id);
    res.json({ success: true, votos: ideia.votos });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── PLANILHAS REGISTRY — todas as XLSX/XLS como API em tempo real ────────────
// Le do arquivo origem (Desktop/OneDrive/vault) on-demand · cache invalidado por mtime
// Cada planilha tem slug + lista de paths (primeiro que existir vence)
const PLANILHAS_REGISTRY_PATH = path.join(__dirname, 'vault/00-contexto/planilhas-registry.json');
const _planilhasCache = new Map(); // key: path · val: { mtime, json, parsedAt }

function _loadPlanilhasRegistry() {
  try { return JSON.parse(fs.readFileSync(PLANILHAS_REGISTRY_PATH, 'utf8')); }
  catch (e) { return { planilhas: [] }; }
}

function _resolvePath(paths) {
  if (!Array.isArray(paths)) return null;
  for (const p of paths) { if (fs.existsSync(p)) return p; }
  return null;
}

function _parsePlanilha(filePath, sheetIdx) {
  const XLSX = IS_LOCAL_DEV ? require(localModules + '/xlsx') : require('xlsx');
  const st = fs.statSync(filePath);
  const cached = _planilhasCache.get(filePath);
  if (cached && cached.mtime === st.mtimeMs) return cached.json;
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[sheetIdx || 0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const json = {
    sheet: sheetName,
    sheets_disponiveis: wb.SheetNames,
    total_linhas: rows.length,
    rows,
    arquivo: filePath,
    modificado_em: st.mtime,
    parseado_em: new Date().toISOString()
  };
  _planilhasCache.set(filePath, { mtime: st.mtimeMs, json, parsedAt: Date.now() });
  return json;
}

// GET /api/planilhas — lista todas + status de cada uma
app.get('/api/planilhas', (req, res) => {
  try {
    const reg = _loadPlanilhasRegistry();
    const status = reg.planilhas.map(p => {
      const resolved = _resolvePath(p.paths);
      const exists = !!resolved;
      let mtime = null, size = null;
      if (exists) { const st = fs.statSync(resolved); mtime = st.mtime; size = st.size; }
      return {
        slug: p.slug, nome: p.nome, dona: p.dona, categoria: p.categoria,
        descricao: p.descricao, endpoint: '/api/planilhas/' + p.slug,
        endpoint_alias: p.endpoint_alias || null,
        status: exists ? 'ok' : 'fora-do-ar',
        arquivo_resolvido: resolved,
        paths_tentados: p.paths,
        modificado_em: mtime, tamanho_bytes: size
      };
    });
    res.json({
      total: status.length,
      online: status.filter(s => s.status === 'ok').length,
      offline: status.filter(s => s.status === 'fora-do-ar').length,
      planilhas: status,
      obs: 'Cache invalidado automaticamente quando mtime do arquivo muda. Edita o XLSX no Desktop/OneDrive → proxima request ja pega versao nova.'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/planilhas/:slug — retorna o JSON parsed da planilha
app.get('/api/planilhas/:slug', (req, res) => {
  try {
    const reg = _loadPlanilhasRegistry();
    const p = reg.planilhas.find(x => x.slug === req.params.slug);
    if (!p) return res.status(404).json({ error: 'planilha nao encontrada no registry', slug: req.params.slug });
    const resolved = _resolvePath(p.paths);
    if (!resolved) return res.status(404).json({ error: 'arquivo fora-do-ar', slug: p.slug, paths_tentados: p.paths });
    const sheetParam = req.query.sheet != null ? parseInt(req.query.sheet, 10) : (p.sheet || 0);
    const data = _parsePlanilha(resolved, sheetParam);
    res.json({ slug: p.slug, nome: p.nome, dona: p.dona, ...data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/sprints — alias historico para /api/planilhas/roadmap-pm (mantem compat /changelog)
app.get('/api/sprints', (req, res) => {
  try {
    const XLSX = IS_LOCAL_DEV ? require(localModules + '/xlsx') : require('xlsx');
    const sprintsPath = path.join(__dirname, 'public/api/sprints-pm.xlsx');
    const wb = XLSX.readFile(sprintsPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let headerIdx = rows.findIndex(r => String(r[0] || '').trim() === '#');
    if (headerIdx < 0) headerIdx = 1;
    const headers = (rows[headerIdx] || []).map(h => String(h || '').trim());
    const sprints = rows.slice(headerIdx + 1)
      .filter(r => r[0] && String(r[0]).trim())
      .map(r => Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), String(r[i] || '').trim()])));
    res.json({
      fonte: 'planilha PM do Ruda (atualizada via commit)',
      atualizado_em: fs.statSync(sprintsPath).mtime,
      total: sprints.length,
      sprints
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MODULOS POR AREA (v0.7.x — nav reorganizado por dona) ───────────────────
// /area/<id> -> template unico area.html (le /api/areas.json por id)
const AREA_PATH = path.join(__dirname, 'public/area.html');
// Área da Diretoria (big bosses) — página dedicada, ANTES do /area/:id genérico.
const DIRETORIA_HTML = path.join(__dirname, 'public/diretoria.html');
app.get('/area/diretoria', (req, res) => res.sendFile(DIRETORIA_HTML));
app.get('/diretoria',      (req, res) => res.redirect('/area/diretoria'));
app.get('/area', (req, res) => res.sendFile(AREA_PATH));
app.get('/area/:id', (req, res) => res.sendFile(AREA_PATH));

const AGENTES_PATH = path.join(__dirname, 'public/agentes.html');
const AGENTE_PATH  = path.join(__dirname, 'public/agente.html');
app.get('/agentes', (req, res) => res.sendFile(AGENTES_PATH));
app.get('/agentes/:slug', (req, res) => res.sendFile(AGENTE_PATH));
app.get('/war-room', (req, res) => res.sendFile(path.join(__dirname, 'public/war-room.html')));

function getWorkspaceDir(slug) {
  const possiblePaths = [
    path.join(__dirname, 'vault/workspaces', slug),
    path.join(__dirname, 'vault/workspaces/01-orquestrador', slug),
    path.join(__dirname, 'vault/workspaces/02-areas', slug),
    path.join(__dirname, 'vault/workspaces/03-executores', slug),
    path.join(__dirname, 'vault/workspaces/04-pipeline-conteudo', slug)
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }
  return path.join(__dirname, 'vault/workspaces', slug);
}

// API: resumo de contadores de TODOS os workspaces (pra /agentes mostrar inbox count)
app.get('/api/agentes/_counters', (req, res) => {
  try {
    const wsRoot = path.join(__dirname, 'vault/workspaces');
    if (!fs.existsSync(wsRoot)) return res.json({});
    const out = {};
    const scanDir = (dir) => {
      fs.readdirSync(dir).forEach(name => {
        const fullPath = path.join(dir, name);
        if (!fs.statSync(fullPath).isDirectory()) return;
        const hasInbox = fs.existsSync(path.join(fullPath, 'inbox'));
        const hasOutbox = fs.existsSync(path.join(fullPath, 'outbox'));
        if (hasInbox || hasOutbox) {
          const count = (sub) => {
            const d = path.join(fullPath, sub);
            if (!fs.existsSync(d)) return 0;
            return fs.readdirSync(d).filter(f => !f.startsWith('.') && !f.startsWith('_') && f.endsWith('.md')).length;
          };
          out[name] = { inbox: count('inbox'), outbox: count('outbox') };
        } else {
          // Entra recursivamente nos grupos (01-orquestrador, etc.)
          scanDir(fullPath);
        }
      });
    };
    scanDir(wsRoot);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST pedido no inbox do agente
app.post('/api/agentes/:slug/inbox', express.json(), (req, res) => {
  try {
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/gi,'').toLowerCase();
    const { titulo, pedido, autor } = req.body || {};
    if (!titulo || !pedido) return res.status(400).json({ error: 'titulo e pedido sao obrigatorios' });
    const wsDir = getWorkspaceDir(slug);
    const inboxDir = path.join(wsDir, 'inbox');
    if (!fs.existsSync(inboxDir)) return res.status(404).json({ error: 'agente nao tem workspace' });
    const now = new Date();
    const stamp = now.toISOString().slice(0,10);
    const safeSlug = String(titulo).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
    const filename = stamp + '-' + safeSlug + '.md';
    const md = '# ' + titulo + '\n\n'
      + '> Pedido criado em ' + now.toISOString() + (autor?' por ' + autor:'') + '\n'
      + '> Status: 📥 inbox · aguardando agente `' + slug + '`\n\n'
      + '## Pedido\n\n' + pedido + '\n';
    fs.writeFileSync(path.join(inboxDir, filename), md, 'utf8');
    res.json({ ok: true, arquivo: filename, slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: workspace de um agente (inbox/outbox/_vt + entregas filtradas)
app.get('/api/agentes/:slug/workspace', (req, res) => {
  try {
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/gi,'').toLowerCase();
    const wsDir = getWorkspaceDir(slug);
    const out = { slug, inbox: [], outbox: [], vt: null, entregas: [] };
    if (!fs.existsSync(wsDir)) return res.status(404).json({ error: 'workspace nao encontrado', slug });
    const listDir = (sub) => {
      const dir = path.join(wsDir, sub);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.startsWith('_'))
        .map(f => {
          const st = fs.statSync(path.join(dir, f));
          return { nome: f, tamanho: st.size, modificado: st.mtime };
        }).sort((a,b) => new Date(b.modificado) - new Date(a.modificado));
    };
    out.inbox = listDir('inbox');
    out.outbox = listDir('outbox');
    const vtPath = path.join(wsDir, '_vt.md');
    if (fs.existsSync(vtPath)) {
      out.vt = fs.readFileSync(vtPath, 'utf8');
    }
    // entregas: filtrar por subdir que case com slug (criativos/lps/propostas/campanhas) OU prefixo do slug
    const entregasDir = path.join(__dirname, 'vault/entregas');
    if (fs.existsSync(entregasDir)) {
      const slugShort = slug.replace(/^area-/, '');
      const tryDirs = [slug, slugShort, slug.replace('-','')];
      for (const d of tryDirs) {
        const full = path.join(entregasDir, d);
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          out.entregas = fs.readdirSync(full).filter(f => !f.startsWith('.'))
            .map(f => ({ nome: f, subdir: d }));
          break;
        }
      }
      // tambem busca arquivos na raiz que tenham o slug no nome
      const raiz = fs.readdirSync(entregasDir).filter(f => {
        const full = path.join(entregasDir, f);
        return fs.statSync(full).isFile() && f.toLowerCase().includes(slug.replace('area-',''));
      }).map(f => ({ nome: f, subdir: '(raiz)' }));
      out.entregas = out.entregas.concat(raiz);
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MODULE PAINEL DA DUDA (sprint 15 · módulo 10 · 0.11.0) ─────────────────
// Áreas/agentes que a Duda toca (aprova, opera ou é dona)
const AREAS_DUDA = ['area-brand', 'criativos', 'landing-pages', 'pipe-capa', 'pipe-carrossel'];

function _listInboxOutbox(slug) {
  const dir = getWorkspaceDir(slug);
  const out = { inbox: [], outbox: [] };
  ['inbox','outbox'].forEach(sub => {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) return;
    out[sub] = fs.readdirSync(subDir)
      .filter(f => !f.startsWith('.') && !f.startsWith('_') && f.endsWith('.md'))
      .map(f => {
        const st = fs.statSync(path.join(subDir, f));
        return { agente: slug, tipo: sub, arquivo: f, modificado: st.mtime, tamanho: st.size };
      });
  });
  return out;
}

// Inbox Duda — feed dos workspaces das áreas dela
app.get('/api/painel/inbox-duda', (req, res) => {
  try {
    const out = { inbox: [], outbox: [], areas: AREAS_DUDA };
    AREAS_DUDA.forEach(slug => {
      const io = _listInboxOutbox(slug);
      out.inbox = out.inbox.concat(io.inbox);
      out.outbox = out.outbox.concat(io.outbox);
    });
    out.inbox.sort((a,b) => new Date(b.modificado) - new Date(a.modificado));
    out.outbox.sort((a,b) => new Date(b.modificado) - new Date(a.modificado));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Daily Digest — o que a Duda precisa olhar HOJE
app.get('/api/painel/digest', (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);

    // pega voices
    let voicesData = { voices: [], programa: {} };
    try {
      voicesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/api/voices.json'), 'utf8'));
    } catch (e) {}

    const voices = voicesData.voices || [];
    const pendentes = voices.filter(v => v.pendencia || (v.dados_a_confirmar||[]).length > 0);
    const semBaseline = voices.filter(v => v.ssi_baseline == null);
    const sem_kit = voices.filter(v => !v.kit_pronto && !v.kit_status);

    // pega inboxes das áreas dela
    const inboxAreas = { hoje: 0, semana: 0, total: 0, novos_hoje: [] };
    AREAS_DUDA.forEach(slug => {
      const io = _listInboxOutbox(slug);
      io.inbox.forEach(item => {
        const m = new Date(item.modificado);
        inboxAreas.total++;
        if (m >= startOfDay) { inboxAreas.hoje++; inboxAreas.novos_hoje.push(item); }
        if (m >= sevenAgo) inboxAreas.semana++;
      });
    });
    inboxAreas.novos_hoje = inboxAreas.novos_hoje.slice(0, 8);

    // workflows ativos
    let workflowsAtivos = 0;
    try {
      if (fs.existsSync(COWORK_RUNS_DIR)) {
        const runs = fs.readdirSync(COWORK_RUNS_DIR).filter(f => f.endsWith('.json'));
        workflowsAtivos = runs.filter(f => {
          try { const r = JSON.parse(fs.readFileSync(path.join(COWORK_RUNS_DIR, f), 'utf8'));
                return new Date(r.criado_em) >= sevenAgo; }
          catch (e) { return false; }
        }).length;
      }
    } catch (e) {}

    res.json({
      gerado_em: now.toISOString(),
      cumprimento: _saudacao(now),
      voices_ativos: voices.length,
      voices_meta: voicesData.programa?.vagas_total || 5,
      pendencias: {
        total: pendentes.length + semBaseline.length,
        com_dados_provisorios: pendentes.length,
        sem_ssi_baseline: semBaseline.length,
        sem_kit: sem_kit.length,
        lista: pendentes.slice(0, 5).map(v => ({ id: v.id, nome: v.nome, motivo: v.pendencia || 'dados provisórios' }))
      },
      inbox_areas: inboxAreas,
      workflows_ativos_7d: workflowsAtivos,
      areas_duda: AREAS_DUDA
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function _saudacao(d) {
  const h = d.getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ── MODULE COWORK · workflows dinâmicos entre agentes (sprint 14 · 0.10.0) ──
const COWORK_PATH = path.join(__dirname, 'public/cowork.html');
app.get('/cowork', (req, res) => res.status(503).send('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px"><h2>Cowork temporariamente desabilitado</h2><p><a href="/">← Voltar</a></p></body></html>'));

const WORKFLOWS_DIR = path.join(__dirname, 'vault/workflows');
const COWORK_RUNS_DIR = path.join(__dirname, 'vault/cowork-runs');
if (!fs.existsSync(COWORK_RUNS_DIR)) fs.mkdirSync(COWORK_RUNS_DIR, { recursive: true });

function loadWorkflows() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  return fs.readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')); }
      catch (e) { return null; }
    })
    .filter(Boolean);
}

app.get('/api/workflows', (req, res) => res.status(503).json({ error: 'cowork desabilitado' }));

app.get('/api/workflows/:slug', (req, res) => res.status(503).json({ error: 'cowork desabilitado' }));

function fillTpl(tpl, vars) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] != null ? vars[k] : '');
}

app.post('/api/workflows/:slug/run', (req, res) => res.status(503).json({ error: 'cowork desabilitado' }));

app.get('/api/cowork/runs', (req, res) => res.status(503).json({ error: 'cowork desabilitado' }));

app.get('/api/cowork/atividade', (req, res) => res.status(503).json({ error: 'cowork desabilitado' }));

// ── MODULE H · METAS LINKEDIN (sprint 0.4.8 — apresentação corporativa) ─────
const METAS_PATH = path.join(__dirname, 'public/metas.html');
app.get('/metas', (req, res) => res.sendFile(METAS_PATH));

// GET metas (público — qualquer um do time vê os números)
app.get('/api/metas', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM metas_linkedin').all();
    const metas = {};
    for (const r of rows) {
      metas[r.area_id] = {
        seg_30d: r.seg_30d || '',
        seg_90d: r.seg_90d || '',
        eventos_q: r.eventos_q || '',
        acoes: r.acoes || ''
      };
    }
    res.json({ metas, updated_at: rows[0]?.updated_at || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST metas (protegido — só com EDITOR_TOKEN)
// POST /api/events.json — atualiza os eventos do Calendario Mestre AO VIVO (Opcao B).
// Grava no arquivo (instancia viva) + no volume (app_blobs, sobrevive a deploy).
// Alimentado por scripts/sync/sync_eventos.py --push. Protegido por EDITOR_TOKEN.
app.post('/api/events.json', requireEditorToken, (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.abas || typeof data.abas !== 'object') {
      return res.status(400).json({ success: false, error: 'payload invalido: faltou abas{}' });
    }
    const txt = JSON.stringify(data, null, 2);
    fs0.writeFileSync(require('path').join(__dirname, 'public/api/events.json'), txt);
    db.prepare(`INSERT INTO app_blobs (key, value, updated_at) VALUES ('events.json', @v, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run({ v: txt });
    const total = Object.values(data.abas).reduce((s, a) => s + ((a.eventos || []).length), 0);
    res.json({ success: true, bytes: txt.length, abas: Object.keys(data.abas), total_eventos: total });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/metas', requireEditorToken, (req, res) => {
  const m = req.body?.metas || {};
  if (!Object.keys(m).length) return res.status(400).json({ success: false, error: 'metas{} vazio' });
  const upsert = db.prepare(`
    INSERT INTO metas_linkedin (area_id, seg_30d, seg_90d, eventos_q, acoes, updated_at)
    VALUES (@area_id, @seg_30d, @seg_90d, @eventos_q, @acoes, datetime('now'))
    ON CONFLICT(area_id) DO UPDATE SET
      seg_30d=excluded.seg_30d, seg_90d=excluded.seg_90d,
      eventos_q=excluded.eventos_q, acoes=excluded.acoes,
      updated_at=datetime('now')
  `);
  let n = 0;
  db.transaction(() => {
    for (const [area_id, data] of Object.entries(m)) {
      upsert.run({
        area_id,
        seg_30d: data.seg_30d ? parseInt(data.seg_30d, 10) : null,
        seg_90d: data.seg_90d ? parseInt(data.seg_90d, 10) : null,
        eventos_q: data.eventos_q ? parseInt(data.eventos_q, 10) : null,
        acoes: String(data.acoes || '').slice(0, 5000)
      });
      n++;
    }
  })();
  res.json({ success: true, upserted: n });
});

// ── MODULE G · CASES & CS HUB (Modularizado em routes/cases.js) ───────────────

// ── MODULE F · INBOUND ENGINE (Modularizado em routes/inbound.js) ──────────────
app.get('/field-marketing', (req, res) => res.sendFile(path.join(__dirname, 'public/field-marketing.html')));
app.get('/content-pipeline', (req, res) => res.redirect(301, '/area/brand'));
app.get('/area/conteudo', (req, res) => res.redirect(301, '/area/brand'));
app.get('/development-funds', (req, res) => res.sendFile(path.join(__dirname, 'public/development-funds.html')));

// ── MODULE ZOHO PIPELINE (v0.27.0) ──────────────────────────────────────────
// GET  /api/zoho/pipeline   — agregações por período/dimensão (sem auth)
// POST /api/zoho/sync       — upsert de deals (editor token)

app.get('/api/zoho/pipeline', (req, res) => {
  try {
    const src = req.query.source || 'all'; // mkt | sdr | all
    const srcFilter = src === 'mkt' ? "AND opportunity_source = 'MKT (EPI-USE)'"
                    : src === 'sdr' ? "AND opportunity_source = 'SDR'"
                    : '';

    const now = new Date();
    const y   = now.getUTCFullYear();
    const m   = now.getUTCMonth(); // 0-based

    // período helpers
    const iso = (d) => d.toISOString().slice(0,10);
    const thisMthStart  = iso(new Date(Date.UTC(y, m, 1)));
    const lastMthStart  = iso(new Date(Date.UTC(y, m-1, 1)));
    const lastMthEnd    = iso(new Date(Date.UTC(y, m, 0)));
    const qStart = iso(new Date(Date.UTC(y, Math.floor(m/3)*3 - 3, 1)));
    const qEnd   = iso(new Date(Date.UTC(y, Math.floor(m/3)*3, 0)));
    const fyStart = iso(new Date(Date.UTC(y-1, 0, 1))); // último FY = ano ant completo
    const fyEnd   = iso(new Date(Date.UTC(y-1, 11, 31)));
    const since24 = iso(new Date(Date.UTC(y, m-24, 1)));

    const sumQ = (from, to) =>
      db.prepare(`SELECT COALESCE(SUM(valor),0) as s FROM zoho_deals WHERE data_criacao >= ? AND data_criacao <= ? ${srcFilter}`).get(from, to)?.s || 0;

    const kpis = {
      este_mes:     { label: 'Este mês',        valor: sumQ(thisMthStart, iso(now)) },
      ultimo_mes:   { label: 'Último mês',       valor: sumQ(lastMthStart, lastMthEnd) },
      ultimo_q:     { label: 'Último quarter',   valor: sumQ(qStart, qEnd) },
      ultimo_fy:    { label: 'Último FY',        valor: sumQ(fyStart, fyEnd) },
    };

    const porCampanha = db.prepare(
      `SELECT campanha, SUM(valor) as total, COUNT(*) as deals
       FROM zoho_deals WHERE data_criacao >= ? ${srcFilter}
       GROUP BY campanha ORDER BY total DESC LIMIT 20`
    ).all(since24);

    const porSolution = db.prepare(
      `SELECT solution, SUM(valor) as total, COUNT(*) as deals
       FROM zoho_deals WHERE solution IS NOT NULL AND solution != '' ${srcFilter}
       GROUP BY solution ORDER BY deals DESC LIMIT 15`
    ).all();

    const porDealScope = db.prepare(
      `SELECT deal_scope, SUM(valor) as total, COUNT(*) as deals
       FROM zoho_deals WHERE deal_scope IS NOT NULL AND deal_scope != '' ${srcFilter}
       GROUP BY deal_scope ORDER BY deals DESC LIMIT 20`
    ).all();

    const porMes = db.prepare(
      `SELECT substr(data_criacao,1,7) as mes, SUM(valor) as total, COUNT(*) as deals
       FROM zoho_deals WHERE data_criacao >= ? ${srcFilter}
       GROUP BY mes ORDER BY mes ASC`
    ).all(since24);

    const lastSync = db.prepare('SELECT MAX(synced_at) as s FROM zoho_deals').get()?.s || null;
    const totalDeals = db.prepare(`SELECT COUNT(*) as n FROM zoho_deals WHERE 1=1 ${srcFilter}`).get()?.n || 0;

    res.json({ kpis, por_campanha: porCampanha, por_solution: porSolution, por_deal_scope: porDealScope, por_mes: porMes, last_sync: lastSync, total_deals: totalDeals, source_filter: src });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/executivo — agregado CMO View (Roberto / Country Manager)
// Marketing-sourced pipeline (classificação por campanha) + win rate real
// (stages Zoho) + DF + metas FY26. Tudo dado REAL (Regra 7).
// Restrito a head (Rudá) + country-manager (Roberto) — regra do Rudá (18/jul).
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/executivo', _requireExec, (req, res) => {
  try {
    // 1 — classificação de campanhas (editável sem deploy)
    let classif = { tipos: {}, campanhas: {} };
    try { classif = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/api/campanha-classificacao.json'), 'utf8')); } catch (e) {}

    // 2 — pipeline por campanha × tipo (todos os deals, 24m)
    const porCampanha = db.prepare(
      `SELECT campanha, SUM(valor) as total, COUNT(*) as deals
       FROM zoho_deals GROUP BY campanha ORDER BY total DESC`
    ).all();
    const porTipo = {};
    for (const t of Object.keys(classif.tipos || {})) porTipo[t] = { total: 0, deals: 0, campanhas: [] };
    if (!porTipo.sem_atribuicao) porTipo.sem_atribuicao = { total: 0, deals: 0, campanhas: [] };
    for (const c of porCampanha) {
      const nome = (c.campanha || '').trim();
      const tipo = nome ? (classif.campanhas[nome] || 'sem_atribuicao') : 'sem_atribuicao';
      if (!porTipo[tipo]) porTipo[tipo] = { total: 0, deals: 0, campanhas: [] };
      porTipo[tipo].total += c.total || 0;
      porTipo[tipo].deals += c.deals || 0;
      porTipo[tipo].campanhas.push({ nome: nome || '(sem campanha)', total: c.total, deals: c.deals });
    }
    const totalPipeline = porCampanha.reduce((s, c) => s + (c.total || 0), 0);

    // 3 — win rate REAL por stage
    const stages = db.prepare('SELECT stage, COUNT(*) n, SUM(valor) v FROM zoho_deals GROUP BY stage').all();
    const agg = { ganho: { n: 0, v: 0 }, perdido: { n: 0, v: 0 }, cancelado: { n: 0, v: 0 }, aberto: { n: 0, v: 0 } };
    for (const s of stages) {
      const st = (s.stage || '').toLowerCase();
      const key = st.includes('ganhamos') ? 'ganho'
                : (st.includes('perdemos') || st === 'perdido') ? 'perdido'
                : st.includes('cancelado') ? 'cancelado'
                : 'aberto';
      agg[key].n += s.n; agg[key].v += s.v || 0;
    }
    const decididos = agg.ganho.n + agg.perdido.n;
    const winRate = decididos ? Math.round(1000 * agg.ganho.n / decididos) / 10 : null;

    // 4 — DF (lê o endpoint interno? não — replica leitura do JSON snapshot usado por /api/development-funds)
    let df = null;
    try {
      const dfData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/api/development-funds.json'), 'utf8'));
      df = dfData.kpis || null;
    } catch (e) {}

    // 5 — metas FY26 agregado (valor no JSON é TARGET; realizado vem das APIs ao
    // vivo na tela /metas-fy26 — aqui só contamos cobertura de fonte, sem inventar %)
    let metas = null;
    try {
      const mj = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/api/metas-fy26.json'), 'utf8'));
      const st = mj.por_status_fonte || {};
      metas = {
        total: mj.total_metas || (mj.metas || []).length,
        com_fonte_real: (st.real || 0) + (st.parcial || 0),
        por_status_fonte: st,
        ano_fiscal: mj.ano_fiscal || 'FY26',
      };
    } catch (e) {}

    const lastSync = db.prepare('SELECT MAX(synced_at) as s FROM zoho_deals').get()?.s || null;
    res.json({
      gerado_em: new Date().toISOString(),
      pipeline: {
        total_24m: totalPipeline,
        por_tipo: porTipo,
        tipos_meta: classif.tipos || {},
        mkt_sourced_total: porTipo.marketing ? porTipo.marketing.total : 0,
        mkt_sourced_pct: totalPipeline ? Math.round(1000 * (porTipo.marketing?.total || 0) / totalPipeline) / 10 : null,
      },
      resultado: {
        ganho_valor: agg.ganho.v, ganho_deals: agg.ganho.n,
        perdido_valor: agg.perdido.v, perdido_deals: agg.perdido.n,
        cancelado_deals: agg.cancelado.n,
        aberto_valor: agg.aberto.v, aberto_deals: agg.aberto.n,
        win_rate_pct: winRate,
      },
      df, metas,
      last_sync_zoho: lastSync,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/executivo', _requireExec, (req, res) => res.sendFile(path.join(__dirname, 'public/executivo.html')));
app.get('/linkedin', (req, res) => res.sendFile(path.join(__dirname, 'public/linkedin.html')));
app.get('/raccoon', (req, res) => res.sendFile(path.join(__dirname, 'public/raccoon.html')));

app.post('/api/zoho/sync', requireEditorToken, (req, res) => {
  const items = Array.isArray(req.body?.deals) ? req.body.deals : [];
  if (!items.length) return res.status(400).json({ success: false, error: 'deals[] vazio.' });
  const upsert = db.prepare(`
    INSERT INTO zoho_deals (deal_id, conta, nome_deal, valor, stage, campanha, solution, deal_scope, opportunity_source, data_criacao, data_fechamento, synced_at)
    VALUES (@deal_id, @conta, @nome_deal, @valor, @stage, @campanha, @solution, @deal_scope, @opportunity_source, @data_criacao, @data_fechamento, datetime('now'))
    ON CONFLICT(deal_id) DO UPDATE SET
      conta=excluded.conta, nome_deal=excluded.nome_deal, valor=excluded.valor,
      stage=excluded.stage, campanha=excluded.campanha, solution=excluded.solution,
      deal_scope=excluded.deal_scope, opportunity_source=excluded.opportunity_source,
      data_criacao=excluded.data_criacao, data_fechamento=excluded.data_fechamento,
      synced_at=datetime('now')
  `);
  let n = 0;
  db.transaction((arr) => {
    for (const it of arr) {
      try {
        upsert.run({
          deal_id:            String(it.deal_id || it.id || '').slice(0,100),
          conta:              String(it.conta || '').slice(0,200),
          nome_deal:          String(it.nome_deal || it.Deal_Name || '').slice(0,300),
          valor:              parseFloat(it.valor ?? it.Amount ?? 0) || 0,
          stage:              String(it.stage || it.Stage || '').slice(0,100),
          campanha:           String(it.campanha || it.Lead_Source || '').slice(0,200),
          solution:           String(it.solution || '').slice(0,200),
          deal_scope:         String(it.deal_scope || '').slice(0,200),
          opportunity_source: String(it.opportunity_source || '').slice(0,100),
          data_criacao:       String(it.data_criacao || it.Created_Time || '').slice(0,10),
          data_fechamento:    String(it.data_fechamento || it.Closing_Date || '').slice(0,10),
        });
        n++;
      } catch (e) { console.warn('[zoho-sync] upsert falhou:', e.message); }
    }
  })(items);
  res.json({ success: true, upserted: n, total: items.length });
});

// ── CLIENTES SAP 4 ME (Modularizado em routes/sap.js) ─────────────────────────

// ── FIELD MARKETING (eventos events.json + enriquecimento SQLite) ────────────
function _slugifyEvent(aba, ev) {
  const n = String(ev.n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${aba}-${ev.m}-${n}`;
}
function _eventISO(ev, ano) {
  if (!ev.m || !ev.d || ev.d === 'TBC') return null;
  const dia = String(ev.d).split('-')[0].trim();
  if (!/^\d+$/.test(dia)) return null;
  return `${ano}-${String(ev.m).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

app.get('/api/field-marketing', (req, res) => {
  try {
    const events = JSON.parse(fs0.readFileSync(path.join(__dirname, 'public/api/events.json'), 'utf8'));
    const ano = events.ano || new Date().getFullYear();
    const enrich = {};
    for (const r of db.prepare('SELECT * FROM field_events').all()) enrich[r.event_id] = r;

    const lista = [];
    for (const [aba, conteudo] of Object.entries(events.abas || {})) {
      for (const ev of (conteudo.eventos || [])) {
        const id = _slugifyEvent(aba, ev);
        const e = enrich[id] || {};
        let captura = {}; try { captura = JSON.parse(e.captura_json || '{}'); } catch {}
        lista.push({
          event_id: id, regiao: aba, nome: ev.n, lob: ev.lob, who: ev.who,
          pais: ev.country, flag: ev.flag, mes: ev.m, dia: ev.d,
          data_evento: e.data_evento || _eventISO(ev, ano),
          status: e.status || 'planejamento',
          local: e.local || '', responsavel: e.responsavel || '', porte: e.porte || '',
          orcamento: e.orcamento || 0, captura,
          tem_briefing: !!(e.briefing_json && e.briefing_json !== '{}'),
        });
      }
    }
    // KPIs
    const byStatus = {};
    for (const e of lista) byStatus[e.status] = (byStatus[e.status]||0)+1;
    const comCaptura = lista.filter(e => e.captura && (e.captura.leads || e.captura.deals));
    const totLeads = comCaptura.reduce((s,e)=>s+(+e.captura.leads||0),0);
    const totQual  = comCaptura.reduce((s,e)=>s+(+e.captura.qualificados||0),0);
    const totDeals = comCaptura.reduce((s,e)=>s+(+e.captura.deals||0),0);
    const totCusto = comCaptura.reduce((s,e)=>s+(+e.captura.custo||0),0);

    res.json({
      total: lista.length, ano,
      kpis: {
        por_status: byStatus,
        eventos_com_captura: comCaptura.length,
        total_leads: totLeads, total_qualificados: totQual, total_deals: totDeals,
        custo_total: totCusto,
        custo_por_lead: totLeads ? Math.round(totCusto/totLeads) : null,
      },
      eventos: lista,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/field-marketing/:id', requireEditorToken, (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body || {};
    const existing = db.prepare('SELECT * FROM field_events WHERE event_id = ?').get(id) || {};
    const merged = {
      event_id: id,
      nome:        b.nome ?? existing.nome ?? '',
      data_evento: b.data_evento ?? existing.data_evento ?? null,
      local:       b.local ?? existing.local ?? '',
      lob:         b.lob ?? existing.lob ?? '',
      pais:        b.pais ?? existing.pais ?? '',
      responsavel: b.responsavel ?? existing.responsavel ?? '',
      porte:       b.porte ?? existing.porte ?? '',
      orcamento:   b.orcamento != null ? parseFloat(b.orcamento) || 0 : (existing.orcamento || 0),
      status:      b.status ?? existing.status ?? 'planejamento',
      brindes_json:  b.brindes  != null ? JSON.stringify(b.brindes)  : (existing.brindes_json || '[]'),
      captura_json:  b.captura  != null ? JSON.stringify(b.captura)  : (existing.captura_json || '{}'),
      briefing_json: b.briefing != null ? JSON.stringify(b.briefing) : (existing.briefing_json || '{}'),
    };
    db.prepare(`
      INSERT INTO field_events (event_id, nome, data_evento, local, lob, pais, responsavel, porte, orcamento, status, brindes_json, captura_json, briefing_json, updated_at)
      VALUES (@event_id,@nome,@data_evento,@local,@lob,@pais,@responsavel,@porte,@orcamento,@status,@brindes_json,@captura_json,@briefing_json,datetime('now'))
      ON CONFLICT(event_id) DO UPDATE SET
        nome=excluded.nome, data_evento=excluded.data_evento, local=excluded.local, lob=excluded.lob,
        pais=excluded.pais, responsavel=excluded.responsavel, porte=excluded.porte, orcamento=excluded.orcamento,
        status=excluded.status, brindes_json=excluded.brindes_json, captura_json=excluded.captura_json,
        briefing_json=excluded.briefing_json, updated_at=datetime('now')
    `).run(merged);
    res.json({ success: true, event_id: id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── CONTENT PIPELINE (Redatoria → SEO/GEO → persona → copy/CTA → carrossel → publicado) ──
const CONTENT_ESTADOS = ['recebido','seo_geo','persona','copy_cta','carrossel','agendado','publicado'];

app.get('/api/content', (req, res) => {
  try {
    const all = db.prepare('SELECT * FROM content_pipeline ORDER BY updated_at DESC').all();
    const porEstado = {};
    for (const e of CONTENT_ESTADOS) porEstado[e] = 0;
    for (const it of all) porEstado[it.estado] = (porEstado[it.estado]||0)+1;
    const parse = (s) => { try { return JSON.parse(s||'{}'); } catch { return {}; } };
    res.json({
      estados: CONTENT_ESTADOS,
      total: all.length,
      por_estado: porEstado,
      itens: all.map(it => ({
        id: it.id, external_id: it.external_id, titulo: it.titulo, tema_keyword: it.tema_keyword,
        lob: it.lob, pilar: it.pilar, persona_alvo: it.persona_alvo, autor: it.autor,
        estado: it.estado, corpo: it.corpo,
        seo: parse(it.seo_json), geo: parse(it.geo_json),
        copy_text: it.copy_text, cta_sugerido: it.cta_sugerido, carrossel_url: it.carrossel_url,
        agendado_para: it.agendado_para, publicado_em: it.publicado_em, url_publicado: it.url_publicado,
        updated_at: it.updated_at,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/content', requireEditorToken, (req, res) => {
  try {
    const b = req.body || {};
    if (!b.titulo) return res.status(400).json({ success: false, error: 'titulo obrigatório.' });
    
    // Generate unique external_id if not present
    const extId = b.external_id || `rax-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // 1. Insert into content_pipeline with all generated details
    const r = db.prepare(`
      INSERT INTO content_pipeline (
        external_id, titulo, tema_keyword, lob, pilar, persona_alvo, autor, estado, corpo,
        copy_text, cta_sugerido, seo_json, geo_json, carrossel_url, carrossel_json, capa_url
      )
      VALUES (
        @external_id, @titulo, @tema_keyword, @lob, @pilar, @persona_alvo, @autor, @estado, @corpo,
        @copy_text, @cta_sugerido, @seo_json, @geo_json, @carrossel_url, @carrossel_json, @capa_url
      )
    `).run({
      external_id: extId,
      titulo: String(b.titulo).slice(0,300),
      tema_keyword: b.tema_keyword || '',
      lob: b.lob || '',
      pilar: b.pilar || '',
      persona_alvo: b.persona_alvo || '',
      autor: b.autor || 'Rax',
      estado: CONTENT_ESTADOS.includes(b.estado) ? b.estado : 'recebido',
      corpo: b.corpo || '',
      copy_text: b.copy_text || '',
      cta_sugerido: b.cta_sugerido || '',
      seo_json: typeof b.seo_json === 'object' ? JSON.stringify(b.seo_json) : (b.seo_json || '{}'),
      geo_json: typeof b.geo_json === 'object' ? JSON.stringify(b.geo_json) : (b.geo_json || '{}'),
      carrossel_url: b.carrossel_url || '',
      carrossel_json: typeof b.carrossel_json === 'object' ? JSON.stringify(b.carrossel_json) : (b.carrossel_json || ''),
      capa_url: b.capa_url || ''
    });

    // NOTA: o item NAO entra no calendario/planilha da Duda no save cru.
    // So entra quando agendado (PUT /api/content/:id com estado=agendado + agendado_para),
    // evitando que testes/rascunhos sujem a agenda. external_id estavel: extId acima.

    res.json({ success: true, id: r.lastInsertRowid, external_id: extId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/content/:id', requireEditorToken, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ex = db.prepare('SELECT * FROM content_pipeline WHERE id = ?').get(id);
    if (!ex) return res.status(404).json({ success: false, error: 'item não encontrado.' });
    const b = req.body || {};
    if (b.estado && !CONTENT_ESTADOS.includes(b.estado)) return res.status(400).json({ success: false, error: 'estado inválido.' });
    const m = {
      id,
      titulo: b.titulo ?? ex.titulo, tema_keyword: b.tema_keyword ?? ex.tema_keyword,
      lob: b.lob ?? ex.lob, pilar: b.pilar ?? ex.pilar, persona_alvo: b.persona_alvo ?? ex.persona_alvo,
      autor: b.autor ?? ex.autor, estado: b.estado ?? ex.estado, corpo: b.corpo ?? ex.corpo,
      copy_text: b.copy_text ?? ex.copy_text, cta_sugerido: b.cta_sugerido ?? ex.cta_sugerido,
      carrossel_url: b.carrossel_url ?? ex.carrossel_url,
      agendado_para: b.agendado_para ?? ex.agendado_para,
      publicado_em: b.estado === 'publicado' && !ex.publicado_em ? new Date().toISOString().slice(0,10) : (b.publicado_em ?? ex.publicado_em),
      url_publicado: b.url_publicado ?? ex.url_publicado,
    };
    db.prepare(`UPDATE content_pipeline SET titulo=@titulo, tema_keyword=@tema_keyword, lob=@lob, pilar=@pilar,
      persona_alvo=@persona_alvo, autor=@autor, estado=@estado, corpo=@corpo, copy_text=@copy_text,
      cta_sugerido=@cta_sugerido, carrossel_url=@carrossel_url, agendado_para=@agendado_para,
      publicado_em=@publicado_em, url_publicado=@url_publicado, updated_at=datetime('now') WHERE id=@id`).run(m);

    // Item AGENDADO (com data real) -> entra no calendario/planilha da Duda.
    // Save cru e rascunho NAO sujam a agenda; so o agendamento explicito publica.
    if (m.estado === 'agendado' && m.agendado_para) {
      const calExtId = ex.external_id || `rax-content-${id}`;
      db.prepare(`
        INSERT INTO editorial_calendar (external_id, fonte, data, canal, autor, titulo, resumo, pilar, status, url_post, synced_at)
        VALUES (@external_id,'raccoon',@data,@canal,@autor,@titulo,@resumo,@pilar,'planned','',datetime('now'))
        ON CONFLICT(external_id) DO UPDATE SET data=excluded.data, canal=excluded.canal, autor=excluded.autor,
          titulo=excluded.titulo, resumo=excluded.resumo, pilar=excluded.pilar, synced_at=datetime('now'), updated_at=datetime('now')
      `).run({
        external_id: calExtId, data: m.agendado_para,
        canal: m.corpo ? 'artigo' : 'linkedin', autor: m.autor || 'Rax',
        titulo: String(m.titulo).slice(0,300),
        resumo: String(m.copy_text || m.corpo || '').slice(0,2000).replace(/<[^>]*>/g,''),
        pilar: m.lob || '',
      });
    }
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/content/:id/seo-check', requireEditorToken, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const it = db.prepare('SELECT * FROM content_pipeline WHERE id = ?').get(id);
    if (!it) return res.status(404).json({ success: false, error: 'item não encontrado.' });
    const input = { titulo: it.titulo, corpo: it.corpo, tema_keyword: it.tema_keyword };
    const seo = seoChecker.checkSEO(input);
    const geo = seoChecker.checkGEO(input);
    const cta = seoChecker.suggestCTA({ lob: it.lob, pilar: it.pilar });
    db.prepare('UPDATE content_pipeline SET seo_json=?, geo_json=?, cta_sugerido=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(JSON.stringify(seo), JSON.stringify(geo), it.cta_sugerido || cta.cta, id);
    res.json({ success: true, seo, geo, cta });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/content/:id', requireEditorToken, (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const ex = db.prepare('SELECT external_id FROM content_pipeline WHERE id = ?').get(id);
    db.prepare('DELETE FROM content_pipeline WHERE id = ?').run(id);
    // limpa tambem a linha espelhada no calendario/planilha da Duda (se houver)
    const calExtId = (ex && ex.external_id) || `rax-content-${id}`;
    db.prepare("DELETE FROM editorial_calendar WHERE fonte='raccoon' AND external_id IN (?,?)")
      .run(calExtId, `rax-content-${id}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── RACCOON OFFLINE GENERATOR ENDPOINT ──
app.post('/api/raccoon/generate', (req, res) => {
  const { ping, tema, persona, lob, outputs } = req.body || {};
  
  // Se for apenas ping para checar status e presença do Ollama
  if (ping) {
    if (process.env.RAILWAY_ENVIRONMENT) {
      return res.json({ success: true, offline: true, msg: 'Engine offline roda apenas no ambiente local.' });
    }
    const indexFile = path.join(__dirname, 'modulos/08-inbound-offline/corpus/index.npz');
    if (!fs.existsSync(indexFile)) {
      return res.json({ success: true, offline: true, msg: 'Índice RAG ainda em compilação.' });
    }
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: 2000
    };
    const reqOllama = http.request(options, (response) => {
      if (response.statusCode === 200) {
        res.json({ success: true, offline: false });
      } else {
        res.json({ success: true, offline: true, msg: 'Ollama respondeu com status ' + response.statusCode });
      }
    });
    reqOllama.on('error', (err) => {
      res.json({ success: true, offline: true, msg: 'Ollama local não conectado: ' + err.message });
    });
    reqOllama.end();
    return;
  }

  if (!tema) {
    return res.status(400).json({ success: false, error: 'tema é obrigatório.' });
  }

  if (process.env.RAILWAY_ENVIRONMENT) {
    return res.status(400).json({ success: false, error: 'Engine offline roda apenas no ambiente local.', offline: true });
  }

  const { spawn } = require('child_process');
  const pythonScript = path.join(__dirname, 'modulos/08-inbound-offline/raccoon_gen.py');
  
  const args = [
    pythonScript,
    '--tema', tema,
    '--persona', persona || 'auto'
  ];
  if (lob) {
    args.push('--lob', lob);
  }
  if (outputs) {
    if (outputs.article) args.push('--article');
    if (outputs.post) args.push('--post');
    if (outputs.carousel) args.push('--carousel');
    if (outputs.single) args.push('--single');
  }

  console.log(`[raccoon-route] Spawning: python ${args.join(' ')}`);

  const py = spawn('python', args, { cwd: path.join(__dirname, 'modulos/08-inbound-offline') });
  
  let stdoutData = '';
  let stderrData = '';

  py.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  py.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  py.on('close', (code) => {
    if (code !== 0) {
      console.error(`[raccoon-route] Python process exited with code ${code}. Error: ${stderrData}`);
      return res.status(500).json({
        success: false,
        error: `Falha na geração (código ${code})`,
        details: stderrData
      });
    }

    try {
      const parsed = JSON.parse(stdoutData.trim());
      
      // Calculate real deterministic SEO/GEO scores
      if (parsed.success && parsed.article) {
        const corpoText = `<h1>${parsed.article.title || ''}</h1>\n\n<p class="intro">${parsed.article.intro || ''}</p>\n\n` +
          (parsed.article.sections || []).map(s => `<h2>${s.h2 || ''}</h2>\n<p>${s.body || ''}</p>`).join('\n\n') +
          `\n\n<p class="conclusion">${parsed.article.conclusion || ''}</p>`;
        
        const seoResult = seoChecker.checkSEO({
          titulo: parsed.article.title || '',
          corpo: corpoText,
          tema_keyword: tema || ''
        });
        
        const geoResult = seoChecker.checkGEO({
          titulo: parsed.article.title || '',
          corpo: corpoText,
          tema_keyword: tema || ''
        });
        
        const realScore = Math.round((seoResult.score + geoResult.score) / 2);
        
        if (!parsed.revisao) {
          parsed.revisao = { seo: {}, geo: {}, qualidade: {} };
        }
        if (!parsed.revisao.qualidade) {
          parsed.revisao.qualidade = {};
        }
        
        parsed.revisao.qualidade.score = realScore;
        
        // Propagate checklist issues to quality alerts
        parsed.revisao.qualidade.alertas = parsed.revisao.qualidade.alertas || [];
        const failedSeo = (seoResult.checklist || []).filter(c => !c.ok).map(c => `SEO: ${c.item} (${c.nota || 'pendente'})`);
        const failedGeo = (geoResult.checklist || []).filter(c => !c.ok).map(c => `GEO: ${c.item}`);
        parsed.revisao.qualidade.alertas = [...parsed.revisao.qualidade.alertas, ...failedSeo, ...failedGeo];
        
        // Sync the detailed meta tags
        if (!parsed.revisao.seo) parsed.revisao.seo = {};
        parsed.revisao.seo.metaTitle = parsed.revisao.seo.metaTitle || seoResult.metaTitle || parsed.article.title;
        parsed.revisao.seo.metaDescription = parsed.revisao.seo.metaDescription || seoResult.metaDescription || parsed.article.intro;
        parsed.revisao.seo.slug = parsed.revisao.seo.slug || seoResult.slug || 'artigo-gerado';
        parsed.revisao.seo.keywords = parsed.revisao.seo.keywords || seoResult.keywords || [tema];
      }
      
      res.json(parsed);
    } catch (err) {
      console.error(`[raccoon-route] JSON Parse failed for stdout: ${stdoutData}. Error: ${err.message}`);
      res.status(500).json({
        success: false,
        error: 'A saída do script Python não pôde ser interpretada como JSON.',
        stdout: stdoutData,
        stderr: stderrData
      });
    }
  });
});

// Importa itens fonte=redatoria do editorial_calendar pro pipeline (estado 'recebido')
app.post('/api/content/import-redatoria', requireEditorToken, (req, res) => {
  try {
    const posts = db.prepare("SELECT * FROM editorial_calendar WHERE fonte = 'redatoria'").all();
    const existing = new Set(db.prepare("SELECT external_id FROM content_pipeline WHERE external_id IS NOT NULL").all().map(r => r.external_id));
    const ins = db.prepare(`INSERT INTO content_pipeline (external_id, titulo, tema_keyword, lob, pilar, autor, estado, corpo)
      VALUES (@external_id,@titulo,@tema_keyword,@lob,@pilar,@autor,'recebido',@corpo)`);
    let n = 0;
    db.transaction(() => {
      for (const p of posts) {
        if (existing.has(p.external_id)) continue;
        ins.run({ external_id: p.external_id, titulo: p.titulo || '(sem título)', tema_keyword: '',
          lob: p.pilar || '', pilar: p.pilar || '', autor: p.autor || 'Redatoria', corpo: p.resumo || '' });
        n++;
      }
    })();
    res.json({ success: true, importados: n, total_redatoria: posts.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── DEVELOPMENT FUNDS (SAP DF LAC) — tracker EDF/DDF + proposals + requests ──
app.get('/api/development-funds', (req, res) => {
  try {
    const df = JSON.parse(fs0.readFileSync(path.join(__dirname, 'public/api/development-funds.json'), 'utf8'));
    const props = df.proposals || [];
    const reqs = df.requests || [];

    const isAprov = s => /approved/i.test(s || '');
    const propsValidos = props.filter(p => !p.derrubado);
    const propsDerrubados = props.filter(p => p.derrubado);

    // Pipeline de proposals por status
    const porStatus = {};
    for (const p of props) porStatus[p.status] = (porStatus[p.status] || 0) + 1;

    // Valor aprovado (€) — só proposals aprovadas e NÃO derrubadas
    const aprovadoValido = propsValidos.filter(p => isAprov(p.status)).reduce((s, p) => s + (+p.pc || 0), 0);
    const derrubadoTotal = propsDerrubados.reduce((s, p) => s + (+p.pc || 0), 0);
    // Em andamento (pending) — potencial
    const pendente = props.filter(p => /pending/i.test(p.status)).reduce((s, p) => s + (+p.pc || 0), 0);

    // Requests: a reclamar (válidos, claim=0, Claim Now) ordenados por expiração
    const reqsValidos = reqs.filter(r => !r.derrubado);
    const aReclamar = reqsValidos
      .filter(r => (+r.claim || 0) === 0 && /claim now/i.test(r.status))
      .sort((a, b) => (a.expiracao || '').localeCompare(b.expiracao || ''));
    const totalAReclamar = aReclamar.reduce((s, r) => s + (+r.aprovado || 0), 0);
    const totalClaimed = reqs.reduce((s, r) => s + (+r.claim || 0), 0);

    // Regra DDF: meta 70% até 1º/jul
    const ddf = df.budget?.ddf_alocado || 0;
    const meta70 = +(ddf * 0.7).toFixed(2);
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const expirandoEm30 = reqsValidos.filter(r => r.expiracao && r.expiracao >= hoje && r.expiracao <= em30 && (+r.claim || 0) === 0);

    res.json({
      programa: df.programa, periodo: df.periodo, budget: df.budget, regras: df.regras,
      kpis: {
        ddf_alocado: ddf,
        ddf_consumido: df.budget?.ddf_consumido || 0,
        meta_70pct_1jul: meta70,
        aprovado_valido: +aprovadoValido.toFixed(2),
        derrubado_total: +derrubadoTotal.toFixed(2),
        pendente: +pendente.toFixed(2),
        total_a_reclamar: +totalAReclamar.toFixed(2),
        total_claimed: +totalClaimed.toFixed(2),
        proposals_total: props.length,
        proposals_derrubadas: propsDerrubados.length,
        requests_expirando_30d: expirandoEm30.length,
      },
      por_status: porStatus,
      a_reclamar: aReclamar,
      expirando_30d: expirandoEm30,
      proposals: props,
      requests: reqs,
      derrubados: propsDerrubados.map(p => ({ numero: p.numero, nome: p.nome, pc: p.pc, motivo: p.motivo_derrubada })),
      atualizado_em: df.atualizado_em,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── /api/alerts: feed unificado pro sino de notificação do office-nav ──
// Fonte: voices.json#alertas + alertas operacionais derivados (ex: posts atrasados)
app.get('/api/alerts', (req, res) => {
  try {
    const voicesPath = path.join(__dirname, 'public/api/voices.json');
    const voices = JSON.parse(fs0.readFileSync(voicesPath, 'utf8'));
    const alertas = [...(voices.alertas || [])];

    // Adiciona alertas derivados de runtime
    const now = Date.now();
    const D14 = 14 * 24 * 3600 * 1000;
    try {
      const recentPosts = db.prepare("SELECT voice_id, MAX(captured_at) AS last_at FROM posts GROUP BY voice_id").all();
      const voicesAtivos = (voices.voices || []).filter(v => v.status !== 'inativo');
      for (const v of voicesAtivos) {
        const row = recentPosts.find(p => p.voice_id === v.id);
        if (!row || (now - new Date(row.last_at).getTime()) > D14) {
          alertas.push({ tipo: 'warn', msg: `${v.nome}: sem post registrado nos últimos 14 dias.` });
        }
      }
    } catch (e) { /* sqlite offline ou tabela vazia — segue sem o alerta derivado */ }

    // 🔔 Alertas pessoais por sessão (v0.82.0) — dados reais, direto do SQLite.
    try {
      const su = req.session && req.session.user;
      if (su && su.role === 'head') {
        const pend = db.prepare(`SELECT COUNT(*) n FROM coin_redemptions WHERE status='pendente'`).get().n;
        if (pend > 0) alertas.unshift({ tipo: 'action', msg: `🎁 ${pend} resgate(s) da Loja aguardando sua decisão`, href: '/admin/coins' });
        const novas = db.prepare(`SELECT COUNT(*) n FROM recruitment_applications WHERE COALESCE(status,'novo')='novo'`).get().n;
        if (novas > 0) alertas.unshift({ tipo: 'action', msg: `🎙️ ${novas} inscrição(ões) de Voice pra triar`, href: '/admin/inscricoes' });
      }
      if (su && su.email) {
        const meus = db.prepare(`SELECT item_nome, status FROM coin_redemptions
          WHERE email=? AND status IN ('aprovado','negado','entregue')
          AND decided_at >= datetime('now','-7 days') ORDER BY decided_at DESC LIMIT 3`)
          .all(String(su.email).toLowerCase());
        const lbl = { aprovado: '✅ aprovado', negado: '❌ negado (coins devolvidos)', entregue: '📦 entregue' };
        meus.forEach(r => alertas.unshift({ tipo: 'info', msg: `🛒 Seu resgate "${r.item_nome}": ${lbl[r.status] || r.status}`, href: '/loja' }));
      }
    } catch (e) { /* tabelas da loja podem não existir em ambiente isolado */ }

    // Módulo 20 — pautas dos Voices (revisão pendente, link liberado, OK da Duda)
    try {
      const su2 = req.session && req.session.user;
      if (su2 && su2.email) {
        require('./routes/voices-pipeline').alertasDoUsuario(su2.email, su2.role)
          .forEach(a => alertas.unshift(a));
      }
    } catch (e) { /* pipeline pode não estar carregado em ambiente isolado */ }

    res.json({ alertas, count: alertas.length });
  } catch (e) {
    res.status(500).json({ alertas: [], error: e.message });
  }
});

// ── INBOUND GENERATE: substitui window.claude.complete() do artifact host ──
// Aceita format='post' (Brief→Post, default) ou 'carousel' (cover + N slides + cta).
// Usado por /inbound/brief e /inbound/carousel.
// ── INBOUND GENERATION & CONTENT FACTORY (Modularizado em routes/inbound.js) ──

// Single source of truth — local e Railway servem do mesmo public/.
// (Antes o local lia de G:/Meu Drive/.../dashboard-classic.html que ficou stale.
// Agora qualquer edição em public/ aparece imediatamente nos 2 ambientes.)
const OFFICE_HTML    = path.join(__dirname, 'public/office.html');
const GAME_HUB_HTML  = path.join(__dirname, 'public/game-hub.html');
const HOME_HTML      = path.join(__dirname, 'public/home.html');
const HUB_HTML       = path.join(__dirname, 'public/hub.html');
const LOGIN_HTML     = path.join(__dirname, 'public/login.html');
// Tela de login branded (portas Office + Game). Se já logado, manda pra home.
app.get('/login', (req, res) => {
  const u = req.session && req.session.user;
  if (u) return res.redirect(u.role === 'hub' ? '/hub' : '/');
  res.sendFile(LOGIN_HTML);
});
// Marketing Hub é a tela central de quem não é do núcleo (role 'hub').
app.get('/', (req, res) => {
  const u = req.session && req.session.user;
  if (u && u.role === 'hub') return res.redirect('/hub');
  res.sendFile(HOME_HTML);
});
// /game = game do time de marketing. Colaborador (role 'hub') vai pro game do Hub.
app.get('/game', (req, res) => {
  const u = req.session && req.session.user;
  if (u && u.role === 'hub') return res.redirect('/game-hub');
  res.sendFile(OFFICE_HTML);
});
// /game-hub = versão do game pra colaboradores EPI-USE (itens do Marketing Hub).
app.get('/game-hub', (req, res) => res.sendFile(GAME_HUB_HTML));
app.get('/memes',     (req, res) => res.sendFile(path.join(__dirname, 'public/memes.html')));
app.get('/cockpit',   (req, res) => res.redirect(301, '/'));

// ── /api/pendencias — parsea vault/00-contexto/pendencias.md em 5 buckets ──
app.get('/api/pendencias', (req, res) => {
  try {
    const md = fs.readFileSync(path.join(__dirname, 'vault/00-contexto/pendencias.md'), 'utf8');
    // splita por ## (level 2 headings)
    const sections = md.split(/^## /m).slice(1); // remove preamble
    const buckets = { bloqueadas: [], dropadas: [], achados: [], pendentes: [], entregues: [] };
    const bucketMap = {
      '🔴': 'bloqueadas', '🟡': 'dropadas', '⚠️': 'achados',
      '🟢': 'pendentes', '✅': 'entregues'
    };
    for (const sec of sections) {
      const firstLine = sec.split('\n')[0];
      let bucket = null;
      for (const [emoji, key] of Object.entries(bucketMap)) {
        if (firstLine.includes(emoji)) { bucket = key; break; }
      }
      if (!bucket) continue;
      // parsea sub-items (### B1. ... ou ### P0. ...)
      const items = sec.split(/^### /m).slice(1);
      for (const item of items) {
        const lines = item.split('\n');
        const titulo = (lines[0] || '').replace(/\s*$/, '').trim();
        // pega 1-3 primeiras linhas com conteudo apos o titulo
        const corpo = lines.slice(1).filter(l => l.trim()).slice(0, 5).join(' ').slice(0, 300);
        if (titulo) items_collect(buckets[bucket], titulo, corpo, sec);
      }
      // se a secao nao tem subheadings, captura o body geral
      if (items.length === 0) {
        const corpo = sec.split('\n').slice(1, 4).filter(l => l.trim()).join(' ').slice(0, 300);
        if (corpo) buckets[bucket].push({ titulo: firstLine.trim(), descricao: corpo, secao: firstLine.trim() });
      }
    }
    res.json({
      gerado_em: new Date().toISOString(),
      fonte: 'vault/00-contexto/pendencias.md',
      total: Object.values(buckets).reduce((a, b) => a + b.length, 0),
      buckets
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
function items_collect(arr, titulo, descricao, secao) {
  arr.push({ titulo, descricao, secao: (secao.split('\n')[0] || '').trim().slice(0, 80) });
}

// Aposentados (v0.34.0): dashboard e hub foram substituídos pela home (/).
// Redirect 301 pra não quebrar links antigos nem o returnTo do SSO.
app.get('/dashboard', (req, res) => res.redirect(301, '/'));
// Marketing Hub — portal central pra quem não é do núcleo de marketing.
app.get('/hub',       (req, res) => res.sendFile(HUB_HTML));
// Brand Assets — página própria (paleta, tipografia, logos). Linkada por último no Hub.
app.get('/brand',     (req, res) => res.sendFile(path.join(__dirname, 'public/brand.html')));
// Campanhas em jogo — campanhas internas (Gol de Placa) + LinkedIn ativas.
app.get('/campanhas', (req, res) => res.sendFile(path.join(__dirname, 'public/campanhas.html')));
// Escolher visualização (Office | Game) pós-login. Requer sessão (enforcement cuida disso).
app.get('/escolher-visao', (req, res) => res.sendFile(path.join(__dirname, 'public/escolher-visao.html')));
// v0.5.0 — Novas rotas (Onda 2-6)
app.get('/relatorio', (req, res) => res.sendFile(path.join(__dirname, 'public/relatorio.html')));
app.get('/artigos',   (req, res) => res.sendFile(path.join(__dirname, 'public/artigos.html')));
app.get('/jornadas',  (req, res) => res.sendFile(path.join(__dirname, 'public/jornadas.html')));
app.get('/metas-fy26', (req, res) => res.sendFile(path.join(__dirname, 'public/metas-fy26.html')));
app.get('/metas-fy27', (req, res) => res.sendFile(path.join(__dirname, 'public/metas-fy27.html')));
app.get('/metas/fy26', (req, res) => res.redirect(301, '/metas-fy27'));
app.get('/metas/fy27', (req, res) => res.redirect(301, '/metas-fy27'));
app.get('/design', (req, res) => res.sendFile(path.join(__dirname, 'public/design.html')));
app.get('/erp-impacto', (req, res) => res.sendFile(path.join(__dirname, 'public/erp-impacto.html')));
app.get('/pipeline',  (req, res) => res.sendFile(path.join(__dirname, 'public/pipeline.html')));

// ════════════════════════════════════════════════════════════════════════════
// v0.5.0 ENDPOINTS — Artigos · LinkedIn historical · Jornadas · Relatório · Projeções
// ════════════════════════════════════════════════════════════════════════════
const ARTIGOS_JSON_PATH = path.join(__dirname, 'public/api/artigos.json');
const LINKEDIN_HIST_PATH = path.join(__dirname, 'public/api/linkedin-historical.json');
const KPIS_HIST_PATH = path.join(__dirname, 'public/api/kpis-historical.json');
const METAS_FY26_PATH = path.join(__dirname, 'public/api/metas-fy26.json');

function _readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.warn(`[json] não conseguiu ler ${filePath}: ${e.message}`);
    return fallback;
  }
}

// GET /api/artigos?linha=X&etapa=Y&q=texto&voice=slug&status=reescrever&limit=50&offset=0
app.get('/api/artigos', (req, res) => {
  const data = _readJSON(ARTIGOS_JSON_PATH, { artigos: [], agregados: {} });
  let lista = data.artigos || [];
  const { linha, etapa, q, voice, status, limit = 50, offset = 0 } = req.query;
  if (linha) lista = lista.filter(a => a.linha_de_negocio === linha);
  if (etapa) lista = lista.filter(a => a.etapa_funil === etapa);
  if (status) lista = lista.filter(a => a.status_reaproveitamento === status);
  if (voice) lista = lista.filter(a => a.voice_atribuido === voice || (a.favorito_voices || []).includes(voice));
  if (q) {
    const qq = String(q).toLowerCase();
    lista = lista.filter(a => (a.titulo || '').toLowerCase().includes(qq));
  }
  const total = lista.length;
  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = parseInt(offset) || 0;
  res.json({
    success: true,
    total,
    agregados: data.agregados,
    artigos: lista.slice(off, off + lim),
    gerado_em: data.gerado_em,
  });
});

// GET /api/jornadas — matriz LOB × etapa funil com gaps
app.get('/api/jornadas', (req, res) => {
  const data = _readJSON(ARTIGOS_JSON_PATH, { artigos: [] });
  const matriz = {};
  for (const a of data.artigos || []) {
    const lob = a.linha_de_negocio || 'Sem LOB';
    const et = a.etapa_funil || 'Sem Etapa';
    matriz[lob] = matriz[lob] || { 'Topo (Aprendizado)': [], 'Meio (Consideração)': [], 'Fundo (Decisão)': [] };
    if (!matriz[lob][et]) matriz[lob][et] = [];
    matriz[lob][et].push({ id: a.id, titulo: a.titulo, url: a.url });
  }
  // Calcula gaps (LOB sem Meio ou sem Fundo)
  const gaps = [];
  for (const [lob, etapas] of Object.entries(matriz)) {
    for (const [etapa, artigos] of Object.entries(etapas)) {
      if (artigos.length === 0 && etapa !== 'Sem Etapa') {
        gaps.push({ lob, etapa, situacao: 'crítico' });
      } else if (artigos.length < 3 && etapa !== 'Topo (Aprendizado)') {
        gaps.push({ lob, etapa, situacao: 'insuficiente', count: artigos.length });
      }
    }
  }
  res.json({ success: true, matriz, gaps });
});

// ── Fonte ÚNICA do nº de seguidores (v0.46.0) ──────────────────────────────
// linkedin-routine.json é regenerado TODO DIA (Tarefa Agendada → xlsx Cowork).
// Sobrepomos o total fresco no serve-time, sem reescrever historical.json
// (evita guerra com sync_linkedin_historical.py). Assim TODO consumidor que lê
// /api/linkedin/historical (home, area, metas, relatorio, executivo) mostra o
// número atualizado do dia — fonte única, zero campo chumbado.
const LINKEDIN_ROUTINE_PATH = path.join(__dirname, 'public/api/linkedin-routine.json');
const _MES_PT = { jan:'01', fev:'02', mar:'03', abr:'04', mai:'05', jun:'06', jul:'07', ago:'08', set:'09', out:'10', nov:'11', dez:'12' };
function _routineMesToISO(m) {
  // "jun/2026" -> "2026-06"
  const mm = String(m || '').toLowerCase().match(/([a-z]{3})\/?(\d{4})/);
  if (!mm || !_MES_PT[mm[1]]) return null;
  return `${mm[2]}-${_MES_PT[mm[1]]}`;
}
// Lê o snapshot diário da rotina; retorna { total, mes_iso, novos, impressoes, reacoes, atualizado_em } ou null
function readLinkedinRoutine() {
  const r = _readJSON(LINKEDIN_ROUTINE_PATH, null);
  if (!r || r.seguidores_atual == null) return null;
  const atual = (r.historico || []).slice(-1)[0] || {};
  return {
    total: r.seguidores_atual,
    mes_iso: _routineMesToISO(r.mes_atual),
    mes_label: r.mes_atual,
    novos: atual.novos_30d ?? null,
    impressoes: atual.impressoes ?? null,
    reacoes: atual.reacoes ?? null,
    top_posts: r.top_posts || [],
    posts: r.posts || [],
    atualizado_em: r.atualizado_em,
    fonte: r.fonte,
  };
}
// Sobrepõe o total da rotina no serie_mensal (upsert do mês corrente) sem persistir
function overlayLinkedinRoutine(data) {
  const rt = readLinkedinRoutine();
  if (!rt || rt.total == null || !rt.mes_iso) return data;
  const out = { ...data, serie_mensal: [...(data.serie_mensal || [])] };
  const i = out.serie_mensal.findIndex(m => m.mes === rt.mes_iso);
  const entry = {
    mes: rt.mes_iso, total_seguidores: rt.total, novos: rt.novos,
    impressoes: rt.impressoes, fonte: 'rotina-cowork (admin diario)',
  };
  if (i >= 0) out.serie_mensal[i] = { ...out.serie_mensal[i], ...entry };
  else out.serie_mensal.push(entry);
  if (out.resumo) out.resumo = { ...out.resumo, ultimo_total_reportado: rt.total, atualizado_rotina: rt.atualizado_em };
  out._rotina_overlay = { aplicado: true, total: rt.total, mes: rt.mes_iso, em: rt.atualizado_em };
  return out;
}

// GET /api/linkedin/historical — 16+ meses + demografia + eventos (+ overlay rotina diária)
app.get('/api/linkedin/historical', (req, res) => {
  const data = _readJSON(LINKEDIN_HIST_PATH, null);
  if (!data) return res.status(404).json({ success: false, error: 'linkedin-historical.json não encontrado. Rode: python scripts/sync/sync_linkedin_historical.py' });
  res.json({ success: true, ...overlayLinkedinRoutine(data) });
});

// GET /api/linkedin/followers — snapshot canônico do dia (fonte única p/ qualquer tela nova)
app.get('/api/linkedin/followers', (req, res) => {
  const rt = readLinkedinRoutine();
  if (!rt) return res.status(404).json({ success: false, error: 'linkedin-routine.json não encontrado. Rode a rotina diária.' });
  res.json({ success: true, ...rt });
});

// ── LinkedIn INTELLIGENCE (v0.46.0) — cruza LinkedIn × Pipeline (Zoho) × Conteúdo (693 artigos) ──
// O valor de ter isso no app (vs ir no LinkedIn Analytics direto): conectar
// presença de marca → demanda → cobertura de conteúdo, por LOB.
const _LOB_CANON = ['HCM', 'S/4HANA', 'BTP', 'ServiceNow', 'Signavio', 'ESG/ERP.ngo', 'Cloud/Infra', 'Outros'];
// mapeia post (texto livre) -> LOB canônico via palavra-chave
function _postToLob(txt) {
  const t = (txt || '').toLowerCase();
  if (/servicenow|hrsd|itsm/.test(t)) return 'ServiceNow';
  if (/signavio|processo|process mining/.test(t)) return 'Signavio';
  if (/btp|build|integration suite|clean core/.test(t)) return 'BTP';
  if (/elephant|erp\.ngo|elefante|rinoceronte|esg|conserva|pobreza/.test(t)) return 'ESG/ERP.ngo';
  if (/successfactors|hxm|hcm|\brh\b|folha|payroll|talento|colaborador|profissional de rh/.test(t)) return 'HCM';
  if (/s\/?4hana|s4hana|\berp\b|reforma trib|ecc|migra/.test(t)) return 'S/4HANA';
  if (/cloud|valcann|infra|aws|hospedagem|observ/.test(t)) return 'Cloud/Infra';
  return 'Outros';
}
const _ZOHO_SOL_LOB = { 'SAP HXM': 'HCM', 'SAP ERP': 'S/4HANA', 'SAP BTP': 'BTP', 'ServiceNow': 'ServiceNow', 'SAP Signavio': 'Signavio', 'SAP Cloud': 'Cloud/Infra', 'Cloud': 'Cloud/Infra', 'SAP HANA': 'S/4HANA' };
const _ART_LOB = { 'Serviços HCM & RH': 'HCM', 'Serviços SAP ERP (S/4HANA)': 'S/4HANA', 'ServiceNow': 'ServiceNow', 'Estratégia & ESG (ERP.ngo)': 'ESG/ERP.ngo', 'Infraestrutura & Cloud (Valcann)': 'Cloud/Infra', 'Excelência em Processos': 'Signavio', 'Observabilidade & Testes (iLab)': 'Outros' };

app.get('/api/linkedin/intelligence', (req, res) => {
  const rt = readLinkedinRoutine();
  if (!rt) return res.status(404).json({ success: false, error: 'rotina LinkedIn indisponível.' });

  // base canônica
  const cross = {};
  _LOB_CANON.forEach(l => cross[l] = { lob: l, li_posts: 0, li_impressoes: 0, li_engaj_soma: 0, li_top: null, pipeline: 0, deals: 0, artigos: 0, artigos_fundo: 0 });

  // 1) LinkedIn: posts -> LOB
  (rt.posts || []).forEach(p => {
    const lob = _postToLob((p.resumo || '') + ' ' + (p.tipo || ''));
    const c = cross[lob]; if (!c) return;
    c.li_posts++; c.li_impressoes += (p.impressoes || 0);
    if (p.taxa_engaj != null) c.li_engaj_soma += p.taxa_engaj;
    if (!c.li_top || (p.taxa_engaj || 0) > (c.li_top.taxa_engaj || 0)) c.li_top = { resumo: p.resumo, taxa_engaj: p.taxa_engaj, impressoes: p.impressoes };
  });

  // 2) Pipeline: Zoho por solution (SQLite)
  try {
    const sols = db.prepare(`SELECT solution, SUM(valor) total, COUNT(*) deals FROM zoho_deals WHERE solution IS NOT NULL AND solution != '' GROUP BY solution`).all();
    sols.forEach(s => {
      const lob = _ZOHO_SOL_LOB[s.solution] || 'Outros';
      if (cross[lob]) { cross[lob].pipeline += (s.total || 0); cross[lob].deals += (s.deals || 0); }
    });
  } catch (e) { console.warn('[li-intel] zoho:', e.message); }

  // 3) Conteúdo: 693 artigos por LOB
  try {
    const art = _readJSON(ARTIGOS_JSON_PATH, { artigos: [] });
    (art.artigos || []).forEach(a => {
      const lob = _ART_LOB[a.linha_de_negocio] || 'Outros';
      if (cross[lob]) { cross[lob].artigos++; if ((a.etapa_funil || '').startsWith('Fundo')) cross[lob].artigos_fundo++; }
    });
  } catch (e) { console.warn('[li-intel] artigos:', e.message); }

  // finaliza: média engaj + insights acionáveis
  const linhas = Object.values(cross).map(c => ({
    ...c,
    li_engaj_medio: c.li_posts ? +(c.li_engaj_soma / c.li_posts).toFixed(4) : null,
  })).filter(c => c.li_posts || c.pipeline || c.artigos);

  // feed de posts individuais disponivel? (rotina diaria so traz seguidores/impressoes/reacoes)
  const postsFeed = (rt.posts || []).length > 0;

  // insights: alto engaj + pipeline mas pouca cobertura de fundo = oportunidade
  const insights = [];
  if (!postsFeed) {
    insights.push({ tipo: 'pendente', lob: null, msg: '⏳ Feed de posts do LinkedIn ainda nao integrado (LinkedIn API) — engajamento por post/LOB fica pendente. Seguidores, impressoes e reacoes sao REAIS (rotina diaria).' });
  }
  linhas.forEach(c => {
    if (c.li_engaj_medio != null && c.li_engaj_medio >= 0.10 && c.pipeline > 1e6 && c.artigos_fundo < 5) {
      insights.push({ tipo: 'oportunidade', lob: c.lob, msg: `${c.lob}: engaja no LinkedIn (${(c.li_engaj_medio*100).toFixed(1)}%) e tem R$${(c.pipeline/1e6).toFixed(1)}M em pipeline, mas só ${c.artigos_fundo} artigo(s) de fundo de funil — gap de conteúdo de decisão.` });
    }
    if (postsFeed && c.pipeline > 1e6 && c.li_posts === 0) {
      insights.push({ tipo: 'silencio', lob: c.lob, msg: `${c.lob}: R$${(c.pipeline/1e6).toFixed(1)}M em pipeline e ZERO post no período — marca silenciosa onde há demanda.` });
    }
    if (c.li_posts > 0 && c.pipeline === 0) {
      insights.push({ tipo: 'sem_retorno', lob: c.lob, msg: `${c.lob}: ${c.li_posts} post(s) no LinkedIn mas R$0 de pipeline atribuído — conteúdo sem captura comercial (ou atribuição faltando).` });
    }
  });

  res.json({
    success: true,
    snapshot: { total: rt.total, mes: rt.mes_label, novos: rt.novos, impressoes: rt.impressoes, reacoes: rt.reacoes, atualizado_em: rt.atualizado_em },
    top_posts: rt.top_posts,
    cross: linhas.sort((a, b) => b.pipeline - a.pipeline),
    insights,
    posts_feed_disponivel: postsFeed,
    fonte: 'LinkedIn (rotina Cowork) × Zoho CRM × 693 artigos — dados REAIS',
  });
});

// POST /api/linkedin/update-today — Ruda crava o nº de seguidores do dia em 5s (interim ate LinkedIn API)
app.post('/api/linkedin/update-today', requireEditorToken, (req, res) => {
  const total = parseInt(req.body && req.body.total, 10);
  if (!total || total < 1000 || total > 2000000) {
    return res.status(400).json({ success: false, error: 'Informe um total de seguidores válido (ex: 10640).' });
  }
  const data = _readJSON(LINKEDIN_HIST_PATH, null);
  if (!data || !Array.isArray(data.serie_mensal)) {
    return res.status(404).json({ success: false, error: 'linkedin-historical.json não encontrado.' });
  }
  const mes = new Date().toISOString().slice(0, 7);
  const anteriores = data.serie_mensal.filter(m => m.total_seguidores && m.mes < mes);
  const ultimoAnterior = anteriores.length ? anteriores[anteriores.length - 1].total_seguidores : null;
  let entry = data.serie_mensal.find(m => m.mes === mes);
  if (!entry) {
    entry = { mes, total_seguidores: null, novos: null, newsletter: null, posts_mes: null, impressoes: null };
    data.serie_mensal.push(entry);
  }
  entry.total_seguidores = total;
  if (req.body.novos != null) entry.novos = parseInt(req.body.novos, 10);
  else if (ultimoAnterior) entry.novos = total - ultimoAnterior;
  entry.fonte = 'manual (Rudá ' + new Date().toISOString().slice(0, 10) + ')';
  data.atualizado_em = new Date().toISOString().slice(0, 10);
  try { fs.writeFileSync(LINKEDIN_HIST_PATH, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { return res.status(500).json({ success: false, error: e.message }); }
  res.json({ success: true, mes, total_seguidores: total, novos: entry.novos });
});

// GET /api/relatorio/snapshot?fy=26|27 — agregado anual fiscal (jul→jun)
// Mantém retrocompat com ?mes=YYYY-MM (mensal).
function _fyMonths(fy) {
  const startYear = 2000 + fy - 1;
  const meses = [];
  for (let m = 7; m <= 12; m++) meses.push(`${startYear}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 6; m++) meses.push(`${startYear + 1}-${String(m).padStart(2, '0')}`);
  return meses;
}

function _snapshotFY(req, res) {
  const fy = parseInt(req.query.fy, 10);
  if (![26, 27].includes(fy)) return res.status(400).json({ success: false, error: 'FY invalido. Use 26 ou 27.' });
  const meses = _fyMonths(fy);
  const hoje = new Date().toISOString().slice(0, 7);
  const elegiveis = meses.filter(m => m <= hoje);

  const linkedin = _readJSON(LINKEDIN_HIST_PATH, { serie_mensal: [], demografia: {}, resumo: {}, eventos: [] });
  const sm = (linkedin.serie_mensal || []).filter(x => meses.includes(x.mes)).sort((a,b) => a.mes.localeCompare(b.mes));
  const seg_ini = sm[0]?.total_seguidores ?? null;
  const seg_fim = sm[sm.length - 1]?.total_seguidores ?? null;
  const novos_fy = sm.reduce((a, x) => a + (x.novos ?? x.novos_diario ?? 0), 0);
  const posts_fy = sm.reduce((a, x) => a + (x.posts_mes ?? 0), 0);
  const impr_fy = sm.reduce((a, x) => a + (x.impressoes ?? 0), 0);

  // GA4 agregado FY (real data only — só meses com cache)
  let site = null;
  try {
    const ga4 = _readJSON(path.join(__dirname, 'public/api/ga4-snapshot.json'), { meses: {} });
    const obtidos = meses.filter(m => ga4.meses && ga4.meses[m] && ga4.meses[m].usuarios != null);
    if (obtidos.length) {
      const sum = (k) => obtidos.reduce((a, m) => a + (ga4.meses[m][k] || 0), 0);
      // Duração média ponderada por sessões (mais correta que média simples)
      const tot_sess = sum('sessoes');
      const tot_segs = obtidos.reduce((a, m) => a + (ga4.meses[m].duracao_sessao_s || 0) * (ga4.meses[m].sessoes || 0), 0);
      const duracao_avg = tot_sess > 0 ? Math.round(tot_segs / tot_sess) : null;
      // Top pages agregadas no FY (soma visualizações por path)
      const pagesMap = new Map();
      obtidos.forEach(m => {
        (ga4.meses[m].top_pages || []).forEach(p => {
          const key = p.path;
          const cur = pagesMap.get(key) || { path: p.path, title: p.title, visualizacoes: 0, usuarios: 0 };
          cur.visualizacoes += p.visualizacoes || 0;
          cur.usuarios += p.usuarios || 0;
          if (p.title && !cur.title) cur.title = p.title;
          pagesMap.set(key, cur);
        });
      });
      const top_pages_fy = Array.from(pagesMap.values())
        .sort((a, b) => b.visualizacoes - a.visualizacoes)
        .slice(0, 10);
      site = {
        usuarios: sum('usuarios'),
        visualizacoes: sum('visualizacoes'),
        sessoes: sum('sessoes'),
        duracao_sessao_s: duracao_avg,
        top_pages: top_pages_fy,
        meses_com_dado: obtidos.length,
        meses_elegiveis: elegiveis.length,
        meses_total_fy: meses.length,
        fonte: 'GA4 Data API (agregado FY)',
        atualizado_em: ga4.atualizado_em || null,
      };
    }
  } catch (e) { console.warn('[relatorio FY] ga4 fail:', e.message); }

  // Email FY (RD Station) — estado atual da base + histórico de envios
  let email = null;
  try {
    const rd = _readJSON(path.join(__dirname, 'public/api/rd-snapshot.json'), null);
    if (rd && rd.emails) {
      email = {
        total_enviados_historico: rd.emails.total_enviados ?? null,
        enviados_mes_atual: rd.emails.enviados_mes_atual ?? null,
        mes_atual: rd.emails.mes_atual ?? null,
        total_na_conta: null,
        segmentacoes_total: rd.segmentations?.total ?? null,
        workflows_ativos: rd.workflows?.ativos ?? null,
        landing_pages_publicadas: rd.landing_pages?.publicadas ?? null,
        base_leads: (rd.segmentations?.top || []).find(s => /todos os contatos/i.test(s.name))?.contatos ?? null,
        base_leads_aprox: (rd.segmentations?.top || []).find(s => /todos os contatos/i.test(s.name))?.contatos_aprox || false,
        fonte: rd.fonte || 'RD Station Marketing API',
        atualizado_em: rd.atualizado_em || null,
      };
    }
  } catch (e) { console.warn('[relatorio FY] rd fail:', e.message); }

  // Cases — estado atual (não tem histórico mensal)
  let cases = { live: 0, publicado: 0, em_edicao: 0, negociacao: 0, declinado: 0 };
  try {
    const cs = db.prepare('SELECT status, COUNT(*) as n FROM cs_clientes GROUP BY status').all();
    cs.forEach(r => {
      const k = (r.status || '').replace('case-', '').replace('-', '_');
      if (k in cases) cases[k] = r.n;
    });
  } catch (e) { console.warn('[relatorio FY] cases fail:', e.message); }

  // Voices
  let voices = [];
  try {
    const vd = _readJSON(path.join(__dirname, 'public/api/voices.json'), { voices: [] });
    voices = (vd.voices || []).map(v => ({ id: v.id, nome: v.nome, status: v.status, area: v.area, ssi: v.ssi_baseline || null, seg: v.seguidores_baseline || null }));
  } catch {}

  // Eventos do FY
  const eventos_fy = (linkedin.eventos || []).filter(e => meses.includes((e.data || '').slice(0, 7)));

  res.json({
    success: true,
    modo: 'fy',
    fy,
    label: `FY${fy} (jul/${String(2000 + fy - 1).slice(-2)} → jun/${String(2000 + fy).slice(-2)})`,
    meses,
    meses_elegiveis: elegiveis,
    meses_com_dado: sm.map(x => x.mes),
    em_andamento: elegiveis.length < meses.length,
    site,
    email,
    linkedin: {
      total_atual: seg_fim,
      total_inicio: seg_ini,
      ganho_total: (seg_ini != null && seg_fim != null) ? (seg_fim - seg_ini) : null,
      ganho_pct: (seg_ini && seg_fim) ? Math.round(100 * (seg_fim - seg_ini) / seg_ini * 100) / 100 : null,
      novos: novos_fy,
      posts_mes: posts_fy,
      impressoes: impr_fy,
      newsletter: sm[sm.length - 1]?.newsletter ?? null,
      serie_12m: sm,
      eventos_mes: eventos_fy,
      tatica_elefante: {
        eventos_no_periodo: eventos_fy.length,
        seguidores_via_eventos: linkedin.resumo?.total_via_eventos || 0,
        pct_eventos: linkedin.resumo?.pct_eventos || 0,
      },
      demografia: linkedin.demografia,
    },
    cases,
    voices: {
      ativos: voices.filter(v => v.status === 'ativo' || v.status === 'onboarding').length,
      total: voices.length,
      lista: voices,
    },
    eventos_proximos: [],
    alertas: [],
    gerado_em: new Date().toISOString(),
  });
}

// GET /api/relatorio/snapshot?mes=YYYY-MM — agrega TUDO pra o relatório mensal
app.get('/api/relatorio/snapshot', (req, res) => {
  if (req.query.fy) return _snapshotFY(req, res);
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  // overlay rotina diária → total de seguidores do mês corrente sempre fresco (fonte única)
  const linkedin = overlayLinkedinRoutine(_readJSON(LINKEDIN_HIST_PATH, { serie_mensal: [], demografia: {}, resumo: {}, eventos: [] }));

  // Recupera o mês específico + comparativo com mês anterior
  const sm = linkedin.serie_mensal || [];
  const idxAtual = sm.findIndex(m => m.mes === mes);
  const atual = idxAtual >= 0 ? sm[idxAtual] : null;
  const anterior = idxAtual > 0 ? sm[idxAtual - 1] : null;
  const mom = (a, b) => (a && b && b > 0) ? Math.round(100 * (a - b) / b * 100) / 100 : null;

  // Lógica de mesclagem de KPIs históricos consolidada
  const kpisHist = _readJSON(KPIS_HIST_PATH, { meses: {} });
  const histMes = kpisHist.meses && kpisHist.meses[mes];
  
  // Acha o mês anterior dinâmico para comparação MoM histórica
  const anteriorMes = idxAtual > 0 ? sm[idxAtual - 1].mes : null;
  const histAnterior = anteriorMes ? (kpisHist.meses && kpisHist.meses[anteriorMes]) : null;

  // Cases atuais
  let cases = { live: 0, publicado: 0, em_edicao: 0, negociacao: 0, declinado: 0 };
  try {
    const cs = db.prepare('SELECT status, COUNT(*) as n FROM cs_clientes GROUP BY status').all();
    cs.forEach(r => {
      const k = (r.status || '').replace('case-', '').replace('-', '_');
      if (k in cases) cases[k] = r.n;
    });
  } catch (e) { console.warn('[relatorio] cases fail:', e.message); }

  // Voices
  let voices = [];
  try {
    const vd = _readJSON(path.join(__dirname, 'public/api/voices.json'), { voices: [] });
    voices = (vd.voices || []).map(v => ({ id: v.id, nome: v.nome, status: v.status, area: v.area, ssi: v.ssi_baseline || null, seg: v.seguidores_baseline || null }));
  } catch {}

  // Eventos do mês
  const eventosMes = (linkedin.eventos || []).filter(e => (e.data || '').startsWith(mes));

  // Próximos eventos (events.json)
  let eventos_proximos = [];
  try {
    const ev = _readJSON(path.join(__dirname, 'public/api/events.json'), { eventos_brasil: [] });
    const all = (ev.eventos_brasil || []).concat(ev.eventos_latam || []);
    const hoje = new Date().toISOString().slice(0, 10);
    eventos_proximos = all.filter(e => (e.data_inicio || e.data || '') >= hoje).slice(0, 5);
  } catch {}

  // Site (GA4) — lê snapshot gravado por scripts/integrations/ga4_fetch.js (quota-safe)
  let site = null;
  try {
    const ga4 = _readJSON(path.join(__dirname, 'public/api/ga4-snapshot.json'), { meses: {} });
    const s = ga4.meses && ga4.meses[mes];
    if (s && s.usuarios != null) {
      site = {
        usuarios: s.usuarios,
        visualizacoes: s.visualizacoes,
        sessoes: s.sessoes,
        duracao_sessao_s: s.duracao_sessao_s,
        usuarios_mom_pct: s.usuarios_mom_pct ?? null,
        visualizacoes_mom_pct: s.visualizacoes_mom_pct ?? null,
        duracao_sessao_mom_pct: s.duracao_sessao_mom_pct ?? null,
        top_pages: s.top_pages || [],
        fonte: s.fonte || 'GA4 Data API',
        atualizado_em: s.atualizado_em || ga4.atualizado_em || null,
      };
    }
  } catch (e) { console.warn('[relatorio] ga4 fail:', e.message); }

  // Sobrescreve com o histórico do Site se disponível
  if (histMes && histMes.site) {
    site = {
      usuarios: histMes.site.usuarios,
      visualizacoes: histMes.site.visualizacoes,
      sessoes: histMes.site.sessoes ?? site?.sessoes ?? null,
      duracao_sessao_s: histMes.site.duracao_sessao_s,
      usuarios_mom_pct: histAnterior?.site ? mom(histMes.site.usuarios, histAnterior.site.usuarios) : site?.usuarios_mom_pct ?? null,
      visualizacoes_mom_pct: histAnterior?.site ? mom(histMes.site.visualizacoes, histAnterior.site.visualizacoes) : site?.visualizacoes_mom_pct ?? null,
      duracao_sessao_mom_pct: histAnterior?.site ? mom(histMes.site.duracao_sessao_s, histAnterior.site.duracao_sessao_s) : site?.duracao_sessao_mom_pct ?? null,
      top_pages: site?.top_pages || [],
      fonte: 'Report Mensal (GA4)',
      atualizado_em: new Date().toISOString()
    };
  }

  // Email (RD Station) — lê snapshot gravado por scripts/integrations/rd_fetch.js
  let email = null;
  try {
    const rd = _readJSON(path.join(__dirname, 'public/api/rd-snapshot.json'), null);
    if (rd && rd.emails) {
      email = {
        total_enviados_historico: rd.emails.total_enviados ?? null,
        enviados_mes_atual: rd.emails.enviados_mes_atual ?? null,
        mes_atual: rd.emails.mes_atual ?? null,
        total_na_conta: null,
        segmentacoes_total: rd.segmentations?.total ?? null,
        workflows_ativos: rd.workflows?.ativos ?? null,
        landing_pages_publicadas: rd.landing_pages?.publicadas ?? null,
        base_leads: (rd.segmentations?.top || []).find(s => /todos os contatos/i.test(s.name))?.contatos ?? null,
        base_leads_aprox: (rd.segmentations?.top || []).find(s => /todos os contatos/i.test(s.name))?.contatos_aprox || false,
        fonte: rd.fonte || 'RD Station Marketing API',
        atualizado_em: rd.atualizado_em || null,
      };
    }
  } catch (e) { console.warn('[relatorio] rd fail:', e.message); }

  // Mescla dados do histórico do Email se disponíveis
  if (histMes && histMes.email) {
    email = {
      ...(email || {}),
      taxa_abertura: histMes.email.taxa_abertura,
      taxa_cliques: histMes.email.taxa_cliques,
      leads: histMes.email.leads,
      taxa_abertura_mom_pct: histAnterior?.email ? mom(histMes.email.taxa_abertura, histAnterior.email.taxa_abertura) : null,
      taxa_cliques_mom_pct: histAnterior?.email ? mom(histMes.email.taxa_cliques, histAnterior.email.taxa_cliques) : null,
      leads_mom_pct: histAnterior?.email ? mom(histMes.email.leads, histAnterior.email.leads) : null,
      fonte: email?.fonte ? `${email.fonte} + Report` : 'Report Mensal (RD Station)'
    };
  }

  // Instagram histórico
  let instagram = null;
  if (histMes && histMes.instagram) {
    instagram = {
      seguidores_novos: histMes.instagram.seguidores_novos,
      alcance: histMes.instagram.alcance,
      seguidores_mom_pct: histAnterior?.instagram ? mom(histMes.instagram.seguidores_novos, histAnterior.instagram.seguidores_novos) : null,
      alcance_mom_pct: histAnterior?.instagram ? mom(histMes.instagram.alcance, histAnterior.instagram.alcance) : null,
      fonte: 'Report Mensal (Instagram)',
      atualizado_em: new Date().toISOString()
    };
  }

  // Bloco de resposta consolidado
  res.json({
    success: true,
    mes,
    site,
    email,
    instagram,
    linkedin: {
      total_atual: atual?.total_seguidores ?? null,
      novos: atual?.novos ?? atual?.novos_diario ?? null,
      novos_mom_pct: mom(atual?.novos ?? atual?.novos_diario, anterior?.novos ?? anterior?.novos_diario),
      newsletter: atual?.newsletter ?? null,
      impressoes: histMes?.linkedin?.impressoes ?? atual?.impressoes ?? null,
      engajamento: histMes?.linkedin?.engajamento ?? null,
      impressoes_mom_pct: histAnterior?.linkedin?.impressoes && histMes?.linkedin?.impressoes ? mom(histMes.linkedin.impressoes, histAnterior.linkedin.impressoes) : null,
      engajamento_mom_pct: histAnterior?.linkedin?.engajamento && histMes?.linkedin?.engajamento ? mom(histMes.linkedin.engajamento, histAnterior.linkedin.engajamento) : null,
      posts_mes: atual?.posts_mes ?? null,
      serie_12m: sm.slice(-12),
      eventos_mes: eventosMes,
      tatica_elefante: {
        eventos_no_periodo: (linkedin.eventos || []).length,
        seguidores_via_eventos: linkedin.resumo?.total_via_eventos || 0,
        pct_eventos: linkedin.resumo?.pct_eventos || 0,
      },
      demografia: linkedin.demografia,
    },
    cases,
    voices: {
      ativos: voices.filter(v => v.status === 'ativo' || v.status === 'onboarding').length,
      total: voices.length,
      lista: voices,
    },
    eventos_proximos,
    alertas: _gerarAlertas(linkedin, atual, anterior),
  });
});

// GET /api/rd/canais — dados de canais de aquisição do RD Station
app.get('/api/rd/canais', (req, res) => {
  try {
    const data = _readJSON(path.join(__dirname, 'public/api/rd-canais.json'), { canais_series: [] });
    const { start_date, end_date } = req.query;
    let series = data.canais_series || [];
    if (start_date) series = series.filter(s => s.data >= start_date);
    if (end_date) series = series.filter(s => s.data <= end_date);
    
    const canais = {};
    let totalVisitas = 0;
    let totalConversoes = 0;
    
    series.forEach(pt => {
      Object.keys(pt).forEach(k => {
        if (k === 'data') return;
        if (!canais[k]) {
          canais[k] = { visitas: 0, conversoes: 0, oportunidades: 0, vendas: 0 };
        }
        canais[k].visitas += pt[k].visitas || 0;
        canais[k].conversoes += pt[k].conversoes || 0;
        canais[k].oportunidades += pt[k].oportunidades || 0;
        canais[k].vendas += pt[k].vendas || 0;
        
        totalVisitas += pt[k].visitas || 0;
        totalConversoes += pt[k].conversoes || 0;
      });
    });

    res.json({
      success: true,
      periodo: { start_date, end_date, dias: series.length },
      totals: { visitas: totalVisitas, conversoes: totalConversoes, oportunidades: 0, vendas: 0 },
      canais,
      series
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/rd/performance — dados de performance do funil de campanhas do RD Station
app.get('/api/rd/performance', (req, res) => {
  try {
    const data = _readJSON(path.join(__dirname, 'public/api/rd-canais.json'), { performance_campanhas: {} });
    const simulado = req.query.simulado === 'true';
    const perf = data.performance_campanhas || {};
    res.json({
      success: true,
      periodo: perf.periodo,
      campanhas: simulado ? perf.simulado : perf.real
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/relatorio/download-pptx?mes=YYYY-MM — executa scripts/relatorio/gerar_pptx.py e retorna o arquivo gerado
app.get('/api/relatorio/download-pptx', (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  const { exec } = require('child_process');
  const os = require('os');
  const tempFile = path.join(os.tmpdir(), `EPI-USE_Marketing_Report_${mes}_${Date.now()}.pptx`);
  
  const port = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;
  
  const PYBIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const cmd = `${PYBIN} "${path.join(__dirname, 'scripts/relatorio/gerar_pptx.py')}" --mes "${mes}" --output "${tempFile}" --base-url "${baseUrl}"`;
  
  console.log(`[relatorio] executando comando: ${cmd}`);
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[relatorio] erro ao gerar PPTX: ${error.message}`);
      return res.status(500).json({ 
        success: false, 
        error: `Erro ao gerar PowerPoint. Python + python-pptx instalados no servidor? (interpretador: ${PYBIN})`,
        details: error.message, 
        stderr 
      });
    }
    
    if (fs.existsSync(tempFile)) {
      res.download(tempFile, `EPI-USE_Marketing_Report_${mes}.pptx`, (err) => {
        if (err) console.error(`[relatorio] erro no download: ${err.message}`);
        try { fs.unlinkSync(tempFile); } catch {}
      });
    } else {
      res.status(500).json({ success: false, error: 'Arquivo PowerPoint não foi criado pelo script.' });
    }
  });
});

// POST /api/relatorio/ga4-refresh?mes=YYYY-MM — dispara fetch real do GA4 e atualiza snapshot
// Protegido por EDITOR_TOKEN. Usado manualmente ou por cron diário.
app.post('/api/relatorio/ga4-refresh', requireEditorToken, async (req, res) => {
  try {
    const ga4 = require(path.join(__dirname, 'scripts/integrations/ga4_fetch.js'));
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const result = await ga4.refreshAndCache(mes);
    res.json({ success: true, mes: result.mes, usuarios: result.usuarios, atualizado_em: result.atualizado_em });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/relatorio/ga4-refresh-fy?fy=26&force=1 — busca todos os meses do FY
app.post('/api/relatorio/ga4-refresh-fy', requireEditorToken, async (req, res) => {
  try {
    const ga4 = require(path.join(__dirname, 'scripts/integrations/ga4_fetch.js'));
    const fy = parseInt(req.query.fy, 10);
    if (![26, 27].includes(fy)) return res.status(400).json({ success: false, error: 'FY invalido. Use 26 ou 27.' });
    const force = req.query.force === '1' || req.query.force === 'true';
    const result = await ga4.refreshFY(fy, { force });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function _gerarAlertas(linkedin, atual, anterior) {
  const a = [];
  // Newsletter estagnada
  const newsletters = (linkedin.serie_mensal || []).slice(-3).map(m => m.newsletter).filter(Boolean);
  if (newsletters.length === 3 && newsletters[0] === newsletters[1] && newsletters[1] === newsletters[2]) {
    a.push({ tipo: 'warn', msg: `Newsletter estagnada em ${newsletters[0]} há 3 meses — sem captação nova` });
  }
  // Queda forte MoM
  if (atual && anterior) {
    const na = atual.novos ?? atual.novos_diario;
    const nb = anterior.novos ?? anterior.novos_diario;
    if (na && nb && (na - nb) / nb < -0.3) {
      a.push({ tipo: 'warn', msg: `Queda forte de novos seguidores: ${nb} → ${na} (${Math.round(100*(na-nb)/nb)}% MoM)` });
    }
  }
  // Sem posts trackeados
  if (atual && !atual.posts_mes) {
    a.push({ tipo: 'info', msg: 'Posts/mês sem tracking — pedir Sergio retomar a métrica' });
  }
  return a;
}


// GET /api/metas/fy26 — Metas oficiais FY26 + realizado real cruzado
app.get(['/api/metas/fy26', '/api/metas/fy27'], (req, res) => {
  const data = _readJSON(METAS_FY26_PATH, null);
  if (!data) return res.status(404).json({ success: false, error: 'metas-fy26.json não encontrado. Rode: python scripts/sync/sync_metas_fy26.py' });

  const linkedin = _readJSON(LINKEDIN_HIST_PATH, { resumo: {}, serie_mensal: [] });
  const outreach = _readJSON(path.join(__dirname, 'public/api/relatorio-outreach.json'), null);
  let casesPorLinha = {};
  let casesTotal = 0;
  try {
    const cs = db.prepare("SELECT status, linha_negocio, COUNT(*) as n FROM cs_clientes WHERE status='case-publicado' GROUP BY linha_negocio").all();
    cs.forEach(r => { casesPorLinha[r.linha_negocio || 'outros'] = r.n; casesTotal += r.n; });
  } catch (e) { console.warn('[metas/fy26] cases fail:', e.message); }

  let eventos_proprios_ano = 0;
  try {
    const ev = _readJSON(path.join(__dirname, 'public/api/events.json'), { eventos_brasil: [] });
    eventos_proprios_ano = (ev.eventos_brasil || []).filter(e => (e.tipo || '').toLowerCase().includes('proprio')).length;
  } catch {}

  // Cruzar realizado por categoria ou label (v0.52)
  const metas_com_realizado = (data.metas || []).map(m => {
    let realizado = null, realizado_fonte = null;
    const lbl = (m.label || '').toLowerCase();
    
    // 1) Mapeamento por Categoria (antigo/fallback)
    if (m.categoria) {
      switch (m.categoria) {
        case 'linkedin_seguidores_totais': {
          const ultima = linkedin.serie_mensal?.filter(x => x.total_seguidores).slice(-1)[0];
          realizado = ultima?.total_seguidores || null;
          realizado_fonte = ultima ? `report ${ultima.mes}` : null;
          break;
        }
        case 'cases_publicados_ano':
          realizado = casesTotal; realizado_fonte = 'SQLite cs_clientes'; break;
        case 'cases_sap_erp_ano':
          realizado = Object.entries(casesPorLinha).filter(([k]) => /SAP ERP|S\/4/i.test(k)).reduce((s, [,n]) => s+n, 0);
          realizado_fonte = 'cs_clientes onde linha_negocio matches SAP ERP'; break;
        case 'cases_successfactors_ano':
          realizado = Object.entries(casesPorLinha).filter(([k]) => /SuccessFactors|HCM/i.test(k)).reduce((s, [,n]) => s+n, 0);
          realizado_fonte = 'cs_clientes onde linha_negocio matches HCM/SF'; break;
        case 'cases_workforce_ano':
          realizado = Object.entries(casesPorLinha).filter(([k]) => /WorkForce/i.test(k)).reduce((s, [,n]) => s+n, 0);
          realizado_fonte = 'cs_clientes onde linha_negocio matches WorkForce'; break;
        case 'cases_servicenow_ano':
          realizado = Object.entries(casesPorLinha).filter(([k]) => /ServiceNow/i.test(k)).reduce((s, [,n]) => s+n, 0);
          realizado_fonte = 'cs_clientes onde linha_negocio matches ServiceNow'; break;
        case 'cases_process_ano':
          realizado = Object.entries(casesPorLinha).filter(([k]) => /Process|Excelência/i.test(k)).reduce((s, [,n]) => s+n, 0);
          realizado_fonte = 'cs_clientes onde linha_negocio matches Process'; break;
        case 'eventos_proprios_ano':
          realizado = eventos_proprios_ano; realizado_fonte = 'events.json tipo=proprio'; break;
      }
    }
    
    // 2) Mapeamento por Label (Metas Pessoais FY27)
    if (realizado === null) {
      const em = outreach && outreach.kpis ? (outreach.kpis.emails_enviados ?? null) : null;
      const emDia = em != null ? Math.round(em / 22 * 10) / 10 : null;
      const re = outreach && outreach.kpis ? (outreach.kpis.reunioes_realizadas ?? null) : null;
      const tc = outreach && outreach.kpis ? (outreach.kpis.empresas_em_conversa ?? null) : null;
      const plData = _readJSON(path.join(__dirname, 'public/api/pipeline-snapshot.json'), null);
      
      if (lbl.includes('toques totais / dia') && emDia != null) {
        realizado = emDia; realizado_fonte = 'Apollo (outbound emails / 22)';
      }
      else if (lbl.includes('e-mails personalizados / dia') && emDia != null) {
        realizado = emDia; realizado_fonte = 'Apollo (outbound emails / 22)';
      }
      else if (lbl.includes('contas perfiladas no apollo / semana') && tc != null) {
        realizado = Math.round(tc / 4.3 * 10) / 10; realizado_fonte = 'Apollo (contas tocadas / 4.3)';
      }
      else if (lbl.includes('reuniões qualificadas agendadas / semana') && re != null) {
        realizado = Math.round(re / 4.3 * 10) / 10; realizado_fonte = 'Apollo (meetings held / 4.3)';
      }
      else if (lbl.includes('reuniões qualificadas agendadas / mês') && re != null) {
        realizado = re; realizado_fonte = 'Apollo (meetings held 30d)';
      }
      else if (lbl.includes('seguidores linkedin') && linkedin.serie_mensal?.length) {
        const ultima = linkedin.serie_mensal.filter(x => x.novos_seguidores).slice(-1)[0];
        realizado = ultima ? (ultima.novos_seguidores_bruto || ultima.novos_seguidores || null) : null;
        realizado_fonte = ultima ? `LinkedIn Analytics (${ultima.mes})` : null;
      }
      else if (lbl.includes('artigos publicados no wordpress')) {
        try {
          const r = db.prepare("SELECT COUNT(*) AS n FROM content_pipeline WHERE estado = 'publicado'").get();
          realizado = r ? r.n : 0; realizado_fonte = 'SQLite content_pipeline';
        } catch {}
      }
      else if (lbl.includes('eventos executados no ano')) {
        try {
          const ev = _readJSON(path.join(__dirname, 'public/api/events.json'), { eventos_brasil: [] });
          const past = (ev.eventos_brasil || []).filter(e => {
            const mth = parseInt(e.m || '99');
            const cm = new Date().getMonth() + 1;
            return mth < cm;
          }).length;
          realizado = past; realizado_fonte = 'events.json';
        } catch {}
      }
      else if (lbl.includes('ddf total disponível')) {
        realizado = 80000; realizado_fonte = 'SAP Portal (MDF alocado)';
      }
      else if (lbl.includes('cases de sucesso/ano')) {
        realizado = casesTotal; realizado_fonte = 'SQLite cs_clientes';
      }
      else if (lbl.includes('contatos na base') && plData && plData.contatos_total != null) {
        realizado = plData.contatos_total; realizado_fonte = 'Apollo snapshot';
      }
      else if (lbl.includes('empresas mapeadas') && plData && plData.contas_total != null) {
        realizado = plData.contas_total; realizado_fonte = 'Apollo snapshot';
      }
      else if (lbl.includes('sequências ativas') && plData && plData.sequencias_ativas != null) {
        realizado = plData.sequencias_ativas; realizado_fonte = 'Apollo snapshot';
      }
    }
    
    let progresso_pct = null;
    // Se o valor for numérico e realizado for numérico
    const valNum = typeof m.valor === 'number' ? m.valor : parseFloat(String(m.valor).replace(/[^0-9.]/g, ''));
    if (realizado != null && valNum) {
      progresso_pct = Math.round(100 * realizado / valNum * 10) / 10;
    }
    
    // Configura o status_fonte com base na fonte real
    let status_fonte = m.status_fonte || 'manual';
    if (realizado_fonte) {
      status_fonte = realizado_fonte.toLowerCase().includes('sqlite') || realizado_fonte.toLowerCase().includes('apollo') ? 'real' : 'manual';
    }
    
    return { ...m, realizado, realizado_fonte, progresso_pct, status_fonte };
  });

  // Calcular por_status_fonte dinamicamente com base nas metas mapeadas
  const por_status_fonte = {};
  metas_com_realizado.forEach(m => {
    const f = m.status_fonte || 'manual';
    por_status_fonte[f] = (por_status_fonte[f] || 0) + 1;
  });

  res.json({
    success: true,
    ano_fiscal: data.ano_fiscal,
    periodo_fiscal: data.periodo_fiscal,
    total_metas: data.total_metas,
    por_status_fonte: por_status_fonte,
    metas: metas_com_realizado,
    gerado_em: data.gerado_em,
  });
});

// GET /api/pipeline — dados REAIS do Apollo (snapshot via MCP, gravado em pipeline-snapshot.json)
// Sync diário headless = TODO (precisa Apollo REST API Key + cron). Hoje: snapshot manual real.
app.get('/api/pipeline', (req, res) => {
  const snap = _readJSON(path.join(__dirname, 'public/api/pipeline-snapshot.json'), null);
  if (!snap) {
    return res.json({ success: true, fonte: 'sem snapshot ainda', contatos_total: null, sequencias_total: null, ultima_sync: null });
  }
  res.json({ success: true, ...snap });
});

// ── UTM REDIRECT: /v/:slug ────────────────────────────────────────────────────
// Bio link de cada Voice. Adiciona UTMs e redireciona pra /seja-voice.
// Loga clique pra futura análise.
app.get('/v/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/g, '').slice(0, 50);
  const referer = req.get('referer') || 'direct';
  const ua = (req.get('user-agent') || 'unknown').slice(0, 120);
  console.log(`[BIO-CLICK] voice=${slug} ref=${referer} ua="${ua}"`);
  const dest = `/seja-voice?utm_source=linkedin&utm_medium=bio&utm_campaign=voices-mvp&utm_voice=${slug}`;
  res.redirect(302, dest);
});

// ── FORM SUBMIT: /api/seja-voice (LP recrutamento) ────────────────────────────
app.post('/api/seja-voice', recruitmentLimiter, async (req, res) => {
  const data = req.body || {};
  const s = (v, max) => String(v || '').slice(0, max);
  const comps = ['comp_gestao_projetos','comp_lideranca','comp_consultoria','comp_tecnico','comp_integracao','comp_treinamento','comp_migracao','comp_suporte']
    .filter(k => data[k] === 'sim').join(', ');
  const clean = {
    nome:        s(data.nome, 100),
    email:       s(data.email, 100),
    linkedin:    s(data.linkedin, 200),
    area:        s(data.area || 'voices', 50),
    motivo:      s(data.motivo, 800),
    cargo:       s(data.cargo, 100),
    endereco:    s(data.endereco, 200),
    tempo_epiuse: s(data.tempo_epiuse, 50),
    dia_a_dia:   s(data.dia_a_dia, 600),
    dominio_tecnico: s(data.dominio_tecnico, 400),
    trajetoria:  s(data.trajetoria, 800),
    palestras:   s(data.palestras, 20),
    videos:      s(data.videos, 20),
    lado_humano: s(data.lado_humano, 600),
    tem_fotos:   s(data.tem_fotos, 20),
    projeto_orgulho: s(data.projeto_orgulho, 800),
    desafio:     s(data.desafio, 800),
    lideranca:   s(data.lideranca, 400),
    competencias: s(comps, 300),
    exposicoes:  s(data.exposicoes, 600),
    tom:         s(data.tom, 20),
    publico_alvo: s(data.publico_alvo, 300),
    tema_adoraria: s(data.tema_adoraria, 400),
    tema_evitar: s(data.tema_evitar, 200),
    artigos_ref: s(data.artigos_ref, 1000),
    dia_tipico:  s(data.dia_tipico, 600),
    bastidores:  s(data.bastidores, 600),
    fora_trabalho: s(data.fora_trabalho, 400),
    utm_source:  s(data.utm_source, 50),
    utm_medium:  s(data.utm_medium, 50),
    utm_campaign: s(data.utm_campaign, 50),
    utm_voice:   s(data.utm_voice, 50),
    timestamp:   data.timestamp || new Date().toISOString(),
    ip:          req.ip || 'unknown'
  };
  if (!clean.nome || !clean.email || !clean.linkedin || !clean.cargo || !clean.endereco || !clean.tempo_epiuse || !clean.dia_a_dia || !clean.dominio_tecnico || !clean.trajetoria || !clean.palestras || !clean.videos || !clean.tem_fotos || !clean.projeto_orgulho || !clean.tom || !clean.publico_alvo || !clean.dia_tipico) {
    return res.status(400).json({ success: false, error: 'Campos obrigatórios não preenchidos.' });
  }
  const cols = ['nome','email','linkedin','area','motivo','cargo','endereco','tempo_epiuse','dia_a_dia','dominio_tecnico','trajetoria','palestras','videos','lado_humano','tem_fotos','projeto_orgulho','desafio','lideranca','competencias','exposicoes','tom','publico_alvo','tema_adoraria','tema_evitar','artigos_ref','dia_tipico','bastidores','fora_trabalho','utm_source','utm_medium','utm_campaign','utm_voice','timestamp','ip'];
  try {
    db.prepare(`INSERT INTO recruitment_applications (${cols.join(',')}) VALUES (${Array(cols.length).fill('?').join(',')})`)
      .run(...cols.map(c => clean[c]));
  } catch (e) {
    console.error('[RECRUITMENT-WRITE-FAIL]', e.message);
  }
  console.log(`[RECRUITMENT] ${clean.nome} (${clean.email}) → cargo=${clean.cargo} | tom=${clean.tom} | utm_source=${clean.utm_source}`);

  // Dispara email + webhook (não bloqueiam response — best effort)
  sendRecruitmentEmail(clean).catch(e => console.error('[EMAIL-UNCAUGHT]', e.message));
  sendRecruitmentWebhook(clean).catch(e => console.error('[WEBHOOK-UNCAUGHT]', e.message));

  res.json({ success: true, message: 'Inscrição recebida. Você será contactado em até 5 dias úteis.' });
});

// GET /api/applications — lista inscrições (head logado OU editor token)
// Enriquecido com flags de triagem: dup (mesmo email/linkedin repetido),
// interno (email é de alguém do time — bate com a tabela users) e publicado.
app.get('/api/applications', _coinsAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM recruitment_applications ORDER BY created_at DESC LIMIT 500').all();
    let userEmails = new Set(), pubIds = new Set();
    try { userEmails = new Set(db.prepare('SELECT lower(email) e FROM users').all().map(r => r.e)); } catch (_) {}
    try { pubIds = new Set(db.prepare('SELECT inscricao_id FROM voices_publicados').all().map(r => r.inscricao_id)); } catch (_) {}
    const emailN = {}, liN = {};
    for (const r of rows) {
      const e = (r.email || '').toLowerCase(); if (e) emailN[e] = (emailN[e] || 0) + 1;
      const l = (r.linkedin || '').toLowerCase().replace(/\/+$/, ''); if (l) liN[l] = (liN[l] || 0) + 1;
    }
    const apps = rows.map(r => {
      const e = (r.email || '').toLowerCase(), l = (r.linkedin || '').toLowerCase().replace(/\/+$/, '');
      return Object.assign({}, r, {
        interno: userEmails.has(e),
        dup: (emailN[e] || 0) > 1 || (l && (liN[l] || 0) > 1),
        publicado: pubIds.has(r.id),
      });
    });
    res.json({ success: true, applications: apps, total: apps.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/applications/:id — muda o status da inscrição (funil de triagem)
const APP_STATUS = ['novo', 'contatado', 'em_analise', 'aprovado', 'reprovado', 'teste', 'ignorado'];
app.patch('/api/applications/:id', _coinsAdmin, express.json({ limit: '1kb' }), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String((req.body || {}).status || '');
  if (!APP_STATUS.includes(status)) return res.status(400).json({ success: false, error: 'status_invalido' });
  try {
    const r = db.prepare('UPDATE recruitment_applications SET status=? WHERE id=?').run(status, id);
    if (!r.changes) return res.status(404).json({ success: false, error: 'nao_encontrado' });
    res.json({ success: true, id, status });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/applications/:id/publish — publica a candidatura como Voice em /voices
// Cria a ficha na tabela voices_publicados (persiste) e marca a inscrição aprovada.
app.post('/api/applications/:id/publish', _coinsAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const app_ = db.prepare('SELECT * FROM recruitment_applications WHERE id=?').get(id);
    if (!app_) return res.status(404).json({ success: false, error: 'nao_encontrado' });
    const slug = slugifyVoice(app_.nome);
    if (!slug) return res.status(400).json({ success: false, error: 'nome_invalido' });
    const base = readVoicesFile();
    const li = (app_.linkedin || '').toLowerCase().replace(/\/+$/, '');
    const clashFile = (base.voices || []).some(v => (v.id === slug) ||
      (li && v.linkedin && String(v.linkedin).toLowerCase().replace(/\/+$/, '') === li));
    const clashPub = db.prepare('SELECT 1 FROM voices_publicados WHERE id=?').get(slug);
    if (clashFile || clashPub) return res.status(409).json({ success: false, error: 'ja_publicado', slug });
    const numero = (base.voices || []).length + db.prepare('SELECT COUNT(*) n FROM voices_publicados').get().n + 1;
    const voice = voiceFromApp(app_, numero, slug);
    db.prepare('INSERT INTO voices_publicados (id, inscricao_id, data) VALUES (?,?,?)').run(slug, id, JSON.stringify(voice));
    db.prepare("UPDATE recruitment_applications SET status='aprovado' WHERE id=?").run(id);
    console.log(`[voices] publicado: ${app_.nome} → /voices (slug=${slug})`);
    res.json({ success: true, slug, numero });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /api/voices-publicados/:slug — remove um Voice publicado via inscrição
app.delete('/api/voices-publicados/:slug', _coinsAdmin, (req, res) => {
  try {
    const slug = slugifyVoice(req.params.slug);
    const r = db.prepare('DELETE FROM voices_publicados WHERE id=?').run(slug);
    res.json({ success: true, removed: r.changes });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Página do painel de inscrições (head OU editor token)
app.get('/admin/inscricoes', _coinsAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public/admin-inscricoes.html')));

// ─────────────────────────────────────────────────────────────────────────────
// VOICE EDITOR — atualiza voices.json e .md de cada Voice via token auth
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/voices/:slug/optimizer-input — JSON pronto pra alimentar /api/analisar-perfil/p1
// SPRINT 9 Bloco A — Voice cadastrado vira input direto, sem digitar nada
app.get('/api/voices/:slug/optimizer-input', (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ success: false, error: 'slug inválido' });
  let data;
  try { data = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8')); }
  catch (e) { return res.status(500).json({ success: false, error: 'falha ao ler voices.json: ' + e.message }); }
  const v = (data.voices || []).find(x => x.id === slug);
  if (!v) return res.status(404).json({ success: false, error: 'voice nao encontrado' });
  // Mapeamento: campos do voices.json -> campos esperados pelo /api/analisar-perfil/p1
  const r = Array.isArray(v.resultados) ? v.resultados : (v.resultados ? [v.resultados] : []);
  const input = {
    voice_slug: v.id,
    nome: v.nome || '',
    cargo_oficial: v.cargo || '',
    area_principal: v.nicho || '',
    publico_alvo: Array.isArray(v.audiencia) ? v.audiencia.join(', ') : (v.audiencia || ''),
    linkedin_url: v.linkedin || '',
    ssi_score: v.ssi_baseline || '',
    seguidores: v.seguidores_baseline || '',
    tom_voz: v.tom_voz || '',
    diferencial_humano: v.lado_humano || '',
    resultado_1: r[0] || '',
    resultado_2: r[1] || '',
    resultado_3: r[2] || '',
    anos_experiencia: v.anos_experiencia || '',
    data_entrada_epiuse: v.data_entrada_epiuse || '',
    foto_oficial: !!v.foto,
    foto_url: v.foto || '',
    // _fonte (Bloco B): marca cada campo como REAL/INFERIDO baseado em ter dado salvo
    _fontes: {
      nome: v.nome ? 'REAL' : 'PLACEHOLDER',
      cargo_oficial: v.cargo ? 'REAL' : 'PLACEHOLDER',
      area_principal: v.nicho ? 'REAL' : 'PLACEHOLDER',
      linkedin_url: v.linkedin ? 'REAL' : 'PLACEHOLDER',
      ssi_score: v.ssi_baseline ? 'REAL' : 'PLACEHOLDER',
      tom_voz: v.tom_voz ? 'REAL' : 'PLACEHOLDER',
      diferencial_humano: v.lado_humano ? 'REAL' : 'PLACEHOLDER',
      resultados: r.length > 0 ? 'REAL' : 'PLACEHOLDER'
    },
    _campos_faltando: (v.dados_a_confirmar || []),
    _voice_status: v.status || 'unknown'
  };
  res.json({ success: true, input });
});

// POST /api/voices/:slug/duplicate — duplica um Voice existente com novo slug
app.post('/api/voices/:slug/duplicate', requireEditorToken, (req, res) => {
  const srcSlug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!srcSlug) return res.status(400).json({ success: false, error: 'slug inválido' });
  let data;
  try { data = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8')); }
  catch (e) { return res.status(500).json({ success: false, error: 'falha ao ler voices.json: ' + e.message }); }
  data.voices = data.voices || [];
  const src = data.voices.find(v => v.id === srcSlug);
  if (!src) return res.status(404).json({ success: false, error: 'voice origem nao encontrado' });
  // gera slug novo (slug-copia, slug-copia-2, ...)
  let newSlug = (req.body && req.body.novo_slug) || (srcSlug + '-copia');
  newSlug = String(newSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  let i = 2;
  while (data.voices.find(v => v.id === newSlug)) {
    newSlug = srcSlug + '-copia-' + i;
    i++;
  }
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = newSlug;
  copy.nome = 'Cópia de ' + (src.nome || src.id);
  copy.status = 'onboarding';
  copy.duplicado_de = srcSlug;
  copy.duplicado_em = new Date().toISOString();
  // limpa contadores específicos
  delete copy.posts_publicados;
  delete copy.ultimo_post;
  data.voices.push(copy);
  try { fs.writeFileSync(VOICES_JSON_PATH, JSON.stringify(data, null, 2)); }
  catch (e) { return res.status(500).json({ success: false, error: 'falha ao gravar: ' + e.message }); }
  res.json({ success: true, slug: newSlug, voice: copy });
});

// POST /api/voices/:slug/ssi — registra medição SSI semanal + seguidores + posts
app.post('/api/voices/:slug/ssi', requireEditorToken, (req, res) => {
  try {
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
    if (!slug) return res.status(400).json({ success: false, error: 'slug inválido' });
    const data = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
    const v = (data.voices || []).find(x => x.id === slug || x.slug === slug);
    if (!v) return res.status(404).json({ success: false, error: 'voice não encontrado' });
    const b = req.body || {};
    const ssi = parseInt(b.ssi, 10);
    if (isNaN(ssi) || ssi < 0 || ssi > 100) return res.status(400).json({ success: false, error: 'ssi 0-100 obrigatório' });
    v.ssi_historico = v.ssi_historico || [];
    const entry = { data: new Date().toISOString().slice(0,10), ssi, seguidores: b.seguidores != null ? parseInt(b.seguidores,10) : null, posts_mes: b.posts_mes != null ? parseInt(b.posts_mes,10) : null, nota: b.nota || '' };
    v.ssi_historico.push(entry);
    if (v.ssi_baseline == null) v.ssi_baseline = ssi;
    if (entry.seguidores != null && v.seguidores_baseline == null) v.seguidores_baseline = entry.seguidores;
    v.ssi_atual = ssi;
    v.proxima_medicao_ssi = new Date(Date.now() + 7*864e5).toISOString().slice(0,10);
    fs.writeFileSync(VOICES_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, voice: slug, registrada: entry, total_medicoes: v.ssi_historico.length, delta_baseline: ssi - (v.ssi_baseline || ssi), proxima: v.proxima_medicao_ssi });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/voices/:slug/ssi — retorna histórico SSI
app.get('/api/voices/:slug/ssi', (req, res) => {
  try {
    const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
    const data = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
    const v = (data.voices || []).find(x => x.id === slug || x.slug === slug);
    if (!v) return res.status(404).json({ success: false, error: 'voice não encontrado' });
    const hist = v.ssi_historico || [];
    res.json({ voice: v.id, nome: v.nome, baseline: v.ssi_baseline, atual: v.ssi_atual, proxima_medicao: v.proxima_medicao_ssi, historico: hist, total: hist.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/voices/:slug — atualiza campos editáveis do Voice em voices.json
app.put('/api/voices/:slug', requireEditorToken, (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ success: false, error: 'slug inválido' });

  let data;
  try {
    data = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
  } catch (e) {
    return res.status(500).json({ success: false, error: 'falha ao ler voices.json: ' + e.message });
  }

  data.voices = data.voices || [];
  let voice = data.voices.find(v => v.id === slug);
  let isNew = false;
  if (!voice) {
    // Upsert: cria Voice novo do zero (fluxo "+ Novo Voice")
    isNew = true;
    voice = {
      id: slug,
      nome: req.body?.nome || slug,
      cargo: req.body?.cargo || '',
      area: req.body?.area || '',
      status: req.body?.status || 'onboarding',
      foto: req.body?.foto || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(req.body?.nome || slug)}`,
      linkedin: req.body?.linkedin || '',
      bio: req.body?.bio || '',
      tags: [],
      audiencia: [],
      tom_voz: '',
      lado_humano: '',
      resultados: [],
      ssi_baseline: null,
      seguidores_baseline: null,
      kit_gerado: false,
      pendencia: '',
      dados_a_confirmar: [],
      created_at: new Date().toISOString()
    };
    data.voices.push(voice);
  }

  const patch = req.body || {};
  // Campos editáveis (whitelist) — expandido pra criação também aceitar campos básicos
  const editable = ['nome', 'cargo', 'area', 'status', 'foto', 'bio', 'nicho', 'tags', 'audiencia', 'linkedin',
                    'ssi_baseline', 'seguidores_baseline',
                    'posts_mes_atual', 'kit_gerado', 'ultimo_post', 'pendencia',
                    'tom_voz', 'lado_humano', 'resultados'];

  const dadosAConfirmar = new Set(voice.dados_a_confirmar || []);
  let touchedAnyProv = false;

  for (const key of editable) {
    if (!(key in patch)) continue;
    let val = patch[key];
    // sanitize ints
    if (key === 'ssi_baseline' || key === 'seguidores_baseline' || key === 'posts_mes_atual') {
      val = (val === null || val === '') ? null : Number(val);
      if (Number.isNaN(val)) val = null;
    }
    // sanitize arrays from string (comma-separated)
    if ((key === 'tags' || key === 'audiencia') && typeof val === 'string') {
      val = val.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (key === 'resultados' && typeof val === 'string') {
      val = val.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (key === 'kit_gerado') val = !!val;

    // Se valor era {valor, provisorio} e agora foi editado, vira valor cru (não mais provisório)
    voice[key] = val;
    if (dadosAConfirmar.has(key)) {
      dadosAConfirmar.delete(key);
      touchedAnyProv = true;
    }
  }

  voice.dados_a_confirmar = [...dadosAConfirmar];
  data.programa = data.programa || {};
  data.programa.atualizado_em = new Date().toISOString().slice(0, 10);

  // Backup + write
  backupFile(VOICES_JSON_PATH);
  try {
    fs.writeFileSync(VOICES_JSON_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    return res.status(500).json({ success: false, error: 'falha ao salvar: ' + e.message });
  }

  console.log(`[VOICE-${isNew ? 'CREATE' : 'EDIT'}] ${slug}. prov_removed=${touchedAnyProv} dados_a_confirmar=${[...dadosAConfirmar].length}`);
  res.json({ success: true, voice, created: isNew });
});

// PUT /api/voices/:slug/md — atualiza arquivo .md do agente
app.put('/api/voices/:slug/md', requireEditorToken, express.text({ type: '*/*', limit: '100kb' }), (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ success: false, error: 'slug inválido' });
  const md = String(req.body || '');
  if (md.length < 50) return res.status(400).json({ success: false, error: 'markdown muito curto' });
  if (md.length > 50000) return res.status(400).json({ success: false, error: 'markdown excede 50KB' });

  const mdPath = path.join(VOICES_MD_DIR, slug + '.md');
  backupFile(mdPath);
  try {
    fs.writeFileSync(mdPath, md);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'falha ao salvar md: ' + e.message });
  }
  console.log(`[VOICE-MD] ${slug} updated (${md.length} chars)`);
  res.json({ success: true, bytes: md.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST TRACKER — registrar/atualizar posts publicados no LinkedIn
// ─────────────────────────────────────────────────────────────────────────────

const postsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 60 posts/hora atingido.' }
});

// POST /api/posts — cria snapshot de um post
app.post('/api/posts', postsLimiter, (req, res) => {
  const b = req.body || {};
  const clean = {
    voice_id:         String(b.voice_id || '').replace(/[^a-z0-9-]/g, '').slice(0, 60),
    post_url:         String(b.post_url || '').slice(0, 500),
    post_id:          '',
    published_at:     String(b.published_at || '').slice(0, 20),
    captured_at:      new Date().toISOString(),
    content_type:     ['post', 'article', 'video', 'image', 'document'].includes(b.content_type) ? b.content_type : 'post',
    content_preview:  String(b.content_preview || '').slice(0, 500),
    pillar:           ['Thought Leadership', 'Cases', 'Pessoas', 'Propósito'].includes(b.pillar) ? b.pillar : null,
    metrics: {
      likes:    Math.max(0, parseInt(b.metrics?.likes, 10) || 0),
      comments: Math.max(0, parseInt(b.metrics?.comments, 10) || 0),
      reposts:  Math.max(0, parseInt(b.metrics?.reposts, 10) || 0),
      views:    b.metrics?.views ? Math.max(0, parseInt(b.metrics.views, 10) || 0) : null
    }
  };

  if (!clean.voice_id || !clean.post_url) {
    return res.status(400).json({ success: false, error: 'voice_id e post_url obrigatórios' });
  }

  // Derive post_id from URL (último segmento ou hash)
  const idMatch = clean.post_url.match(/(?:activity|share|posts)[-_:](\d+)/i) || clean.post_url.match(/-(\d{15,25})-/) || [];
  clean.post_id = idMatch[1] || clean.post_url.split('/').filter(Boolean).pop() || clean.post_url.slice(-30);

  try {
    db.prepare('INSERT INTO posts (voice_id,post_url,post_id,published_at,captured_at,content_type,content_preview,pillar,likes,comments,reposts,views) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(clean.voice_id,clean.post_url,clean.post_id,clean.published_at,clean.captured_at,clean.content_type,clean.content_preview||'',clean.pillar,clean.metrics.likes,clean.metrics.comments,clean.metrics.reposts,clean.metrics.views??null);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'falha ao gravar: ' + e.message });
  }
  console.log(`[POST] ${clean.voice_id} | ${clean.metrics.likes}❤️ ${clean.metrics.comments}💬 ${clean.metrics.reposts}🔄 | ${clean.post_url.slice(0, 60)}`);
  res.json({ success: true, post: clean });
});

// GET /api/posts?voice=X&period=7d|30d|90d|all — retorna posts agregados (último snapshot por post_url)
app.get('/api/posts', (req, res) => {
  const voiceFilter = req.query.voice ? String(req.query.voice).replace(/[^a-z0-9-]/g, '') : null;
  const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : 'all';

  try {
    let cutoff = null;
    if (period !== 'all') {
      cutoff = new Date(Date.now() - parseInt(period, 10) * 86400000).toISOString();
    }

    let sql = `
      SELECT p.* FROM posts p
      WHERE p.captured_at = (
        SELECT MAX(p2.captured_at) FROM posts p2 WHERE p2.post_url = p.post_url
      )
    `;
    const params = [];
    if (voiceFilter)  { sql += ' AND p.voice_id = ?'; params.push(voiceFilter); }
    if (cutoff)       { sql += ' AND (p.published_at >= ? OR (p.published_at = \'\' AND p.captured_at >= ?))'; params.push(cutoff, cutoff); }
    sql += ' ORDER BY CASE WHEN p.published_at != \'\' THEN p.published_at ELSE p.captured_at END DESC';

    const rows = db.prepare(sql).all(...params);
    const posts = rows.map(r => ({
      voice_id: r.voice_id, post_url: r.post_url, post_id: r.post_id,
      published_at: r.published_at, captured_at: r.captured_at,
      content_type: r.content_type, content_preview: r.content_preview, pillar: r.pillar,
      metrics: { likes: r.likes, comments: r.comments, reposts: r.reposts, views: r.views }
    }));
    res.json({ success: true, posts, total: posts.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/posts/timeline/:post_id — todos snapshots de 1 post (evolução)
app.get('/api/posts/timeline/:post_id', (req, res) => {
  const pid = String(req.params.post_id).slice(0, 60);
  try {
    const snaps = db.prepare('SELECT * FROM posts WHERE post_id = ? ORDER BY captured_at ASC').all(pid)
      .map(r => ({
        voice_id: r.voice_id, post_url: r.post_url, post_id: r.post_id,
        published_at: r.published_at, captured_at: r.captured_at,
        content_type: r.content_type, content_preview: r.content_preview, pillar: r.pillar,
        metrics: { likes: r.likes, comments: r.comments, reposts: r.reposts, views: r.views }
      }));
    res.json({ success: true, snapshots: snaps });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GERAR PAUTAS — Claude API com contexto do Voice
// ─────────────────────────────────────────────────────────────────────────────

const pautasLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,  // custa tokens — limita pra evitar abuso
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 5 gerações/hora atingido.' }
});

app.post('/api/voice/:slug/generate-pautas', pautasLimiter, async (req, res) => {
  const slug = String(req.params.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ success: false, error: 'slug inválido' });

  // 1. Carrega voice
  let voicesData, voice, mdContent, eventsData, recentPosts = [];
  try {
    voicesData = JSON.parse(fs.readFileSync(VOICES_JSON_PATH, 'utf8'));
    voice = (voicesData.voices || []).find(v => v.id === slug);
    if (!voice) return res.status(404).json({ success: false, error: 'Voice não encontrado' });

    const mdPath = path.join(VOICES_MD_DIR, slug + '.md');
    mdContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';

    const eventsPath = path.join(__dirname, 'public/api/events.json');
    if (fs.existsSync(eventsPath)) eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ success: false, error: 'falha ao ler contexto: ' + e.message });
  }

  // 2. Recent posts do voice (últimos 5)
  recentPosts = db.prepare(`
    SELECT p.* FROM posts p
    WHERE p.voice_id = ?
      AND p.captured_at = (SELECT MAX(p2.captured_at) FROM posts p2 WHERE p2.post_url = p.post_url)
    ORDER BY CASE WHEN p.published_at != '' THEN p.published_at ELSE p.captured_at END DESC
    LIMIT 5
  `).all(slug).map(r => ({
    voice_id: r.voice_id, post_url: r.post_url,
    published_at: r.published_at, captured_at: r.captured_at,
    content_preview: r.content_preview || '', pillar: r.pillar,
    metrics: { likes: r.likes, comments: r.comments, reposts: r.reposts, views: r.views }
  }));

  // 3. Eventos próximos (próximas 4 semanas)
  const nowMonth = new Date().getMonth() + 1;
  const nearMonths = [nowMonth, nowMonth + 1 > 12 ? 1 : nowMonth + 1];
  const upcomingEvents = (eventsData?.eventos || []).filter(e => nearMonths.includes(e.m)).slice(0, 8);

  // 4. Helper pra extrair valor de {valor, provisorio} ou cru
  const unwrap = (v) => (v && typeof v === 'object' && 'valor' in v) ? v.valor : v;

  // 5. Monta o prompt
  const linkedinUrl = unwrap(voice.linkedin);
  const tomVoz = unwrap(voice.tom_voz) || '(não definido)';
  const ladoHumano = unwrap(voice.lado_humano) || '(não definido)';
  const resultados = unwrap(voice.resultados) || [];

  const prompt = `Você é um copywriter B2B especialista em SAP e LinkedIn. Sua missão: gerar 3 sugestões de pauta de post para ${voice.nome}, ${voice.cargo} na EPI-USE Brasil.

CONTEXTO DO VOICE:
- Nome: ${voice.nome}
- Cargo: ${voice.cargo}
- Empresa: ${voice.empresa}
- Nicho: ${voice.nicho}
- Audiência-alvo: ${(voice.audiencia || []).join(', ')}
- Tom de voz: ${tomVoz}
- Lado humano: ${ladoHumano}
- Resultados concretos:
${resultados.map(r => '  - ' + r).join('\n') || '  (a definir)'}

EVENTOS DAS PRÓXIMAS 8 SEMANAS (use como gancho temporal):
${upcomingEvents.map(e => `- ${e.d}/${e.m}: ${e.n} (${e.lob})`).join('\n') || '  (sem eventos próximos)'}

${recentPosts.length > 0 ? `POSTS RECENTES DESTE VOICE (NÃO REPITA esses temas):
${recentPosts.map(p => `- [${p.pillar || '?'}] ${p.content_preview.slice(0, 100)}`).join('\n')}

` : ''}REGRAS DO PROGRAMA EPI-USE VOICES:
- PT-BR obrigatório
- Hook forte na primeira linha
- Sem clientes nominais (anonimizar como "Fortune 500 BR" ou "holding com 12 filiais")
- Sem concorrentes nominais (TIVIT, Stefanini, Accenture, etc.)
- Sem promessas absurdas
- 1x/mês mencionar EPI-USE Brasil; ERP.ngo quando relevante
- Distribuir entre 4 pilares: Thought Leadership (40%) | Cases (30%) | Pessoas (20%) | Propósito (10%)

GERE 3 PAUTAS DISTINTAS. Cada uma deve:
1. Ter um hook forte e específico
2. Indicar pilar editorial
3. Justificar relevância AGORA (gancho temporal)
4. Trazer 1 dado/insight concreto pra o Voice expandir
5. Sugerir CTA claro

Retorne APENAS JSON válido, sem texto antes/depois:
{
  "pautas": [
    { "titulo": "string", "hook": "string", "pilar": "Thought Leadership|Cases|Pessoas|Propósito", "gancho_temporal": "string", "insight_chave": "string", "cta_sugerido": "string" }
  ]
}`;

  // 6. Chama Claude
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    let rawText = response.content[0].text;
    rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ success: false, error: 'IA não retornou JSON válido' });
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[PAUTAS] ${slug} gerou ${parsed.pautas?.length || 0} pautas`);
    res.json({ success: true, pautas: parsed.pautas || [], generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[PAUTAS-FAIL]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/seo-review — revisor SEO + GEO (jun/2026) + link juice + CTA via Claude ──
app.post('/api/seo-review', async (req, res) => {
  try {
    const b = req.body || {};
    const texto = (b.texto || '').trim();
    const titulo = (b.titulo || '').trim();
    const lob = (b.lob || '').trim();
    if (texto.length < 200) return res.status(400).json({ success: false, error: 'Cole o artigo (minimo 200 caracteres) para revisar.' });

    // pool de link juice: artigos ja produzidos (filtra por LOB se houver), compacto
    const ad = _readJSON(ARTIGOS_JSON_PATH, { artigos: [] });
    let pool = ad.artigos || [];
    if (lob) { const f = pool.filter(a => (a.linha_de_negocio || '').toLowerCase().includes(lob.toLowerCase())); if (f.length >= 5) pool = f; }
    const candidatos = pool.slice(0, 30).map(a => ({ titulo: a.titulo, url: a.url, etapa: a.etapa_funil }));

    const prompt = `Voce e um especialista senior em SEO e GEO (Generative Engine Optimization) com as regras MAIS ATUAIS de junho/2026 para rankear no Google (incl. AI Overviews) e ser citado por motores generativos (ChatGPT, Gemini, Perplexity).

Revise o ARTIGO abaixo e de notas 0-100. Seja rigoroso e acionavel.

## Rubrica SEO (Google jun/2026)
Intencao de busca atendida; Title/H1 otimizado; estrutura H2/H3; cobertura semantica/entidades; E-E-A-T (autoria, experiencia, fontes); helpful content (profundidade, originalidade, responde a query); links internos/externos; meta description; legibilidade; frescor/atualidade; alt de imagem; schema/dados estruturados.

## Rubrica GEO (motores generativos jun/2026)
Resposta direta e clara no topo; headings em forma de pergunta; estatisticas/fontes citaveis; clareza de entidades; dados estruturados (FAQ/HowTo); frases concisas e quotaveis; sinais de autoridade; cobertura abrangente de subtopicos; frescor; respondibilidade por LLM.

## Keyword
Analise o texto e recomende a MELHOR keyword-foco (melhor casamento de intencao de busca + potencial real de ranqueamento em jun/2026) + 2-3 secundarias/semanticas (LSI). Diga onde ela deve aparecer (title, H1, primeiros 100 palavras).

## ARTIGO
Titulo: ${titulo || '(sem titulo informado)'}
LOB: ${lob || '(nao informado)'}
Texto:
"""${texto.slice(0, 12000)}"""

## ARTIGOS INTERNOS DISPONIVEIS (para link juice - use SO os relevantes, com a URL exata da lista)
${JSON.stringify(candidatos)}

Retorne APENAS JSON valido, sem texto antes/depois:
{
  "nota_geral": 0,
  "metaTitle": "meta title sugerido para o artigo (max 60 caracteres)",
  "metaDescription": "meta description sugerida para o artigo (max 160 caracteres)",
  "slug": "url-slug-sugerido-amigavel",
  "keyword": { "principal": "melhor keyword-foco", "secundarias": ["kw2", "kw3"], "onde_usar": "title, H1, primeiros 100 palavras", "motivo": "intencao + potencial jun/2026" },
  "seo": { "score": 0, "criterios": [{ "nome": "string", "nota": 0, "obs": "string curta" }] },
  "geo": { "score": 0, "criterios": [{ "nome": "string", "nota": 0, "obs": "string curta" }] },
  "resumo": "2-3 frases de diagnostico",
  "top_fixes": ["acao prioritaria 1", "acao 2", "acao 3"],
  "link_juice": [{ "anchor": "texto ancora sugerido", "url": "url interna exata da lista", "motivo": "string" }],
  "cta": { "texto": "CTA sugerido", "posicao": "topo|meio|fim", "motivo": "string" },
  "faq": [
    { "q": "Pergunta estruturada baseada no artigo", "a": "Resposta curta, direta e citavel" }
  ],
  "artigo_melhorado": "O texto completo do artigo reescrito com todas as melhorias e correcoes de SEO/GEO aplicadas, incluindo a palavra-chave foco e secundarias, e inserindo os links internos de forma contextualizada."
}`;

    // LLM gratis via OpenRouter (Gemma). Modelo override por env OPENROUTER_MODEL.
    const orKey = process.env.OPENROUTER_API_KEY;
    let useFallback = false;
    let fallbackReason = '';

    if (!orKey) {
      useFallback = true;
      fallbackReason = 'Falta configurar OPENROUTER_API_KEY no servidor';
    }

    let parsed = null;
    let orModel = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';

    if (!useFallback) {
      try {
        const orResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://epiuse-mkt-office-production.up.railway.app',
            'X-Title': 'EPI-USE Office - Raccoon SEO/GEO'
          },
          body: JSON.stringify({
            model: orModel,
            temperature: 0.3,
            max_tokens: 3000,
            messages: [{ role: 'user', content: prompt }]
          })
        });

        if (!orResp.ok) {
          const detail = await orResp.text().catch(() => '');
          console.error('[SEO-REVIEW-OR-FAIL]', orResp.status, detail.slice(0, 300));
          useFallback = true;
          fallbackReason = orResp.status === 429
            ? 'Limite gratuito do Qwen atingido no OpenRouter'
            : `OpenRouter respondeu com status ${orResp.status}`;
        } else {
          const data = await orResp.json();
          let raw = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '')
            .replace(/```json\s*/gi, '').replace(/```\s*/g, '');
          const m = raw.match(/\{[\s\S]*\}/);
          if (!m) {
            useFallback = true;
            fallbackReason = 'IA não retornou um JSON estruturado';
          } else {
            parsed = JSON.parse(m[0]);
          }
        }
      } catch (err) {
        console.error('[SEO-REVIEW-LLM-EXCEPTION]', err.message);
        useFallback = true;
        fallbackReason = `Exceção na chamada LLM: ${err.message}`;
      }
    }

    if (useFallback) {
      console.warn(`[SEO-REVIEW] Falling back to local deterministic checker. Reason: ${fallbackReason}`);
      
      const seoResult = seoChecker.checkSEO({
        titulo: titulo || 'Artigo de Marketing',
        corpo: texto,
        tema_keyword: lob || 'EPI-USE'
      });
      
      const geoResult = seoChecker.checkGEO({
        titulo: titulo || 'Artigo de Marketing',
        corpo: texto,
        tema_keyword: lob || 'EPI-USE'
      });
      
      const ctaResult = seoChecker.suggestCTA({ lob, pilar: '' });

      const metaTitle = titulo ? (titulo.length > 60 ? titulo.slice(0, 57) + '...' : titulo) : 'Artigo de Marketing';
      const metaDescription = texto.slice(0, 150).trim() + '...';
      const slug = (titulo || 'artigo').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const seoCriterios = (seoResult.checklist || []).map(c => ({
        nome: c.item,
        nota: c.ok ? 100 : 0,
        obs: c.nota || (c.ok ? 'Atende perfeitamente' : 'Precisa melhorar')
      }));

      const geoCriterios = (geoResult.checklist || []).map(c => ({
        nome: c.item,
        nota: c.ok ? 100 : 0,
        obs: c.nota || (c.ok ? 'Bom posicionamento' : 'Otimizar estrutura')
      }));

      const top_fixes = [];
      (seoResult.checklist || []).filter(c => !c.ok).forEach(c => top_fixes.push(`SEO: ${c.item}`));
      (geoResult.checklist || []).filter(c => !c.ok).forEach(c => top_fixes.push(`GEO: ${c.item}`));
      if (top_fixes.length === 0) {
        top_fixes.push('Nenhuma melhoria crítica identificada.');
      }

      const link_juice = [];
      candidatos.slice(0, 3).forEach(c => {
        link_juice.push({
          anchor: c.titulo,
          url: c.url,
          motivo: 'Artigo relacionado no acervo'
        });
      });

      parsed = {
        nota_geral: Math.round((seoResult.score + geoResult.score) / 2),
        metaTitle,
        metaDescription,
        slug,
        keyword: {
          principal: lob || 'EPI-USE',
          secundarias: ['SAP', 'Inovação B2B'],
          onde_usar: 'title, H1, primeiros 100 palavras',
          motivo: 'Otimização com base na linha de negócio'
        },
        seo: {
          score: seoResult.score,
          criterios: seoCriterios
        },
        geo: {
          score: geoResult.score,
          criterios: geoCriterios
        },
        resumo: `Análise determinística local (Fallback). O artigo apresenta score SEO de ${seoResult.score}% e GEO de ${geoResult.score}%.`,
        top_fixes: top_fixes.slice(0, 5),
        link_juice,
        cta: {
          texto: ctaResult.cta,
          posicao: 'fim',
          motivo: 'CTA alinhado à linha de negócio'
        },
        faq: [
          { q: 'Como otimizar este artigo para SEO?', a: 'Inclua a palavra-chave no título e nos primeiros parágrafos, além de subtítulos H2/H3.' }
        ],
        artigo_melhorado: texto
      };
      
      return res.json({
        success: true,
        review: parsed,
        modelo: 'local-deterministic-fallback',
        candidatos_considerados: candidatos.length,
        gerado_em: new Date().toISOString(),
        warning: `Análise local ativa devido à sobrecarga temporária da IA (${fallbackReason}).`
      });
    }

    res.json({ success: true, review: parsed, modelo: orModel, candidatos_considerados: candidatos.length, gerado_em: new Date().toISOString() });
  } catch (e) {
    console.error('[SEO-REVIEW-FAIL]', e.message);
    res.status(500).json({ success: false, error: 'Falha ao revisar o artigo. Tente novamente.' });
  }
});

function buildPrompt(fields) {
  const {
    linkedin_url,
    nome,
    area_principal,
    anos_experiencia,
    resultado_1,
    resultado_2,
    resultado_3,
    diferencial_humano,
    publico_alvo,
    tom_voz,
    ssi_score,
    seguidores,
    data_entrada_epiuse,
    cargo_oficial,
    foto_oficial
  } = fields;

  const resultados = [resultado_1, resultado_2, resultado_3]
    .filter(Boolean)
    .map((r, i) => `  ${i + 1}. ${r}`)
    .join('\n');

  return `Você é o Profile Optimizer do programa EPI-USE Voices — programa de influência executiva da EPI-USE Brasil.

CONTEXTO DO PROGRAMA:
- EPI-USE Brasil (Razão social: EPI USE BRASIL SERVIÇOS EM SISTEMAS LTDA): maior consultoria SAP especializada em HCM/Payroll do Brasil; em evolução para EPI-USE 5.0 (Transformação Empresarial)
- Grupo: EPI-USE / groupelephant.com | 42+ anos de atuação | 10 grupos de marcas | 4.500+ profissionais | 40+ países | 2.000+ clientes empresariais | 1.800+ organizações com software licenciado | SAP Gold Partner
- Braços do grupo no Brasil: EPI-USE Brasil (consultoria SAP), EPI-USE Labs (P&D de IPs), Stratview (Analytics), Valcann (Cloud & Infra)
- LOBs: SAP HCM/SuccessFactors, SAP ERP/S4HANA (Clean Core + Reforma Tributária), SAP BTP, SAP Signavio, ServiceNow HRSD/ITSM, Analytics/Stratview
- IPs proprietários: TalenTools (acelerador de RH), PRISM (analytics/reporting)
- ERP.ngo: 1% da receita global destinada à conservação de elefantes e combate à pobreza rural na África (erp.ngo)
- Todos os participantes do EPI-USE Voices são embaixadores do ERP.ngo
- ATENÇÃO: Use SEMPRE "EPI-USE Brasil" por extenso — nunca apenas "EPI-USE", pois existem outras entidades do grupo globalmente

BANNER OFICIAL DA EPI-USE BRASIL (LINKEDIN):
- Link direto da imagem: https://epiusebr-my.sharepoint.com/:i:/g/personal/ti_brasil_epiuse_com_br/IQBWQpKomSTBRZ1VHGjafYUVAXA1AFQuNVFVdmaakKYPKRE?e=ntPEIx
- Pasta completa de assets: https://epiusebr-my.sharepoint.com/:f:/g/personal/ti_brasil_epiuse_com_br/IgCzGSd6PzslRICvk26vZY_fAaJ50os-DQG516n4lhIPBy0?e=P2DJQH

DADOS FORNECIDOS PELO USUÁRIO:
- URL LinkedIn: ${linkedin_url}
- Nome: ${nome || '(ver screenshot)'}
- Área principal: ${area_principal || '(ver screenshot)'}
- Anos de experiência: ${anos_experiencia || '(não informado)'}
- Cargo oficial na EPI-USE Brasil: ${cargo_oficial || '(não informado)'}
- Data de entrada na EPI-USE Brasil: ${data_entrada_epiuse || '(não informada)'}
- Resultados reais com números:
${resultados || '  (não informados — use placeholders)'}
- Diferencial humano (família, paixões pessoais, causas, mentoria): ${diferencial_humano || '(não informado)'}
- Público-alvo desejado: ${publico_alvo || '(não informado)'}
- Tom de voz preferido: ${tom_voz || 'equilibrado'}
- SSI Score atual: ${ssi_score || '(não medido)'}
- Seguidores atuais: ${seguidores || '(não informado)'}
- Foto oficial EPI-USE disponível: ${(foto_oficial === 'true' || foto_oficial === true) ? 'Sim — usar no perfil' : 'Não confirmado — sugerir tirar foto'}

MISSÃO:
Analisar o perfil LinkedIn (URL + screenshots) + dados fornecidos acima e gerar um Kit de Perfil LinkedIn personalizado e completo.

REGRAS OBRIGATÓRIAS:
- Tudo em Português do Brasil
- Seção "Sobre" SEMPRE em 1ª pessoa
- Mencionar EPI-USE Voices E ERP.ngo na seção Sobre
- Usar SEMPRE "EPI-USE Brasil" por extenso — NUNCA apenas "EPI-USE"
- Cargo sugerido deve incluir "EPI-USE Brasil" (ex: "Consultor SAP HCM | EPI-USE Brasil")
- Usar os resultados reais fornecidos — não inventar números
- Onde não há número real, usar placeholder: [preencher: ex. X% de redução]
- Headline: máximo 220 caracteres, área de expertise + empresa + diferencial + LADO HUMANO se houver (ex: "pai de 2, apaixonado por trail running")
- Competências: priorizar tecnologias atuais (SAP BTP, Clean Core, S/4HANA, SuccessFactors) — remover versões legadas (SAP R/3, etc.) — sugerir competências baseado na expertise visível
- Tom deve seguir a preferência indicada: ${tom_voz || 'equilibrado'}
- Formatação mobile: parágrafos curtos, sem paredes de texto
- Seção Sobre: máximo 2.600 caracteres (limite LinkedIn)
- ERP.ngo DEVE ser sugerido como "Causas Sociais" no LinkedIn para este perfil — todo Voice é embaixador padrão
- Sempre gerar exatamente 5 Destaques Estratégicos (seção Featured do LinkedIn), variando entre:
  · Artigo TÉCNICO publicado fora do LinkedIn (StratView/blog SAP)
  · Artigo/post publicado DENTRO do LinkedIn
  · Link EXTERNO (column publicada, podcast, vídeo)
  · Imagem de kickoff/go-live/reunião estratégica/evento SAP-AWS
  · Publicação de PARCEIRO citando o Voice (SAP, EPI-USE Global, AWS) ou premiação/elogio/exposição
- "imagens_perfil" deve sugerir: kickoffs, go-lives, reuniões estratégicas, participação em eventos, prêmios, exposições com clientes/parceiros
- Recomendações: priorizar publicações de SAP, EPI-USE Labs, parceiros — associação de marca por proximidade
- Voluntariado: ERP.ngo sempre como Causa Social padrão

AVALIAÇÃO POR PILARES (CRÍTICO — usar escala de 4 níveis em CADA critério):
- 🟢 forte    — está no top 20% dos profissionais SAP/HCM, exemplar
- 🟡 ok       — médio, dá pra melhorar
- 🟠 fraco    — atrás da média, prioridade de ação
- 🔴 ausente  — não existe, gap crítico
- ⚪ na       — não aplicável a este perfil

Avalie EXATAMENTE estes 7 pilares e seus critérios (use o que vê nos screenshots + dados do form; quando não houver evidência, marque "ausente" ou "na" e justifique):

PILAR 1 — IDENTIDADE VISUAL & ESTRUTURAL:
  · URL customizada (linkedin.com/in/nome-sobrenome vs id aleatório)
  · Localização visível + área de atuação
  · Pronouns declarados
  · Primeiras 3 linhas do "Sobre" (gancho antes do "ver mais")
  · CTA no fim do "Sobre" (email/agenda/DM)
  · Modo Criador ativado + hashtags estratégicas
  · Cover story (vídeo 30s no avatar)

PILAR 2 — AUTORIDADE & PROVA SOCIAL:
  · Competências (Skills) Top 3 endossadas alinhadas com expertise
  · Certificações SAP/EPI-USE (S/4HANA, SuccessFactors, HXM, etc.)
  · Formação acadêmica com instituição relevante
  · Recomendações recebidas (qty + qualidade do recomendante)
  · Premiações (Top Voice, SAP Awards, EPI-USE Insights)
  · Eventos como palestrante (TechEd, SAPPHIRE, EPI-USE Insights)
  · Publicações próprias (artigos LinkedIn, blogs externos, StratView)
  · Newsletter própria

PILAR 3 — CONTEÚDO & ATIVIDADE:
  · Frequência de posts (ideal 1-3/semana)
  · Último post < 7 dias (atividade recente)
  · Mix de formato (texto / carrossel / vídeo / imagem / poll)
  · Engajamento médio (likes + comments / followers)
  · Comentários em posts alheios (pilar SSI "engajar com insights")
  · Polls/enquetes publicadas
  · Tagueamento de colegas/clientes/SAP
  · Compartilhamento de conteúdo SAP / EPI-USE mãe / parceiros

PILAR 4 — NETWORK & RELACIONAMENTO:
  · Conexões totais (>500 vira "500+")
  · Followers vs Conexões (ratio)
  · Membro de Grupos SAP Community, RH Brasil, ASUG
  · DM aberto (mensagens disponíveis fora da rede)

PILAR 5 — SSI INDEX (LinkedIn oficial):
  · Estabelecer marca profissional
  · Encontrar pessoas certas
  · Engajar com insights
  · Construir relacionamentos
  (Se SSI Score foi fornecido no form, use-o como referência. Senão, estime cada pilar do SSI pelos screenshots.)

PILAR 6 — ADERÊNCIA EPI-USE (institucional):
  · Capa oficial EPI-USE Brasil ativa
  · Cargo oficial EPI-USE (não inventado)
  · Foto oficial com fundo padrão / alta qualidade
  · Data de entrada na EPI-USE declarada
  · ERP.ngo no voluntariado
  · Menção EPI-USE Voices quando faz sentido
  · Citação ou tag de parceiros (SAP, AWS, HXM)

PILAR 7 — CONVERSÃO (lead → reunião):
  · Link em destaque (Calendly, Linktree, página EPI-USE)
  · CTA explícito em pelo menos 1 destaque
  · Email visível no Sobre ou Contato
  · Botão "Serviços" ativado (LinkedIn) com tags certas

Calcule o score de cada pilar (0-100) pela média ponderada dos critérios (forte=100, ok=70, fraco=40, ausente=10, na=ignorar).
Calcule o "voice_index_score" geral (0-100) = média simples dos 7 scores de pilar.

Retorne a análise em JSON estruturado. Retorne APENAS o JSON, sem texto antes ou depois:
{
  "nome": "string",
  "cargo_atual": "string",
  "empresa_atual": "EPI-USE Brasil",
  "voice_index_score": 0,
  "voice_index_resumo": "string (1-2 frases explicando o score geral — onde o Voice está forte e onde precisa atacar primeiro)",
  "pilares_avaliacao": [
    {
      "pilar": "Identidade Visual & Estrutural",
      "icone": "🪪",
      "score": 0,
      "criterios": [
        { "nome": "URL customizada", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string (1 frase)" },
        { "nome": "Localização visível", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Pronouns declarados", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Gancho nas 3 primeiras linhas do Sobre", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "CTA no fim do Sobre", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Modo Criador + hashtags", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Cover story (vídeo 30s)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Autoridade & Prova Social",
      "icone": "🏆",
      "score": 0,
      "criterios": [
        { "nome": "Top 3 Skills endossadas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Certificações SAP/EPI-USE", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Formação acadêmica relevante", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Recomendações recebidas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Premiações (Top Voice, SAP Awards)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Eventos como palestrante", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Publicações próprias (artigos)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Newsletter própria", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Conteúdo & Atividade",
      "icone": "📊",
      "score": 0,
      "criterios": [
        { "nome": "Frequência de posts (1-3/semana)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Último post < 7 dias", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Mix de formato (texto/carrossel/vídeo/poll)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Engajamento médio", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Comentários em posts alheios", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Polls/enquetes publicadas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Tag de colegas/clientes/SAP", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Compartilha SAP/EPI-USE mãe/parceiros", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Network & Relacionamento",
      "icone": "🌐",
      "score": 0,
      "criterios": [
        { "nome": "Conexões totais (>500)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Ratio Followers/Conexões", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Membro de Grupos relevantes", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "DM aberto", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "SSI Index (LinkedIn oficial)",
      "icone": "📈",
      "score": 0,
      "criterios": [
        { "nome": "Estabelecer marca profissional", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Encontrar pessoas certas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Engajar com insights", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Construir relacionamentos", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Aderência EPI-USE Brasil",
      "icone": "💼",
      "score": 0,
      "criterios": [
        { "nome": "Capa oficial EPI-USE Brasil", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Cargo oficial EPI-USE", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Foto oficial alta qualidade", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Data de entrada na EPI-USE declarada", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "ERP.ngo no voluntariado", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Menção EPI-USE Voices", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Tag/citação de parceiros (SAP, AWS)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Conversão (lead → reunião)",
      "icone": "🎯",
      "score": 0,
      "criterios": [
        { "nome": "Link em destaque (Calendly/agenda)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "CTA explícito em destaque", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Email visível no Sobre/Contato", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Botão Serviços ativado", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    }
  ],
  "diagnostico": {
    "pontos_positivos": ["string"],
    "problemas_encontrados": [
      { "elemento": "string", "situacao_atual": "string", "meta": "string", "urgencia": "alta|media|baixa" }
    ]
  },
  "headline_sugerida": "string",
  "url_sugerida": "string",
  "sobre_texto": "string (com [preencher: descrição] para placeholders)",
  "competencias": {
    "adicionar": ["string"],
    "remover": ["string"],
    "manter": ["string"]
  },
  "destaques": [
    { "numero": 1, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 2, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 3, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 4, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 5, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" }
  ],
  "ssi_diagnostico": {
    "nivel": "baixo|medio|bom|excelente",
    "observacoes": "string",
    "dicas": ["string (dica concreta de como melhorar o SSI)"]
  },
  "secao_fotos": {
    "foto_sugestao": "string (orientações concretas para a foto de perfil)",
    "imagens_perfil": ["string (sugestões de imagens de capa/kickoffs/eventos para usar no perfil)"]
  },
  "erp_ngo": {
    "passo_causas_sociais": "string (passo a passo: como adicionar ERP.ngo como Causa Social no LinkedIn)",
    "como_virar_embaixador": "string (orientações para se posicionar como embaixador ERP.ngo)"
  },
  "checklist": [
    { "item": "string", "prioridade": "urgente|normal|bonus", "passo": "string" }
  ],
  "proximos_passos": ["string"],
  "estrategia_idioma": {
    "orientacoes": ["string (dica prática sobre estratégia de idioma para este profissional)"],
    "instrucao_perfil_en": "string (passo a passo: como criar o perfil secundário em inglês no LinkedIn — LinkedIn → Eu → Ver perfil → Adicionar perfil em outro idioma)"
  },
  "linha_editorial": {
    "pilares": [
      { "percentual": "40%", "nome": "Thought Leadership", "exemplos": ["string (tema concreto personalizado para este Voice e sua área)"] },
      { "percentual": "30%", "nome": "Cases", "exemplos": ["string"] },
      { "percentual": "20%", "nome": "Pessoas", "exemplos": ["string"] },
      { "percentual": "10%", "nome": "Propósito", "exemplos": ["string"] }
    ],
    "calendario_4_semanas": [
      { "semana": 1, "post_1": "string (tema específico e personalizado para este Voice)", "post_2": "string" },
      { "semana": 2, "post_1": "string", "post_2": "string" },
      { "semana": 3, "post_1": "string", "post_2": "string" },
      { "semana": 4, "post_1": "string", "post_2": "string" }
    ],
    "nota_algoritmo": "string (dica importante: primeiras 4 semanas sem links externos no corpo do post — o algoritmo LinkedIn penaliza)"
  },
  "social_selling": {
    "perfis_para_alertas": ["string (perfil LinkedIn sugerido para este Voice seguir/comentar — ex: VP SAP Brasil, CIO de empresa-alvo)"],
    "exemplo_comentario": "string (modelo de comentário de alto impacto contextualizado para a área deste Voice — mencionar EPI-USE Brasil e dado concreto)",
    "dica_30_min": "string (instrução sobre a tática: nos primeiros 30 min após publicação de um líder do nicho, comentar com insight de valor)"
  },
  "recomendacoes": {
    "meta": "8 a 12 recomendações ativas",
    "perfis_prioritarios": ["string (tipo de perfil a solicitar recomendação — ex: cliente atual, parceiro SAP, gestor interno)"],
    "template_mensagem": "string (mensagem personalizada para solicitar recomendação — pronta para copiar e enviar no LinkedIn — mencionar contexto específico do projeto ou parceria)"
  },
  "kpis": {
    "instrucoes_baseline": "string (instrução para registrar o baseline ANTES de começar — incluir link https://www.linkedin.com/sales/ssi para SSI)",
    "metas_90_dias": [
      { "kpi": "SSI Score", "meta": "> 70" },
      { "kpi": "Visualizações de perfil/semana", "meta": "+150%" },
      { "kpi": "Seguidores", "meta": "+30%" },
      { "kpi": "Convites recebidos/semana", "meta": "+25%" },
      { "kpi": "Mensagens diretas recebidas/semana", "meta": "+20%" },
      { "kpi": "Posts publicados (90 dias)", "meta": "24 (2x/semana)" },
      { "kpi": "Impressões médias por post", "meta": "baseline + 100%" }
    ]
  }
}`;
}

// ════════════════════════════════════════════════════════════════════════════
// SPLIT P1/P2 (v0.4.12) — quebra o kit monolítico em 2 calls Sonnet ~70s cada
// pra evitar timeout 174s. P1 = identidade/conteúdo editável (header, sobre,
// destaques, competências). P2 = Voice Index (7 pilares) + estratégia + KPIs.
// Frontend chama p1, renderiza parcial, chama p2, faz merge {...p1, ...p2}.
// ════════════════════════════════════════════════════════════════════════════

function buildPromptP1(fields) {
  const {
    linkedin_url, nome, area_principal, anos_experiencia,
    resultado_1, resultado_2, resultado_3,
    diferencial_humano, publico_alvo, tom_voz,
    ssi_score, seguidores,
    data_entrada_epiuse, cargo_oficial, foto_oficial
  } = fields;
  const resultados = [resultado_1, resultado_2, resultado_3]
    .filter(Boolean).map((r, i) => `  ${i + 1}. ${r}`).join('\n');

  return `Você é o Profile Optimizer do programa EPI-USE Voices (PARTE 1/2 — IDENTIDADE & CONTEÚDO EDITÁVEL).

CONTEXTO DO PROGRAMA:
- EPI-USE Brasil: maior consultoria SAP HCM/Payroll do Brasil; em evolução para EPI-USE 5.0
- Grupo: EPI-USE / groupelephant.com | 42+ anos | 4.500+ profissionais | 40+ países | SAP Gold Partner
- LOBs: SAP HCM/SuccessFactors, S/4HANA, BTP, Signavio, ServiceNow, Stratview
- IPs: TalenTools, PRISM
- ERP.ngo: 1% receita global → conservação elefantes + combate pobreza rural África (erp.ngo)
- Todo Voice é embaixador ERP.ngo
- SEMPRE "EPI-USE Brasil" por extenso

DADOS FORNECIDOS:
- URL: ${linkedin_url}
- Nome: ${nome || '(ver screenshot)'}
- Área: ${area_principal || '(ver screenshot)'}
- Anos exp: ${anos_experiencia || '(não informado)'}
- Cargo oficial EPI-USE Brasil: ${cargo_oficial || '(não informado)'}
- Data entrada EPI-USE: ${data_entrada_epiuse || '(não informada)'}
- Resultados reais:
${resultados || '  (não informados — use placeholders [preencher])'}
- Diferencial humano: ${diferencial_humano || '(não informado)'}
- Público-alvo: ${publico_alvo || '(não informado)'}
- Tom: ${tom_voz || 'equilibrado'}
- SSI: ${ssi_score || '(não medido)'}
- Seguidores: ${seguidores || '(não informado)'}
- Foto oficial EPI-USE disponível: ${(foto_oficial === 'true' || foto_oficial === true) ? 'Sim' : 'Não confirmado'}

MISSÃO PARTE 1: Diagnóstico + headline + sobre + competências + 5 destaques + ERP.ngo + idioma.

REGRAS:
- Português Brasil
- "Sobre" em 1ª pessoa, máx 2.600 chars, mencionar EPI-USE Voices E ERP.ngo
- Headline máx 220 chars: expertise + EPI-USE Brasil + diferencial + LADO HUMANO se houver
- SEMPRE "EPI-USE Brasil" por extenso
- Competências: priorizar SAP BTP, Clean Core, S/4HANA, SuccessFactors — remover legados
- Resultados reais fornecidos OU placeholder [preencher: ...]
- Sempre 5 Destaques variando: artigo técnico fora LinkedIn | artigo dentro LinkedIn | link externo (podcast/vídeo) | imagem kickoff/go-live/evento SAP-AWS | publicação de PARCEIRO citando o Voice

Retorne APENAS o JSON, sem texto antes/depois:
{
  "nome": "string",
  "cargo_atual": "string",
  "empresa_atual": "EPI-USE Brasil",
  "diagnostico": {
    "pontos_positivos": ["string"],
    "problemas_encontrados": [
      { "elemento": "string", "situacao_atual": "string", "meta": "string", "urgencia": "alta|media|baixa" }
    ]
  },
  "headline_sugerida": "string (máx 220 chars)",
  "url_sugerida": "string (linkedin.com/in/nome-sobrenome)",
  "sobre_texto": "string (1ª pessoa, máx 2600 chars, mencionar EPI-USE Voices + ERP.ngo, com [preencher: ...] para placeholders)",
  "competencias": {
    "adicionar": ["string"],
    "remover": ["string"],
    "manter": ["string"]
  },
  "destaques": [
    { "numero": 1, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 2, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 3, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 4, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" },
    { "numero": 5, "titulo": "string", "descricao": "string", "tipo": "artigo|projeto|conquista|curso|evento" }
  ],
  "secao_fotos": {
    "foto_sugestao": "string (orientações concretas para foto de perfil)",
    "imagens_perfil": ["string (sugestões de capa/kickoffs/eventos)"]
  },
  "erp_ngo": {
    "passo_causas_sociais": "string (passo a passo: como adicionar ERP.ngo como Causa Social no LinkedIn)",
    "como_virar_embaixador": "string (como se posicionar como embaixador ERP.ngo)"
  },
  "estrategia_idioma": {
    "orientacoes": ["string (dica prática sobre idioma)"],
    "instrucao_perfil_en": "string (passo a passo: criar perfil secundário em inglês no LinkedIn)"
  }
}`;
}

function buildPromptP2(fields, p1) {
  const { tom_voz, ssi_score, area_principal, publico_alvo } = fields;
  return `Você é o Profile Optimizer do programa EPI-USE Voices (PARTE 2/2 — VOICE INDEX & ESTRATÉGIA).

PARTE 1 JÁ FEITA — perfil:
- Nome: ${p1.nome || '(?)'}
- Cargo: ${p1.cargo_atual || '(?)'}
- Headline sugerida: ${p1.headline_sugerida || '(?)'}
- Área: ${area_principal || '(?)'}
- Público-alvo: ${publico_alvo || '(não informado)'}
- Tom: ${tom_voz || 'equilibrado'}
- SSI: ${ssi_score || '(não medido)'}

CONTEXTO EPI-USE Brasil: maior consultoria SAP HCM/Payroll do Brasil; LOBs SAP HCM/SF, S/4HANA, BTP, Signavio, ServiceNow, Stratview. Todo Voice é embaixador ERP.ngo (1% receita → conservação elefantes + combate pobreza África).

MISSÃO PARTE 2: avaliar perfil em 7 pilares (Voice Index 0-100) + linha editorial 4 semanas + social selling + recomendações + checklist + KPIs + próximos passos.

AVALIAÇÃO POR PILARES — escala 4 níveis em CADA critério:
- 🟢 forte    — top 20%, exemplar
- 🟡 ok       — médio, dá pra melhorar
- 🟠 fraco    — atrás da média, prioridade
- 🔴 ausente  — gap crítico
- ⚪ na       — não aplicável

PILAR 1 IDENTIDADE VISUAL & ESTRUTURAL: URL customizada · Localização · Pronouns · Gancho 3 primeiras linhas Sobre · CTA no fim Sobre · Modo Criador+hashtags · Cover story
PILAR 2 AUTORIDADE & PROVA SOCIAL: Top 3 Skills endossadas · Certificações SAP/EPI-USE · Formação · Recomendações · Premiações · Eventos palestrante · Publicações próprias · Newsletter
PILAR 3 CONTEÚDO & ATIVIDADE: Frequência posts · Último<7d · Mix formato · Engajamento médio · Comentários alheios · Polls · Tag colegas/clientes/SAP · Compartilha SAP/EPI-USE/parceiros
PILAR 4 NETWORK & RELACIONAMENTO: Conexões >500 · Ratio Followers/Conexões · Grupos relevantes · DM aberto
PILAR 5 SSI INDEX: Estabelecer marca · Encontrar pessoas certas · Engajar com insights · Construir relacionamentos
PILAR 6 ADERÊNCIA EPI-USE: Capa oficial · Cargo oficial · Foto alta qualidade · Data entrada · ERP.ngo voluntariado · Menção Voices · Tag parceiros
PILAR 7 CONVERSÃO: Link destaque · CTA em destaque · Email visível · Botão Serviços

Score pilar (0-100) = média ponderada critérios (forte=100, ok=70, fraco=40, ausente=10, na=ignorar).
voice_index_score = média simples dos 7 pilares.

REGRAS LINHA EDITORIAL:
- Pilares: 40% Thought Leadership, 30% Cases, 20% Pessoas, 10% Propósito
- Calendário 4 semanas × 2 posts (8 temas personalizados pra área do Voice)
- Nota: primeiras 4 semanas SEM links externos no corpo (algoritmo penaliza)
- Tom: ${tom_voz || 'equilibrado'}

Retorne APENAS o JSON, sem texto antes/depois:
{
  "voice_index_score": 0,
  "voice_index_resumo": "string (1-2 frases — onde forte, onde atacar primeiro)",
  "pilares_avaliacao": [
    {
      "pilar": "Identidade Visual & Estrutural",
      "icone": "🪪",
      "score": 0,
      "criterios": [
        { "nome": "URL customizada", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Localização visível", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Pronouns declarados", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Gancho 3 primeiras linhas Sobre", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "CTA no fim do Sobre", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Modo Criador + hashtags", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Cover story (vídeo 30s)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Autoridade & Prova Social",
      "icone": "🏆",
      "score": 0,
      "criterios": [
        { "nome": "Top 3 Skills endossadas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Certificações SAP/EPI-USE", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Formação acadêmica relevante", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Recomendações recebidas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Premiações (Top Voice, SAP Awards)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Eventos como palestrante", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Publicações próprias (artigos)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Newsletter própria", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Conteúdo & Atividade",
      "icone": "📊",
      "score": 0,
      "criterios": [
        { "nome": "Frequência de posts (1-3/semana)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Último post < 7 dias", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Mix de formato (texto/carrossel/vídeo/poll)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Engajamento médio", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Comentários em posts alheios", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Polls/enquetes publicadas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Tag de colegas/clientes/SAP", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Compartilha SAP/EPI-USE mãe/parceiros", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Network & Relacionamento",
      "icone": "🌐",
      "score": 0,
      "criterios": [
        { "nome": "Conexões totais (>500)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Ratio Followers/Conexões", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Membro de Grupos relevantes", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "DM aberto", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "SSI Index (LinkedIn oficial)",
      "icone": "📈",
      "score": 0,
      "criterios": [
        { "nome": "Estabelecer marca profissional", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Encontrar pessoas certas", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Engajar com insights", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Construir relacionamentos", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Aderência EPI-USE Brasil",
      "icone": "💼",
      "score": 0,
      "criterios": [
        { "nome": "Capa oficial EPI-USE Brasil", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Cargo oficial EPI-USE", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Foto oficial alta qualidade", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Data de entrada na EPI-USE declarada", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "ERP.ngo no voluntariado", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Menção EPI-USE Voices", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Tag/citação de parceiros (SAP, AWS)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    },
    {
      "pilar": "Conversão (lead → reunião)",
      "icone": "🎯",
      "score": 0,
      "criterios": [
        { "nome": "Link em destaque (Calendly/agenda)", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "CTA explícito em destaque", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Email visível no Sobre/Contato", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" },
        { "nome": "Botão Serviços ativado", "nivel": "forte|ok|fraco|ausente|na", "observacao": "string" }
      ]
    }
  ],
  "ssi_diagnostico": {
    "nivel": "baixo|medio|bom|excelente",
    "observacoes": "string",
    "dicas": ["string"]
  },
  "linha_editorial": {
    "pilares": [
      { "percentual": "40%", "nome": "Thought Leadership", "exemplos": ["string (tema personalizado pra área deste Voice)"] },
      { "percentual": "30%", "nome": "Cases", "exemplos": ["string"] },
      { "percentual": "20%", "nome": "Pessoas", "exemplos": ["string"] },
      { "percentual": "10%", "nome": "Propósito", "exemplos": ["string"] }
    ],
    "calendario_4_semanas": [
      { "semana": 1, "post_1": "string (tema específico pra este Voice)", "post_2": "string" },
      { "semana": 2, "post_1": "string", "post_2": "string" },
      { "semana": 3, "post_1": "string", "post_2": "string" },
      { "semana": 4, "post_1": "string", "post_2": "string" }
    ],
    "nota_algoritmo": "string (dica: primeiras 4 semanas sem links externos no corpo do post)"
  },
  "social_selling": {
    "perfis_para_alertas": ["string (perfis sugeridos pra seguir/comentar)"],
    "exemplo_comentario": "string (modelo de comentário de alto impacto contextualizado pra área deste Voice — mencionar EPI-USE Brasil + dado concreto)",
    "dica_30_min": "string (instrução tática: primeiros 30 min após publicação de líder do nicho, comentar com insight)"
  },
  "recomendacoes": {
    "meta": "8 a 12 recomendações ativas",
    "perfis_prioritarios": ["string"],
    "template_mensagem": "string (mensagem pronta pra copiar e enviar no LinkedIn pedindo recomendação)"
  },
  "checklist": [
    { "item": "string", "prioridade": "urgente|normal|bonus", "passo": "string" }
  ],
  "kpis": {
    "instrucoes_baseline": "string (incluir https://www.linkedin.com/sales/ssi)",
    "metas_90_dias": [
      { "kpi": "SSI Score", "meta": "> 70" },
      { "kpi": "Visualizações de perfil/semana", "meta": "+150%" },
      { "kpi": "Seguidores", "meta": "+30%" },
      { "kpi": "Convites recebidos/semana", "meta": "+25%" },
      { "kpi": "Mensagens diretas recebidas/semana", "meta": "+20%" },
      { "kpi": "Posts publicados (90 dias)", "meta": "24 (2x/semana)" },
      { "kpi": "Impressões médias por post", "meta": "baseline + 100%" }
    ]
  },
  "proximos_passos": ["string"]
}`;
}

// Helper: extrai req.body comum + arquivos pra base64
function _extractCommonInput(req) {
  const files = req.files || [];
  const fields = {
    linkedin_url: req.body.linkedin_url,
    nome: req.body.nome,
    area_principal: req.body.area_principal,
    anos_experiencia: req.body.anos_experiencia,
    resultado_1: req.body.resultado_1,
    resultado_2: req.body.resultado_2,
    resultado_3: req.body.resultado_3,
    diferencial_humano: req.body.diferencial_humano,
    publico_alvo: req.body.publico_alvo,
    tom_voz: req.body.tom_voz,
    ssi_score: req.body.ssi_score,
    seguidores: req.body.seguidores,
    data_entrada_epiuse: req.body.data_entrada_epiuse,
    cargo_oficial: req.body.cargo_oficial,
    foto_oficial: req.body.foto_oficial
  };
  const images = files.map(file => ({
    type: 'image',
    source: { type: 'base64', media_type: file.mimetype, data: fs.readFileSync(file.path).toString('base64') }
  }));
  return { fields, files, images };
}

// POST /api/analisar-perfil/p1 — header + sobre + destaques + ERP.ngo (~70s, max_tokens 8000)
app.post('/api/analisar-perfil/p1', optimizerLimiter, upload.array('screenshots', 5), async (req, res) => {
  const { fields, files, images } = _extractCommonInput(req);
  try {
    if (!fields.linkedin_url) return res.status(400).json({ success: false, error: 'URL do LinkedIn é obrigatória.' });
    const content = [...images, { type: 'text', text: buildPromptP1(fields) }];
    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[optimizer/p1] ${dur}s · ${response.usage?.input_tokens || '?'}→${response.usage?.output_tokens || '?'} · stop=${response.stop_reason}`);
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    if (response.stop_reason === 'max_tokens') {
      return res.status(500).json({ success: false, error: `P1 truncado (${response.usage.output_tokens} tokens). Reduza screenshots ou tente novamente.` });
    }
    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA na parte 1.' });
    const p1 = JSON.parse(m[0]);
    res.json({ success: true, p1, dur_ms: Date.now() - t0 });
  } catch (e) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('[optimizer/p1]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/analisar-perfil/p2 — Voice Index + estratégia + KPIs (~70s, max_tokens 12000)
// Recebe p1_json no body pra ter contexto. NÃO precisa de screenshots (já analisados em p1).
app.post('/api/analisar-perfil/p2', optimizerLimiter, async (req, res) => {
  try {
    const { p1, ...fields } = req.body;
    if (!p1 || !p1.nome) return res.status(400).json({ success: false, error: 'p1 (resultado da parte 1) é obrigatório no body.' });
    const content = [{ type: 'text', text: buildPromptP2(fields, p1) }];
    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 12000,
      messages: [{ role: 'user', content }]
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[optimizer/p2] ${dur}s · ${response.usage?.input_tokens || '?'}→${response.usage?.output_tokens || '?'} · stop=${response.stop_reason}`);
    if (response.stop_reason === 'max_tokens') {
      return res.status(500).json({ success: false, error: `P2 truncado (${response.usage.output_tokens} tokens). Tente novamente.` });
    }
    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA na parte 2.' });
    const p2 = JSON.parse(m[0]);
    res.json({ success: true, p2, dur_ms: Date.now() - t0 });
  } catch (e) {
    console.error('[optimizer/p2]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// LEGACY: /api/analisar-perfil — mantém pra fallback. Faz p1+p2 sequencial internamente.
app.post('/api/analisar-perfil', optimizerLimiter, upload.array('screenshots', 5), async (req, res) => {
  const files = req.files || [];

  try {
    const {
      linkedin_url,
      nome,
      area_principal,
      anos_experiencia,
      resultado_1,
      resultado_2,
      resultado_3,
      diferencial_humano,
      publico_alvo,
      tom_voz,
      ssi_score,
      seguidores,
      data_entrada_epiuse,
      cargo_oficial,
      foto_oficial
    } = req.body;

    if (!linkedin_url) {
      return res.status(400).json({ success: false, error: 'URL do LinkedIn é obrigatória.' });
    }

    const content = [];

    for (const file of files) {
      const imageData = fs.readFileSync(file.path);
      const base64 = imageData.toString('base64');
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: file.mimetype, data: base64 }
      });
    }

    content.push({
      type: 'text',
      text: buildPrompt({
        linkedin_url, nome, area_principal, anos_experiencia,
        resultado_1, resultado_2, resultado_3,
        diferencial_humano, publico_alvo, tom_voz,
        ssi_score, seguidores,
        data_entrada_epiuse, cargo_oficial, foto_oficial
      })
    });

    // Sonnet 4.6: o JSON do kit completo + 7 pilares × ~7 critérios (v0.4.1) chega facilmente
    // em 14-18k tokens output. max_tokens=20000 dá margem confortável.
    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20000,
      messages: [{ role: 'user', content }]
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[optimizer] análise concluída em ${dur}s · ${response.usage?.input_tokens || '?'}→${response.usage?.output_tokens || '?'} tokens · stop=${response.stop_reason}`);

    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });

    // Se Claude bateu o teto de output, o JSON tá truncado — falha clara
    if (response.stop_reason === 'max_tokens') {
      return res.status(500).json({
        success: false,
        error: `Resposta truncada (estourou ${response.usage.output_tokens} tokens). Reduza pra 2-3 screenshots ou tente novamente.`
      });
    }

    // Extrair JSON — remove blocos markdown se Claude os incluir
    let rawText = response.content[0].text;
    rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: 'A IA não retornou um JSON válido. Tente novamente.' });
    }

    let kit;
    try {
      kit = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, '· raw length:', rawText.length);
      return res.status(500).json({ success: false, error: 'Resposta da IA incompleta (JSON malformado). Tente novamente ou reduza o número de screenshots.' });
    }
    res.json({ success: true, kit });

  } catch (error) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });
    console.error('Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// OPTIMIZER EXTRACT — Vision pass 1: pré-preenche todos os campos do form
// (Haiku 4.5, ~8s, retorna 14 campos + _faltando[] com o que não conseguiu)
// ════════════════════════════════════════════════════════════════════════════
function buildOptimizerExtractPrompt(linkedin_url) {
  return `Você analisa o perfil LinkedIn (URL: ${linkedin_url || 'não fornecida — usar screenshots'}) e pré-preenche o formulário do EPI-USE Voices Profile Optimizer.

Sua tarefa: extrair do que VOCÊ VÊ nos screenshots o máximo possível dos 14 campos abaixo. Onde não houver evidência, retorne null (NÃO INVENTE).

Retorne APENAS este JSON, sem texto antes/depois:
{
  "nome": "nome completo conforme aparece no perfil ou null",
  "cargo_atual": "headline OU cargo principal visível (ex: 'Head Products & Innovation | FIAP') ou null",
  "area_principal": "1-4 palavras do nicho técnico (ex: 'SAP HCM SuccessFactors', 'SAP BTP Cloud', 'Process Mining') ou null",
  "anos_experiencia": "número inteiro inferido das datas de experiência ou null",
  "ssi_score": "número 0-100 só se aparecer screenshot do linkedin.com/sales/ssi senão null",
  "seguidores": "número de seguidores se visível senão null",
  "cargo_oficial": "cargo oficial na EPI-USE Brasil se o perfil já cita (ex: 'Head of Products & Innovation') OU null se ainda não está atualizado",
  "data_entrada_epiuse": "data início se EPI-USE aparece na experiência (formato YYYY-MM ou 'YYYY') ou null",
  "foto_oficial": "true se a foto atual parece profissional/atual (rosto visível, fundo neutro), false se claramente precisa atualizar",
  "resultado_1": "1º resultado quantitativo REAL extraído (ex: '14 anos consultoria SAP HCM' · '280 lojas Drogaria Venancio em 14 meses'). Null se não houver.",
  "resultado_2": "2º resultado quantitativo OU null",
  "resultado_3": "3º resultado quantitativo OU null",
  "diferencial_humano": "1 frase sobre família/paixão/causa/mentoria/esporte visível no perfil (ex: 'pai do João, apaixonado por corrida') ou null",
  "publico_alvo": "1-3 personas que esse perfil deveria atingir (ex: 'CHROs, Diretores RH', 'CIOs, Arquitetos SAP') ou null",
  "tom_voz": "uma das opções: formal | equilibrado | coloquial | técnico-storytelling — inferido dos posts/Sobre, default 'equilibrado'",
  "_faltando": ["array com os NOMES dos campos que você retornou null/vazio — pra UI marcar pro user preencher manualmente"]
}

REGRAS:
- Não invente. Se a info não está visível, retorne null e adicione o nome do campo em _faltando.
- "tom_voz" SEMPRE retorna um valor (default 'equilibrado'), nunca null.
- _faltando deve listar exatamente os keys dos campos null/vazios.
- **CRÍTICO:** mesmo se não houver screenshots (só URL) ou nenhum dado, RETORNE o JSON com todos os campos null + _faltando listando todos. NUNCA retorne texto fora do JSON.`;
}

const optimizerExtractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,    // mais permissivo que kit completo (10/h) — extract é barato
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 15 extrações/hora atingido. Tente em 1h.' }
});

app.post('/api/optimizer/extract', optimizerExtractLimiter, upload.array('screenshots', 5), async (req, res) => {
  const files = req.files || [];
  try {
    const { linkedin_url } = req.body;
    if (!linkedin_url && files.length === 0) {
      return res.status(400).json({ success: false, error: 'Forneça URL LinkedIn ou pelo menos 1 screenshot.' });
    }
    const content = [];
    for (const file of files) {
      const base64 = fs.readFileSync(file.path).toString('base64');
      content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: base64 } });
    }
    content.push({ type: 'text', text: buildOptimizerExtractPrompt(linkedin_url) });

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',         // Haiku — barato, rápido (~5-10s pra Vision)
      max_tokens: 2500,
      messages: [{ role: 'user', content }]
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[optimizer/extract] ${dur}s · ${response.usage?.input_tokens || '?'}→${response.usage?.output_tokens || '?'} · stop=${response.stop_reason}`);
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });

    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA. Tente novamente.' });
    const data = JSON.parse(m[0]);
    res.json({ success: true, ...data });
  } catch (e) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('[optimizer/extract]', e.message);
    res.status(500).json({ success: false, error: e.message || 'Falha na extração.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// OPTIMIZER FROM-TRANSCRIPT (v0.4.9) — single textarea com transcrição da
// entrevista. Sonnet extrai os 14 campos do form + sinaliza o que faltou.
// User não precisa preencher nada manualmente — só cola e gera.
// ════════════════════════════════════════════════════════════════════════════
function buildOptimizerTranscriptPrompt(transcript, linkedin_url) {
  return `Você analisa a transcrição de uma entrevista feita com um colaborador da EPI-USE Brasil pra preencher o formulário do Profile Optimizer.

CONTEXTO: Pra otimizar o perfil LinkedIn do Voice, precisamos extrair 14 dados específicos da conversa. Use linguagem natural pra capturar tom e detalhes humanos. Se algo NÃO foi mencionado, retorna null + adiciona o campo em _faltando[].

URL LinkedIn (se disponível): ${linkedin_url || '(não fornecida)'}

═══ TRANSCRIÇÃO DA ENTREVISTA ═══
${transcript}
═══ FIM DA TRANSCRIÇÃO ═══

EXTRAIA EM JSON (APENAS o JSON, sem texto antes/depois):
{
  "nome": "nome completo se mencionado ou null",
  "cargo_atual": "cargo/headline atual (ex: 'Delivery Strategic Account | EPI-USE Brasil') ou null",
  "area_principal": "área SAP principal: SAP HCM / SuccessFactors | SAP BTP / Clean Core | SAP ERP / S/4HANA | SAP Signavio | Analytics / Stratview | ServiceNow HRSD / ITSM | Múltiplas áreas",
  "anos_experiencia": "número inteiro ou null",
  "ssi_score": "0-100 se mencionado SSI, senão null",
  "seguidores": "número se mencionado, senão null",
  "cargo_oficial": "cargo oficial EPI-USE Brasil se citado",
  "data_entrada_epiuse": "data ou ano de entrada (formato YYYY ou 'Mês de YYYY')",
  "foto_oficial": "true se mencionou ter foto oficial, false se admitiu não ter",
  "resultado_1": "1º resultado quantitativo concreto extraído (preferir os com NÚMEROS reais — ex: '14 anos consultoria SAP HCM' · 'Migrei 280 lojas Drogaria Venancio em 14 meses'). Capture com riqueza, NÃO resuma.",
  "resultado_2": "2º resultado quantitativo OU null",
  "resultado_3": "3º resultado quantitativo OU null",
  "diferencial_humano": "1-2 frases sobre família/paixões/causas/esportes/mentorias mencionados (ex: 'pai do João e Maria, apaixonado por trail running, mentor de jovens SAP'). NÃO invente.",
  "publico_alvo": "personas-alvo no LinkedIn mencionadas (ex: 'CHROs, Diretores de RH de empresas com SAP')",
  "tom_voz": "uma das opções: equilibrado | técnico | executivo | inspirador — inferir do tom da entrevista",
  "certificacoes": "lista de certificações SAP mencionadas ou null (string separada por vírgula)",
  "eventos_palestras": "eventos onde palestrou/participou (ex: 'SAP NOW 2025, BTP Experience 2026')",
  "frequencia_post_meta": "se mencionou meta de frequência de posts (ex: '2/semana')",
  "kickoffs_recentes": "kickoffs/go-lives recentes que viraram caso de sucesso",
  "trechos_destacados": "array de 3-5 trechos LITERAIS marcantes da entrevista que valem virar conteúdo de post — frases dele próprio entre aspas",
  "_faltando": ["array com NOMES dos campos null/vazios — pra UI sinalizar pro user"],
  "_confianca": "alta | media | baixa — qualidade geral da transcrição pra extração",
  "_observacoes": "string opcional: o que ficou ambíguo na entrevista, ou sugestões de pergunta de follow-up"
}

REGRAS CRÍTICAS:
- Não invente. Se o entrevistado não falou, retorna null e adiciona em _faltando.
- "tom_voz" SEMPRE retorna um valor (default 'equilibrado').
- "trechos_destacados" deve ter pelo menos 2 itens — frases LITERAIS dele, não paráfrases.
- Não corrija português coloquial nas frases dele; preserve voz natural.
- "resultado_*" são o coração — capture com NÚMEROS quando houver, e contexto suficiente pro Claude gerar Sobre depois.`;
}

const transcriptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Limite 10/h atingido.' }
});

app.post('/api/optimizer/from-transcript', transcriptLimiter, async (req, res) => {
  try {
    const { transcript, linkedin_url } = req.body || {};
    if (!transcript || transcript.length < 100) {
      return res.status(400).json({ success: false, error: 'Transcrição precisa ter pelo menos 100 caracteres.' });
    }
    if (transcript.length > 80000) {
      return res.status(400).json({ success: false, error: 'Transcrição muito longa (>80k chars). Reduza pra trechos relevantes.' });
    }

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',    // Haiku — 5x rápido que Sonnet, qualidade suficiente pra extract estruturado
      max_tokens: 4000,
      messages: [{ role: 'user', content: buildOptimizerTranscriptPrompt(transcript, linkedin_url) }]
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[optimizer/from-transcript] ${dur}s · ${response.usage?.input_tokens}→${response.usage?.output_tokens} · stop=${response.stop_reason}`);
    if (response.stop_reason === 'max_tokens') {
      return res.status(500).json({ success: false, error: 'Extração truncada — transcrição muito longa. Reduza pra trechos mais relevantes.' });
    }

    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA.' });
    const data = JSON.parse(m[0]);
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[optimizer/from-transcript]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// VOICES VISION — extrai dados de perfil LinkedIn via Claude Vision
// (a) extract: Voice existente, preenche campos faltantes
// (b) create-from-profile: novo Voice do zero, retorna esqueleto pra revisão
// ════════════════════════════════════════════════════════════════════════════

const voicesVisionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,    // 8/h por IP — Vision é caro
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de 8 análises Vision/hora atingido.' }
});

function buildExtractPrompt(linkedin_url, nome) {
  return `Você analisa o perfil LinkedIn de ${nome || 'um Voice'} (URL: ${linkedin_url || 'ver screenshots'}) e extrai dados estruturados pra atualizar o perfil dele no programa EPI-USE Voices.

Use o que VOCÊ CONSEGUE VER nos screenshots. Não invente números. Onde não houver evidência, retorne null.

Retorne APENAS este JSON, sem texto antes/depois:
{
  "ssi_baseline": "número 0-100 se aparecer na URL https://linkedin.com/sales/ssi (provavelmente null)",
  "seguidores_baseline": "número de seguidores se visível",
  "tom_voz": "string 1-2 frases descrevendo o tom — formal/coloquial, técnico/storytelling, etc — inferido dos posts ou Sobre",
  "lado_humano": "string 1 frase — paixões/causas/diferencial humano visível no perfil (família, mentoria, comunidade, esportes, etc)",
  "resultados": ["array de 3-5 strings com resultados quantitativos REAIS do perfil — extrair de Sobre, Destaques, recomendações. Ex: '14 anos consultoria SAP HCM' · 'liderou migração para 280 lojas Drogaria Venancio'. Se não houver, retornar array vazio []"]
}`;
}

function buildCreatePrompt(nome, linkedin_url, area_principal) {
  return `Você está cadastrando ${nome} como novo Voice do programa EPI-USE Voices (LinkedIn: ${linkedin_url}, área: ${area_principal || 'não informada'}).

Analise os screenshots do perfil dele e extraia TUDO que conseguir ver pra montar o esqueleto do Voice. Retorne APENAS este JSON:

{
  "nome": "${nome}",
  "cargo": "cargo atual visível no LinkedIn",
  "empresa": "EPI-USE Brasil",
  "nicho": "string · 3-6 palavras · ex: 'SAP HCM · SuccessFactors · Folha de Pagamento'",
  "tags": ["array de 3-5 tags técnicas relevantes pro nicho — ex: 'SAP HCM', 'SuccessFactors', 'Payroll'"],
  "audiencia": ["array de 2-4 personas que esse Voice vai atingir — ex: 'CHROs', 'Diretores de RH', 'Líderes de Folha'"],
  "tom_voz": "string 1-2 frases — tom natural visível nos posts/Sobre",
  "lado_humano": "string 1 frase — diferencial humano visível",
  "resultados": ["array 3-5 resultados quantitativos REAIS extraídos do perfil — não inventar"],
  "seguidores_baseline": "número se visível, senão null",
  "ssi_baseline": null
}`;
}

app.post('/api/voices/extract', voicesVisionLimiter, upload.array('screenshots', 5), async (req, res) => {
  const files = req.files || [];
  try {
    const { linkedin_url, nome } = req.body;
    if (!linkedin_url && files.length === 0) {
      return res.status(400).json({ success: false, error: 'Forneça URL LinkedIn ou pelo menos 1 screenshot.' });
    }
    const content = [];
    for (const file of files) {
      const base64 = fs.readFileSync(file.path).toString('base64');
      content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: base64 } });
    }
    content.push({ type: 'text', text: buildExtractPrompt(linkedin_url, nome) });

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    });
    console.log(`[voices/extract] ${((Date.now() - t0)/1000).toFixed(1)}s · ${response.usage?.input_tokens||'?'}→${response.usage?.output_tokens||'?'}`);
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });

    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA. Tente novamente.' });
    const data = JSON.parse(m[0]);
    res.json({ success: true, ...data });
  } catch (e) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('[voices/extract]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/voices/create-from-profile', voicesVisionLimiter, upload.array('screenshots', 5), async (req, res) => {
  const files = req.files || [];
  try {
    const { nome, linkedin_url, area_principal } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ success: false, error: 'Nome é obrigatório.' });
    if (!linkedin_url && files.length === 0) {
      return res.status(400).json({ success: false, error: 'Forneça URL LinkedIn ou pelo menos 1 screenshot.' });
    }
    const content = [];
    for (const file of files) {
      const base64 = fs.readFileSync(file.path).toString('base64');
      content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: base64 } });
    }
    content.push({ type: 'text', text: buildCreatePrompt(nome.trim(), linkedin_url, area_principal) });

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content }]
    });
    console.log(`[voices/create] ${((Date.now() - t0)/1000).toFixed(1)}s · ${response.usage?.input_tokens||'?'}→${response.usage?.output_tokens||'?'}`);
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });

    let raw = response.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(500).json({ success: false, error: 'JSON inválido da IA. Tente novamente.' });
    const data = JSON.parse(m[0]);
    // Adiciona campos infra que o user vai precisar revisar/preencher
    data.linkedin = linkedin_url || null;
    data.status = 'onboarding';
    data.status_label = 'Onboarding';
    data.id = (nome.toLowerCase().replace(/[^a-z\s]/g,'').trim().replace(/\s+/g,'-')).slice(0, 40);
    res.json({ success: true, ...data });
  } catch (e) {
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    console.error('[voices/create]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Healthcheck — usado pela Tarefa Agendada do Windows (office-health.ps1) e pelo Railway
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'epi-use-office',
    version: (() => { try { return require('./package.json').version; } catch { return 'unknown'; } })(),
    uptime_s: Math.round(process.uptime()),
    ts: new Date().toISOString(),
    webhooks: {
      recruitment: WEBHOOK_RECRUITMENT_URL ? `SET (${WEBHOOK_RECRUITMENT_URL.length} chars, starts: ${WEBHOOK_RECRUITMENT_URL.slice(0,40)}...)` : 'NOT SET',
      brindes: process.env.WEBHOOK_BRINDES_URL ? 'SET' : 'NOT SET'
    }
  });
});

const PORT = process.env.PORT || 3000;
// ── REGISTER MODULAR ROUTERS ──────────────────────────────────────────────────
const sapRouter = require('./routes/sap');
const authRouter = require('./routes/auth');
const casesRouter = require('./routes/cases');
const inboundRouter = require('./routes/inbound');
const jarvisRouter = require('./routes/jarvis'); // Módulo 11 — JARVIS (copiloto SDR/BDR)
const optimizerV3Router = require('./routes/optimizer-v3'); // Módulo 12 — Profile Optimizer v3 (Groq Vision + 21 LinkedIn skills)
const usersRouter = require('./routes/users'); // Módulo 13 — Users & Roles (SSO + admin)
const curvaAbcRouter = require('./routes/curva-abc'); // Módulo 14 — Curva ABC (classificação de contas Fit x Propensão)

app.use('/', sapRouter);
app.use('/', authRouter);
app.use('/', casesRouter);
app.use('/', inboundRouter);
app.use('/', jarvisRouter);
app.use('/', optimizerV3Router);
app.use('/', usersRouter);
app.use('/', curvaAbcRouter);
app.use('/', analyticsRouter); // Módulo 15 — Analytics de uso (report /admin/analytics)
app.use('/', require('./routes/utm')); // Módulo 18 — UTM / links rastreados (report /admin/utm)
app.use('/', require('./routes/loja')); // Módulo 19 — Loja de ERP Coins (/loja + resgates no /admin/coins)
app.use('/', require('./routes/voices-pipeline')); // Módulo 20 — pipeline de validação/publicação dos Voices
app.use('/', require('./routes/comunicados')); // Modulo 21 -- fila de comunicados por e-mail
app.use('/', require('./routes/cafezinho')); // Módulo 22 — Cafezinho (área pessoal do time)
app.use('/', require('./routes/horas'));      // Módulo 23 — Banco de Horas MKT

app.listen(PORT, () => {
  console.log(`\n🎙️  EPI-USE Voices — Profile Optimizer`);
  console.log(`🚀  http://localhost:${PORT}\n`);
});

// ════════════════════════════════════════════════════════════════════════════
// REFRESH DIÁRIO de GA4 + RD (v0.47.2) — mantém o report mensal fresco em PROD.
// Só dispara onde as credenciais existem (Railway). Local sem creds = no-op
// silencioso. Roda ~40s após boot + a cada 24h. Sem lib de cron (setInterval).
// Antes disso GA4/RD ficavam congelados (ex: travados em 05/jun) — Regra 7.
// ════════════════════════════════════════════════════════════════════════════
async function dailyDataRefresh() {
  const mes = new Date().toISOString().slice(0, 7);
  // GA4
  if (process.env.GA4_PROPERTY_ID) {
    try {
      const ga4 = require(path.join(__dirname, 'scripts/integrations/ga4_fetch.js'));
      const r = await ga4.refreshAndCache(mes);
      console.log(`[daily] GA4 ${mes} OK — usuarios=${r.usuarios}`);
    } catch (e) { console.warn('[daily] GA4 falhou:', e.message); }
  }
  // RD Station
  if (process.env.RD_REFRESH_TOKEN) {
    try {
      const rd = require(path.join(__dirname, 'scripts/integrations/rd_fetch.js'));
      const o = await rd.fetchRD();
      console.log(`[daily] RD OK — atualizado=${o.atualizado_em}`);
    } catch (e) { console.warn('[daily] RD falhou:', e.message); }
  }
}
if (process.env.GA4_PROPERTY_ID || process.env.RD_REFRESH_TOKEN) {
  setTimeout(dailyDataRefresh, 40000);            // 40s após boot
  setInterval(dailyDataRefresh, 24 * 60 * 60 * 1000); // a cada 24h
  console.log('[daily] refresh GA4/RD agendado (boot+24h)');
} else {
  console.log('[daily] refresh GA4/RD inativo (sem creds — esperado em local)');
}

// ── RESUMO SEMANAL POR E-MAIL (Módulo 17 · v0.76.0) ──────────────────────────
// Toda segunda ~8h BRT (>=11h UTC) manda um digest do Analytics + UTM pro
// NOTIFY_EMAIL (Rudá). Sem cron lib: tick horário + guard em app_blobs
// (chave 'digest.lastSent' = ano-semana ISO) pra não duplicar entre restarts.
// Sem RESEND_API_KEY: loga "skipped" e marca a semana (não fica re-tentando).
function _isoWeekKey(d) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y = dt.getUTCFullYear();
  const week = Math.ceil((((dt - Date.UTC(y, 0, 1)) / 86400000) + 1) / 7);
  return y + '-W' + String(week).padStart(2, '0');
}
async function sendWeeklyDigest(force) {
  const anl = require('./routes/analytics');
  const data = anl.buildDigestData(7);
  const html = anl.buildDigestHTML(data);
  if (!resend) { console.log('[digest] skipped (sem RESEND_API_KEY)'); return { sent: false, reason: 'sem_resend', html }; }
  try {
    await resend.emails.send({
      from: FROM_EMAIL, to: NOTIFY_EMAIL,
      subject: `📊 Office — resumo da semana (${data.uso.usuarios} usuários · ${data.uso.visitas} visitas · ${data.utm.cliques} cliques UTM)`,
      html,
    });
    console.log(`[digest] enviado pra ${NOTIFY_EMAIL}${force ? ' (forçado)' : ''}`);
    return { sent: true, to: NOTIFY_EMAIL };
  } catch (e) { console.warn('[digest] falhou:', e.message); return { sent: false, reason: e.message }; }
}
async function weeklyDigestTick() {
  try {
    const now = new Date();
    if (now.getUTCDay() !== 1 || now.getUTCHours() < 11) return; // segunda >= 8h BRT
    const wk = _isoWeekKey(now);
    const row = db.prepare(`SELECT value FROM app_blobs WHERE key='digest.lastSent'`).get();
    if (row && row.value === wk) return; // já mandou esta semana
    db.prepare(`INSERT OR REPLACE INTO app_blobs (key, value, updated_at) VALUES ('digest.lastSent', ?, datetime('now'))`).run(wk);
    await sendWeeklyDigest(false);
  } catch (e) { console.warn('[digest] tick:', e.message); }
}
setInterval(weeklyDigestTick, 60 * 60 * 1000); // checa a cada hora
setTimeout(weeklyDigestTick, 90000);           // e uma vez ~90s após o boot

// Preview/força-envio pro admin (testável sem esperar segunda-feira).
app.get('/api/admin/digest/preview', _coinsAdmin, (req, res) => {
  try {
    const anl = require('./routes/analytics');
    res.type('html').send(anl.buildDigestHTML(anl.buildDigestData(parseInt(req.query.days, 10) || 7)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/digest/send', _coinsAdmin, async (req, res) => {
  try { res.json(await sendWeeklyDigest(true)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
