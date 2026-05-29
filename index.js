/**
 * Bot de Efeitos de Voz para WhatsApp
 * ------------------------------------
 * Criado por: Endria / EndriaCarem
 * Repositório: github.com/EndriaCarem/whatsapp-bot-voz
 *
 * Como funciona:
 *  1. A Evolution API (rodando via Docker) mantém a conexão com o WhatsApp.
 *  2. Quando chega uma mensagem no grupo, a Evolution dispara um POST
 *     para o nosso webhook (/webhook) com os dados da mensagem.
 *  3. Se a mensagem for o comando !voz respondendo um áudio, o bot:
 *       a. Exibe botões de efeito (Demônio, Esquilo, Robô...)
 *       b. Quando a pessoa clica num botão, baixa o áudio original
 *       c. Aplica o efeito via FFmpeg
 *       d. Reenvia o áudio modificado no grupo
 *
 * ⚠️  A Evolution API usa Baileys (conexão não-oficial).
 *     Use sempre um número de teste — nunca o seu principal.
 */

import "dotenv/config";
import express from "express";
import { aplicarEfeito, EFEITOS, textoMenu } from "./efeitos.js";

// ─── Configuração ────────────────────────────────────────────────────────────

const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://localhost:8080";
const API_KEY       = process.env.EVOLUTION_API_KEY;
const INSTANCE      = process.env.INSTANCE_NAME   || "bot-voz";
const PORT          = process.env.PORT             || 3000;

// ─── Comunicação com a Evolution API ─────────────────────────────────────────

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
    throw new Error(`Evolution ${metodo} ${caminho} → ${resp.status}: ${texto}`);
  }
  try { return JSON.parse(texto); } catch { return texto; }
}

function enviarTexto(numero, texto) {
  return evolution("POST", `/message/sendText/${INSTANCE}`, {
    number: numero,
    text: texto,
  });
}

function enviarAudio(numero, bufferOgg) {
  return evolution("POST", `/message/sendWhatsAppAudio/${INSTANCE}`, {
    number: numero,
    audio: bufferOgg.toString("base64"),
  });
}

/**
 * Envia os botões de seleção de efeito.
 * O ID de cada botão carrega qual áudio modificar: "efeito|chave|audioId|autor"
 * Isso evita precisar de banco de dados para guardar o estado.
 */
function enviarBotoes(numero, audioId, autorAudio) {
  const botoes = Object.entries(EFEITOS).map(([chave, e]) => ({
    type: "reply",
    displayText: e.nome,
    id: `efeito|${chave}|${audioId}|${autorAudio || ""}`,
  }));

  return evolution("POST", `/message/sendButtons/${INSTANCE}`, {
    number: numero,
    title: "🎙️ Efeitos de voz",
    description: "Toque em um efeito para transformar o áudio:",
    footer: "Bot de Voz • EndriaCarem",
    buttons: botoes,
  });
}

async function baixarMidia(messageKey) {
  const r = await evolution("POST", `/chat/getBase64FromMediaMessage/${INSTANCE}`, {
    message: { key: messageKey },
    convertToMp4: false,
  });
  const base64 = r?.base64 || r?.media || r;
  return Buffer.from(base64, "base64");
}

// ─── Servidor de Webhook ──────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));

// Rota de health check — Railway e outros serviços usam isso pra saber se o bot está vivo.
app.get("/", (_req, res) => {
  res.json({ status: "online", bot: "whatsapp-bot-voz", autor: "EndriaCarem" });
});

app.post("/webhook", async (req, res) => {
  // Responde 200 imediatamente — a Evolution não espera processamento.
  res.sendStatus(200);
  console.log(`📥 evento recebido: ${req.body?.event}`);
  try {
    await tratarEvento(req.body);
  } catch (err) {
    console.error("❌ Erro no webhook:", err.message);
  }
});

// ─── Lógica principal ─────────────────────────────────────────────────────────

async function tratarEvento(evento) {
  if (evento?.event !== "messages.upsert") return;

  const dados = evento.data;
  const msg   = Array.isArray(dados) ? dados[0] : dados;

  // Ignora mensagens enviadas pelo próprio bot e mensagens sem conteúdo.
  if (!msg?.message || msg.key?.fromMe) return;

  const chatId = msg.key.remoteJid;

  // ── Caso 1: clique em botão de efeito ─────────────────────────────────────
  const clique =
    msg.message.buttonsResponseMessage?.selectedButtonId ||
    msg.message.templateButtonReplyMessage?.selectedId;

  if (clique?.startsWith("efeito|")) {
    await aplicarPorClique(chatId, clique);
    return;
  }

  // ── Caso 2: comando de texto ───────────────────────────────────────────────
  const texto = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    ""
  ).trim().toLowerCase();

  if (!texto.startsWith("!")) return;

  // !menu / !ajuda → exibe instruções
  if (["!menu", "!ajuda", "!help"].includes(texto)) {
    await enviarTexto(chatId, textoMenu());
    return;
  }

  // !voz / !efeito → exibe botões para escolher o efeito
  if (["!voz", "!efeito", "!efeitos"].includes(texto)) {
    const contexto = msg.message.extendedTextMessage?.contextInfo;
    if (!contexto?.quotedMessage?.audioMessage) {
      await enviarTexto(chatId, "❗ Responda a uma *mensagem de áudio* com *!voz* para usar os efeitos.");
      return;
    }
    await enviarBotoes(chatId, contexto.stanzaId, contexto.participant);
    return;
  }

  // !demonio / !robo / etc. → atalho direto (para quem preferir digitar)
  const chaveAtalho = texto.slice(1);
  if (EFEITOS[chaveAtalho]) {
    const contexto = msg.message.extendedTextMessage?.contextInfo;
    if (!contexto?.quotedMessage?.audioMessage) {
      await enviarTexto(chatId, "❗ Responda a uma *mensagem de áudio* com o comando.");
      return;
    }
    await processarAudio(chatId, chaveAtalho, contexto.stanzaId, contexto.participant);
  }
}

async function aplicarPorClique(chatId, selectedId) {
  const [, chave, audioId, autor] = selectedId.split("|");
  if (!EFEITOS[chave]) return;
  await processarAudio(chatId, chave, audioId, autor);
}

async function processarAudio(chatId, chave, audioId, autor) {
  const key = {
    remoteJid:   chatId,
    id:          audioId,
    participant: autor || undefined,
    fromMe:      false,
  };

  try {
    console.log(`🎙️  Aplicando efeito "${chave}" no chat ${chatId}...`);
    const entrada = await baixarMidia(key);
    const saida   = await aplicarEfeito(entrada, chave);
    await enviarAudio(chatId, saida);
    console.log(`✅ Efeito "${chave}" enviado com sucesso.`);
  } catch (err) {
    console.error(`❌ Falha ao aplicar "${chave}":`, err.message);
    await enviarTexto(chatId, "❌ Não consegui processar esse áudio. Tenta de novo!");
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("─────────────────────────────────────────");
  console.log("  🎙️  WhatsApp Bot de Voz — EndriaCarem  ");
  console.log("─────────────────────────────────────────");
  console.log(`  Webhook : http://localhost:${PORT}/webhook`);
  console.log(`  Evolution: ${EVOLUTION_URL}`);
  console.log(`  Instância: ${INSTANCE}`);
  console.log("─────────────────────────────────────────");
});
