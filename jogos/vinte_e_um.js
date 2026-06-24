import {
  criarJogo, getJogoAtivo, getJogadores, entrarJogo,
  getMao, setMao, getEstado, setEstado, setStatus, encerrarJogo,
} from "./db_jogos.js";
import { gerarCartaBaralho, baralhoCompleto, somaBlackjack, labelCarta, delay } from "./cartas.js";

const MAX_JOGADORES = 8;
const TEMPO_INSCRICAO_MS = 300_000; // 5 min

async function enviarCarta(sock, chatId, carta) {
  const img = await gerarCartaBaralho(carta.naipe, carta.valor);
  await sock.sendMessage(chatId, { sticker: img });
  await delay(600);
}

async function msg(sock, chatId, texto) {
  await sock.sendMessage(chatId, { text: texto });
  await delay(400);
}

async function enviarPV(sock, jid, texto) {
  console.log(`📤 Tentando PV para: ${jid}`);
  try {
    await sock.sendMessage(jid, { text: texto });
    console.log(`✅ PV enviado para ${jid}`);
    return true;
  } catch (e) {
    console.log(`❌ PV falhou para ${jid}: ${e.message}`);
    return false;
  }
}

// ── Iniciar ───────────────────────────────────────────────────────────────────
export async function vjIniciar(sock, chatId, jid, nome) {
  const ativo = getJogoAtivo(chatId);
  if (ativo) {
    await msg(sock, chatId, `⚠️ Já tem um jogo de *${ativo.tipo.toUpperCase()}* ativo! Use *!cancelar* para encerrar.`);
    return;
  }
  const jogoId = criarJogo(chatId, "21");
  entrarJogo(jogoId, jid, nome);
  await msg(sock, chatId,
    `🃏 *21 / Blackjack iniciado por ${nome}!*\n\n` +
    `Digite *!entrar* para participar.\n` +
    `Máximo ${MAX_JOGADORES} jogadores • ⏳ 5 minutos para entrar\n` +
    `Ou use *!comecar* para começar agora.`
  );
  setTimeout(() => {
    const jogo = getJogoAtivo(chatId);
    if (jogo?.id === jogoId && jogo.status === "aguardando") vjComecou(sock, chatId);
  }, TEMPO_INSCRICAO_MS);
}

export async function vjEntrar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "21" || jogo.status !== "aguardando") return;
  if (getJogadores(jogo.id).length >= MAX_JOGADORES) {
    await msg(sock, chatId, "⚠️ Jogo cheio!");
    return;
  }
  const entrou = entrarJogo(jogo.id, jid, nome);
  if (!entrou) { await msg(sock, chatId, `${nome}, você já está no jogo!`); return; }
  const total = getJogadores(jogo.id).length;
  await msg(sock, chatId, `✅ *${nome}* entrou no 21! (${total} jogador${total > 1 ? "es" : ""})`);
}

export async function vjComecou(sock, chatId) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "21" || jogo.status !== "aguardando") return;

  const jogadores = getJogadores(jogo.id);
  if (jogadores.length < 1) {
    await msg(sock, chatId, "⚠️ Nenhum jogador inscrito ainda! Use *!entrar* primeiro.");
    return;
  }

  setStatus(jogo.id, "rodando");
  const baralho = baralhoCompleto();
  let idx = 0;

  // Distribui 2 cartas pra cada + 2 pro dealer
  for (const j of jogadores) {
    setMao(jogo.id, j.jid, baralho.slice(idx, idx + 2));
    idx += 2;
  }
  const dealer = baralho.slice(idx, idx + 2);
  idx += 2;

  const estado = { dealer, monte: baralho.slice(idx), vez: 0, ordem: jogadores.map(j => j.jid), parados: [] };
  setEstado(jogo.id, estado);

  await msg(sock, chatId, `🎰 *21 começou!* Enviando suas cartas no privado... 📤`);

  // Envia cartas no PV de cada jogador
  for (const j of jogadores) {
    const mao = getMao(jogo.id, j.jid);
    const soma = somaBlackjack(mao);
    const pvTexto = `🃏 *Suas cartas no 21*:\n${mao.map(labelCarta).join("\n")} = *${soma}*` +
                    (soma === 21 ? "\n\n🎉 *BLACKJACK!*" : "") +
                    `\n\nUse *!pedir* ou *!parar* no grupo.`;
    const enviado = await enviarPV(sock, j.jid, pvTexto);
    if (!enviado) {
      await msg(sock, chatId,
        `📨 *${j.nome}*, não consegui enviar suas cartas no privado. Me manda uma mensagem e use *!mao* para ver.`
      );
    }
    await delay(500);
  }

  await msg(sock, chatId, `🏦 *Dealer*: ${labelCarta(dealer[0])} + 🂠 (carta virada)`);
  await enviarCarta(sock, chatId, dealer[0]);

  // Verifica blackjacks imediatos
  const vencedores = [];
  for (const j of jogadores) {
    const mao = getMao(jogo.id, j.jid);
    if (somaBlackjack(mao) === 21) vencedores.push(j.nome);
  }
  if (vencedores.length > 0) {
    await msg(sock, chatId, `🎉 *BLACKJACK!* ${vencedores.join(", ")} venceram instantaneamente!`);
    await revelarDealer(sock, chatId, jogo.id);
    return;
  }

  await anunciarVez21(sock, chatId, jogo.id);
}

