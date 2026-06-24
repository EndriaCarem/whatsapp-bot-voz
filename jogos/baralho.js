// Jogo da Guerra: cada jogador vira uma carta, maior ganha todas
import {
  criarJogo, getJogoAtivo, getJogadores, entrarJogo,
  getMao, setMao, getEstado, setEstado, setStatus, encerrarJogo,
} from "./db_jogos.js";
import { gerarCartaBaralho, baralhoCompleto, labelCarta, delay } from "./cartas.js";

const MAX_JOGADORES = 8;
const TEMPO_INSCRICAO_MS = 300_000; // 5 min
const ORDEM_VALOR = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function forca(valor) { return ORDEM_VALOR.indexOf(valor); }

async function enviarCarta(sock, chatId, carta) {
  const img = await gerarCartaBaralho(carta.naipe, carta.valor);
  await sock.sendMessage(chatId, { sticker: img });
  await delay(500);
}

async function msg(sock, chatId, texto) {
  await sock.sendMessage(chatId, { text: texto });
  await delay(400);
}

// ── Iniciar ───────────────────────────────────────────────────────────────────
export async function guerraIniciar(sock, chatId, jid, nome) {
  const ativo = getJogoAtivo(chatId);
  if (ativo) {
    await msg(sock, chatId, `⚠️ Já tem um jogo de *${ativo.tipo.toUpperCase()}* ativo! Use *!cancelar* para encerrar.`);
    return;
  }
  const jogoId = criarJogo(chatId, "guerra");
  entrarJogo(jogoId, jid, nome);
  await msg(sock, chatId,
    `⚔️ *Guerra iniciado por ${nome}!*\n\n` +
    `Digite *!entrar* para participar.\n` +
    `Máximo ${MAX_JOGADORES} jogadores • ⏳ 5 minutos para entrar\n` +
    `Ou use *!comecar* para começar agora.`
  );
  setTimeout(() => {
    const jogo = getJogoAtivo(chatId);
    if (jogo?.id === jogoId && jogo.status === "aguardando") guerraComecou(sock, chatId);
  }, TEMPO_INSCRICAO_MS);
}

export async function guerraEntrar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "guerra" || jogo.status !== "aguardando") return;
  if (getJogadores(jogo.id).length >= MAX_JOGADORES) {
    await msg(sock, chatId, "⚠️ Jogo cheio!");
    return;
  }
  const entrou = entrarJogo(jogo.id, jid, nome);
  if (!entrou) { await msg(sock, chatId, `${nome}, você já está no jogo!`); return; }
  const total = getJogadores(jogo.id).length;
  await msg(sock, chatId, `✅ *${nome}* entrou na Guerra! (${total} jogador${total > 1 ? "es" : ""})`);
}

export async function guerraComecou(sock, chatId) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "guerra" || jogo.status !== "aguardando") return;

  const jogadores = getJogadores(jogo.id);
  if (jogadores.length < 2) {
    await msg(sock, chatId,
      `⚠️ Precisa de pelo menos 2 jogadores!\n` +
      `Já tem *${jogadores.length}* inscrito. Aguardando mais pessoas usarem *!entrar*.`
    );
    return; // NÃO encerra
  }

  setStatus(jogo.id, "rodando");
  const baralho = baralhoCompleto();

  // Distribui cartas igualmente
  const porJogador = Math.floor(baralho.length / jogadores.length);
  let idx = 0;
  for (const j of jogadores) {
    setMao(jogo.id, j.jid, baralho.slice(idx, idx + porJogador));
    idx += porJogador;
  }

  const estado = { rodada: 1, pilhasExtras: {} };
  setEstado(jogo.id, estado);

  await msg(sock, chatId,
    `⚔️ *Guerra começou!* ${jogadores.length} jogadores\n` +
    `Cada um recebeu *${porJogador} cartas*\n\n` +
    `Use *!virar* para revelar sua carta da rodada.\n` +
    `Maior carta ganha todas! A > K > Q > J > 10...`
  );

  await novaRodadaGuerra(sock, chatId, jogo.id);
}

async function novaRodadaGuerra(sock, chatId, jogoId) {
  const estado = getEstado(jogoId);
  const jogadores = getJogadores(jogoId);

  // Remove jogadores sem cartas
  const ativos = jogadores.filter(j => getMao(jogoId, j.jid).length > 0);
  if (ativos.length <= 1) {
    const vencedor = ativos[0];
    await msg(sock, chatId,
      `🏆 *FIM DE JOGO!*\n\n` +
      `👑 *${vencedor ? vencedor.nome : "Ninguém"}* venceu a Guerra!\n` +
      `Rodadas jogadas: ${estado.rodada - 1}`
    );
    encerrarJogo(chatId);
    return;
  }

  // Reseta jogadas da rodada
  estado.jogadasRodada = {};
  estado.aguardando = ativos.map(j => j.jid);
  setEstado(jogoId, estado);

  await msg(sock, chatId,
    `⚔️ *Rodada ${estado.rodada}*\n` +
    `${ativos.map(j => `${j.nome}: ${getMao(jogoId, j.jid).length} cartas`).join(" | ")}\n\n` +
    `Todos usem *!virar* para revelar!`
  );
}

export async function guerraVirar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "guerra" || jogo.status !== "rodando") return;

  const estado = getEstado(jogo.id);
  if (!estado.aguardando?.includes(jid)) return;

  const mao = getMao(jogo.id, jid);
  if (mao.length === 0) return;

  const carta = mao.splice(0, 1)[0];
  setMao(jogo.id, jid, mao);

  estado.jogadasRodada[jid] = { nome, carta };
  estado.aguardando = estado.aguardando.filter(j => j !== jid);
  setEstado(jogo.id, estado);

  await msg(sock, chatId, `🃏 *${nome}* virou: *${labelCarta(carta)}*`);
  await enviarCarta(sock, chatId, carta);

  // Todos viraram?
  if (estado.aguardando.length === 0) {
    await resolverRodada(sock, chatId, jogo.id);
  } else {
    const faltam = estado.aguardando.length;
    await msg(sock, chatId, `⏳ Aguardando ${faltam} jogador${faltam > 1 ? "es" : ""}...`);
  }
}

async function resolverRodada(sock, chatId, jogoId) {
  const estado = getEstado(jogoId);
  const jogadas = Object.entries(estado.jogadasRodada);

  // Encontra maior carta
  let melhor = null, melhorForca = -1, empate = false;
  for (const [, { nome, carta }] of jogadas) {
    const f = forca(carta.valor);
    if (f > melhorForca) { melhor = { nome, carta }; melhorForca = f; empate = false; }
    else if (f === melhorForca) empate = true;
  }

  if (empate) {
    await msg(sock, chatId, `🤝 *Empate!* Rodada nula — cartas descartadas.`);
  } else {
    const vencedorJid = Object.keys(estado.jogadasRodada).find(
      jid => forca(estado.jogadasRodada[jid].carta.valor) === melhorForca
    );
    const todasCartas = jogadas.map(([, { carta }]) => carta);
    const maoVencedor = getMao(jogoId, vencedorJid);
    // Adiciona cartas ganhas no final da mão
    setMao(jogoId, vencedorJid, [...maoVencedor, ...todasCartas]);
    await msg(sock, chatId, `🏅 *${melhor.nome}* venceu a rodada com *${labelCarta(melhor.carta)}* e ganhou ${todasCartas.length} cartas!`);
  }

  estado.rodada++;
  setEstado(jogoId, estado);
  await delay(1500);
  await novaRodadaGuerra(sock, chatId, jogoId);
}
