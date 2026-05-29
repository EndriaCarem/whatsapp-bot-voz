import "dotenv/config";
import express from "express";
import { writeFile, mkdir } from "node:fs/promises";
import qrcode from "qrcode";
import baileys, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

import { aplicarEfeito, EFEITOS, textoMenu } from "./efeitos.js";
import {
  addXP, addAudio, addMoedas, logMsg, upsertUsuario,
} from "./db.js";
import { textoRanking, textoPerfil, textoSubiuNivel } from "./xp.js";
import {
  cmdCriarEnquete, cmdVotar, cmdResultado, cmdEncerrar,
} from "./enquetes.js";
import { textoJornal, textoStats, textoSumidos } from "./stats.js";
import {
  responderIA, resumoGrupo, fofocaGrupo, previsaoFuturo,
  compatibilidade, respostaModoLivre, isModoLivre, setModoLivre,
} from "./ia.js";

const makeWASocket = baileys.default ?? baileys;
const PORT = process.env.PORT || 3000;

// ─── Servidor Express ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use((_req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); });

app.get("/", (_req, res) => res.json({ status: "online", bot: "whatsapp-bot-voz" }));

const sseClients = new Set();
let ultimoQR  = null;
let conectado = false;

app.get("/qr/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
  if (conectado)      res.write(`data: ${JSON.stringify({ state: "open" })}\n\n`);
  else if (ultimoQR)  res.write(`data: ${JSON.stringify({ qr: ultimoQR, state: "qr" })}\n\n`);
  else                res.write(`data: ${JSON.stringify({ state: "connecting" })}\n\n`);
});

app.get("/qr", (_req, res) => {
  if (conectado) return res.json({ state: "open" });
  res.json({ qr: ultimoQR, state: ultimoQR ? "qr" : "connecting" });
});

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of sseClients) c.write(data);
}

app.listen(PORT, () => {
  console.log("─────────────────────────────────────────");
  console.log("  🎙️  WhatsApp Bot — EndriaCarem");
  console.log("─────────────────────────────────────────");
  console.log(`  Painel QR : http://localhost:${PORT}`);
  console.log("─────────────────────────────────────────");
});

// ─── Conexão Baileys ──────────────────────────────────────────────────────────

