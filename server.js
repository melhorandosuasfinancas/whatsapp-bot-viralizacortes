require("dotenv").config();
const express = require("express");
const Groq = require("groq-sdk");
const axios = require("axios");

const app = express();
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const EVOLUTION_URL      = process.env.EVOLUTION_API_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "viralizacortes";
const EVOLUTION_KEY      = process.env.EVOLUTION_API_KEY;

const CHECKOUT = {
  starter: "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36710557",
  pro:     "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36710590",
  full:    "https://viralizacortes.carrinho.app/one-checkout/ocmdf/36711838",
};

// ─── Envio via Evolution API ─────────────────────────────────────────────────
async function enviarMensagem(numero, texto) {
  await axios.post(
    `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
    { number: numero, text: texto },
    { headers: { apikey: EVOLUTION_KEY } }
  );
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizarNumero(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/\D/g, "");
  if (n.startsWith("0")) n = n.slice(1);
  if (!n.startsWith("55")) n = "55" + n;
  return n.length >= 12 ? n : null;
}

// ─── Geração de mensagens com IA ─────────────────────────────────────────────
async function gerarMensagem(prompt) {
  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 250,
    temperature: 0.85,
    messages: [{ role: "user", content: prompt }],
  });
  return res.choices[0].message.content.trim();
}

// ─── Sequências de mensagens ──────────────────────────────────────────────────

// Sequência 1: usuário esgotou os créditos do trial (3 mensagens)
async function sequenciaTrialEsgotado(numero, nome) {
  const primeiro = (nome || "").split(" ")[0] || "oi";

  const msg1 = await gerarMensagem(
    `Você é uma atendente simpática da Viraliza Cortes (plataforma que transforma vídeos do YouTube em cortes virais para TikTok, Reels e Shorts).
O cliente "${primeiro}" acabou de usar todos os seus 10 cortes grátis do trial.
Escreva UMA mensagem curta de WhatsApp (máximo 4 linhas) reconhecendo que ele usou tudo, elogiando de forma natural e perguntando se quer continuar.
Tom: humano, caloroso, sem pressão. Sem emojis exagerados. Nunca mencione preço ainda.
Responda APENAS com o texto da mensagem.`
  );

  await delay(1500);
  await enviarMensagem(numero, msg1);

  // Mensagem 2 — 20 horas depois
  await delay(20 * 60 * 60 * 1000);

  const msg2 = await gerarMensagem(
    `Você é uma atendente da Viraliza Cortes.
O cliente "${primeiro}" usou os créditos grátis mas ainda não assinou.
Escreva UMA mensagem curta (máximo 3 linhas) criando senso de perda: enquanto ele está sem créditos, os concorrentes estão postando todo dia. Sem mencionar preço.
Tom: humano, direto, sem drama. Responda APENAS com o texto.`
  );

  await enviarMensagem(numero, msg2);

  // Mensagem 3 — 48 horas após a primeira
  await delay(28 * 60 * 60 * 1000);

  const msg3 = await gerarMensagem(
    `Você é uma atendente da Viraliza Cortes.
O cliente "${primeiro}" ainda não assinou após usar o trial.
Escreva UMA mensagem de oferta (máximo 5 linhas) apresentando o Plano Starter por R$29,90/mês com 35 cortes/mês.
Inclua no final o link: ${CHECKOUT.starter}
Mencione a garantia de 7 dias. Tom: caloroso, com leveza de urgência. Responda APENAS com o texto.`
  );

  await enviarMensagem(numero, msg3);
}

// Sequência 2: nunca usou os créditos (2 mensagens)
async function sequenciaNuncaUsou(numero, nome) {
  const primeiro = (nome || "").split(" ")[0] || "oi";

  const msg1 = await gerarMensagem(
    `Você é uma atendente da Viraliza Cortes.
O cliente "${primeiro}" se cadastrou mas nunca usou os 10 créditos grátis.
Escreva UMA mensagem curta (máximo 3 linhas) lembrando que os créditos estão esperando e explicando em 1 frase como é simples: cola o link do YouTube e a IA faz o resto.
Inclua: viralizacortes.com.br. Tom: animado, sem pressão. Responda APENAS com o texto.`
  );

  await delay(1500);
  await enviarMensagem(numero, msg1);

  // Mensagem 2 — 3 dias depois
  await delay(3 * 24 * 60 * 60 * 1000);

  const msg2 = await gerarMensagem(
    `Você é uma atendente da Viraliza Cortes.
O cliente "${primeiro}" ainda não usou os créditos grátis após 5 dias.
Escreva UMA mensagem curta (máximo 3 linhas) com urgência leve: os créditos vão vencer em breve. Mencione que dá pra ganhar renda extra postando cortes sem aparecer no vídeo.
Inclua: viralizacortes.com.br. Responda APENAS com o texto.`
  );

  await enviarMensagem(numero, msg2);
}

// Sequência 3: usou poucos créditos (1 mensagem de reengajamento)
async function sequenciaPoucoUso(numero, nome, creditosUsados) {
  const primeiro = (nome || "").split(" ")[0] || "oi";

  const msg = await gerarMensagem(
    `Você é uma atendente da Viraliza Cortes.
O cliente "${primeiro}" testou a plataforma e usou ${creditosUsados} dos 10 créditos grátis mas sumiu.
Escreva UMA mensagem curta (máximo 3 linhas) reengajando: pergunte se teve alguma dificuldade, ofereça ajuda e lembre que ainda tem créditos para usar.
Inclua: viralizacortes.com.br. Tom: caloroso, genuíno. Responda APENAS com o texto.`
  );

  await delay(1500);
  await enviarMensagem(numero, msg);
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// Disparado pelo backend quando usuário esgota créditos
app.post("/disparar/trial-esgotado", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true, status: "sequência iniciada em background" });
  sequenciaTrialEsgotado(numero, name).catch((e) =>
    console.error("[trial-esgotado] erro:", e.message)
  );
});

// Disparado para usuários que nunca usaram (2 dias após cadastro)
app.post("/disparar/nunca-usou", async (req, res) => {
  const { phone, name } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true, status: "sequência iniciada em background" });
  sequenciaNuncaUsou(numero, name).catch((e) =>
    console.error("[nunca-usou] erro:", e.message)
  );
});

// Disparado para usuários com pouco uso (3+ dias sem logar)
app.post("/disparar/reengajamento", async (req, res) => {
  const { phone, name, creditsUsed } = req.body;
  const numero = normalizarNumero(phone);
  if (!numero) return res.status(400).json({ erro: "phone inválido" });
  res.json({ ok: true, status: "mensagem enviada em background" });
  sequenciaPoucoUso(numero, name, creditsUsed || 0).catch((e) =>
    console.error("[reengajamento] erro:", e.message)
  );
});

// Disparo manual para lista (ex: os 8 usuários atuais)
app.post("/disparar/lista", async (req, res) => {
  const { usuarios, tipo } = req.body;
  // tipo: "trial-esgotado" | "nunca-usou" | "reengajamento"
  if (!Array.isArray(usuarios) || !tipo)
    return res.status(400).json({ erro: "Informe usuarios[] e tipo" });

  res.json({ ok: true, total: usuarios.length, tipo });

  for (const u of usuarios) {
    const numero = normalizarNumero(u.phone);
    if (!numero) continue;
    try {
      if (tipo === "trial-esgotado") await sequenciaTrialEsgotado(numero, u.name);
      else if (tipo === "nunca-usou") await sequenciaNuncaUsou(numero, u.name);
      else if (tipo === "reengajamento") await sequenciaPoucoUso(numero, u.name, u.creditsUsed);
      await delay(10000 + Math.random() * 5000); // delay entre usuários
    } catch (e) {
      console.error(`[lista] erro em ${numero}:`, e.message);
    }
  }
  console.log(`[lista] Concluído — ${usuarios.length} usuários`);
});

// Resposta automática para quem mandar mensagem
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
    const texto = body.data.message.conversation?.trim().toLowerCase();
    if (!texto || numero.includes("@g.us")) return;

    console.log(`[webhook] ${numero}: ${texto}`);

    // Respostas automáticas simples
    let resposta = null;

    if (texto.match(/preço|plano|valor|quanto|custa/)) {
      resposta = `Oi! Temos 4 planos 👇\n\n*Starter* — R$29,90/mês → 35 cortes\n*Pro* — R$49,90/mês → 60 cortes\n*Full* — R$99,90/mês → 120 cortes\n*Agência* — R$150/mês → 200 cortes\n\nTodos com 7 dias de garantia ✅\n\nQual se encaixa melhor pra você?`;
    } else if (texto.match(/como funciona|o que é|o que faz/)) {
      resposta = `É simples! 🎬\n\n1️⃣ Cole o link de qualquer vídeo do YouTube\n2️⃣ Nossa IA identifica os melhores momentos\n3️⃣ Receba os cortes prontos em 9:16 com legenda\n\nPronto para postar no TikTok, Reels e Shorts em menos de 3 minutos!\n\n👉 viralizacortes.com.br`;
    } else if (texto.match(/starter|assinar|quero/)) {
      resposta = `Boa escolha! 🚀\n\nAcesse aqui para assinar o Starter (R$29,90/mês):\n${CHECKOUT.starter}\n\nQualquer dúvida é só chamar!`;
    } else {
      resposta = `Oi! 👋 Obrigada por entrar em contato com o *Viraliza Cortes*!\n\nTransformamos vídeos do YouTube em cortes virais para TikTok, Reels e Shorts com IA 🎬✂️\n\nComece com 10 cortes grátis:\n👉 viralizacortes.com.br\n\nTem alguma dúvida? Pode perguntar!`;
    }

    if (resposta) {
      await delay(1500 + resposta.length * 10);
      await enviarMensagem(numero, resposta);
    }
  } catch (err) {
    console.error("[webhook] erro:", err.message);
  }
});

app.get("/", (req, res) =>
  res.json({ status: "online", bot: "Viraliza Cortes — Bot de Conversão" })
);

app.get("/status", (req, res) =>
  res.json({ status: "online", instance: EVOLUTION_INSTANCE })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[ViralizaCortes Bot] rodando na porta ${PORT}`));
