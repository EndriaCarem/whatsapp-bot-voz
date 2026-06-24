import {
  criarJogo, getJogoAtivo, getJogadores, entrarJogo,
  getMao, setMao, getEstado, setEstado, setStatus, encerrarJogo, sairJogo,
} from "./db_jogos.js";
import { gerarCartaUno, baralhoUno, labelCarta, delay } from "./cartas.js";

const MAX_JOGADORES = 10;
const TEMPO_INSCRICAO_MS = 300_000; // 5 min
const TIMEOUT_TURNO_MS   = 60_000;  // 1 min para jogar

// Envia imagem da carta como sticker
async function enviarCarta(sock, jid, carta, quoted = null) {
  const img = await gerarCartaUno(carta.cor, carta.valor);
  const opts = quoted ? { quoted } : {};
  await sock.sendMessage(jid, { sticker: img }, opts);
}

async function enviarMsgGrupo(sock, chatId, texto) {
  await sock.sendMessage(chatId, { text: texto });
  await delay(500);
}

// Tenta enviar PV. Retorna true se conseguiu, false se falhou.
// Com contas novas do WhatsApp, o JID é @lid (ID interno).
// O Baileys resolve o mapeamento LID→PN internamente quando enviamos para @lid diretamente.
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

// ── Iniciar jogo ──────────────────────────────────────────────────────────────
export async function unoIniciar(sock, chatId, jid, nome) {
  const ativo = getJogoAtivo(chatId);
  if (ativo) {
    await sock.sendMessage(chatId, { text: `⚠️ Já tem um jogo de *${ativo.tipo.toUpperCase()}* em andamento! Use *!cancelar* para encerrar.` });
    return;
  }
  const jogoId = criarJogo(chatId, "uno");
  entrarJogo(jogoId, jid, nome);

  await enviarMsgGrupo(sock, chatId,
    `🃏 *UNO iniciado por ${nome}!*\n\n` +
    `Digite *!entrar* para participar.\n` +
    `Mínimo 2 jogadores • Máximo ${MAX_JOGADORES}\n` +
    `⏳ Inscrições abertas por 5 minutos ou use *!comecar* para começar já.`
  );

  // Fecha inscrições automaticamente após 2 min
  setTimeout(() => {
    const jogo = getJogoAtivo(chatId);
    if (jogo?.id === jogoId && jogo.status === "aguardando") {
      unoIniciarPartida(sock, chatId, jogoId);
    }
  }, TEMPO_INSCRICAO_MS);
}

// ── Entrar no jogo ────────────────────────────────────────────────────────────
export async function unoEntrar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "aguardando") return;
  if (getJogadores(jogo.id).length >= MAX_JOGADORES) {
    await sock.sendMessage(chatId, { text: "⚠️ Jogo cheio! Máximo de jogadores atingido." });
    return;
  }
  const entrou = entrarJogo(jogo.id, jid, nome);
  if (!entrou) {
    await sock.sendMessage(chatId, { text: `${nome}, você já está no jogo!` });
    return;
  }
  const total = getJogadores(jogo.id).length;
  await enviarMsgGrupo(sock, chatId, `✅ *${nome}* entrou no UNO! (${total} jogador${total > 1 ? "es" : ""})`);
}

// ── Começar partida ───────────────────────────────────────────────────────────
export async function unoComecou(sock, chatId) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "aguardando") return;
  await unoIniciarPartida(sock, chatId, jogo.id);
}

