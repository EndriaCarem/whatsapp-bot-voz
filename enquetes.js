import {
  criarEnquete, getEnqueteAtiva, votar,
  getResultados, encerrarEnquete,
} from "./db.js";

// !enquete Qual a melhor linguagem? JavaScript | Python | Rust
export function parseCriarEnquete(texto) {
  // formato: !enquete Pergunta? Opção1 | Opção2 | Opção3
  const corpo = texto.replace(/^!enquete\s*/i, "").trim();
  const partes = corpo.split("|").map(s => s.trim()).filter(Boolean);
  if (partes.length < 3) return null; // pergunta + mínimo 2 opções
  return { pergunta: partes[0], opcoes: partes.slice(1) };
}

export async function cmdCriarEnquete(sock, chatId, jid, texto) {
  const existente = getEnqueteAtiva(chatId);
  if (existente) {
    return sock.sendMessage(chatId, {
      text: "⚠️ Já há uma enquete ativa! Use *!encerrar* antes de criar outra.",
    });
  }
  const parsed = parseCriarEnquete(texto);
  if (!parsed) {
    return sock.sendMessage(chatId, {
      text: "❗ Formato: *!enquete Pergunta? Opção1 | Opção2 | Opção3*",
    });
  }
  const id = criarEnquete(chatId, jid, parsed.pergunta, parsed.opcoes);
  const linhas = parsed.opcoes.map((o, i) => `  ${i + 1}. ${o}`).join("\n");
  return sock.sendMessage(chatId, {
    text: `📊 *Nova Enquete!*\n\n*${parsed.pergunta}*\n\n${linhas}\n\n_Vote com_ *!votar <número>*`,
  });
}

export async function cmdVotar(sock, chatId, jid, nome, texto) {
  const enquete = getEnqueteAtiva(chatId);
  if (!enquete) {
    return sock.sendMessage(chatId, { text: "❓ Nenhuma enquete ativa no momento." });
  }
  const opcoes = JSON.parse(enquete.opcoes);
  const num = parseInt(texto.replace(/^!votar\s*/i, "").trim());
  if (isNaN(num) || num < 1 || num > opcoes.length) {
    return sock.sendMessage(chatId, {
      text: `❗ Vote com um número de 1 a ${opcoes.length}.`,
    });
  }
  const jaVotou = votar(enquete.id, jid, num - 1);
  return sock.sendMessage(chatId, {
    text: jaVotou
      ? `✅ *${nome}* votou em: *${opcoes[num - 1]}*`
      : `🔄 *${nome}* trocou o voto para: *${opcoes[num - 1]}*`,
  });
}

export async function cmdResultado(sock, chatId) {
  const enquete = getEnqueteAtiva(chatId);
  if (!enquete) {
    return sock.sendMessage(chatId, { text: "❓ Nenhuma enquete ativa no momento." });
  }
  return sock.sendMessage(chatId, { text: textoResultado(enquete) });
}

export async function cmdEncerrar(sock, chatId) {
  const enquete = getEnqueteAtiva(chatId);
  if (!enquete) {
    return sock.sendMessage(chatId, { text: "❓ Nenhuma enquete ativa." });
  }
  encerrarEnquete(enquete.id);
  return sock.sendMessage(chatId, {
    text: "🔒 Enquete encerrada!\n\n" + textoResultado(enquete),
  });
}

function textoResultado(enquete) {
  const opcoes = JSON.parse(enquete.opcoes);
  const resultados = getResultados(enquete.id);
  const total = resultados.reduce((s, r) => s + r.total, 0);
  const linhas = opcoes.map((o, i) => {
    const r = resultados.find(x => x.opcao === i);
    const votos = r ? r.total : 0;
    const pct = total ? Math.round((votos / total) * 100) : 0;
    const barra = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    return `${i + 1}. *${o}*\n   ${barra} ${pct}% (${votos} voto${votos !== 1 ? "s" : ""})`;
  });
  return `📊 *${enquete.pergunta}*\n\n${linhas.join("\n\n")}\n\n_Total: ${total} voto${total !== 1 ? "s" : ""}_`;
}
