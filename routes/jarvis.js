// ── MÓDULO 11 · JARVIS — Copiloto SDR/BDR/LDR (biz dev) ───────────────────────
// Router modular ADITIVO (não altera nada existente). Espelha routes/inbound.js.
// Guia o vendedor em tempo real: escuta a conversa (transcrição do front) e
// recomenda falas via Claude, ancorado na base de conhecimento REAL da EPI-USE.
// Persona: SDR sênior 20 anos, prospecção B2B SAP/ServiceNow.

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
  db,
  requireAuth,
  client,
  rateLimit
} = require('../server-context');

const JARVIS_HTML = path.join(__dirname, '../public/jarvis.html');
const MOD_DIR = path.join(__dirname, '../modulos/11-jarvis-sdr');
const PLAYBOOK_PATH = path.join(MOD_DIR, 'playbook.json');

// ── BASE DE CONHECIMENTO (carregada 1x no boot) ───────────────────────────────
let PLAYBOOK = {};
try {
  PLAYBOOK = JSON.parse(fs.readFileSync(PLAYBOOK_PATH, 'utf8'));
  console.log('[jarvis] playbook carregado:', PLAYBOOK?._meta?.versao || '?');
} catch (e) {
  console.warn('[jarvis] playbook não carregado:', e.message);
}

// ── KB CURADA (battle cards + produtos SAP) — arquivos versionados, Regra 7 ────
// Alimentados por material REAL (Rudá entrega arquivo → Claude estrutura → commit).
// Começam vazios com etiqueta "aguarda ingestão"; injeta no prompt só quando houver dado.
function loadKb(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(MOD_DIR, file), 'utf8')); }
  catch (e) { console.warn(`[jarvis] ${file} não carregado:`, e.message); return fallback; }
}
let KB_PRODUTOS = loadKb('kb-produtos-sap.json', { produtos: [] });
let KB_BATTLE   = loadKb('kb-battle-cards.json', { battle_cards: [] });
console.log('[jarvis] KB:', (KB_PRODUTOS.produtos || []).length, 'produtos ·',
            (KB_BATTLE.battle_cards || []).length, 'battle cards');

// ── MEMÓRIA VIVA (persistência SQLite — calls + dores aprendidas) ─────────────
// Aditivo: cria as tabelas no boot do router. Cloud-ready (volume /data no Railway).
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jarvis_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect TEXT, empresa TEXT, industria TEXT, lob TEXT, persona TEXT, estagio TEXT,
      transcript_json TEXT,
      role_map_json TEXT,
      temperatura INTEGER,
      resumo TEXT,
      duracao_seg INTEGER,
      criado_em TEXT DEFAULT (datetime('now')),
      criado_por TEXT
    );
    CREATE TABLE IF NOT EXISTS jarvis_aprendizados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER,
      tipo TEXT,                 -- dor | objecao | gatilho | pergunta_vencedora | sinal
      texto TEXT,
      lob TEXT, industria TEXT, persona TEXT,
      fonte TEXT DEFAULT 'call', -- call (real) | manual
      criado_em TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jap_lob  ON jarvis_aprendizados(lob);
    CREATE INDEX IF NOT EXISTS idx_jap_tipo ON jarvis_aprendizados(tipo);
  `);
  try { db.exec(`ALTER TABLE jarvis_calls ADD COLUMN zoho_call_id TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE jarvis_calls ADD COLUMN fonte_audio TEXT`); } catch (_) {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_jc_zoho ON jarvis_calls(zoho_call_id) WHERE zoho_call_id IS NOT NULL`); } catch (_) {}
  console.log('[jarvis] memória viva pronta (jarvis_calls + jarvis_aprendizados)');
} catch (e) {
  console.warn('[jarvis] falha ao preparar memória viva:', e.message);
}

// ── BACKEND DE IA: odysseus (Anthropic-compat) | Anthropic padrão ─────────────
// odysseus expõe /v1/messages (Anthropic-compatible), então reusamos a MESMA classe
// Anthropic do client compartilhado — só trocando baseURL + key (via env off-repo).
// Se as vars do odysseus não existirem, cai no client padrão (ANTHROPIC_API_KEY).
// Config (Railway + .env local): JARVIS_LLM_BASE_URL · JARVIS_LLM_API_KEY · JARVIS_LLM_MODEL.
const ODY_BASE = (process.env.JARVIS_LLM_BASE_URL || process.env.ODYSSEUS_BASE_URL || '').trim();
const ODY_KEY  = (process.env.JARVIS_LLM_API_KEY  || process.env.ODYSSEUS_API_KEY  || '').trim();
const AI_MODEL = (process.env.JARVIS_LLM_MODEL     || 'claude-haiku-4-5').trim();
const AI_FALLBACK_MODELS = ['qwen/qwen3.6-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini'];
// Formato da API do backend de IA:
//   'anthropic' (padrão) → /v1/messages (API Anthropic ou gateway Anthropic-compat)
//   'openai'             → /v1/chat/completions (Ollama, LM Studio, odysseus local etc.)
const AI_FORMAT = (process.env.JARVIS_LLM_FORMAT || 'anthropic').trim().toLowerCase();
let aiClient = client;          // default: client Anthropic compartilhado
let usingOdysseus = false;
if (ODY_BASE && AI_FORMAT !== 'openai') {
  // gateway Anthropic-compat: reusa a MESMA classe Anthropic, só trocando baseURL + key
  try {
    aiClient = new client.constructor({ baseURL: ODY_BASE.replace(/\/+$/, ''), apiKey: ODY_KEY || 'odysseus' });
    usingOdysseus = true;
    console.log('[jarvis] backend de IA: odysseus(anthropic) @', ODY_BASE, '· modelo', AI_MODEL);
  } catch (e) {
    console.warn('[jarvis] falha ao iniciar odysseus, usando Anthropic padrão:', e.message);
  }
}
if (AI_FORMAT === 'openai') {
  console.log('[jarvis] backend de IA: OpenAI-compat @', ODY_BASE || '(JARVIS_LLM_BASE_URL vazio!)', '· modelo', AI_MODEL);
}

// Monta a URL de chat-completions tolerando base com ou sem /v1 no final.
function openaiChatUrl(base) {
  const b = (base || '').replace(/\/+$/, '');
  return /\/v1$/.test(b) ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

// Monta a URL de listagem de modelos (health-check padrão OpenAI-compat: Groq, OpenRouter, Ollama).
function openaiModelsUrl(base) {
  const b = (base || '').replace(/\/+$/, '');
  return /\/v1$/.test(b) ? `${b}/models` : `${b}/v1/models`;
}

// Modelos fallback (Groq remove modelos com frequência — cadeia de segurança).
const AI_FALLBACK_MODELS = [AI_MODEL, 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini'];

// Chamada unificada ao LLM — devolve só o TEXTO da resposta.
// Ramo 'openai' usa fetch com fallback automático de modelo se o primário falhar.
async function callLLM({ system, user, maxTokens }) {
  if (AI_FORMAT === 'openai') {
    const models = [...new Set(AI_FALLBACK_MODELS)];
    let lastErr;
    for (const model of models) {
      try {
        const resp = await fetch(openaiChatUrl(ODY_BASE), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(ODY_KEY ? { Authorization: `Bearer ${ODY_KEY}` } : {})
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ]
          })
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          if (resp.status === 404 || (resp.status === 400 && /decommissioned/i.test(t))) {
            console.warn(`[jarvis] modelo ${model} indisponível (${resp.status}), tentando próximo…`);
            lastErr = new Error(`LLM ${resp.status}: ${t.slice(0, 200)}`);
            continue;
          }
          throw new Error(`LLM ${resp.status}: ${t.slice(0, 200)}`);
        }
        const data = await resp.json();
        if (model !== AI_MODEL) console.log(`[jarvis] LLM fallback: usando ${model} (${AI_MODEL} indisponível)`);
        return data?.choices?.[0]?.message?.content || '';
      } catch (e) {
        if (e.message?.includes('LLM 4')) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('Nenhum modelo LLM disponível');
  }
  const completion = await aiClient.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return completion.content?.[0]?.text || '';
}

// Pronto se: openai com base setada · odysseus(anthropic) configurado · ou há chave Anthropic.
function aiReady() {
  if (AI_FORMAT === 'openai') return !!ODY_BASE;
  return usingOdysseus || !!process.env.ANTHROPIC_API_KEY;
}
const AI_OFFLINE_MSG = 'Backend de IA indisponível: configure o backend de IA (JARVIS_LLM_BASE_URL [+ JARVIS_LLM_FORMAT=openai p/ Ollama/LM Studio]) ou ANTHROPIC_API_KEY no ambiente.';

// ── RATE LIMIT (anti-abuso da API do Claude) ──────────────────────────────────
const jarvisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240, // loop ao vivo precisa de mais folga que o inbound (chamadas curtas)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Limite de chamadas/hora atingido. Aguarde um pouco.' }
});