async function unoIniciarPartida(sock, chatId, jogoId) {
  const jogadores = getJogadores(jogoId);
  if (jogadores.length < 2) {
    await enviarMsgGrupo(sock, chatId,
      "⚠️ Precisa de pelo menos 2 jogadores!\n" +
      `Já tem *${jogadores.length}* inscrito. Aguardando mais pessoas usarem *!entrar*.`
    );
    return; // NÃO encerra — mantém o jogo aberto
  }

  setStatus(jogoId, "rodando");
  const baralho = baralhoUno();

  // Distribui 7 cartas pra cada
  let idx = 0;
  for (const j of jogadores) {
    const mao = baralho.slice(idx, idx + 7);
    idx += 7;
    setMao(jogoId, j.jid, mao);
  }

  // Primeira carta do monte (não pode ser especial)
  let primeiraIdx = idx;
  while (["Coringa", "+4"].includes(baralho[primeiraIdx]?.valor)) primeiraIdx++;
  const cartaMesa = baralho[primeiraIdx];
  const monte = baralho.slice(idx).filter((_, i) => i + idx !== primeiraIdx);

  const estado = {
    mesa: cartaMesa,
    monte,
    vez: 0,
    ordem: jogadores.map(j => j.jid),
    sentido: 1,
    comprando: 0,
  };
  setEstado(jogoId, estado);

  await enviarMsgGrupo(sock, chatId,
    `🎮 *UNO começou!* ${jogadores.length} jogadores\n\n` +
    `Ordem: ${jogadores.map(j => j.nome).join(" → ")}\n\n` +
    `📜 *Regras rápidas:*\n` +
    `• *!jogar [cor] [valor]* → joga uma carta\n` +
    `• *!comprar* → compra carta do monte\n` +
    `• *!mao* → ver suas cartas no privado\n` +
    `• *!uno* → grite quando ficar com 1 carta!\n` +
    `  _(se não gritar, alguém pode te pegar e você leva +2)_\n` +
    `• *!cor [cor]* → escolher cor após coringa/+4\n\n` +
    `📤 Enviando suas cartas no privado...`
  );

  // Envia as cartas no PRIVADO de cada jogador
  for (const j of jogadores) {
    const mao = getMao(jogoId, j.jid);
    const pvTexto =
      `🎮 *UNO — Suas cartas (${mao.length}):*\n\n` +
      mao.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n") +
      `\n\n🟡 *Carta da mesa:* ${labelCarta(cartaMesa)}` +
      `\n\n📝 *Como jogar:*\n` +
      `• *!jogar [cor] [valor]* → ex: _!jogar vermelho 7_\n` +
      `• Coringas: _!jogar preto coringa_ depois _!cor vermelho_\n` +
      `• *!comprar* → se não tiver jogada\n` +
      `• *!mao* → ver suas cartas de novo`;
    const enviado = await enviarPV(sock, j.jid, pvTexto);
    if (!enviado) {
      // Fallback: manda no grupo sem revelar todas as cartas de uma vez
      await enviarMsgGrupo(sock, chatId, `📨 *${j.nome}*, não consegui enviar suas cartas no privado.\nMe manda uma mensagem em PV e use *!mao* para ver suas cartas.`);
    }
    await delay(800);
  }

  // Mostra carta da mesa
  await enviarMsgGrupo(sock, chatId, `\n🟡 Carta da mesa: *${labelCarta(cartaMesa)}*`);
  await enviarCarta(sock, chatId, cartaMesa);

  await anunciarVez(sock, chatId, jogoId);
}

// ── Anunciar vez ──────────────────────────────────────────────────────────────
async function anunciarVez(sock, chatId, jogoId) {
  const estado = getEstado(jogoId);
  const jogadores = getJogadores(jogoId);
  const jogadorAtual = jogadores.find(j => j.jid === estado.ordem[estado.vez]);
  if (!jogadorAtual) return;

  const mao = getMao(jogoId, jogadorAtual.jid);
  await enviarMsgGrupo(sock, chatId,
    `🎯 Vez de *${jogadorAtual.nome}*!\n` +
    `Cartas na mão: ${mao.length}\n\n` +
    `Use *!jogar [carta]* • Ex: _!jogar vermelho 7_\n` +
    `Ou *!comprar* se não tiver jogada.`
  );
}