async function iniciar() {
  await mkdir("auth", { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      ultimoQR  = await qrcode.toDataURL(qr);
      conectado = false;
      broadcast({ qr: ultimoQR, state: "qr" });
      console.log("📱 QR atualizado — abra http://localhost:3000");
    }
    if (connection === "open") {
      conectado = true;
      ultimoQR  = null;
      broadcast({ state: "open" });
      console.log("✅ WhatsApp conectado!");
    }
    if (connection === "close") {
      conectado = false;
      const codigo    = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason.loggedOut;
      broadcast({ state: "close" });
      console.log("❌ Conexão fechada.", deslogado ? "Deslogado." : "Reconectando...");
      if (!deslogado) setTimeout(iniciar, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`📨 messages.upsert type=${type} count=${messages.length}`);
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try { await processarMensagem(sock, msg); }
      catch (err) { console.error("Erro:", err.message); }
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNome(msg) {
  return (
    msg.pushName ||
    msg.key.participant?.split("@")[0] ||
    msg.key.remoteJid?.split("@")[0] ||
    "Anônimo"
  );
}

function getJid(msg) {
  return msg.key.participant || msg.key.remoteJid;
}

function isGrupo(msg) {
  return msg.key.remoteJid?.endsWith("@g.us");
}

async function isAdminGrupo(sock, chatId, jid) {
  try {
    const meta = await sock.groupMetadata(chatId);
    const participante = meta.participants.find(p => p.id === jid || p.id.startsWith(jid.split(":")[0]));
    return participante?.admin === "admin" || participante?.admin === "superadmin";
  } catch {
    return false;
  }
}

// Detecta menção ao bot pelo número, pela palavra "bot" ou pelo nome "axolotl"
function mencionouBot(texto, botJid) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  const num = botJid?.split(":")[0]?.split("@")[0] || "";
  return (
    t.includes("@bot") ||
    /\bbot\b/.test(t) ||
    t.includes("axolotl") ||
    t.includes("axolot") ||
    (num && texto.includes(num))
  );
}

// ─── Processamento de mensagens ───────────────────────────────────────────────

async function processarMensagem(sock, msg) {
  console.log(`📩 msg de ${msg.key.remoteJid} fromMe=${msg.key.fromMe} tipo=${Object.keys(msg.message || {}).join(",")}`);
  if (msg.key.fromMe || !msg.message) return;

  const chatId = msg.key.remoteJid;
  const jid    = getJid(msg);
  const nome   = getNome(msg);
  const botJid = sock.user?.id;

  // Detecta tipo e texto
  const tipoMsg =
    msg.message.audioMessage                ? "audio"      :
    msg.message.imageMessage                ? "imagem"     :
    msg.message.videoMessage                ? "video"      :
    msg.message.stickerMessage              ? "sticker"    : "text";

  const texto = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption || ""
  ).trim();

  // ── Registra no log e concede XP ──────────────────────────────────────────
  logMsg(chatId, jid, nome, tipoMsg, texto || null);
  upsertUsuario(jid, nome);

  if (tipoMsg === "audio") {
    addAudio(jid, nome);
    const { subiuNivel, nivelNovo } = addXP(jid, nome, 15);
    if (subiuNivel) await sock.sendMessage(chatId, { text: textoSubiuNivel(nome, nivelNovo) });
  } else if (tipoMsg === "text" && texto) {
    const { subiuNivel, nivelNovo } = addXP(jid, nome, 5);
    if (subiuNivel) await sock.sendMessage(chatId, { text: textoSubiuNivel(nome, nivelNovo) });
  }

  // ── Comandos com ! ─────────────────────────────────────────────────────────
  if (texto.startsWith("!")) {
    await processarComando(sock, msg, chatId, jid, nome, texto.toLowerCase(), botJid);
    return;
  }

  // ── Menção direta ao bot (sem !) ───────────────────────────────────────────
  if (mencionouBot(texto, botJid)) {
    const pergunta = texto
      .replace(/@\S+/g, "")
      .replace(/\baxolotl?-?byte?\b[,]?/gi, "")
      .replace(/\bbot\b[,]?/gi, "")
      .trim();
    const resposta = await responderIA(chatId, pergunta || texto, nome);
    await sock.sendMessage(chatId, { text: resposta }, { quoted: msg });
    return;
  }

  // ── Modo livre: IA responde espontaneamente ────────────────────────────────
  console.log(`🔍 modolivre check: isGrupo=${isGrupo(msg)} modoLivre=${isModoLivre(chatId)} tipo=${tipoMsg} textoLen=${texto.length}`);
  if (isGrupo(msg) && isModoLivre(chatId) && tipoMsg === "text" && texto.length >= 2) {
    console.log(`🤖 chamando respostaModoLivre para: "${texto}"`);
    const resposta = await respostaModoLivre(chatId, nome, texto);
    console.log(`🤖 resposta: ${resposta}`);
    if (resposta) await sock.sendMessage(chatId, { text: resposta }, { quoted: msg });
  }
}

// ─── Roteador de comandos ─────────────────────────────────────────────────────

async function processarComando(sock, msg, chatId, jid, nome, texto, botJid) {
  const cmd = texto.split(" ")[0];

  // ── Efeitos de voz ────────────────────────────────────────────────────────
  if (["!menu", "!ajuda", "!help"].includes(cmd)) {
    await sock.sendMessage(chatId, { text: textoMenuCompleto() });
    return;
  }

  if (["!voz", "!efeito", "!efeitos"].includes(cmd)) {
    const ctx    = msg.message.extendedTextMessage?.contextInfo;
    const citada = ctx?.quotedMessage;
    if (!citada?.audioMessage) {
      await sock.sendMessage(chatId, { text: "❗ Responda a uma *mensagem de áudio* com *!voz*." }, { quoted: msg });
      return;
    }
    await enviarMenuEfeitos(sock, chatId, ctx.stanzaId, ctx.participant, citada, msg);
    return;
  }

  if (EFEITOS[cmd.slice(1)]) {
    const ctx    = msg.message.extendedTextMessage?.contextInfo;
    const citada = ctx?.quotedMessage;
    if (!citada?.audioMessage) {
      await sock.sendMessage(chatId, { text: "❗ Responda a uma *mensagem de áudio* com o comando." }, { quoted: msg });
      return;
    }
    await aplicarAudio(sock, chatId, cmd.slice(1), ctx.stanzaId, ctx.participant, citada, msg);
    return;
  }

  // ── XP / Gamificação ──────────────────────────────────────────────────────
  if (cmd === "!ranking" || cmd === "!top") {
    await sock.sendMessage(chatId, { text: textoRanking() });
    return;
  }

  if (cmd === "!perfil" || cmd === "!xp") {
    await sock.sendMessage(chatId, { text: textoPerfil(jid) });
    return;
  }

  // ── Enquetes ──────────────────────────────────────────────────────────────
  if (cmd === "!enquete") {
    await cmdCriarEnquete(sock, chatId, jid, texto);
    return;
  }
  if (cmd === "!votar") {
    await cmdVotar(sock, chatId, jid, nome, texto);
    return;
  }
  if (cmd === "!resultado") {
    await cmdResultado(sock, chatId);
    return;
  }
  if (cmd === "!encerrar") {
    await cmdEncerrar(sock, chatId);
    return;
  }

  // ── Estatísticas ──────────────────────────────────────────────────────────
  if (cmd === "!jornal") {
    await sock.sendMessage(chatId, { text: textoJornal(chatId) });
    return;
  }
  if (cmd === "!stats" || cmd === "!estatisticas") {
    await sock.sendMessage(chatId, { text: textoStats(chatId) });
    return;
  }
  if (cmd === "!sumidos") {
    await sock.sendMessage(chatId, { text: textoSumidos(chatId) });
    return;
  }

  // ── IA / NPC ──────────────────────────────────────────────────────────────
  if (cmd === "!resumo") {
    const tipo = texto.includes("semana") ? "semana" : "dia";
    await sock.sendMessage(chatId, { text: "⏳ Gerando resumo..." });
    const r = await resumoGrupo(chatId, tipo);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!fofoca") {
    await sock.sendMessage(chatId, { text: "🕵️ Investigando o grupo..." });
    const r = await fofocaGrupo(chatId);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!previsao" || cmd === "!futuro") {
    const alvo = texto.replace(cmd, "").trim() || nome;
    const r = await previsaoFuturo(alvo);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!compatibilidade" || cmd === "!compat") {
    const partes = texto.replace(cmd, "").trim().split(/\s+e\s+|\s*\|\s*/i);
    const n1 = partes[0]?.trim() || nome;
    const n2 = partes[1]?.trim() || "o grupo";
    const r = await compatibilidade(n1, n2);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!ia" || cmd === "!bot") {
    const pergunta = texto.replace(cmd, "").trim();
    if (!pergunta) {
      await sock.sendMessage(chatId, { text: "Me faz uma pergunta! Ex: *!ia o que você acha do grupo?*" });
      return;
    }
    const r = await responderIA(chatId, pergunta, nome);
    await sock.sendMessage(chatId, { text: r }, { quoted: msg });
    return;
  }

  // ── Modo livre (somente admins do grupo) ─────────────────────────────────
  if (cmd === "!modolivre") {
    if (!await isAdminGrupo(sock, chatId, jid)) {
      await sock.sendMessage(chatId, { text: "🔒 Só admins do grupo podem ativar o modo livre." });
      return;
    }
    setModoLivre(chatId, true);
    await sock.sendMessage(chatId, { text: "🤖 *Modo Livre ativado!*\nAgora vou participar das conversas espontaneamente. Para desativar: *!desativar*" });
    return;
  }

  if (cmd === "!desativar") {
    if (!await isAdminGrupo(sock, chatId, jid)) {
      await sock.sendMessage(chatId, { text: "🔒 Só admins do grupo podem desativar o modo livre." });
      return;
    }
    setModoLivre(chatId, false);
    await sock.sendMessage(chatId, { text: "😴 *Modo Livre desativado.*\nVou ficar quieto até ser chamado." });
    return;
  }

}

// ─── Efeitos de voz ───────────────────────────────────────────────────────────

function enviarMenuEfeitos(sock, chatId, audioId, autor, citada, quotedMsg) {
  const linhas = Object.entries(EFEITOS).map(([chave, e], i) =>
    `  ${i + 1}. *!${chave}* — ${e.nome}`
  ).join("\n");
  const texto =
    "🎙️ *Escolha um efeito respondendo este áudio com o comando:*\n\n" +
    linhas +
    "\n\n_Ex: responda o áudio com_ *!demonio*";
  return sock.sendMessage(chatId, { text: texto }, { quoted: quotedMsg });
}

async function aplicarAudio(sock, chatId, chave, audioId, autor, citada, quotedMsg) {
  const key = { remoteJid: chatId, id: audioId, participant: autor || undefined, fromMe: false };
  try {
    await sock.sendMessage(chatId, { text: `⏳ Aplicando *${EFEITOS[chave].nome}*...` });
    const entrada = await downloadMediaMessage(
      { key, message: { audioMessage: citada.audioMessage } }, "buffer", {}
    );
    const saida = await aplicarEfeito(entrada, chave);
    await sock.sendMessage(chatId, { audio: saida, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: quotedMsg });
    console.log(`🎙️ Efeito "${chave}" enviado`);
  } catch (err) {
    console.error(`❌ Falha "${chave}":`, err.message);
    await sock.sendMessage(chatId, { text: "❌ Não consegui processar esse áudio. Tenta de novo!" });
  }
}

// ─── Menu completo ────────────────────────────────────────────────────────────

function textoMenuCompleto() {
  return (
    `🤖 *Menu do Bot*\n\n` +

    `🎙️ *Efeitos de Voz*\n` +
    `  !voz — menu de efeitos (responda um áudio)\n` +
    `  !demonio !esquilo !robo !estadio !agudo !grave\n\n` +

    `🏆 *Gamificação*\n` +
    `  !ranking — top do grupo\n` +
    `  !perfil — seu XP e nível\n\n` +

    `📊 *Enquetes*\n` +
    `  !enquete Pergunta? Op1 | Op2 | Op3\n` +
    `  !votar <número>\n` +
    `  !resultado — ver votos\n` +
    `  !encerrar — encerrar enquete\n\n` +

    `📰 *Grupo*\n` +
    `  !jornal — jornal do grupo\n` +
    `  !stats — estatísticas\n` +
    `  !sumidos — quem sumiu\n\n` +

    `🤖 *IA*\n` +
    `  !ia <pergunta> — fala com o bot\n` +
    `  !resumo — resumo do dia\n` +
    `  !resumo semana — resumo da semana\n` +
    `  !fofoca — fofoca do grupo\n` +
    `  !previsao <nome> — previsão do futuro\n` +
    `  !compatibilidade <nome1> e <nome2>\n\n` +

    `🔒 *Admins do grupo*\n` +
    `  !modolivre — IA ativa em todas as msgs\n` +
    `  !desativar — desativa modo livre`
  );
}

iniciar();
