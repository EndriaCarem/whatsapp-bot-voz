import { getStatsGrupo, getRanking, getSignosGrupo } from "./db.js";
import { colunasJornal } from "./ia.js";

const SEP = "━".repeat(20);

// Horóscopo "de TI" — uma vibe por signo, escolhida pelo dia (muda a cada dia).
const VIBES_TI = [
  "deploy na sexta vai dar certo (confia)",
  "evite mergear sem revisar o PR hoje",
  "um bug some sozinho quando você menos esperar",
  "dia bom pra refatorar aquele código legado",
  "alguém vai te chamar no privado pra 'uma dúvida rápida'",
  "café + foco = você fecha a sprint",
  "cuidado com o git push --force hoje",
  "boa fase pra estudar aquela tecnologia nova",
  "o stand-up vai durar menos que o normal",
  "documentação que você escreveu vai te salvar",
  "dia de produtividade alta, aproveita a maré",
  "respira antes de responder aquele e-mail",
];

function horoscopoDoDia(signo) {
  // determinístico por (signo + dia): todo mundo do mesmo signo vê a mesma vibe no dia
  const dia = Math.floor(Date.now() / 86400000);
  let h = dia;
  for (const c of signo) h += c.charCodeAt(0);
  return VIBES_TI[Math.abs(h) % VIBES_TI.length];
}

const EMOJI_SIGNO = {
  "áries": "♈", "touro": "♉", "gêmeos": "♊", "câncer": "♋",
  "leão": "♌", "virgem": "♍", "libra": "♎", "escorpião": "♏",
  "sagitário": "♐", "capricórnio": "♑", "aquário": "♒", "peixes": "♓",
};

export async function textoJornal(chatId) {
  const s = getStatsGrupo(chatId);
  const audios = s.maisAudios[0];

  // ── Manchete: atividade do grupo ──
  const topTexto = s.topFalantes.length
    ? s.topFalantes.slice(0, 3).map((u, i) => `  ${["🥇", "🥈", "🥉"][i]} *${u.nome}* — ${u.n} msgs`).join("\n")
    : "  Sem dados ainda";

  const sumidosTexto = s.sumidos.length
    ? s.sumidos.slice(0, 3).map(u => {
        const dias = Math.floor((Date.now() - u.ultima_msg) / 86400000);
        return `  👻 *${u.nome}* — sumido há ${dias} dia${dias !== 1 ? "s" : ""}`;
      }).join("\n")
    : "  ✅ Ninguém sumido!";

  // ── Horóscopo de TI: só dos signos que existem no grupo ──
  const signos = getSignosGrupo(chatId);
  const horoscopoTexto = signos.length
    ? signos.slice(0, 6).map(row => {
        const nome = row.signo;
        const emoji = EMOJI_SIGNO[nome.toLowerCase()] || "🔮";
        return `  ${emoji} *${nome}* (${row.total}): ${horoscopoDoDia(nome)}`;
      }).join("\n")
    : "  Ninguém cadastrou o signo ainda — use *!signo <seu signo>*";

  // ── Colunas criativas (IA): notícia, piada, fato, dica ──
  const c = await colunasJornal();

  let txt =
    `🗞️ *JORNAL DA TABERNA* 🗞️\n` +
    `_a edição mais quente da galera do TI_\n` +
    `${SEP}\n\n` +
    `📊 *PLACAR DA SEMANA*\n` +
    `📬 Hoje: *${s.hoje}* msgs | 📦 Semana: *${s.semana}* msgs\n\n` +
    `🏆 *Mais ativos:*\n${topTexto}\n` +
    (audios ? `\n🎙️ *Rei dos áudios:* ${audios.nome} (${audios.n})\n` : "") +
    `\n👻 *Sumidos da semana:*\n${sumidosTexto}\n\n` +
    `${SEP}\n\n` +
    `🔮 *HORÓSCOPO DEV DO DIA*\n${horoscopoTexto}\n\n`;

  if (c) {
    if (c.noticia) txt += `${SEP}\n\n💡 *RADAR TECH*\n  ${c.noticia}\n\n`;
    if (c.dica)    txt += `📚 *APRENDA HOJE*\n  ${c.dica}\n\n`;
    if (c.fato)    txt += `🤓 *VOCÊ SABIA?*\n  ${c.fato}\n\n`;
    if (c.piada)   txt += `😂 *PIADA DO DIA*\n  ${c.piada}\n\n`;
  }

  txt += `${SEP}\n_Cadastre seu signo com *!signo <signo>* pra aparecer no horóscopo!_`;
  return txt;
}

export function textoStats(chatId) {
  const s = getStatsGrupo(chatId);
  const ranking = getRanking(chatId, 5);

  const rankTexto = ranking.length
    ? ranking.map((u, i) => `  ${i + 1}. *${u.nome}* Nv.${u.nivel} | ${u.msgs} msgs`).join("\n")
    : "  Sem dados ainda";

  return (
    `📊 *Estatísticas do Grupo*\n\n` +
    `📅 Hoje: *${s.hoje}* mensagens\n` +
    `📆 Semana: *${s.semana}* mensagens\n\n` +
    `🏅 *Top 5 níveis:*\n${rankTexto}`
  );
}

export function textoSumidos(chatId) {
  const s = getStatsGrupo(chatId);
  if (!s.sumidos.length) return "✅ Ninguém sumido há mais de 3 dias!";
  const linhas = s.sumidos.map(u => {
    const dias = Math.floor((Date.now() - u.ultima_msg) / 86400000);
    return `👻 *${u.nome}* — sumido há ${dias} dia${dias !== 1 ? "s" : ""}`;
  });
  return "🕵️ *Detector de Sumidos*\n\n" + linhas.join("\n");
}