// ── Jogar carta ───────────────────────────────────────────────────────────────
export async function unoJogar(sock, chatId, jid, nome, args) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "rodando") return;

  const estado = getEstado(jogo.id);
  const jogadorAtualJid = estado.ordem[estado.vez];

  if (jid !== jogadorAtualJid) return; // não é a vez dessa pessoa

  const mao = getMao(jogo.id, jid);
  // args: ["vermelho", "7"] ou ["preto", "coringa"] etc
  const [corArg, ...valorArgs] = args;
  const valorArg = valorArgs.join(" ").trim();

  const idxCarta = mao.findIndex(c =>
    c.cor?.toLowerCase() === corArg?.toLowerCase() &&
    c.valor?.toLowerCase() === valorArg?.toLowerCase()
  );

  if (idxCarta === -1) {
    await sock.sendMessage(chatId, { text: `❌ *${nome}*, você não tem essa carta ou o formato está errado.\nEx: _!jogar vermelho 7_ ou _!jogar preto coringa_` });
    return;
  }

  const carta = mao[idxCarta];
  const mesa = estado.mesa;

  // Valida jogada
  const valida =
    carta.cor === "preto" ||
    carta.cor === mesa.cor ||
    carta.valor === mesa.valor;

  if (!valida) {
    await sock.sendMessage(chatId, { text: `❌ *${nome}*, essa carta não encaixa! A mesa é *${labelCarta(mesa)}*.` });
    return;
  }

  // Remove da mão
  mao.splice(idxCarta, 1);
  setMao(jogo.id, jid, mao);

  // Atualiza mesa
  estado.mesa = carta;

  // Manda mão atualizada no PV (só se ainda tiver cartas)
  if (mao.length > 0) {
    enviarPV(sock, jid,
      `✅ Você jogou *${labelCarta(carta)}*\n\n` +
      `🎮 *Suas cartas agora (${mao.length}):*\n` +
      mao.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n") +
      `\n\n🟡 *Mesa:* ${labelCarta(carta)}`
    ).catch(() => {});
  }

  // Verifica vitória
  if (mao.length === 0) {
    setEstado(jogo.id, estado);
    await enviarCarta(sock, chatId, carta);
    await enviarMsgGrupo(sock, chatId, `🏆 *${nome}* jogou a última carta e VENCEU o UNO! Parabéns! 🎉`);
    encerrarJogo(chatId);
    return;
  }

  // UNO! — jogador precisa gritar !uno em 15s ou leva punição
  if (mao.length === 1) {
    estado.unoAlerta = { jid, nome, ts: Date.now() };
    setEstado(jogo.id, estado);
    await enviarMsgGrupo(sock, chatId,
      `⚠️ *${nome}* ficou com 1 carta!\n` +
      `*${nome}*, grite *!uno* agora!\n` +
      `Ou alguém grite *!uno* para pegar ${nome} sem gritar e ele leva +2! ⏱️`
    );
  }

  await enviarCarta(sock, chatId, carta);

  const jogadores = getJogadores(jogo.id);
  const n = jogadores.length;
  let proximoIdx = (estado.vez + estado.sentido + n) % n;

  // Efeitos especiais
  if (carta.valor === "Pular") {
    await enviarMsgGrupo(sock, chatId, `🚫 ${jogadores.find(j => j.jid === estado.ordem[proximoIdx])?.nome} foi pulado!`);
    proximoIdx = (proximoIdx + estado.sentido + n) % n;
  } else if (carta.valor === "Inverter") {
    estado.sentido *= -1;
    proximoIdx = (estado.vez + estado.sentido + n) % n;
    await enviarMsgGrupo(sock, chatId, `🔄 Sentido invertido!`);
  } else if (carta.valor === "+2") {
    const alvo = jogadores.find(j => j.jid === estado.ordem[proximoIdx]);
    if (alvo) {
      const maoAlvo = getMao(jogo.id, alvo.jid);
      const novas = estado.monte.splice(0, 2);
      maoAlvo.push(...novas);
      setMao(jogo.id, alvo.jid, maoAlvo);
      await enviarMsgGrupo(sock, chatId, `+2! *${alvo.nome}* comprou 2 cartas e foi pulado.`);
      proximoIdx = (proximoIdx + estado.sentido + n) % n;
    }
  } else if (carta.valor === "+4") {
    const alvo = jogadores.find(j => j.jid === estado.ordem[proximoIdx]);
    if (alvo) {
      const maoAlvo = getMao(jogo.id, alvo.jid);
      const novas = estado.monte.splice(0, 4);
      maoAlvo.push(...novas);
      setMao(jogo.id, alvo.jid, maoAlvo);
      await enviarMsgGrupo(sock, chatId, `+4! *${alvo.nome}* comprou 4 cartas e foi pulado.\nEscolha a cor: *!cor vermelho/azul/verde/amarelo*`);
      estado.vez = proximoIdx;
      estado.aguardandoCor = jid;
      setEstado(jogo.id, estado);
      return;
    }
  } else if (carta.valor === "Coringa") {
    await enviarMsgGrupo(sock, chatId, `🌈 *${nome}* jogou coringa! Escolha a cor: *!cor vermelho/azul/verde/amarelo*`);
    estado.vez = proximoIdx;
    estado.aguardandoCor = jid;
    setEstado(jogo.id, estado);
    return;
  }

  estado.vez = proximoIdx;
  setEstado(jogo.id, estado);
  await anunciarVez(sock, chatId, jogo.id);
}