async function anunciarVez21(sock, chatId, jogoId) {
  const estado = getEstado(jogoId);
  const jogadores = getJogadores(jogoId);
  const pendentes = jogadores.filter(j => !estado.parados.includes(j.jid));
  if (pendentes.length === 0) { await revelarDealer(sock, chatId, jogoId); return; }

  const atual = pendentes[0];
  const mao = getMao(jogoId, atual.jid);
  const soma = somaBlackjack(mao);
  await msg(sock, chatId,
    `🎯 *${atual.nome}*, sua vez!\n` +
    `Cartas: ${mao.map(labelCarta).join(", ")} = *${soma}*\n\n` +
    `*!pedir* — pedir carta  |  *!parar* — parar`
  );
}

export async function vjVerMao(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "21" || jogo.status !== "rodando") return;
  const jogadores = getJogadores(jogo.id);
  if (!jogadores.find(j => j.jid === jid)) return;
  const mao = getMao(jogo.id, jid);
  const soma = somaBlackjack(mao);
  const enviado = await enviarPV(sock, jid,
    `🃏 *Suas cartas no 21 (${mao.length}):*\n` +
    mao.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n") +
    `\n\nTotal: *${soma}*`
  );
  if (enviado) {
    await sock.sendMessage(chatId, { text: `📨 *${nome}*, enviei suas cartas no privado!` });
  } else {
    await msg(sock, chatId, `🃏 *${nome}*: ${mao.map(labelCarta).join(", ")} = *${soma}*`);
  }
}

export async function vjPedir(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "21" || jogo.status !== "rodando") return;
  const estado = getEstado(jogo.id);
  const jogadores = getJogadores(jogo.id);
  const pendentes = jogadores.filter(j => !estado.parados.includes(j.jid));
  if (!pendentes.length || pendentes[0].jid !== jid) return;

  const mao = getMao(jogo.id, jid);
  const nova = estado.monte.splice(0, 1)[0];
  mao.push(nova);
  setMao(jogo.id, jid, mao);
  setEstado(jogo.id, estado);

  const soma = somaBlackjack(mao);
  await msg(sock, chatId, `📥 *${nome}* pegou: *${labelCarta(nova)}*\nTotal: *${soma}*`);
  await enviarCarta(sock, chatId, nova);

  if (soma > 21) {
    await msg(sock, chatId, `💥 *${nome}* estourou com ${soma}!`);
    estado.parados.push(jid);
    setEstado(jogo.id, estado);
  } else if (soma === 21) {
    await msg(sock, chatId, `🎉 *${nome}* chegou em 21!`);
    estado.parados.push(jid);
    setEstado(jogo.id, estado);
  }

  await anunciarVez21(sock, chatId, jogo.id);
}

export async function vjParar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "21" || jogo.status !== "rodando") return;
  const estado = getEstado(jogo.id);
  const jogadores = getJogadores(jogo.id);
  const pendentes = jogadores.filter(j => !estado.parados.includes(j.jid));
  if (!pendentes.length || pendentes[0].jid !== jid) return;

  const mao = getMao(jogo.id, jid);
  await msg(sock, chatId, `✋ *${nome}* parou com *${somaBlackjack(mao)}*.`);
  estado.parados.push(jid);
  setEstado(jogo.id, estado);
  await anunciarVez21(sock, chatId, jogo.id);
}

async function revelarDealer(sock, chatId, jogoId) {
  const estado = getEstado(jogoId);
  const jogadores = getJogadores(jogoId);
  let dealer = estado.dealer;
  const monte = estado.monte;

  await msg(sock, chatId, `🏦 *Dealer revela:* ${dealer.map(labelCarta).join(", ")} = *${somaBlackjack(dealer)}*`);
  for (const c of dealer) await enviarCarta(sock, chatId, c);

  // Dealer pede até 17
  while (somaBlackjack(dealer) < 17 && monte.length > 0) {
    const nova = monte.splice(0, 1)[0];
    dealer.push(nova);
    await msg(sock, chatId, `🏦 Dealer pegou: *${labelCarta(nova)}* = *${somaBlackjack(dealer)}*`);
    await enviarCarta(sock, chatId, nova);
    await delay(800);
  }

  const dealerTotal = somaBlackjack(dealer);
  const dealerEstourou = dealerTotal > 21;

  let resultado = `\n🏁 *Resultado Final*\n🏦 Dealer: *${dealerTotal}*${dealerEstourou ? " 💥 ESTOUROU" : ""}\n\n`;

  for (const j of jogadores) {
    const mao = getMao(jogoId, j.jid);
    const total = somaBlackjack(mao);
    let res;
    if (total > 21)          res = "💥 Estourou";
    else if (dealerEstourou) res = "🏆 Venceu!";
    else if (total > dealerTotal) res = "🏆 Venceu!";
    else if (total === dealerTotal) res = "🤝 Empate";
    else                     res = "❌ Perdeu";
    resultado += `${res} *${j.nome}*: ${total}\n`;
  }

  await msg(sock, chatId, resultado);
  encerrarJogo(chatId);
}
