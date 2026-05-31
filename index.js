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
import { baixarMusica } from "./musica.js";
import {
  addXP, addAudio, addMoedas, getMoedas, transferirMoedas,
  bonusDiario, buscarUsuarioPorNome, getUsuarioPorJid,
  logMsg, upsertUsuario, setCargoCustom, setAreaTi, getAdminDestaque,
  checarResetMensal,
} from "./db.js";
import { textoRanking, textoPerfil, textoSubiuNivel, AREAS_TI, textoRegras } from "./xp.js";
import {
  cmdCriarEnquete, cmdVotar, cmdResultado, cmdEncerrar,
} from "./enquetes.js";
import { textoJornal, textoStats, textoSumidos, textoHoroscopo } from "./stats.js";
import {
  responderIA, resumoGrupo, fofocaGrupo, previsaoFuturo,
  compatibilidade, respostaModoLivre, isModoLivre, setModoLivre,
} from "./ia.js";

const makeWASocket = baileys.default ?? baileys;
const PORT = process.env.PORT || 3000;

// Cooldown do modo livre: guarda o timestamp da última resposta por pessoa
const cooldownModoLivre = new Map();

// Cache de nomes (número-base do jid → pushName), alimentado pelas mensagens.
// Serve pro boas-vindas: quando alguém entra, o nome às vezes ainda não
// sincronizou no groupMetadata, mas se a pessoa já mandou msg antes a gente tem.
const cacheNomes = new Map();
function chaveNome(jid) {
  return jid?.split("@")[0].split(":")[0];
}
function lembrarNome(jid, nome) {
  if (jid && nome && !/^\+?\d{6,}$/.test(nome)) cacheNomes.set(chaveNome(jid), nome);
}

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

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      processarMensagem(sock, msg).catch(err => console.error("Erro:", err.message));
    }
  });

  // Boas-vindas quando alguém entra no grupo
  sock.ev.on("group-participants.update", async ({ id: chatId, participants, action }) => {
    if (action !== "add") return;
    for (const [idx, participante] of participants.entries()) {
      try {
        const jid = typeof participante === "string" ? participante : participante.id || String(participante);

        // Aguarda 5s pra o Baileys sincronizar o perfil/nome da pessoa
        await new Promise(r => setTimeout(r, 5000));

        // Recarrega o metadata por participante: o groupMetadata pode estar
        // defasado logo após o "add", então garantimos que o recém-chegado
        // está contado. Se entrar mais de um de uma vez, somamos os restantes.
        const meta = await sock.groupMetadata(chatId);
        const jaContado = meta.participants.some(p =>
          p.id === jid ||
          p.id?.split("@")[0] === jid?.split("@")[0] ||
          p.id?.split(":")[0] === jid?.split(":")[0]
        );
        const faltam = participants.length - 1 - idx; // outros deste lote ainda não processados

        // Contagem dinâmica: lê o estado ATUAL do grupo a cada entrada, então
        // já reflete quem saiu/foi removido (não é um contador que só cresce).
        let total;
        if (typeof meta.size === "number") {
          // `meta.size` é a contagem oficial do WhatsApp e normalmente já
          // inclui o recém-chegado. Só soma os outros do mesmo lote.
          total = meta.size + faltam;
        } else {
          // Fallback: participants.length pode estar defasado logo após o "add",
          // então garantimos que o recém-chegado entra na conta.
          total = meta.participants.length + (jaContado ? 0 : 1) + faltam;
        }

        // Tenta pegar o nome de várias fontes
        const p = meta.participants.find(p =>
          p.id === jid ||
          p.id?.split("@")[0] === jid?.split("@")[0] ||
          p.id?.split(":")[0] === jid?.split(":")[0]
        );

        const ehNumero = (n) => !n || /^\+?\d{6,}$/.test(n);

        // 1) metadata do grupo  2) cache de nomes (msgs anteriores)  3) banco
        let nome = p?.notify || p?.name || p?.pushName;
        if (ehNumero(nome)) nome = cacheNomes.get(chaveNome(jid)) || nome;
        if (ehNumero(nome)) {
          const uBanco = getUsuarioPorJid(chatId, jid);
          if (uBanco?.nome && !ehNumero(uBanco.nome)) nome = uBanco.nome;
        }

        // 4) tenta o store de contatos do Baileys
        if (ehNumero(nome)) {
          try {
            const c = sock.store?.contacts?.[jid] || sock.contacts?.[jid];
            nome = c?.notify || c?.name || c?.verifiedName || nome;
          } catch { /* ignora */ }
        }

        // Último recurso: nome genérico amigável (nunca o ID gigante do @lid)
        if (ehNumero(nome)) nome = "novo(a) membro";

        // Registra a entrada agora — assim `entrou_em` reflete a data real
        // de entrada e a contagem de dias no grupo passa a funcionar.
        // Só grava o nome se for um nome de verdade (não o placeholder genérico).
        if (nome !== "novo(a) membro") upsertUsuario(chatId, jid, nome);

        await sock.sendMessage(chatId, { text: textoBemVindo(nome, total) });
        console.log(`👋 Boas-vindas enviado pra ${nome} (${jid})`);
      } catch (err) {
        console.error("Erro boas-vindas:", err.message);
      }
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

// Conjunto de jids (sem sufixo) que são admins do grupo, segundo o WhatsApp.
// Usado pra separar admins de membros no ranking.
async function getAdminsGrupo(sock, chatId) {
  try {
    const meta = await sock.groupMetadata(chatId);
    const adminsRaw = meta.participants.filter(
      p => p.admin === "admin" || p.admin === "superadmin"
    );
    return new Set(adminsRaw.map(p => p.id.split("@")[0].split(":")[0]));
  } catch (err) {
    console.error("Erro ao buscar admins do grupo:", err.message);
    return new Set();
  }
}

// Detecta chamada direta ao bot.
// Só ativa quando o nome/bot aparecer no INÍCIO da frase ou com vírgula/ponto,
// indicando que a pessoa está falando COM o bot, não SOBRE ele.
// Ex: "bot, o que você acha?" → ativa
//     "e o nome axolotl"      → NÃO ativa (falando sobre, não para)
function mencionouBot(texto, botJid) {
  if (!texto) return false;
  const t = texto.toLowerCase().trim();
  const num = botJid?.split(":")[0]?.split("@")[0] || "";
  return (
    /^bot[,!?:\s]/.test(t) ||
    /^axolotl[- ]?byte?[,!?:\s]/.test(t) ||
    /^axolotl[,!?:\s]/.test(t) ||
    t.startsWith("@bot") ||
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

  // Desembrulha a mensagem real: o WhatsApp aninha o conteúdo dentro de
  // ephemeralMessage (mensagens temporárias), viewOnce (visualização única) etc.
  // Sem isso, áudio/texto não eram detectados e a pessoa não ganhava XP.
  // Normaliza msg.message pro conteúdo real, pra que comandos/menções/efeitos
  // (que leem msg.message adiante) também funcionem com mensagens embrulhadas.
  msg.message =
    msg.message.ephemeralMessage?.message    ||
    msg.message.viewOnceMessage?.message     ||
    msg.message.viewOnceMessageV2?.message   ||
    msg.message.viewOnceMessageV2Extension?.message ||
    msg.message.documentWithCaptionMessage?.message ||
    msg.message;

  // Detecta tipo e texto
  const tipoMsg =
    (msg.message.audioMessage || msg.message.pttMessage) ? "audio"   :
    msg.message.imageMessage                             ? "imagem"  :
    msg.message.videoMessage                             ? "video"   :
    msg.message.stickerMessage                           ? "sticker" : "text";

  const texto = (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption || ""
  ).trim();

  // ── Temporada mensal: zera o ranking na virada do mês ─────────────────────
  if (isGrupo(msg)) {
    const mesAnterior = checarResetMensal(chatId);
    if (mesAnterior) {
      await sock.sendMessage(chatId, {
        text: "🏁 *NOVA TEMPORADA!* 🏁\n\n" +
              `O ranking de *${mesAnterior}* foi encerrado e o XP do mês de todos foi zerado.\n` +
              "A corrida pelo topo recomeçou — bora! 🚀\n\n" +
              "_Seu cargo, nível, senioridade, moedas e tempo de grupo foram mantidos._",
      });
    }
  }

  // ── Registra no log e concede XP ──────────────────────────────────────────
  lembrarNome(jid, nome);
  logMsg(chatId, jid, nome, tipoMsg, texto || null);
  upsertUsuario(chatId, jid, nome);

  if (tipoMsg === "audio") {
    addAudio(chatId, jid, nome);
    addMoedas(chatId, jid, 3); // áudio vale mais
    const { subiuNivel, nivelNovo } = addXP(chatId, jid, nome, 15);
    if (subiuNivel) await sock.sendMessage(chatId, { text: textoSubiuNivel(chatId, jid, nome, nivelNovo) });
  } else if (tipoMsg === "text" && texto) {
    addMoedas(chatId, jid, 1); // 1 moeda por mensagem
    const { subiuNivel, nivelNovo } = addXP(chatId, jid, nome, 5);
    if (subiuNivel) await sock.sendMessage(chatId, { text: textoSubiuNivel(chatId, jid, nome, nivelNovo) });
  }

  // ── Comandos com ! ─────────────────────────────────────────────────────────
  if (texto.startsWith("!")) {
    const cmd = texto.split(" ")[0].toLowerCase();
    const CMDS_IA = ["!ia", "!bot", "!resumo", "!fofoca", "!previsao", "!compatibilidade", "!jornal", "!musica", "!music", "!play"];
    if (CMDS_IA.includes(cmd)) {
      // Comandos lentos (IA): dispara sem bloquear outros comandos
      processarComando(sock, msg, chatId, jid, nome, texto.toLowerCase(), botJid)
        .catch(err => console.error("Erro cmd IA:", err.message));
    } else {
      // Comandos rápidos: responde instantaneamente
      await processarComando(sock, msg, chatId, jid, nome, texto.toLowerCase(), botJid);
    }
    return;
  }

  // ── Menção direta ao bot (sem !) ───────────────────────────────────────────
  if (mencionouBot(texto, botJid)) {
    const pergunta = texto
      .replace(/@\S+/g, "")
      .replace(/\baxolotl?-?byte?\b[,]?/gi, "")
      .replace(/\bbot\b[,]?/gi, "")
      .trim();
    // Dispara sem bloquear
    ;(async () => {
      await sock.sendPresenceUpdate("composing", chatId);
      const resposta = await responderIA(chatId, pergunta || texto, nome);
      await sock.sendPresenceUpdate("paused", chatId);
      await sock.sendMessage(chatId, { text: resposta }, { quoted: msg });
    })().catch(err => console.error("Erro menção:", err.message));
    return;
  }

  // ── Modo livre: IA responde espontaneamente ────────────────────────────────
  if (isGrupo(msg) && isModoLivre(chatId) && tipoMsg === "text" && texto.length >= 2) {
    const agora = Date.now();
    const chave = `${chatId}:${jid}`;
    const ultimo = cooldownModoLivre.get(chave) || 0;
    if (agora - ultimo < 20_000) return;
    cooldownModoLivre.set(chave, agora);
    // Dispara sem bloquear
    ;(async () => {
      await sock.sendPresenceUpdate("composing", chatId);
      const resposta = await respostaModoLivre(chatId, nome, texto);
      await sock.sendPresenceUpdate("paused", chatId);
      if (resposta) await sock.sendMessage(chatId, { text: resposta }, { quoted: msg });
    })().catch(err => console.error("Erro modo livre:", err.message));
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
    const admins = await getAdminsGrupo(sock, chatId);
    await sock.sendMessage(chatId, { text: textoRanking(chatId, admins) });
    return;
  }

  if (cmd === "!perfil" || cmd === "!xp") {
    await sock.sendMessage(chatId, { text: textoPerfil(chatId, jid) });
    return;
  }

  if (cmd === "!moedas" || cmd === "!saldo") {
    const u = getUsuarioPorJid(chatId, jid);
    const saldo = u?.moedas ?? 0;
    const msgs  = u?.msgs ?? 0;
    await sock.sendMessage(chatId, {
      text: `💰 *${nome}*, você tem *${saldo} moedas*.\n\n` +
            `📊 Suas mensagens no grupo: *${msgs}*\n\n` +
            `⚡ *Como ganhar XP:*\n` +
            `• +5 XP por mensagem de texto\n` +
            `• +15 XP por áudio\n` +
            `• XP sobe seu nível e seu cargo (use *!perfil*)\n\n` +
            `💰 *Como ganhar moedas:*\n` +
            `• +1 moeda por mensagem\n` +
            `• +3 moedas por áudio\n` +
            `• *!daily* — bônus diário (resgate 1x/dia)\n\n` +
            `*!transferir @pessoa 50* — enviar moedas`
    }, { quoted: msg });
    return;
  }

  if (cmd === "!daily") {
    const { getDiasNoGrupo } = await import("./db.js");
    const dias  = getDiasNoGrupo(chatId, jid);
    const bonus = bonusDiario(chatId, jid, dias);
    if (bonus === 0) {
      await sock.sendMessage(chatId, { text: `⏳ *${nome}*, você já resgatou o bônus de hoje!\nVolte amanhã. 😄` }, { quoted: msg });
    } else {
      const saldo = getMoedas(chatId, jid);
      await sock.sendMessage(chatId, {
        text: `🎁 Bônus diário resgatado!\n\n+*${bonus} moedas* (${dias} dias no grupo)\n💰 Saldo: *${saldo} moedas*`
      }, { quoted: msg });
    }
    return;
  }

  if (cmd === "!transferir" || cmd === "!pix") {
    const partes    = texto.replace(cmd, "").trim().split(" ");
    const qtd       = parseInt(partes[partes.length - 1]);
    const alvoTexto = partes.slice(0, -1).join(" ").replace(/@/g, "").trim();

    if (!alvoTexto || isNaN(qtd) || qtd <= 0) {
      await sock.sendMessage(chatId, { text: "❗ Use: *!transferir @nome 50*" }, { quoted: msg });
      return;
    }

    // Busca o usuário de origem pelo jid real do banco
    const uOrigem = getUsuarioPorJid(chatId, jid);
    if (!uOrigem) {
      await sock.sendMessage(chatId, { text: "❗ Você ainda não tem perfil. Manda uma mensagem primeiro!" }, { quoted: msg });
      return;
    }

    // Busca o destino por menção ou nome
    const mencionado = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const uDestino   = mencionado
      ? getUsuarioPorJid(chatId, mencionado)
      : buscarUsuarioPorNome(chatId, alvoTexto);

    if (!uDestino) {
      await sock.sendMessage(chatId, { text: `❗ Não encontrei ninguém com esse nome no grupo.` }, { quoted: msg });
      return;
    }
    if (uOrigem.jid === uDestino.jid) {
      await sock.sendMessage(chatId, { text: "😅 Você não pode transferir pra si mesmo." }, { quoted: msg });
      return;
    }
    if (uOrigem.moedas < qtd) {
      await sock.sendMessage(chatId, {
        text: `❌ Saldo insuficiente!\nVocê tem *${uOrigem.moedas} moedas* e tentou enviar *${qtd}*.`
      }, { quoted: msg });
      return;
    }

    // Faz a transferência usando os jids reais do banco
    const resultado = transferirMoedas(chatId, uOrigem.jid, uDestino.jid, qtd);
    if (!resultado.ok) {
      await sock.sendMessage(chatId, { text: `❌ Erro na transferência. Tenta de novo!` }, { quoted: msg });
      return;
    }

    await sock.sendMessage(chatId, {
      text: `✅ Transferência realizada!\n\n` +
            `💸 *${uOrigem.nome}* → *${uDestino.nome}*\n` +
            `💰 Valor: *${qtd} moedas*\n` +
            `📊 Seu saldo restante: *${resultado.saldo} moedas*`
    });
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
    await sock.sendMessage(chatId, { text: "🗞️ Fechando a edição de hoje..." });
    const jornal = await textoJornal(chatId);
    await sock.sendMessage(chatId, { text: jornal });
    return;
  }

  if (cmd === "!signo" || cmd === "!horoscopo") {
    await sock.sendMessage(chatId, { text: textoHoroscopo() }, { quoted: msg });
    return;
  }

  if (cmd === "!musica" || cmd === "!music" || cmd === "!play") {
    const consulta = texto.split(" ").slice(1).join(" ").trim();
    if (!consulta) {
      await sock.sendMessage(chatId, {
        text: "🎵 Use *!musica <nome ou link>*\nEx: *!musica imagine dragons believer*",
      }, { quoted: msg });
      return;
    }
    await sock.sendMessage(chatId, { text: `🎶 Procurando *${consulta}*... (pode levar alguns segundos)` }, { quoted: msg });
    try {
      const { buffer, titulo } = await baixarMusica(consulta);
      await sock.sendMessage(chatId, {
        audio: buffer,
        mimetype: "audio/mpeg",
        fileName: `${titulo}.mp3`,
        ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(chatId, { text: `🎵 *${titulo}*` });
      console.log(`🎵 Música enviada: ${titulo}`);
    } catch (err) {
      console.error("❌ Falha música:", err.message);
      await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: msg });
    }
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
    const alvo = texto.replace(cmd, "").replace(/[<>@]/g, "").trim() || nome;
    const r = await previsaoFuturo(alvo, chatId);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!compatibilidade" || cmd === "!compat") {
    // Limpa <> (placeholders que a pessoa às vezes digita) e @ de menção.
    const limpar = (s) => (s || "").replace(/[<>@]/g, "").trim();
    const partes = texto.replace(cmd, "").trim().split(/\s+e\s+|\s*\|\s*/i);
    const n1 = limpar(partes[0]) || nome;
    const n2 = limpar(partes[1]) || "o grupo";
    if (!partes[1]) {
      await sock.sendMessage(chatId, {
        text: "❤️ Use *!compatibilidade <nome1> e <nome2>*\nEx: *!compatibilidade Endy e Guilherme*",
      }, { quoted: msg });
      return;
    }
    const r = await compatibilidade(n1, n2, chatId);
    await sock.sendMessage(chatId, { text: r });
    return;
  }

  if (cmd === "!ia" || cmd === "!bot") {
    const pergunta = texto.replace(cmd, "").trim();
    if (!pergunta) {
      await sock.sendMessage(chatId, { text: "Me faz uma pergunta! Ex: *!ia o que você acha do grupo?*" });
      return;
    }
    await sock.sendPresenceUpdate("composing", chatId);
    const r = await responderIA(chatId, pergunta, nome);
    await sock.sendPresenceUpdate("paused", chatId);
    await sock.sendMessage(chatId, { text: r }, { quoted: msg });
    return;
  }

  // ── Modo livre (somente admins do grupo) ─────────────────────────────────
  if (cmd === "!regras" || cmd === "!cargos") {
    await sock.sendMessage(chatId, { text: textoRegras() });
    return;
  }

  if (cmd === "!destaque") {
    const d = getAdminDestaque(chatId);
    if (!d) {
      await sock.sendMessage(chatId, { text: "📊 Ainda sem dados suficientes pra eleger o destaque da semana." });
      return;
    }
    await sock.sendMessage(chatId, {
      text: `🌟 *Admin Destaque da Semana*\n\n👑 *${d.nome}*\n📨 ${d.total} mensagens nos últimos 7 dias\n\nObrigado por cuidar do grupo! 💪`
    });
    return;
  }

  // !cargo [nome do cargo] — admins definem seu cargo personalizado
  // Ex: !cargo Dev Backend  →  aparece como [Dev Backend] no ranking e perfil
  if (cmd === "!cargo") {
    if (!await isAdminGrupo(sock, chatId, jid)) {
      await sock.sendMessage(chatId, { text: "🔒 Só admins do grupo podem definir cargos personalizados." }, { quoted: msg });
      return;
    }
    const novoCargo = texto.replace("!cargo", "").trim();
    if (!novoCargo) {
      const lista = AREAS_TI.join(", ");
      await sock.sendMessage(chatId, { text: `✏️ Use: *!cargo <cargo>*\nEx: !cargo Dev Backend\n\nSugestões: ${lista}` });
      return;
    }
    if (novoCargo.length > 30) {
      await sock.sendMessage(chatId, { text: "❗ Cargo muito longo. Máximo 30 caracteres." });
      return;
    }
    setCargoCustom(chatId, jid, novoCargo);
    await sock.sendMessage(chatId, { text: `✅ Cargo definido: *[${novoCargo}]*` }, { quoted: msg });
    return;
  }

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
  // Agrupa por categoria pra ficar legível com muitos efeitos.
  const grupos = {
    "🎚️ Clássicos": ["demonio", "esquilo", "robo", "estadio", "agudo", "grave"],
    "👴 Família":   ["vovo", "vovoh", "bebe"],
    "🎭 Personagens": ["gigante", "alien", "fantasma", "coral", "bebado"],
    "📡 Ambientes":  ["telefone", "radio"],
  };
  const blocos = Object.entries(grupos).map(([titulo, chaves]) => {
    const linhas = chaves
      .filter(c => EFEITOS[c])
      .map(c => `  • *!${c}* — ${EFEITOS[c].nome}`)
      .join("\n");
    return `${titulo}\n${linhas}`;
  }).join("\n\n");

  const texto =
    "🎙️ *Escolha um efeito respondendo este áudio com o comando:*\n\n" +
    blocos +
    "\n\n_Ex: responda o áudio com_ *!vovo*";
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

// ─── Boas-vindas ─────────────────────────────────────────────────────────────

function textoBemVindo(nome, totalMembros) {
  return (
    `👋 Seja bem-vindo(a), *${nome}*! 🎉\n\n` +
    `Você é o membro *#${totalMembros}* da galera do TI!\n\n` +
    `Aqui você começa como *🆕 Novato* — mas não por muito tempo:\n\n` +
    `🆕 *Novato* → dias 0 a 3\n` +
    `🎓 *Estagiário* → a partir do 4º dia\n` +
    `💻 *Junior* → a partir do 9º dia\n` +
    `⚙️ *Pleno* → 2 semanas + participação\n` +
    `🚀 *Sênior* → 1 mês + participação\n` +
    `🏗️ *Tech Lead*, 🧠 *Arquiteto*, 👑 *CTO do Grupo*...\n\n` +
    `Quanto mais você participar, mais rápido sobe! ⚡\n` +
    `• Mensagem de texto = *+5 XP*\n` +
    `• Áudio = *+15 XP*\n\n` +
    `Use *!menu* pra ver todos os comandos e *!regras* pra entender o sistema de cargos.\n\n` +
    `Bora participar? 🚀`
  );
}

// ─── Menu completo ────────────────────────────────────────────────────────────

function textoMenuCompleto() {
  return (
    `🤖 *Menu do Bot*\n\n` +

    `🎙️ *Efeitos de Voz* (responda um áudio com o comando)\n` +
    `  🎚️ *!demonio* *!esquilo* *!robo* *!estadio* *!agudo* *!grave*\n` +
    `  👴 *!vovo* *!vovoh* *!bebe*\n` +
    `  🎭 *!gigante* *!alien* *!fantasma* *!coral* *!bebado*\n` +
    `  📡 *!telefone* *!radio*\n` +
    `  _Ou responda com *!voz* pra ver a lista completa_\n\n` +

    `🏆 *Gamificação*\n` +
    `  !ranking — top do grupo\n` +
    `  !perfil — seu XP, cargo e moedas\n` +
    `  !moedas — ver seu saldo de moedas\n` +
    `  !daily — bônus diário de moedas 🎁\n` +
    `  !transferir @pessoa 50 — enviar moedas\n` +
    `  !regras — sistema de cargos e XP\n` +
    `  !destaque — admin destaque da semana 🌟\n` +
    `  !cargo <nome> — cargo personalizado (admins)\n\n` +

    `📊 *Enquetes*\n` +
    `  !enquete Pergunta? Op1 | Op2 | Op3\n` +
    `  !votar <número>\n` +
    `  !resultado — ver votos\n` +
    `  !encerrar — encerrar enquete\n\n` +

    `📰 *Grupo*\n` +
    `  !jornal — jornal completo do grupo 🗞️\n` +
    `  !signo — horóscopo dev do dia (12 signos) 🔮\n` +
    `  !musica <nome ou link> — baixa a música 🎵\n` +
    `  !stats — estatísticas\n` +
    `  !sumidos — quem sumiu\n\n` +

    `🤖 *IA (Axolotl-Byte)*\n` +
    `  !ia <pergunta> — fala direto com o bot\n` +
    `  !bot <pergunta> — mesma coisa\n` +
    `  bot, <pergunta> — chama pelo nome (sem !)\n` +
    `  axolotl, <pergunta> — também funciona\n` +
    `  !resumo — resumo do dia\n` +
    `  !resumo semana — resumo da semana\n` +
    `  !fofoca — resenha das últimas horas do grupo\n` +
    `  !previsao <nome> — previsão do futuro\n` +
    `  !compatibilidade <nome1> e <nome2>\n\n` +

    `🔒 *Admins do grupo*\n` +
    `  !modolivre — IA ativa em todas as msgs\n` +
    `  !desativar — desativa modo livre`
  );
}

iniciar();