// ── Escolher cor (após coringa/+4) ────────────────────────────────────────────
export async function unoEscolherCor(sock, chatId, jid, cor) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "rodando") return;
  const estado = getEstado(jogo.id);
  if (estado.aguardandoCor !== jid) return;

  const cores = ["vermelho", "azul", "verde", "amarelo"];
  if (!cores.includes(cor.toLowerCase())) {
    await sock.sendMessage(chatId, { text: "❌ Cor inválida. Escolha: vermelho, azul, verde ou amarelo." });
    return;
  }
  estado.mesa = { ...estado.mesa, cor: cor.toLowerCase() };
  delete estado.aguardandoCor;
  setEstado(jogo.id, estado);
  await enviarMsgGrupo(sock, chatId, `🎨 Cor escolhida: *${cor.toUpperCase()}*`);
  await anunciarVez(sock, chatId, jogo.id);
}

// ── Comprar carta ─────────────────────────────────────────────────────────────
export async function unoComprar(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "rodando") return;
  const estado = getEstado(jogo.id);
  if (estado.ordem[estado.vez] !== jid) return;

  const mao = getMao(jogo.id, jid);
  if (estado.monte.length === 0) {
    await sock.sendMessage(chatId, { text: "⚠️ Monte vazio! Não é possível comprar." });
    return;
  }
  const nova = estado.monte.splice(0, 1)[0];
  mao.push(nova);
  setMao(jogo.id, jid, mao);
  setEstado(jogo.id, estado);

  // Informa no grupo que comprou (sem revelar qual carta)
  await enviarMsgGrupo(sock, chatId, `📥 *${nome}* comprou uma carta. (${mao.length} na mão)`);
  // Envia a carta comprada no PV
  await enviarPV(sock, jid,
    `📥 Você comprou: *${labelCarta(nova)}*\n\n` +
    `🎮 *Suas cartas (${mao.length}):*\n` +
    mao.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n")
  );

  // Passa a vez
  const jogadores = getJogadores(jogo.id);
  const n = jogadores.length;
  estado.vez = (estado.vez + estado.sentido + n) % n;
  setEstado(jogo.id, estado);
  await anunciarVez(sock, chatId, jogo.id);
}