// ── Normaliza o LOB do dropdown para a chave da estratégia FY27 ───────────────
function normalizeLobKey(lobStr) {
  const s = String(lobStr || '').toLowerCase();
  if (/successfactors|\bhcm\b|sfsf/.test(s)) return 'SuccessFactors';
  if (/s\/?4|s4hana|\berp\b/.test(s)) return 'S/4HANA';
  if (/servicenow/.test(s)) return 'ServiceNow';
  if (/signavio|process|\bbtm\b|leanix/.test(s)) return 'Process Excellence';
  if (/workforce|\bwfs\b/.test(s)) return 'WorkForce Software (WFS)';
  if (/qualtrics/.test(s)) return 'Qualtrics';
  return null;
}
// Normaliza a persona do dropdown para a chave de personas_detalhe.
function normalizePersonaKey(personaStr) {
  const s = String(personaStr || '').toLowerCase();
  if (/cfo/.test(s)) return 'CFO';
  if (/chro|\bcoo\b|rh/.test(s)) return 'CHRO';
  if (/cio|cto|arquit/.test(s)) return 'CIO';
  if (/gerente.*ti|\bti\b/.test(s)) return 'Gerente de TI';
  return null;
}

// Seleciona só as fatias da estratégia FY27 relevantes a ESTA call (mantém token baixo).
function selectFY27(ctx = {}) {
  const p = PLAYBOOK || {};
  const lobKey = normalizeLobKey(ctx.lob);
  const persKey = normalizePersonaKey(ctx.persona);
  const out = {};
  if (lobKey) {
    if (p.icp_por_lob && p.icp_por_lob[lobKey]) out.icp = { [lobKey]: p.icp_por_lob[lobKey] };
    if (p.diferenciacao_competitiva && p.diferenciacao_competitiva[lobKey]) out.diferenciacao_competitiva = { [lobKey]: p.diferenciacao_competitiva[lobKey], _uso_interno: p.diferenciacao_competitiva._uso_interno };
    if (p.jornadas && p.jornadas[lobKey]) out.jornada = { [lobKey]: p.jornadas[lobKey] };
    if (p.cases_reais) { const cs = (p.cases_reais.lista || []).filter(c => c.lob === lobKey); if (cs.length) out.cases = { _uso: p.cases_reais._uso, lista: cs }; }
  }
  if (persKey && p.personas_detalhe && p.personas_detalhe[persKey]) out.persona_detalhe = { [persKey]: p.personas_detalhe[persKey] };
  if (ctx.industria && Array.isArray(p.matriz_industria)) { const ind = p.matriz_industria.find(i => i.industria === ctx.industria); if (ind) out.industria = ind; }
  return out;
}

// Seleciona a fatia da KB curada (produtos SAP + battle cards) relevante ao LOB da call.
function selectKb(ctx = {}) {
  const lobKey = normalizeLobKey(ctx.lob);
  const out = {};
  const prods = (KB_PRODUTOS.produtos || []).filter(p => !lobKey || normalizeLobKey(p.lob) === lobKey);
  if (prods.length) out.produtos_sap = prods.slice(0, 6);
  const bcs = (KB_BATTLE.battle_cards || []).filter(b => !lobKey || normalizeLobKey(b.lob) === lobKey);
  if (bcs.length) out.battle_cards = bcs.slice(0, 6);
  return out;
}

// MEMÓRIA VIVA: recupera as dores/objeções/gatilhos REAIS já ouvidos em campo (calls salvas),
// priorizando o LOB da call. Alimenta o JARVIS com o que os SDRs realmente escutaram.
function recallDores(ctx = {}, k = 8) {
  try {
    const lobKey = normalizeLobKey(ctx.lob);
    const sql = `SELECT texto, tipo, COUNT(*) AS freq
                 FROM jarvis_aprendizados
                 WHERE tipo IN ('dor','objecao','gatilho') ${lobKey ? 'AND lob = ?' : ''}
                 GROUP BY lower(texto)
                 ORDER BY freq DESC, MAX(criado_em) DESC
                 LIMIT ?`;
    const stmt = db.prepare(sql);
    return lobKey ? stmt.all(lobKey, k) : stmt.all(k);
  } catch (e) { return []; }
}

// Cases REAIS (anonimizados) — filtra por LOB quando houver; senão devolve todos.
// No PRÉ-CALL o LOB ainda não foi detectado, então sem isto o modelo ficava sem
// nenhuma prova social real e INVENTAVA (regressão da v0.9, ao tirar os dropdowns).
function casesReais(lobStr) {
  const cr = (PLAYBOOK.cases_reais || {});
  const lista = cr.lista || [];
  const lobKey = normalizeLobKey(lobStr);
  const sel = lobKey ? lista.filter(c => c.lob === lobKey) : lista;
  return (sel.length ? sel : lista).map(c => ({ anonimo: c.anonimo, lob: c.lob, resultado: c.resultado }));
}

// Guarda anti-invenção: a base de cases NÃO tem métrica (nenhum "%", "R$", "3x").
// Se o modelo devolver número que não existe na fonte, é alucinação — corta.
function temMetricaInventada(texto, fonteTxt) {
  const s = String(texto || '');
  const nums = s.match(/\d+([.,]\d+)?\s*(%|x\b)|R\$\s*[\d.,]+|\b\d+\s*(dias|semanas|meses|horas)\b/gi) || [];
  if (!nums.length) return false;
  const fonte = String(fonteTxt || '');
  return nums.some(n => !fonte.includes(n.trim()));
}

// ── SYSTEM PROMPT (persona sênior + playbook real + estratégia FY27 + humanização) ──
function buildSystemPrompt(ctx = {}) {
  const p = PLAYBOOK || {};
  const persona = p.persona_jarvis || {};
  const fy27 = selectFY27(ctx);
  const linhas = [
    `Você é o JARVIS — copiloto de vendas que atua como ${persona.papel || 'SDR/BDR sênior com 20 anos de prospecção B2B SAP/ServiceNow'}.`,
    `Idioma: ${persona.idioma || 'Português do Brasil, consultivo e executivo'}.`,
    `Filosofia: ${persona.filosofia || 'Vender a dor e o resultado de negócio, nunca a tecnologia. Ouvir mais do que falar.'}`,
    ``,
    `Seu papel é ASSISTIR o SDR humano em TEMPO REAL durante uma reunião/ligação. Você NÃO fala com o cliente — você sussurra recomendações para o vendedor. Seja CURTO, acionável e específico do contexto.`,
    ``,
    `=== BASE DE CONHECIMENTO REAL — EPI-USE BRASIL (use SEMPRE, não invente fatos) ===`,
    JSON.stringify({
      empresa: p.empresa,
      pitches_por_persona: p.pitches_por_persona,
      gatilhos_urgencia_2026: p.gatilhos_urgencia_2026,
      lobs: p.lobs,
      matriz_industria: p.matriz_industria,
      frameworks: p.frameworks,
      objecoes: p.objecoes,
      regras_inegociaveis: p.regras_inegociaveis
    }, null, 0)
  ];
  if (Object.keys(fy27).length) {
    linhas.push(``, `=== CONTEXTO ESPECÍFICO DESTA CALL (estratégia FY27 — ancore as sugestões NISTO) ===`, JSON.stringify(fy27, null, 0));
  }
  const kb = selectKb(ctx);
  if (Object.keys(kb).length) {
    linhas.push(``, `=== CONHECIMENTO DE PRODUTO + BATTLE CARDS (uso INTERNO de coaching — battle card NUNCA nomeia concorrente na fala) ===`, JSON.stringify(kb, null, 0));
  }
  const dores = recallDores(ctx, 8);
  if (dores.length) {
    linhas.push(``, `=== MEMÓRIA VIVA — DORES JÁ OUVIDAS EM CAMPO (de calls reais; use pra ANTECIPAR a dor, não pra afirmar) ===`, JSON.stringify(dores.map(d => ({ dor: d.texto, tipo: d.tipo, vezes: d.freq })), null, 0));
  }
  linhas.push(
    ``,
    `=== HUMANIZAÇÃO DA "talk_track" (o que o SDR vai FALAR em voz alta) — OBRIGATÓRIO ===`,
    `A talk_track precisa soar como gente de verdade, não como IA. Aplique:`,
    `- 1ª pessoa, contrações naturais (tá, pra, dá pra, cê), frases curtas e de tamanho VARIADO.`,
    `- PROIBIDO: travessão (— ou –); palavras-robô (crucial, fundamental, robusto, sinergia, "no fim do dia", "nesse sentido", "potencializar", "alavancar"); "Entendo que X é um desafio para muitas empresas"; "Nossa especialização em..."; regra de três decorativa; conclusão motivacional genérica; emoji; jargão técnico à toa.`,
    `- Prefira PERGUNTAR a afirmar. Vá direto ao ponto, sem "deixa eu te explicar" nem floreio.`,
    `- Específico > genérico: use o número/dor concreta que apareceu na conversa.`,
    `Exemplos:`,
    `  ❌ "Entendo que a Reforma Tributária é um desafio. Nossa especialização em SAP pode mitigar riscos fiscais."`,
    `  ✅ "Deixa eu te perguntar: com a CBS/IBS entrando, quanto do fiscal de vocês ainda roda no braço hoje?"`,
    `  ❌ "Podemos agregar valor com uma solução robusta e inovadora."`,
    `  ✅ "Faz sentido a gente sentar 30 min e eu te mostrar onde dá pra cortar esse retrabalho?"`,
    ``,
    `=== REGRAS ===`,
    `- 🚫 NUNCA INVENTE DADO. Proibido citar número, percentual, prazo, economia, ROI ou nome de cliente que`,
    `  NÃO esteja escrito na base acima. Sem "reduzimos 40%", "3x mais rápido", "em 2 semanas" — nada disso`,
    `  existe na nossa base. Se não tiver o dado, fale do TIPO de resultado sem número, ou não fale.`,
    `- Prova social: use SOMENTE os cases da base (já anonimizados). Se não houver case aderente, devolva vazio`,
    `  em vez de inventar um.`,
    `- PT-BR sempre. Vender a DOR, nunca a tecnologia pela tecnologia.`,
    `- NUNCA citar concorrentes nominalmente na fala — use o argumento sem nome (veja diferenciacao_competitiva).`,
    `- NUNCA citar clientes nominalmente sem aprovação — anonimize os cases (ex: "um grande grupo do agro").`,
    `- Sem promessas absurdas (ROI garantido, prazos imbatíveis).`,
    `- Sempre empurrar para um próximo passo concreto com data.`
  );
  return linhas.join('\n');
}

