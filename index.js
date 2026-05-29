// index.js
// ----------------------------------------------------------------------------
// Bot de efeitos de voz usando a EVOLUTION API.
//
// Fluxo:
//   1. A Evolution API (Docker) conecta no WhatsApp.
//   2. Quando chega uma mensagem, a Evolution chama nosso WEBHOOK (POST /webhook).
//   3. Se for um comando "!efeito" respondendo um audio, baixamos o audio,
//      aplicamos o efeito (FFmpeg) e mandamos de volta pela REST da Evolution.
//
// ⚠️ Conexao nao-oficial (Evolution usa Baileys por baixo). Use chip de teste.
// ----------------------------------------------------------------------------

import "dotenv/config";
import express from "express";
import { aplicarEfeito, EFEITOS, textoMenu } from "./efeitos.js";

const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://localhost:8080";
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.INSTANCE_NAME || "bot-voz";
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Helpers pra falar com a Evolution API (REST).
// ---------------------------------------------------------------------------

// Chamada generica autenticada na Evolution.
async function evolution(metodo, caminho, corpo) {
  const resp = await fetch(`${EVOLUTION_URL}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(`Evolution ${metodo} ${caminho} -> ${resp.status}: ${texto}`);
  }
  try { return JSON.parse(texto); } catch { return texto; }
}

// Manda um texto pra um chat (grupo ou contato).
function enviarTexto(numero, texto) {
  return evolution("POST", `/message/sendText/${INSTANCE}`, {
    number: numero,
    text: texto,
  });
}

// Manda um audio (como mensagem de voz / PTT). A Evolution aceita base64.
function enviarAudio(numero, bufferOgg) {
  return evolution("POST", `/message/sendWhatsAppAudio/${INSTANCE}`, {
    number: numero,
    audio: bufferOgg.toString("base64"),
  });
}

// Manda a lista de efeitos como BOTOES clicaveis. Cada botao tem um "id" que
// volta pra gente quando a pessoa clica (ai sabemos qual efeito aplicar).
// O "audioId" e o id da mensagem de audio original — vai embutido no id do
// botao pra sabermos QUAL audio modificar.
function enviarBotoes(numero, audioId, autorAudio) {
  const botoes = Object.entries(EFEITOS).map(([chave, e]) => ({
    type: "reply",
    // formato do id: efeito|chave|idDoAudio|autorDoAudio
    displayText: e.nome,
    id: `efeito|${chave}|${audioId}|${autorAudio || ""}`,
  }));

  return evolution("POST", `/message/sendButtons/${INSTANCE}`, {
    number: numero,
    title: "🎙️ Efeitos de voz",
    description: "Toque num efeito pra ouvir o audio modificado:",
    footer: "Bot de voz",
    buttons: botoes,
  });
}

// Baixa a midia de uma mensagem (a Evolution devolve o conteudo em base64).
async function baixarMidia(messageKey) {
  const r = await evolution("POST", `/chat/getBase64FromMediaMessage/${INSTANCE}`, {
    message: { key: messageKey },
    convertToMp4: false,
  });
  const base64 = r?.base64 || r?.media || r;
  return Buffer.from(base64, "base64");
}

// ---------------------------------------------------------------------------
// Servidor que recebe os webhooks da Evolution.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "50mb" })); // audios podem ser grandes

app.get("/", (_req, res) => res.send("Bot de voz rodando ✅"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // responde rapido; processa depois
  // LOG DE DIAGNOSTICO: mostra todo evento que chega.
  console.log(`📥 webhook: event=${req.body?.event}`);
  try {
    await tratarEvento(req.body);
  } catch (err) {
    console.error("Erro no webhook:", err.message);
  }
});

async function tratarEvento(evento) {
  // So nos interessa o evento de mensagem nova.
  if (evento?.event !== "messages.upsert") return;

  const dados = evento.data;
  const msg = Array.isArray(dados) ? dados[0] : dados;
  if (!msg?.message || msg.key?.fromMe) return;

  const chatId = msg.key.remoteJid; // grupo ou contato

  // ---- CASO 1: a pessoa CLICOU num botao de efeito ----------------------
  const clique =
    msg.message.buttonsResponseMessage?.selectedButtonId ||
    msg.message.templateButtonReplyMessage?.selectedId;
  if (clique?.startsWith("efeito|")) {
    await aplicarPorClique(chatId, clique);
    return;
  }

  // ---- CASO 2: comando de texto -----------------------------------------
  const texto = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    ""
  ).trim().toLowerCase();

  // Menu / ajuda.
  if (["!menu", "!ajuda", "!help"].includes(texto)) {
    await enviarTexto(chatId, textoMenu());
    return;
  }

  // !voz (ou !efeito) respondendo um audio -> mostra os BOTOES.
  if (["!voz", "!efeito", "!efeitos"].includes(texto)) {
    const contexto = msg.message.extendedTextMessage?.contextInfo;
    const citada = contexto?.quotedMessage;
    if (!citada?.audioMessage) {
      await enviarTexto(chatId, "❗ Responda a uma *mensagem de audio* com *!voz*.");
      return;
    }
    // Mostra os botoes, carregando no id qual audio modificar.
    await enviarBotoes(chatId, contexto.stanzaId, contexto.participant);
    return;
  }

  // Atalho: ainda aceita !demonio, !robo etc. direto, se a pessoa preferir.
  if (texto.startsWith("!") && EFEITOS[texto.slice(1)]) {
    const contexto = msg.message.extendedTextMessage?.contextInfo;
    const citada = contexto?.quotedMessage;
    if (!citada?.audioMessage) {
      await enviarTexto(chatId, "❗ Responda a uma *mensagem de audio* com o comando.");
      return;
    }
    await processarAudio(chatId, texto.slice(1), contexto.stanzaId, contexto.participant);
  }
}

// Quando a pessoa clica num botao: o id traz "efeito|chave|idDoAudio|autor".
async function aplicarPorClique(chatId, selectedId) {
  const [, chave, audioId, autor] = selectedId.split("|");
  if (!EFEITOS[chave]) return;
  await processarAudio(chatId, chave, audioId, autor);
}

// Baixa o audio original, aplica o efeito e reenvia so o modificado.
async function processarAudio(chatId, chave, audioId, autor) {
  const keyCitada = {
    remoteJid: chatId,
    id: audioId,
    participant: autor || undefined,
    fromMe: false,
  };

  try {
    const bufferEntrada = await baixarMidia(keyCitada);
    const bufferSaida = await aplicarEfeito(bufferEntrada, chave);
    await enviarAudio(chatId, bufferSaida);
    console.log(`🎙️  Efeito "${chave}" aplicado em ${chatId}`);
  } catch (err) {
    console.error(`Falha ao aplicar "${chave}":`, err.message);
    await enviarTexto(chatId, "❌ Nao consegui processar esse audio, tenta de novo.");
  }
}

app.listen(PORT, () => {
  console.log(`✅ Bot ouvindo webhooks em http://localhost:${PORT}/webhook`);
  console.log(`   Evolution API esperada em ${EVOLUTION_URL}`);
  console.log(`   Rode "npm run setup" se ainda nao conectou o WhatsApp.`);
});