// ── Desistir ──────────────────────────────────────────────────────────────────
export async function unoDesistir(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno") return;
  const jogadores = getJogadores(jogo.id);
  if (!jogadores.find(j => j.jid === jid)) return;

  sairJogo(jogo.id, jid);
  await enviarMsgGrupo(sock, chatId, `🏳️ *${nome}* desistiu do UNO.`);

  // Verifica se sobrou jogador suficiente
  const restantes = getJogadores(jogo.id);
  if (restantes.length <= 1) {
    if (restantes.length === 1) {
      await enviarMsgGrupo(sock, chatId, `🏆 *${restantes[0].nome}* venceu por W.O.!`);
    }
    encerrarJogo(chatId);
    return;
  }

  // Se era a vez dele, passa para o próximo
  if (jogo.status === "rodando") {
    const estado = getEstado(jogo.id);
    const vezIdx = estado.ordem.indexOf(jid);
    // Remove da ordem
    estado.ordem = estado.ordem.filter(j => j !== jid);
    const n = estado.ordem.length;
    // Ajusta índice da vez
    if (vezIdx !== -1 && estado.vez >= vezIdx) {
      estado.vez = estado.vez % n;
    }
    setEstado(jogo.id, estado);
    await anunciarVez(sock, chatId, jogo.id);
  }
}

// ── Gritar UNO ────────────────────────────────────────────────────────────────
export async function unoGritarUno(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "rodando") return;
  const estado = getEstado(jogo.id);
  if (!estado.unoAlerta) return;

  const alvo = estado.unoAlerta;
  const agora = Date.now();
  const dentroDoTempo = (agora - alvo.ts) < 15_000; // 15 segundos

  if (jid === alvo.jid) {
    // O próprio jogador gritou UNO
    if (dentroDoTempo) {
      delete estado.unoAlerta;
      setEstado(jogo.id, estado);
      await enviarMsgGrupo(sock, chatId, `✅ *UNO!* ${nome} gritou a tempo! 🎉`);
    } else {
      await enviarMsgGrupo(sock, chatId, `⏰ Tarde demais, *${nome}*! O tempo já passou.`);
    }
  } else {
    // Outro jogador pegou sem gritar
    if (!dentroDoTempo) {
      // Já passou o tempo, não pode mais pegar
      await enviarMsgGrupo(sock, chatId, `⏰ Tarde demais! O tempo de pegar *${alvo.nome}* já expirou.`);
      return;
    }
    // Pega o jogador que não gritou — ele leva +2
    const maoAlvo = getMao(jogo.id, alvo.jid);
    const novas = estado.monte.splice(0, 2);
    maoAlvo.push(...novas);
    setMao(jogo.id, alvo.jid, maoAlvo);
    delete estado.unoAlerta;
    setEstado(jogo.id, estado);
    await enviarMsgGrupo(sock, chatId,
      `🎯 *${nome}* pegou *${alvo.nome}* sem gritar UNO!\n` +
      `*${alvo.nome}* comprou +2 de punição! (${maoAlvo.length} cartas agora)`
    );
    await enviarPV(sock, alvo.jid,
      `😅 Te pegaram sem gritar UNO! +2 de punição.\n` +
      `Suas cartas agora (${maoAlvo.length}):\n` +
      maoAlvo.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n")
    );
  }
}

// ── Ver mão ───────────────────────────────────────────────────────────────────
export async function unoVerMao(sock, chatId, jid, nome) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo || jogo.tipo !== "uno" || jogo.status !== "rodando") return;
  const jogadores = getJogadores(jogo.id);
  if (!jogadores.find(j => j.jid === jid)) return;

  const mao = getMao(jogo.id, jid);
  const estado = getEstado(jogo.id);
  const enviado = await enviarPV(sock, jid,
    `🎮 *UNO — Suas cartas (${mao.length}):*\n\n` +
    mao.map((c, i) => `${i + 1}. ${labelCarta(c)}`).join("\n") +
    `\n\n🟡 *Carta da mesa:* ${labelCarta(estado.mesa)}`
  );
  if (enviado) {
    await sock.sendMessage(chatId, { text: `📨 *${nome}*, enviei suas cartas no privado!` });
  } else {
    await sock.sendMessage(chatId, {
      text: `🃏 *${nome}*, suas cartas (${mao.length}):\n${mao.map(labelCarta).join(", ")}\n\n🟡 Mesa: *${labelCarta(estado.mesa)}*`
    });
  }
}