// ── RAG-lite: recupera cases/conteúdos REAIS do catálogo de artigos (cloud-ready) ──
const ARTIGOS_PATH = path.join(__dirname, '../public/api/artigos.json');
let _artigosCache = null;
function loadArtigos() {
  if (_artigosCache) return _artigosCache;
  try { _artigosCache = JSON.parse(fs.readFileSync(ARTIGOS_PATH, 'utf8')).artigos || []; }
  catch (e) { console.warn('[jarvis] artigos.json não carregado:', e.message); _artigosCache = []; }
  return _artigosCache;
}
// Mapa LOB do JARVIS → linha_de_negocio do catálogo de artigos.
const LOB_TO_LINHA = {
  'SuccessFactors': 'Serviços HCM & RH',
  'WorkForce Software (WFS)': 'Serviços HCM & RH',
  'Qualtrics': 'Serviços HCM & RH',
  'S/4HANA': 'Serviços SAP ERP (S/4HANA)',
  'ServiceNow': 'ServiceNow',
  'Process Excellence': 'Excelência em Processos'
};
const _STOP = new Set(['para','como','isso','você','voce','sobre','quero','tem','uma','dos','das','que','com','por','não','nao','meu','minha','nossa','nosso','sim','mais','muito','está','esta','estamos','reunião','reuniao']);
function retrieveArtigos({ lob, query, k = 6 } = {}) {
  const arts = loadArtigos();
  if (!arts.length) return [];
  const lobKey = normalizeLobKey(lob);
  const linha = LOB_TO_LINHA[lobKey];
  const terms = String(query || '').toLowerCase().split(/[^a-zà-ú0-9]+/).filter(w => w.length >= 4 && !_STOP.has(w));
  const scored = arts.map(a => {
    const titulo = String(a.titulo || '').toLowerCase();
    let score = 0;
    if (linha && a.linha_de_negocio === linha) score += 3;
    for (const t of terms) if (titulo.includes(t)) score += 2;
    // dá um empurrãozinho pra fundo/meio de funil (mais úteis pra venda)
    if (/Fundo|Meio/.test(a.etapa_funil || '')) score += 0.5;
    return { a, score };
  }).filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map(x => ({ titulo: x.a.titulo, url: x.a.url, etapa: x.a.etapa_funil, linha: x.a.linha_de_negocio }));
  return scored;
}

// ── Helper: parse JSON tolerante (remove cercas markdown) ──────────────────────
function safeParseJson(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  try { return JSON.parse(t); } catch { return null; }
}

// ── ROTA DE PÁGINA (rota limpa /jarvis) ───────────────────────────────────────
router.get('/jarvis', requireAuth, (req, res) => {
  res.sendFile(JARVIS_HTML);
});

// ── API: playbook (pro front popular dropdowns de LOB/persona/indústria) ──────
router.get('/api/jarvis/playbook', (req, res) => {
  res.json({
    versao: PLAYBOOK?._meta?.versao || null,
    backend: AI_FORMAT === 'openai' ? 'openai-compat' : (usingOdysseus ? 'odysseus' : 'anthropic'),
    formato: AI_FORMAT,
    modelo: AI_MODEL,
    ia_pronta: aiReady(),
    lobs: (PLAYBOOK.lobs || []).map(l => l.nome),
    personas: Object.keys(PLAYBOOK.pitches_por_persona || {}),
    industrias: (PLAYBOOK.matriz_industria || []).map(i => i.industria),
    gatilhos: PLAYBOOK.gatilhos_urgencia_2026 || [],
    kb: {
      produtos_sap: (KB_PRODUTOS.produtos || []).length,
      battle_cards: (KB_BATTLE.battle_cards || []).length,
      estado_produtos: KB_PRODUTOS?._meta?.estado || null,
      estado_battle: KB_BATTLE?._meta?.estado || null
    }
  });
});

// ── API: ping — testa conectividade do Railway com o backend de IA ───────────
// Útil p/ diagnosticar se o Quick Tunnel ainda está ativo.
router.get('/api/jarvis/ping', async (req, res) => {
  const base = { model: AI_MODEL, formato: AI_FORMAT, baseUrl: ODY_BASE || null };
  if (!aiReady()) return res.json({ ...base, ok: false, message: 'Backend não configurado (sem URL/chave).' });
  if (AI_FORMAT === 'openai') {
    try {
      // health-check padrão OpenAI-compat: GET /v1/models com a chave (Groq, OpenRouter, Ollama).
      const resp = await fetch(openaiModelsUrl(ODY_BASE), {
        headers: ODY_KEY ? { Authorization: `Bearer ${ODY_KEY}` } : {},
        signal: AbortSignal.timeout(6000)
      });
      if (resp.ok) return res.json({ ...base, ok: true, message: `provedor respondeu OK (HTTP ${resp.status})` });
      const txt = await resp.text().catch(() => '');
      const dica = resp.status === 401 ? ' (chave inválida? verifique JARVIS_LLM_API_KEY)' : '';
      return res.json({ ...base, ok: false, message: `HTTP ${resp.status}${dica} ${txt.slice(0, 80)}`.trim() });
    } catch (e) {
      return res.json({ ...base, ok: false, message: e.message });
    }
  }
  return res.json({ ...base, ok: true, message: 'Anthropic client configurado.' });
});

// ── Diagnóstico temporário do pipeline de IA ────────────────────────────────
router.get('/api/jarvis/diag-llm', async (req, res) => {
  const diag = { aiReady: aiReady(), format: AI_FORMAT, model: AI_MODEL, base: ODY_BASE ? ODY_BASE.slice(0, 40) : null };
  if (!aiReady()) return res.json({ ...diag, error: 'aiReady=false' });
  try {
    const modelsResp = await fetch(openaiModelsUrl(ODY_BASE), {
      headers: ODY_KEY ? { Authorization: `Bearer ${ODY_KEY}` } : {},
      signal: AbortSignal.timeout(6000)
    });
    const modelsText = await modelsResp.text();
    if (modelsResp.ok) {
      try {
        const md = JSON.parse(modelsText);
        diag.available_models = (md.data || []).map(m => m.id).sort();
      } catch (_) { diag.models_raw = modelsText.slice(0, 300); }
    } else {
      diag.models_error = `HTTP ${modelsResp.status}: ${modelsText.slice(0, 200)}`;
    }
  } catch (e) { diag.models_exception = e.message; }
  try {
    const raw = await callLLM({ system: 'Responde só JSON.', user: 'Responda: {"ok":true,"msg":"teste"}', maxTokens: 50 });
    diag.rawResponse = String(raw).slice(0, 300);
    const parsed = safeParseJson(raw);
    diag.parsed = parsed;
    diag.success = !!parsed;
  } catch (e) {
    diag.error = e.message;
    diag.stack = e.stack ? e.stack.split('\n').slice(0, 3) : [];
  }
  res.json(diag);
});

