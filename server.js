require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const EVOLUTION_URL      = process.env.EVOLUTION_API_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "viralizacortes";
const EVOLUTION_KEY      = process.env.EVOLUTION_API_KEY;

const CHECKOUT = {
  starter: "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36710557",
  pro:     "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36710590",
  full:    "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36711838",
  agencia: "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36711896",
};
const ACCESS_URL = "https://viralizacortes.com.br/entrar";

// ─── Envio via Evolution API ─────────────────────────────────────────────────
async function enviarMensagem(numero, texto) {
  await axios.post(
    `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
    { number: numero, text: texto },
    { headers: { apikey: EVOLUTION_KEY } }
  );
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizarNumero(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/\D/g, "");
  if (n.startsWith("0")) n = n.slice(1);
  if (!n.startsWith("55")) n = "55" + n;
  return n.length >= 12 ? n : null;
}

function primeiroNome(nome) {
  return (nome || "").split(" ")[0] || "amigo";
}

// ─── Histórico de conversas (in-memory) ──────────────────────────────────────
const conversas = new Map();

function getHistorico(numero) {
  if (!conversas.has(numero)) conversas.set(numero, []);
  return conversas.get(numero);
}

// ─── Log de eventos ───────────────────────────────────────────────────────────
const logEventos = [];
function registrarEvento(tipo, numero, ok) {
  logEventos.unshift({ tipo, numero, ok, at: new Date().toISOString() });
  if (logEventos.length > 200) logEventos.pop();
}

// ─── System Prompt ────────────────────────────────────────────────────────────
function systemPrompt() {
  return `Você é a Mari, atendente virtual do Viraliza Cortes — plataforma que transforma vídeos do YouTube em cortes virais para TikTok, Reels e Shorts com IA.

Sobre a plataforma:
- Usuário cola link do YouTube → IA encontra os melhores momentos → gera clips 9:16 com legendas em PT-BR gravadas no vídeo
- Tudo no navegador, sem instalar nada. 2 cortes grátis para testar, sem cartão de crédito.

Planos:
- Starter: R$29,90/mês → 55 cortes
- Pro: R$49,90/mês → 80 cortes
- Full: R$99,90/mês → 140 cortes
- Agência: R$150/mês → 220 cortes
- Todos com garantia de 7 dias sem risco

Links:
- Acesso/Cadastro: ${ACCESS_URL}
- Starter: ${CHECKOUT.starter}
- Pro: ${CHECKOUT.pro}
- Full: ${CHECKOUT.full}
- Agência: ${CHECKOUT.agencia}
- Suporte: suporte@viralizacortes.com.br

Seu estilo:
- Tom caloroso, humano, animado — nunca robótico
- Respostas curtas (máximo 4 linhas no WhatsApp)
- Use emojis com moderação (1-2 por mensagem)
- Sempre ofereça próximo passo concreto (link ou ação)
- Nunca invente preços ou funcionalidades que não existem`;
}

// ─── IA para respostas conversacionais ───────────────────────────────────────
async function responderComIA(numero, textoUsuario) {
  const historico = getHistorico(numero);
  historico.push({ role: "user", content: textoUsuario });
  if (historico.length > 20) historico.splice(0, historico.length - 20);

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: systemPrompt(),
    messages: historico,
  });

  const resposta = response.content[0].text.trim();
  historico.push({ role: "assistant", content: resposta });
  return resposta;
}

// ─── Mensagens de Lifecycle ───────────────────────────────────────────────────

function msgBoasVindas(nome) {
  const n = primeiroNome(nome);
  return `Oi ${n}! 🚀\nBem-vindo ao *Viraliza Cortes*!\n\nSeu acesso começa AGORA — 2 cortes grátis pra testar.\n▶️ Acesse: ${ACCESS_URL}\n\nCola um link do YouTube e me conta o resultado! 💚`;
}

function msgTrialVencendo(nome) {
  const n = primeiroNome(nome);
  return `Oi ${n}! ⏰\nSeu trial vence amanhã!\n\nSe você tá gostando (e aposto que tá 😄), aqui sua opção pra continuar:\n\n🎯 *Starter*: R$29,90/mês → 55 cortes\n🎯 *Pro*: R$49,90/mês → 80 cortes\n🎯 *Full*: R$99,90/mês → 140 cortes\n\nAssina agora (garantia 7 dias): ${CHECKOUT.starter}\nDúvidas? É só me chamar! 💬`;
}

function msgPagamentoAprovado(nome, plano, dataRenovacao) {
  const n = primeiroNome(nome);
  const labels = { starter: "Starter", basico: "Starter", pro: "Pro", full: "Full", agencia: "Agência" };
  const label = labels[plano] || "Pro";
  const renovacao = dataRenovacao ? `\nRenova em: *${dataRenovacao}*` : "";
  return `🎉 *${n}*, pagamento aprovado!\n\nSeu plano *${label}* tá ativo agora ✅\nAcesse: ${ACCESS_URL}${renovacao}\n\nBora criar cortes que explodem! 🚀\nMe chama qualquer coisa 💚`;
}

function msgPlanoVencendo(nome, dataRenovacao) {
  const n = primeiroNome(nome);
  return `Oi ${n}! 🔔\n\nSeu plano renova em *${dataRenovacao}*.\n\nQuer trocar de plano ou tem dúvida, é só me chamar! Tô aqui 💚\nVer planos: ${CHECKOUT.starter}`;
}

// ─── Endpoints de Lifecycle ───────────────────────────────────────────────────

app.post("/disparar/boas-vindas", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true });
  setImmediate(async () => {
    try {
      await delay(2000);
      await enviarMensagem(numero, msgBoasVindas(name));
      registrarEvento("boas-vindas", numero, true);
      console.log(`[boas-vindas] enviado para ${numero}`);
    } catch (e) {
      registrarEvento("boas-vindas", numero, false);
      console.error("[boas-vindas] erro:", e.message);
    }
  });
});

app.post("/disparar/trial-vencendo", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true });
  setImmediate(async () => {
    try {
      await enviarMensagem(numero, msgTrialVencendo(name));
      registrarEvento("trial-vencendo", numero, true);
      console.log(`[trial-vencendo] enviado para ${numero}`);
    } catch (e) {
      registrarEvento("trial-vencendo", numero, false);
      console.error("[trial-vencendo] erro:", e.message);
    }
  });
});

app.post("/disparar/pagamento-aprovado", async (req, res) => {
  const { phone, name, plan, renewalDate } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true });
  setImmediate(async () => {
    try {
      await enviarMensagem(numero, msgPagamentoAprovado(name, plan, renewalDate));
      registrarEvento("pagamento-aprovado", numero, true);
      console.log(`[pagamento-aprovado] enviado para ${numero}`);
    } catch (e) {
      registrarEvento("pagamento-aprovado", numero, false);
      console.error("[pagamento-aprovado] erro:", e.message);
    }
  });
});

app.post("/disparar/plano-vencendo", async (req, res) => {
  const { phone, name, renewalDate } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true });
  setImmediate(async () => {
    try {
      await enviarMensagem(numero, msgPlanoVencendo(name, renewalDate));
      registrarEvento("plano-vencendo", numero, true);
      console.log(`[plano-vencendo] enviado para ${numero}`);
    } catch (e) {
      registrarEvento("plano-vencendo", numero, false);
      console.error("[plano-vencendo] erro:", e.message);
    }
  });
});

// ─── Sequências IA (reengajamento) ───────────────────────────────────────────

async function gerarMsgIA(prompt) {
  const r = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 220, system: systemPrompt(),
    messages: [{ role: "user", content: prompt }],
  });
  return r.content[0].text.trim();
}

async function sequenciaTrialEsgotado(numero, nome) {
  const n = primeiroNome(nome);
  const msg1 = await gerarMsgIA(`Crie UMA mensagem (máx 4 linhas) para "${n}" que acabou de usar todos os 2 cortes grátis. Reconheça de forma natural, elogie e pergunte se quer continuar. Sem preço, sem pressão. Apenas o texto.`);
  await delay(1500);
  await enviarMensagem(numero, msg1);
  await delay(20 * 60 * 60 * 1000);
  const msg2 = await gerarMsgIA(`Crie UMA mensagem (máx 3 linhas) para "${n}" que usou os créditos grátis mas não assinou. Crie senso de perda: concorrentes postam todo dia enquanto ele está parado. Sem preço. Apenas o texto.`);
  await enviarMensagem(numero, msg2);
  await delay(28 * 60 * 60 * 1000);
  const msg3 = await gerarMsgIA(`Crie UMA mensagem de oferta (máx 5 linhas) para "${n}". Apresente Starter R$29,90/mês com 55 cortes e garantia de 7 dias. Termine com: ${CHECKOUT.starter}. Urgência leve. Apenas o texto.`);
  await enviarMensagem(numero, msg3);
}

async function sequenciaNuncaUsou(numero, nome) {
  const n = primeiroNome(nome);
  const msg1 = await gerarMsgIA(`Crie UMA mensagem (máx 3 linhas) para "${n}" que se cadastrou mas nunca usou os 2 cortes grátis. Lembre que estão esperando e diga em 1 frase como é simples. Inclua: viralizacortes.com.br. Apenas o texto.`);
  await delay(1500);
  await enviarMensagem(numero, msg1);
  await delay(3 * 24 * 60 * 60 * 1000);
  const msg2 = await gerarMsgIA(`Crie UMA mensagem (máx 3 linhas) de urgência leve para "${n}" que ainda não usou após 5 dias. Diga que os créditos vencem em breve, mencione renda extra. Inclua: viralizacortes.com.br. Apenas o texto.`);
  await enviarMensagem(numero, msg2);
}

async function sequenciaPoucoUso(numero, nome, creditosUsados) {
  const n = primeiroNome(nome);
  const msg = await gerarMsgIA(`Crie UMA mensagem (máx 3 linhas) de reengajamento para "${n}" que usou ${creditosUsados} cortes grátis mas sumiu. Pergunte se teve dificuldade, ofereça ajuda, lembre dos créditos restantes. Inclua: viralizacortes.com.br. Apenas o texto.`);
  await delay(1500);
  await enviarMensagem(numero, msg);
}

app.post("/disparar/trial-esgotado", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true, status: "sequência iniciada" });
  sequenciaTrialEsgotado(numero, name).catch(e => console.error("[trial-esgotado]", e.message));
});

app.post("/disparar/nunca-usou", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true, status: "sequência iniciada" });
  sequenciaNuncaUsou(numero, name).catch(e => console.error("[nunca-usou]", e.message));
});

app.post("/disparar/reengajamento", async (req, res) => {
  const { phone, name, creditsUsed } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true });
  sequenciaPoucoUso(numero, name, creditsUsed || 0).catch(e => console.error("[reengajamento]", e.message));
});

app.post("/disparar/lista", async (req, res) => {
  const { usuarios, tipo } = req.body;
  if (!Array.isArray(usuarios) || !tipo) return res.status(400).json({ erro: "Informe usuarios[] e tipo" });
  res.json({ ok: true, total: usuarios.length, tipo });
  for (const u of usuarios) {
    const numero = normalizarNumero(u.phone);
    if (!numero) continue;
    try {
      if (tipo === "trial-esgotado")     await sequenciaTrialEsgotado(numero, u.name);
      else if (tipo === "nunca-usou")    await sequenciaNuncaUsou(numero, u.name);
      else if (tipo === "reengajamento") await sequenciaPoucoUso(numero, u.name, u.creditsUsed);
      await delay(10000 + Math.random() * 5000);
    } catch (e) { console.error(`[lista] erro em ${numero}:`, e.message); }
  }
});

// ─── Webhook (respostas automáticas via Claude) ───────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (
      body.event !== "messages.upsert" ||
      body.data?.key?.fromMe === true ||
      !body.data?.message?.conversation
    ) return;

    const numero = body.data.key.remoteJid;
    const texto = body.data.message.conversation?.trim();
    if (!texto || numero.includes("@g.us")) return;

    console.log(`[webhook] ${numero}: ${texto.slice(0, 80)}`);
    await delay(1500 + texto.length * 15);
    const resposta = await responderComIA(numero, texto);
    await enviarMensagem(numero, resposta);
  } catch (err) {
    console.error("[webhook] erro:", err.message);
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => {
  const rows = logEventos.map(e => `
    <tr class="${e.ok ? "" : "err"}">
      <td>${e.at.replace("T", " ").slice(0, 19)}</td>
      <td><span class="badge">${e.tipo}</span></td>
      <td>${e.numero}</td>
      <td>${e.ok ? "✅" : "❌"}</td>
    </tr>`).join("");

  res.send(`<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Viraliza Cortes</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:24px}
h1{color:#a855f7;margin-bottom:6px;font-size:1.4rem}
.sub{color:#888;font-size:13px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #1e1e1e}
th{background:#141414;color:#a855f7;font-weight:600}
tr.err td{color:#f87171}
tr:hover td{background:#111}
.badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:#1e1b4b;color:#a5b4fc}
.empty{text-align:center;color:#444;padding:32px}
</style></head>
<body>
<h1>🤖 Viraliza Cortes — Bot WhatsApp</h1>
<p class="sub">Instância: ${EVOLUTION_INSTANCE} &nbsp;|&nbsp; Últimas ${logEventos.length} mensagens</p>
<table>
<thead><tr><th>Horário</th><th>Evento</th><th>Número</th><th>Status</th></tr></thead>
<tbody>${rows || `<tr><td colspan="4" class="empty">Nenhuma mensagem enviada ainda</td></tr>`}</tbody>
</table>
</body></html>`);
});

app.get("/", (req, res) => res.json({ status: "online", bot: "Viraliza Cortes — Bot Lifecycle + IA" }));
app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[ViralizaCortes Bot] porta ${PORT} — Claude ${process.env.CLAUDE_MODEL || "haiku"}`));