// ── API: coach ao vivo ────────────────────────────────────────────────────────
// Recebe contexto da call + transcrição recente + última fala do prospect.
// Devolve JSON com próxima pergunta, talk track, contorno de objeção, sinais e temperatura.
router.post('/api/jarvis/coach', jarvisLimiter, async (req, res) => {
  if (!aiReady()) {
    return res.status(503).json({ success: false, error: AI_OFFLINE_MSG });
  }
  try {
    const { context = {}, transcript = [], lastUtterance = '' } = req.body || {};
    const ctxLines = [
      `Prospect: ${context.prospect || '—'}`,
      `Empresa: ${context.empresa || '—'}`,
      `Indústria: ${context.industria || '—'}`,
      `LOB foco: ${context.lob || '—'}`,
      `Persona/cargo: ${context.persona || '—'}`,
      `Estágio: ${context.estagio || '—'}`
    ].join('\n');

    // só as últimas ~12 falas pra manter latência baixa
    const recent = Array.isArray(transcript) ? transcript.slice(-12) : [];
    const transcriptText = recent.map(t => {
      const who = t.speaker === 'prospect' ? 'PROSPECT' : 'SDR';
      return `${who}: ${t.text}`;
    }).join('\n') || '(sem transcrição ainda)';

    // RAG-lite: cases/conteúdos REAIS do catálogo (cloud-ready, sem Ollama)
    const queryTexto = [lastUtterance, recent.map(t => t.text).join(' ')].filter(Boolean).join(' ');
    const artigos = retrieveArtigos({ lob: context.lob, query: queryTexto, k: 6 });
    const artigosBloco = artigos.length
      ? [`=== CONTEÚDOS REAIS EPI-USE DISPONÍVEIS (use SÓ estes em conteudos_sugeridos; NUNCA invente URL) ===`,
         JSON.stringify(artigos.map(a => ({ titulo: a.titulo, url: a.url })), null, 0)].join('\n')
      : '';

    const userPrompt = [
      `CONTEXTO DA CALL:`,
      ctxLines,
      ``,
      `TRANSCRIÇÃO RECENTE:`,
      transcriptText,
      ``,
      lastUtterance ? `ÚLTIMA FALA A REAGIR (do prospect): "${lastUtterance}"` : '',
      artigosBloco ? `\n${artigosBloco}` : '',
      ``,
      `Com base nisso, oriente o SDR AGORA. Responda APENAS com um JSON válido neste formato:`,
      `{`,
      `  "proxima_pergunta": "1 pergunta de descoberta poderosa pra fazer agora (SPIN/MEDDIC)",`,
      `  "talk_track": "1-2 frases que o SDR pode falar agora — HUMANIZADAS (ver regras de humanização)",`,
      `  "objecao": "se houve objeção, o contorno em 1-2 frases; senão string vazia",`,
      `  "sinais": ["sinal de compra ou risco observado", "..."],`,
      `  "lob_sugerida": "LOB EPI-USE mais aderente ao que foi dito",`,
      `  "lob_detectada": "LOB EPI-USE que o cliente está falando agora (taxonomia real) — '' se não der pra inferir",`,
      `  "persona_detectada": "cargo/persona do prospect inferido da conversa (ex: CFO, CIO, CHRO, Gerente de TI) — '' se não der",`,
      `  "industria_detectada": "indústria/setor do cliente inferido da conversa — '' se não der",`,
      `  "estagio_detectado": "Cold call | Discovery | Demo | Negociação | Follow-up — '' se não der",`,
      `  "conteudos_sugeridos": [{"titulo": "título exato da lista", "url": "url exata da lista", "porque": "por que enviar agora"}],`,
      `  "temperatura": 0-100 (quão quente está a oportunidade, inteiro),`,
      `  "proximo_passo": "o próximo passo concreto a propor (com ideia de prazo)"`,
      `}`,
      `Em conteudos_sugeridos use NO MÁXIMO 3 itens, e SOMENTE da lista de conteúdos reais acima (se não houver lista, devolva []).`
    ].filter(Boolean).join('\n');

    const raw = await callLLM({ system: buildSystemPrompt(context), user: userPrompt, maxTokens: 800 });
    const parsed = safeParseJson(raw);
    if (!parsed) {
      return res.json({ success: true, gerado_por_ia: true, fallback: true, talk_track: raw.slice(0, 400), proxima_pergunta: '', objecao: '', sinais: [], conteudos_sugeridos: [], temperatura: null, proximo_passo: '' });
    }
    // saneamento: conteudos_sugeridos só com URLs que existem na lista real (anti-alucinação)
    if (Array.isArray(parsed.conteudos_sugeridos)) {
      const urlsOk = new Set(artigos.map(a => a.url));
      parsed.conteudos_sugeridos = parsed.conteudos_sugeridos.filter(c => c && urlsOk.has(c.url)).slice(0, 3);
    }
    res.json({ success: true, gerado_por_ia: true, ...parsed });
  } catch (e) {
    console.error('[jarvis/coach] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: pré-call brief ───────────────────────────────────────────────────────
// Gera um ângulo de abertura por persona/LOB/indústria antes da call começar.
router.post('/api/jarvis/brief', jarvisLimiter, async (req, res) => {
  if (!aiReady()) {
    return res.status(503).json({ success: false, error: AI_OFFLINE_MSG });
  }
  try {
    const { context = {} } = req.body || {};
    // RAG-lite: conteúdos reais por LOB/indústria pra abrir a conversa
    const artigos = retrieveArtigos({ lob: context.lob, query: [context.industria, context.lob].filter(Boolean).join(' '), k: 5 });
    const artigosBloco = artigos.length
      ? [`=== CONTEÚDOS REAIS EPI-USE DISPONÍVEIS (use SÓ estes; NUNCA invente URL) ===`,
         JSON.stringify(artigos.map(a => ({ titulo: a.titulo, url: a.url })), null, 0)].join('\n')
      : '';
    // Cases REAIS sempre injetados (no pré-call o LOB ainda não foi detectado).
    const cases = casesReais(context.lob);
    const casesTxt = JSON.stringify(cases, null, 0);
    const semContexto = !context.lob && !context.persona && !context.industria;

    const userPrompt = [
      `Monte um PRÉ-CALL BRIEF curto pra eu (SDR) abrir esta conversa com confiança.`,
      `Prospect: ${context.prospect || '—'} | Empresa: ${context.empresa || '—'} | Indústria: ${context.industria || '—'} | LOB: ${context.lob || '—'} | Persona: ${context.persona || '—'} | Estágio: ${context.estagio || '—'}`,
      semContexto
        ? `⚠️ ATENÇÃO: LOB, persona e indústria AINDA NÃO são conhecidos (o brief roda antes da conversa). NÃO finja que sabe. Trate as dores como HIPÓTESES a confirmar e escreva perguntas que DESCUBRAM o cenário. A abertura não pode afirmar dor específica como se fosse fato.`
        : '',
      ``,
      `=== CASES REAIS EPI-USE (única prova social permitida — já anonimizados) ===`,
      casesTxt,
      `Repare: estes cases NÃO têm métrica. Então é PROIBIDO citar percentual, prazo ou economia.`,
      artigosBloco ? `\n${artigosBloco}` : '',
      ``,
      `Responda APENAS com JSON válido:`,
      `{`,
      `  "abertura": "frase de abertura consultiva, HUMANIZADA (ver regras). Sem afirmar dor como fato se o cenário é desconhecido.",`,
      `  "dores_provaveis": ["hipótese de dor 1 (a confirmar)", "2", "3"],`,
      `  "gatilho_2026": "o gatilho de urgência mais relevante da base (texto da base, sem inventar)",`,
      `  "perguntas_chave": ["pergunta de descoberta 1", "2", "3"],`,
      `  "prova_social": "1 case da lista acima, com a descrição ANÔNIMA e o resultado como está escrito. Sem número inventado. Se nenhum for aderente, devolva string vazia.",`,
      `  "conteudos_sugeridos": [{"titulo": "título exato da lista", "url": "url exata da lista", "porque": "quando usar"}]`,
      `}`,
      `Em conteudos_sugeridos use NO MÁXIMO 3 itens, SOMENTE da lista acima (se não houver, devolva []).`
    ].filter(Boolean).join('\n');

    const raw = await callLLM({ system: buildSystemPrompt(context), user: userPrompt, maxTokens: 900 });
    const parsed = safeParseJson(raw);
    if (!parsed) return res.status(502).json({ success: false, error: 'Resposta da IA não pôde ser interpretada.' });
    if (Array.isArray(parsed.conteudos_sugeridos)) {
      const urlsOk = new Set(artigos.map(a => a.url));
      parsed.conteudos_sugeridos = parsed.conteudos_sugeridos.filter(c => c && urlsOk.has(c.url)).slice(0, 3);
    }
    // ── SANEAMENTO (Regra 7): corta prova social com métrica que não existe na base ──
    const avisos = [];
    if (parsed.prova_social && temMetricaInventada(parsed.prova_social, casesTxt)) {
      console.warn('[jarvis/brief] prova_social com número inventado, descartada:', parsed.prova_social);
      parsed.prova_social = '';
      avisos.push('Descartei uma prova social que citava número inexistente na nossa base.');
    }
    // gatilho fora da base também é invenção
    const gatilhosTxt = JSON.stringify(PLAYBOOK.gatilhos_urgencia_2026 || []);
    if (parsed.gatilho_2026 && temMetricaInventada(parsed.gatilho_2026, gatilhosTxt)) {
      parsed.gatilho_2026 = String(parsed.gatilho_2026).replace(/\d+([.,]\d+)?\s*%/g, '').trim();
    }
    res.json({
      success: true, gerado_por_ia: true, ...parsed,
      _contexto_conhecido: !semContexto,
      _cases_disponiveis: cases.length,
      _avisos: avisos,
      etiqueta: semContexto
        ? '🤖 Gerado por IA · dores são HIPÓTESES (LOB/persona ainda não detectados) — confirme na call'
        : '🤖 Gerado por IA — use seu julgamento'
    });
  } catch (e) {
    console.error('[jarvis/brief] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: pesquisar produto na web (OpenRouter :online · foco sap.com/servicenow.com) ──
// Pré-call only (não no loop ao vivo). Reusa OPENROUTER_API_KEY já existente no ambiente.
const OR_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OR_WEB_MODEL = (process.env.JARVIS_WEB_MODEL || 'perplexity/sonar').trim();
router.post('/api/jarvis/pesquisar', jarvisLimiter, async (req, res) => {
  if (!OR_KEY) {
    return res.status(503).json({ success: false, error: 'Pesquisa web indisponível: configure OPENROUTER_API_KEY no ambiente.' });
  }
  try {
    const { produto = '', duvida = '', lob = '' } = req.body || {};
    const termo = [produto, lob].filter(Boolean).join(' ').trim();
    if (!termo && !String(duvida).trim()) {
      return res.status(400).json({ success: false, error: 'Informe um produto ou uma dúvida técnica.' });
    }
    const prompt = [
      `Você é um especialista técnico em soluções SAP/ServiceNow apoiando um SDR da EPI-USE Brasil.`,
      `Pesquise informação TÉCNICA e ATUAL sobre: ${termo || duvida}.`,
      duvida ? `Dúvida específica a responder: "${duvida}".` : '',
      `Priorize fontes oficiais (site:sap.com, site:help.sap.com, site:servicenow.com). Responda em PT-BR.`,
      `🚫 REGRAS DE PRECISÃO (o SDR vai repetir isso pro cliente):`,
      `- Só afirme o que você REALMENTE encontrou na busca. Se não achou, diga que não achou.`,
      `- Em "fontes", coloque APENAS URLs que vieram do resultado da busca. NUNCA construa/adivinhe URL.`,
      `- Nada de número, preço, SLA ou data sem fonte. Prefira omitir a arriscar.`,
      `- Se a informação for incerta ou variar por contrato/edição, diga isso explicitamente.`,
      `Responda APENAS com JSON válido:`,
      `{`,
      `  "resumo": ["bullet técnico 1", "bullet 2", "bullet 3"],`,
      `  "como_explicar": "1-2 frases pra o SDR explicar ao prospect em linguagem de NEGÓCIO (humanizada, sem jargão à toa)",`,
      `  "fontes": [{"titulo": "título da página", "url": "url"}]`,
      `}`
    ].filter(Boolean).join('\n');

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://office.epiuse.com.br',
        'X-Title': 'EPI-USE Office - JARVIS'
      },
      body: JSON.stringify({ model: OR_WEB_MODEL, temperature: 0.2, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return res.status(502).json({ success: false, error: `OpenRouter ${resp.status}: ${t.slice(0, 200)}` });
    }
    const data = await resp.json();
    const rawTxt = data?.choices?.[0]?.message?.content || '';
    const parsed = safeParseJson(rawTxt);
    if (!parsed) {
      return res.json({ success: true, gerado_por_ia: true, etiqueta: '🌐 Pesquisa web — verificar', resumo: [rawTxt.slice(0, 600)], fontes: [] });
    }
    // ── SANEAMENTO das fontes (Regra 7): antes NADA era validado aqui ──
    // O modelo às vezes "constrói" URL plausível (sap.com/products/xyz) que não existe.
    // Separa em oficiais (confiáveis) vs demais (marcadas como não verificadas).
    const OFICIAIS = /(^|\.)(sap\.com|help\.sap\.com|servicenow\.com|docs\.servicenow\.com|successfactors\.com|qualtrics\.com)$/i;
    let oficiais = 0, outras = 0;
    if (Array.isArray(parsed.fontes)) {
      parsed.fontes = parsed.fontes.filter(f => f && f.url).map(f => {
        let host = '';
        try { host = new URL(f.url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
        const ok = OFICIAIS.test(host);
        ok ? oficiais++ : outras++;
        return { titulo: f.titulo || host, url: f.url, host, oficial: ok };
      }).filter(Boolean).slice(0, 6);
    } else parsed.fontes = [];

    const semFonte = parsed.fontes.length === 0;
    res.json({
      success: true, gerado_por_ia: true, ...parsed,
      _fontes_oficiais: oficiais, _fontes_outras: outras,
      etiqueta: semFonte
        ? '⚠️ Sem fonte verificável — NÃO repita isso pro cliente sem conferir'
        : (oficiais ? '🌐 Pesquisa web · ' + oficiais + ' fonte(s) oficial(is) — confira antes de afirmar'
                    : '⚠️ Nenhuma fonte oficial (SAP/ServiceNow) — trate como indício, não como fato')
    });
  } catch (e) {
    console.error('[jarvis/pesquisar] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: encerrar & salvar a call (memória viva) ──────────────────────────────
// Salva a call no SQLite e EXTRAI (via IA) as dores/objeções/gatilhos reais ouvidos,
// gravando em jarvis_aprendizados. É assim que o JARVIS "aprende a dor" entre calls.
router.post('/api/jarvis/encerrar', requireAuth, jarvisLimiter, async (req, res) => {
  try {
    const { context = {}, transcript = [], roleMap = {}, temperatura = null, duracao_seg = null, call_id = null } = req.body || {};
    const turns = Array.isArray(transcript) ? transcript : [];
    if (!turns.length) {
      return res.status(400).json({ success: false, error: 'Sem transcrição para salvar.' });
    }
    const lobKey = normalizeLobKey(context.lob) || (context.lob || null);
    const temp = (temperatura != null && !isNaN(temperatura)) ? Math.round(temperatura) : null;
    const dur  = (duracao_seg != null && !isNaN(duracao_seg)) ? Math.round(duracao_seg) : null;
    const quem = (req.session && req.session.user && (req.session.user.name || req.session.user.email)) || 'sdr';

    // 1) salva (auto-save em background): UPDATE se já há call_id desta sessão, senão INSERT
    //    (evita duplicar a call a cada auto-save; re-extrai os aprendizados do zero no update)
    let callId = null;
    const existing = call_id ? db.prepare('SELECT id FROM jarvis_calls WHERE id = ?').get(call_id) : null;
    if (existing) {
      db.prepare(`UPDATE jarvis_calls SET prospect=?, empresa=?, industria=?, lob=?, persona=?, estagio=?,
                    transcript_json=?, role_map_json=?, temperatura=?, duracao_seg=? WHERE id=?`).run(
        context.prospect || null, context.empresa || null, context.industria || null,
        lobKey, context.persona || null, context.estagio || null,
        JSON.stringify(turns), JSON.stringify(roleMap || {}), temp, dur, existing.id
      );
      callId = existing.id;
      db.prepare('DELETE FROM jarvis_aprendizados WHERE call_id = ?').run(callId);
    } else {
      const callRow = db.prepare(`INSERT INTO jarvis_calls
        (prospect, empresa, industria, lob, persona, estagio, transcript_json, role_map_json, temperatura, duracao_seg, criado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        context.prospect || null, context.empresa || null, context.industria || null,
        lobKey, context.persona || null, context.estagio || null,
        JSON.stringify(turns), JSON.stringify(roleMap || {}), temp, dur, quem
      );
      callId = callRow.lastInsertRowid;
    }

    // 2) extrai aprendizados REAIS (só o que o PROSPECT/cliente disse) — se a IA estiver pronta
    let resumo = null, aprendizados = { dor: [], objecao: [], gatilho: [], pergunta_vencedora: [], sinal: [] };
    if (aiReady()) {
      const fala = turns.map(t => {
        const who = (t.speaker === 'prospect' || t.role === 'prospect') ? 'CLIENTE'
                  : (t.speaker === 'sdr' || t.role === 'sdr') ? 'SDR' : (t.voz || 'VOZ');
        return `${who}: ${t.text}`;
      }).join('\n').slice(0, 8000);
      const ext = [
        `Você é um analista de pré-vendas. Abaixo está a transcrição de uma call de prospecção B2B (SAP/ServiceNow).`,
        `Extraia SOMENTE o que apareceu DE FATO na conversa (não invente). Foque no que o CLIENTE disse.`,
        ``,
        `CONTEXTO: empresa=${context.empresa || '—'} · indústria=${context.industria || '—'} · LOB=${context.lob || '—'} · persona=${context.persona || '—'}`,
        ``,
        `TRANSCRIÇÃO:`,
        fala,
        ``,
        `Responda APENAS com JSON válido:`,
        `{`,
        `  "resumo": "2-3 frases do que rolou e onde parou",`,
        `  "dores": ["dor de negócio concreta dita pelo cliente", "..."],`,
        `  "objecoes": ["objeção levantada pelo cliente", "..."],`,
        `  "gatilhos": ["gatilho de urgência/contexto real (ex: prazo, projeto, mudança regulatória)", "..."],`,
        `  "perguntas_vencedoras": ["pergunta do SDR que abriu a conversa (se houve)", "..."],`,
        `  "sinais": ["sinal de compra ou de risco observado", "..."]`,
        `}`,
        `Listas vazias se não houver. Sem texto fora do JSON.`
      ].join('\n');
      try {
        const raw = await callLLM({ system: 'Extrator factual de calls de venda. Responde só JSON. PT-BR.', user: ext, maxTokens: 700 });
        const parsed = safeParseJson(raw);
        if (parsed) {
          resumo = parsed.resumo || null;
          const mapTipo = { dores: 'dor', objecoes: 'objecao', gatilhos: 'gatilho', perguntas_vencedoras: 'pergunta_vencedora', sinais: 'sinal' };
          const ins = db.prepare(`INSERT INTO jarvis_aprendizados (call_id, tipo, texto, lob, industria, persona, fonte)
                                  VALUES (?,?,?,?,?,?, 'call')`);
          const tx = db.transaction(() => {
            for (const [campo, tipo] of Object.entries(mapTipo)) {
              const arr = Array.isArray(parsed[campo]) ? parsed[campo] : [];
              for (const txt of arr) {
                const clean = String(txt || '').trim();
                if (!clean) continue;
                ins.run(callId, tipo, clean.slice(0, 400), lobKey, context.industria || null, context.persona || null);
                if (aprendizados[tipo]) aprendizados[tipo].push(clean);
              }
            }
          });
          tx();
          if (resumo) db.prepare('UPDATE jarvis_calls SET resumo = ? WHERE id = ?').run(resumo, callId);
        }
      } catch (e) {
        console.warn('[jarvis/encerrar] extração falhou (call salva mesmo assim):', e.message);
      }
    }

    const totalApr = Object.values(aprendizados).reduce((a, x) => a + x.length, 0);
    res.json({
      success: true,
      call_id: callId,
      resumo,
      aprendizados,
      total_aprendizados: totalApr,
      ia_disponivel: aiReady(),
      etiqueta: '🧠 Aprendizados extraídos da call real (revise antes de usar como verdade absoluta)'
    });
  } catch (e) {
    console.error('[jarvis/encerrar] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: dores de campo (loop p/ guiar conteúdo) ──────────────────────────────
// Agrega o que os SDRs ouviram em campo, por LOB, pra pautar os próximos conteúdos.
router.get('/api/jarvis/dores-de-campo', requireAuth, (req, res) => {
  try {
    const lobKey = normalizeLobKey(req.query.lob);
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 200);
    const tipoFiltro = req.query.tipo ? String(req.query.tipo) : null;

    const where = ['1=1'];
    const params = [];
    if (lobKey) { where.push('lob = ?'); params.push(lobKey); }
    if (tipoFiltro) { where.push('tipo = ?'); params.push(tipoFiltro); }

    const dores = db.prepare(
      `SELECT texto, tipo, lob, industria, persona, COUNT(*) AS freq, MAX(criado_em) AS ultima
       FROM jarvis_aprendizados
       WHERE ${where.join(' AND ')}
       GROUP BY lower(texto)
       ORDER BY freq DESC, ultima DESC
       LIMIT ?`
    ).all(...params, limit);

    const porLob = db.prepare(
      `SELECT COALESCE(lob,'(sem LOB)') AS lob, tipo, COUNT(*) AS total
       FROM jarvis_aprendizados GROUP BY lob, tipo ORDER BY total DESC`
    ).all();

    const totalCalls = db.prepare('SELECT COUNT(*) AS n FROM jarvis_calls').get().n;
    const totalApr = db.prepare('SELECT COUNT(*) AS n FROM jarvis_aprendizados').get().n;

    res.json({
      success: true,
      etiqueta: '🧠 Dores reais ouvidas em campo (calls do JARVIS) — insumo pra pautar conteúdo',
      total_calls: totalCalls,
      total_aprendizados: totalApr,
      filtro_lob: lobKey || null,
      dores,
      por_lob: porLob
    });
  } catch (e) {
    console.error('[jarvis/dores-de-campo] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: ingest Zoho Call (webhook) ──────────────────────────────────────────
// Recebe webhook do Zoho CRM (módulo Calls) quando nova call é registrada.
// Baixa a gravação do 3CX, transcreve via Groq Whisper, salva no JARVIS e
// extrai aprendizados — mesmo pipeline do /api/jarvis/encerrar.
const GROQ_KEY = () => (process.env.JARVIS_LLM_API_KEY || process.env.GROQ_API_KEY || '').trim();
const ZOHO_WEBHOOK_SECRET = () => (process.env.ZOHO_JARVIS_WEBHOOK_SECRET || '').trim();

router.post('/api/jarvis/ingest-zoho-call', async (req, res) => {
  const tag = '[jarvis/ingest-zoho-call]';
  try {
    // 1) Validação do webhook secret (se configurado)
    const secret = ZOHO_WEBHOOK_SECRET();
    if (secret) {
      const incoming = req.headers['x-jarvis-secret'] || req.query.secret || '';
      if (incoming !== secret) {
        console.warn(tag, 'webhook rejeitado: secret inválido');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    // 2) Extrair dados da call do payload Zoho
    const payload = req.body || {};
    const callData = payload.data ? (Array.isArray(payload.data) ? payload.data[0] : payload.data) : payload;
    const zohoCallId = String(callData.id || callData.Id || callData.call_id || '');
    if (!zohoCallId) {
      return res.status(400).json({ success: false, error: 'Payload sem ID de call.' });
    }

    // Evita duplicata (force=true permite re-processar)
    const forceReprocess = req.query.force === 'true';
    const existing = db.prepare('SELECT id FROM jarvis_calls WHERE zoho_call_id = ?').get(zohoCallId);
    if (existing && !forceReprocess) {
      console.log(tag, `call ${zohoCallId} já ingerida (jarvis_calls.id=${existing.id}), ignorando.`);
      return res.json({ success: true, skipped: true, call_id: existing.id, message: 'Call já processada.' });
    }
    if (existing && forceReprocess) {
      db.prepare('DELETE FROM jarvis_aprendizados WHERE call_id = ?').run(existing.id);
      db.prepare('DELETE FROM jarvis_calls WHERE id = ?').run(existing.id);
      console.log(tag, `force reprocess: deletou call ${existing.id} (zoho ${zohoCallId})`);
    }

    const subject = callData.Subject || callData.subject || '';
    const description = callData.Description || callData.description || '';
    const callType = callData.Call_Type || callData.call_type || '';
    const duration = callData.Call_Duration || callData.call_duration || '';
    const startTime = callData.Call_Start_Time || callData.call_start_time || '';
    const whatId = callData.What_Id || callData.what_id || {};
    const whoId = callData.Who_Id || callData.who_id || {};
    const seModule = callData['$se_module'] || callData.se_module || '';

    // Extrai URL de gravação do Description
    const recMatch = description.match(/https?:\/\/[^\s)]+recording[^\s)]*/i);
    const recordingUrl = recMatch ? recMatch[0] : null;

    // Extrai prospect e empresa do Description (padrão: "para o NNN Nome (Empresa) (MM:SS)")
    const descMatch = description.match(/para o \d+ (.+?) \(([^)]+)\)\s*\(/);
    const prospectFromDesc = descMatch ? descMatch[1].trim() : '';
    const empresaFromDesc = descMatch ? descMatch[2].trim() : '';

    const prospectName = (whoId && typeof whoId === 'object' && whoId.name) || prospectFromDesc || (whatId && typeof whatId === 'object' && whatId.name) || '';
    const empresa = empresaFromDesc || (whatId && typeof whatId === 'object' && whatId.name) || '';

    // Parseia duração "MM:SS" → segundos
    const durParts = String(duration).match(/(\d+):(\d+)/);
    const duracaoSeg = durParts ? parseInt(durParts[1]) * 60 + parseInt(durParts[2]) : null;

    console.log(tag, `nova call: ${zohoCallId} · ${prospectName} · ${empresa} · ${duration} · gravação: ${recordingUrl ? 'sim' : 'não'}`);

    // 3) Se não tem gravação, salva metadados mas sem transcrição
    if (!recordingUrl) {
      const row = db.prepare(`INSERT INTO jarvis_calls
        (prospect, empresa, transcript_json, role_map_json, duracao_seg, criado_por, zoho_call_id, fonte_audio, resumo)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        prospectName, empresa, '[]', '{}', duracaoSeg, 'zoho-webhook', zohoCallId, 'zoho-3cx',
        `Call ${callType} registrada no Zoho (${startTime}) — sem gravação disponível.`
      );
      console.log(tag, `salva sem áudio (id=${row.lastInsertRowid})`);
      return res.json({ success: true, call_id: row.lastInsertRowid, transcribed: false, message: 'Call salva sem gravação.' });
    }

    // 4) Baixar áudio da gravação 3CX
    let audioBuffer;
    try {
      const audioResp = await fetch(recordingUrl, { signal: AbortSignal.timeout(30000) });
      if (!audioResp.ok) throw new Error(`HTTP ${audioResp.status}`);
      audioBuffer = Buffer.from(await audioResp.arrayBuffer());
      console.log(tag, `áudio baixado: ${(audioBuffer.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.error(tag, 'falha ao baixar gravação:', e.message);
      const row = db.prepare(`INSERT INTO jarvis_calls
        (prospect, empresa, transcript_json, role_map_json, duracao_seg, criado_por, zoho_call_id, fonte_audio, resumo)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        prospectName, empresa, '[]', '{}', duracaoSeg, 'zoho-webhook', zohoCallId, 'zoho-3cx',
        `Call registrada mas falha ao baixar gravação: ${e.message}`
      );
      return res.json({ success: true, call_id: row.lastInsertRowid, transcribed: false, error_download: e.message });
    }

    // 5) Transcrever via Groq Whisper API
    const groqKey = GROQ_KEY();
    let transcriptText = '';
    if (!groqKey) {
      console.warn(tag, 'sem GROQ/JARVIS API key — salvando call sem transcrição');
    } else {
      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'call.wav');
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'pt');
        formData.append('response_format', 'text');

        const whisperResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}` },
          body: formData,
          signal: AbortSignal.timeout(120000)
        });
        if (!whisperResp.ok) {
          const errTxt = await whisperResp.text().catch(() => '');
          throw new Error(`Groq Whisper HTTP ${whisperResp.status}: ${errTxt.slice(0, 200)}`);
        }
        transcriptText = await whisperResp.text();
        console.log(tag, `transcrito: ${transcriptText.length} chars`);
      } catch (e) {
        console.error(tag, 'falha na transcrição Groq:', e.message);
      }
    }

    // 6) Salvar na tabela jarvis_calls (transcript mono inicial)
    let turns = transcriptText
      ? [{ speaker: 'call', text: transcriptText.trim(), ts: startTime }]
      : [];

    const callRow = db.prepare(`INSERT INTO jarvis_calls
      (prospect, empresa, transcript_json, role_map_json, duracao_seg, criado_por, zoho_call_id, fonte_audio)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      prospectName, empresa, JSON.stringify(turns), '{}', duracaoSeg, 'zoho-webhook', zohoCallId, 'zoho-3cx'
    );
    const callId = callRow.lastInsertRowid;

    // 7) Diarização via LLM (separar SDR × Cliente) + extração de aprendizados
    let resumo = null;
    let aprendizados = { dor: [], objecao: [], gatilho: [], pergunta_vencedora: [], sinal: [] };

    console.log(tag, `aiReady=${aiReady()}, transcriptLen=${transcriptText.length}`);
    if (transcriptText && aiReady()) {
      // 7a) Diarização — separar falas SDR vs Cliente
      try {
        const diarPrompt = [
          `Abaixo está a transcrição de uma call de prospecção B2B entre um SDR (vendedor) e um Cliente (prospect).`,
          `O áudio era mono, então as falas vieram misturadas sem identificação.`,
          `Sua tarefa: separar as falas entre SDR e CLIENTE baseado no contexto.`,
          `- O SDR faz perguntas, apresenta soluções SAP/ServiceNow, conduz a conversa.`,
          `- O CLIENTE descreve problemas, responde perguntas, faz objeções, conta sobre a empresa.`,
          `- Se houver saudação/secretária/correio de voz, marque como SISTEMA.`,
          ``,
          `CONTEXTO: SDR da EPI-USE · prospect=${prospectName} · empresa=${empresa}`,
          ``,
          `TRANSCRIÇÃO BRUTA:`,
          transcriptText.slice(0, 7000),
          ``,
          `Responda APENAS com JSON válido:`,
          `{"falas":[{"speaker":"sdr","text":"fala do sdr"},{"speaker":"prospect","text":"fala do cliente"},{"speaker":"sdr","text":"..."}]}`,
          `Mantenha a ordem cronológica. Agrupe frases consecutivas do mesmo speaker. Sem texto fora do JSON.`
        ].join('\n');

        const diarRaw = await callLLM({ system: 'Diarizador de calls de venda. Separa falas entre SDR e Cliente. Responde APENAS JSON puro. PT-BR.', user: diarPrompt, maxTokens: 2000 });
        const diarParsed = safeParseJson(diarRaw);
        if (diarParsed && Array.isArray(diarParsed.falas) && diarParsed.falas.length > 1) {
          turns = diarParsed.falas.map(f => ({
            speaker: f.speaker === 'prospect' ? 'prospect' : f.speaker === 'sistema' ? 'sistema' : 'sdr',
            text: String(f.text || '').trim(),
            ts: startTime
          })).filter(t => t.text);
          db.prepare('UPDATE jarvis_calls SET transcript_json = ? WHERE id = ?').run(JSON.stringify(turns), callId);
          console.log(tag, `diarização OK: ${turns.length} turnos (${turns.filter(t=>t.speaker==='sdr').length} SDR, ${turns.filter(t=>t.speaker==='prospect').length} Cliente)`);
        } else {
          console.warn(tag, 'diarização falhou, mantendo transcrição mono');
        }
      } catch (e) {
        console.warn(tag, 'diarização falhou:', e.message);
      }

      // 7b) Extrair aprendizados (usa transcrição diarizada quando disponível)
      try {
        const transcriptForLLM = turns.length > 1
          ? turns.map(t => (t.speaker === 'sdr' ? 'SDR' : t.speaker === 'prospect' ? 'CLIENTE' : 'SISTEMA') + ': ' + t.text).join('\n')
          : transcriptText.slice(0, 8000);

        const ext = [
          `Você é um analista de pré-vendas. Abaixo está a transcrição de uma call de prospecção B2B (SAP/ServiceNow).`,
          `As falas estão marcadas como SDR (vendedor) ou CLIENTE (prospect).`,
          `Extraia SOMENTE o que apareceu DE FATO na conversa (não invente).`,
          ``,
          `CONTEXTO: prospect=${prospectName} · empresa=${empresa}`,
          ``,
          `TRANSCRIÇÃO:`,
          transcriptForLLM.slice(0, 8000),
          ``,
          `Responda APENAS com JSON válido:`,
          `{`,
          `  "resumo": "2-3 frases do que rolou e onde parou",`,
          `  "dores": ["dor de negócio concreta dita pelo CLIENTE", "..."],`,
          `  "objecoes": ["objeção levantada pelo CLIENTE", "..."],`,
          `  "gatilhos": ["gatilho de urgência/contexto real mencionado na call", "..."],`,
          `  "perguntas_vencedoras": ["pergunta do SDR que gerou abertura/resposta rica", "..."],`,
          `  "sinais": ["sinal de compra ou de risco observado", "..."]`,
          `}`,
          `Listas vazias se não houver. Sem texto fora do JSON.`
        ].join('\n');

        const raw = await callLLM({ system: 'Extrator factual de calls de venda. Responde APENAS JSON puro, sem markdown, sem tags, sem explicação. PT-BR.', user: ext, maxTokens: 1200 });
        const parsed = safeParseJson(raw);
        if (parsed) {
          resumo = parsed.resumo || null;
          const mapTipo = { dores: 'dor', objecoes: 'objecao', gatilhos: 'gatilho', perguntas_vencedoras: 'pergunta_vencedora', sinais: 'sinal' };
          const ins = db.prepare(`INSERT INTO jarvis_aprendizados (call_id, tipo, texto, lob, industria, persona, fonte)
                                  VALUES (?,?,?,?,?,?, 'zoho-call')`);
          const tx = db.transaction(() => {
            for (const [campo, tipo] of Object.entries(mapTipo)) {
              const arr = Array.isArray(parsed[campo]) ? parsed[campo] : [];
              for (const txt of arr) {
                const clean = String(txt || '').trim();
                if (!clean) continue;
                ins.run(callId, tipo, clean.slice(0, 400), null, null, null);
                if (aprendizados[tipo]) aprendizados[tipo].push(clean);
              }
            }
          });
          tx();
          if (resumo) db.prepare('UPDATE jarvis_calls SET resumo = ? WHERE id = ?').run(resumo, callId);
        } else {
          console.warn(tag, 'safeParseJson retornou null — raw:', String(raw).slice(0, 500));
        }
      } catch (e) {
        console.warn(tag, 'extração de aprendizados falhou (call salva):', e.message);
      }
    }

    const totalApr = Object.values(aprendizados).reduce((a, x) => a + x.length, 0);
    console.log(tag, `✓ call ${zohoCallId} → jarvis_calls.id=${callId} · ${transcriptText.length} chars transcritos · ${totalApr} aprendizados`);

    res.json({
      success: true,
      call_id: callId,
      zoho_call_id: zohoCallId,
      prospect: prospectName,
      empresa,
      transcribed: !!transcriptText,
      transcript_length: transcriptText.length,
      resumo,
      aprendizados,
      total_aprendizados: totalApr
    });
  } catch (e) {
    console.error(tag, 'erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: listar calls ingeridas do Zoho ──────────────────────────────────────
router.get('/api/jarvis/zoho-calls', requireAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const calls = db.prepare(`
      SELECT id, zoho_call_id, prospect, empresa, resumo, duracao_seg, fonte_audio, criado_em,
             transcript_json,
             LENGTH(transcript_json) > 4 AS tem_transcricao
      FROM jarvis_calls
      WHERE zoho_call_id IS NOT NULL
      ORDER BY criado_em DESC
      LIMIT ?
    `).all(limit);

    const aprendizados = calls.length ? db.prepare(`
      SELECT call_id, tipo, texto FROM jarvis_aprendizados
      WHERE call_id IN (${calls.map(() => '?').join(',')})
      ORDER BY call_id, tipo
    `).all(...calls.map(c => c.id)) : [];

    const aprByCall = {};
    for (const a of aprendizados) {
      if (!aprByCall[a.call_id]) aprByCall[a.call_id] = [];
      aprByCall[a.call_id].push({ tipo: a.tipo, texto: a.texto });
    }

    const result = calls.map(c => {
      let transcricao_preview = '';
      try {
        const turns = JSON.parse(c.transcript_json || '[]');
        transcricao_preview = turns.map(t => t.text).join(' ').slice(0, 500);
      } catch (_) {}
      return {
        id: c.id, zoho_call_id: c.zoho_call_id, prospect: c.prospect,
        empresa: c.empresa, resumo: c.resumo, duracao_seg: c.duracao_seg,
        fonte: c.fonte_audio, data: c.criado_em, tem_transcricao: !!c.tem_transcricao,
        transcricao_preview, aprendizados: aprByCall[c.id] || []
      };
    });

    res.json({ success: true, total: result.length, calls: result });
  } catch (e) {
    console.error('[jarvis/zoho-calls] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: buscar calls por prospect (pré-call context) ────────────────────────
router.get('/api/jarvis/calls-by-prospect', requireAuth, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ success: false, error: 'Query mínima: 2 caracteres.' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const calls = db.prepare(`
      SELECT id, zoho_call_id, prospect, empresa, resumo, duracao_seg, fonte_audio, criado_em,
             transcript_json,
             LENGTH(transcript_json) > 4 AS tem_transcricao
      FROM jarvis_calls
      WHERE prospect LIKE ? OR empresa LIKE ?
      ORDER BY criado_em DESC
      LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit);

    const aprendizados = calls.length ? db.prepare(`
      SELECT call_id, tipo, texto FROM jarvis_aprendizados
      WHERE call_id IN (${calls.map(() => '?').join(',')})
      ORDER BY call_id, tipo
    `).all(...calls.map(c => c.id)) : [];

    const aprByCall = {};
    for (const a of aprendizados) {
      if (!aprByCall[a.call_id]) aprByCall[a.call_id] = [];
      aprByCall[a.call_id].push({ tipo: a.tipo, texto: a.texto });
    }

    const result = calls.map(c => {
      let transcriptPreview = '';
      try {
        const turns = JSON.parse(c.transcript_json || '[]');
        transcriptPreview = turns.map(t => t.text).join(' ').slice(0, 500);
      } catch (_) {}
      return {
        id: c.id,
        zoho_call_id: c.zoho_call_id,
        prospect: c.prospect,
        empresa: c.empresa,
        resumo: c.resumo,
        duracao_seg: c.duracao_seg,
        fonte: c.fonte_audio,
        data: c.criado_em,
        tem_transcricao: !!c.tem_transcricao,
        transcricao_preview: transcriptPreview,
        aprendizados: aprByCall[c.id] || []
      };
    });

    res.json({ success: true, query: q, total: result.length, calls: result });
  } catch (e) {
    console.error('[jarvis/calls-by-prospect] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: detalhe completo de uma call (para modal) ──────────────────────────
router.get('/api/jarvis/call/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido.' });
    const c = db.prepare(`
      SELECT id, zoho_call_id, prospect, empresa, resumo, duracao_seg, fonte_audio, criado_em, transcript_json
      FROM jarvis_calls WHERE id = ?
    `).get(id);
    if (!c) return res.status(404).json({ success: false, error: 'Call não encontrada.' });

    let transcricao = '';
    let turns = [];
    try {
      turns = JSON.parse(c.transcript_json || '[]');
      transcricao = turns.map(t => {
        const speaker = t.speaker === 'sdr' ? '🧑‍💼 SDR' : t.speaker === 'prospect' ? '👤 Cliente' : (t.speaker || '');
        return speaker + ': ' + t.text;
      }).join('\n\n');
    } catch (_) { transcricao = c.transcript_json || ''; }

    const diarizado = turns.length > 1 && turns.some(t => t.speaker === 'sdr' || t.speaker === 'prospect');

    const aprendizados = db.prepare(`
      SELECT tipo, texto FROM jarvis_aprendizados WHERE call_id = ? ORDER BY tipo
    `).all(id);

    res.json({
      success: true,
      call: {
        id: c.id, zoho_call_id: c.zoho_call_id, prospect: c.prospect,
        empresa: c.empresa, resumo: c.resumo, duracao_seg: c.duracao_seg,
        fonte: c.fonte_audio, data: c.criado_em, transcricao, aprendizados,
        diarizado, turns: diarizado ? turns : undefined
      }
    });
  } catch (e) {
    console.error('[jarvis/call/:id] erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: sync periódico de calls do Zoho → JARVIS ──────────────────────────
// Busca calls recentes no Zoho CRM (com gravação 3CX) e ingere as novas.
// Chamado por cron externo ou manualmente: GET /api/jarvis/sync-zoho-calls?secret=...
router.get('/api/jarvis/sync-zoho-calls', async (req, res) => {
  const tag = '[jarvis/sync-zoho-calls]';
  try {
    const secret = ZOHO_WEBHOOK_SECRET();
    if (secret) {
      const incoming = req.query.secret || '';
      if (incoming !== secret) return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const clientId     = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      return res.status(500).json({ success: false, error: 'Credenciais Zoho OAuth2 não configuradas (ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET).' });
    }

    // 1) Obter access token
    const tokenRes = await fetch(
      `https://accounts.zoho.com/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`,
      { method: 'POST' }
    );
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      console.error(tag, 'falha ao obter token:', tokenJson);
      return res.status(500).json({ success: false, error: 'Falha ao obter access_token do Zoho.' });
    }
    const token = tokenJson.access_token;

    // 2) Buscar calls recentes (últimos 30 dias, com gravação)
    const daysBack = parseInt(req.query.days, 10) || 30;
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const coql = `SELECT id, Subject, Call_Duration, Call_Start_Time, Description, Who_Id, What_Id FROM Calls WHERE Call_Start_Time >= '${since}' ORDER BY Call_Start_Time DESC LIMIT 100`;

    const coqlRes = await fetch('https://www.zohoapis.com/crm/v7/coql', {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ select_query: coql })
    });
    const coqlJson = await coqlRes.json();
    const calls = coqlJson.data || [];
    console.log(tag, `${calls.length} calls encontradas no Zoho (desde ${since})`);

    // 3) Filtrar só as que têm Recording na Description e ainda não foram ingeridas
    const existingIds = new Set(
      db.prepare('SELECT zoho_call_id FROM jarvis_calls WHERE zoho_call_id IS NOT NULL').all().map(r => r.zoho_call_id)
    );

    const novas = calls.filter(c => {
      const desc = String(c.Description || '');
      return desc.includes('Recording:') && !existingIds.has(String(c.id));
    });
    console.log(tag, `${novas.length} calls novas pra ingerir (${calls.length - novas.length} já existem)`);

    if (!novas.length) {
      return res.json({ success: true, message: 'Nenhuma call nova.', total_zoho: calls.length, novas: 0, resultados: [] });
    }

    // 4) Ingerir cada call nova via self-call HTTP
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const ingestSecret = secret ? `?secret=${secret}` : '';
    const resultados = [];

    for (const call of novas) {
      try {
        const ingestRes = await fetch(`${baseUrl}/api/jarvis/ingest-zoho-call${ingestSecret}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call)
        });
        const r = await ingestRes.json();
        resultados.push({ zoho_call_id: call.id, success: r.success, prospect: r.prospect, aprendizados: r.total_aprendizados || 0 });
        console.log(tag, `✓ ${call.id} → ${r.success ? 'ok' : 'erro'} (${r.total_aprendizados || 0} aprendizados)`);
      } catch (e) {
        resultados.push({ zoho_call_id: call.id, success: false, error: e.message });
        console.warn(tag, `✗ ${call.id}:`, e.message);
      }
    }

    res.json({ success: true, total_zoho: calls.length, novas: novas.length, resultados });
  } catch (e) {
    console.error(tag, 'erro:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
