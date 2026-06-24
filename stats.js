import { getStatsGrupo, getRanking } from "./db.js";
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
  "hoje o CSS finalmente vai centralizar",
  "aquele teste que tava vermelho vai passar",
  "alguém vai elogiar seu código (aproveita)",
  "evite responder 'funciona na minha máquina'",
  "dia de fechar abas do navegador e respirar",
  "o deploy vai pedir pra você revisar duas vezes",
  "boa hora pra automatizar aquela tarefa chata",
  "cuidado: reunião que podia ser um e-mail à vista",
  "seu rubber duck vai resolver o bug de novo",
  "dia ótimo pra apagar código morto sem dó",
  "vai surgir uma ideia boa no banho, anota",
  "hoje o Stack Overflow tá do seu lado",
];

// Ordem fixa dos 12 signos (com emoji e datas) — pro horóscopo completo.
const SIGNOS_INFO = [
  { nome: "Áries",       emoji: "♈", datas: "21/03–19/04" },
  { nome: "Touro",       emoji: "♉", datas: "20/04–20/05" },
  { nome: "Gêmeos",      emoji: "♊", datas: "21/05–20/06" },
  { nome: "Câncer",      emoji: "♋", datas: "21/06–22/07" },
  { nome: "Leão",        emoji: "♌", datas: "23/07–22/08" },
  { nome: "Virgem",      emoji: "♍", datas: "23/08–22/09" },
  { nome: "Libra",       emoji: "♎", datas: "23/09–22/10" },
  { nome: "Escorpião",   emoji: "♏", datas: "23/10–21/11" },
  { nome: "Sagitário",   emoji: "♐", datas: "22/11–21/12" },
  { nome: "Capricórnio", emoji: "♑", datas: "22/12–19/01" },
  { nome: "Aquário",     emoji: "♒", datas: "20/01–18/02" },
  { nome: "Peixes",      emoji: "♓", datas: "19/02–20/03" },
];

function diaAtual() {
  return Math.floor(Date.now() / 86400000);
}

function horoscopoDoDia(signo) {
  // determinístico por (signo + dia): todo mundo do mesmo signo vê a mesma vibe no dia.
  // Usa o índice do signo pra espalhar melhor e reduzir repetições no mesmo dia.
  const idx = SIGNOS_INFO.findIndex(s => s.nome === signo);
  const base = idx >= 0 ? idx : [...signo].reduce((a, c) => a + c.charCodeAt(0), 0);
  const h = diaAtual() * 7 + base * 13;
  return VIBES_TI[Math.abs(h) % VIBES_TI.length];
}

// Horóscopo completo dos 12 signos (comando !signo) — não precisa cadastro.
export function textoHoroscopo() {
  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });
  const linhas = SIGNOS_INFO.map(s =>
    `${s.emoji} *${s.nome}* _(${s.datas})_\n   ↳ ${horoscopoDoDia(s.nome)}`
  ).join("\n\n");
  return (
    `🔮 *HORÓSCOPO DEV DO DIA*\n` +
    `_${data}_\n` +
    `${SEP}\n\n${linhas}\n\n` +
    `${SEP}\n_As estrelas (e o compilador) raramente erram 😉_`
  );
}

// Um "signo do dia" rotativo (pro jornal) — muda a cada dia.
function signoDoDia() {
  const s = SIGNOS_INFO[diaAtual() % SIGNOS_INFO.length];
  return `${s.emoji} *${s.nome}* — ${horoscopoDoDia(s.nome)}`;
}

export async function textoJornal(chatId) {
  const s = getStatsGrupo(chatId);
  const audios = s.maisAudios[0];

  // ── Manchete: atividade do grupo ──
  const topTexto = s.topFalantes.length
    ? s.topFalantes.slice(0, 3).map((u, i) => `  ${["🥇", "🥈", "🥉"][i]} *${u.nome}* — ${u.n} msgs`).join("\n")
    : "  Sem dados ainda";

  const sumidosTexto = s.sumidos.length
    ? s.sumidos.slice(0, 3).map(u => {
        const dias = Math.floor((Math.floor(Date.now() / 1000) - u.ultimo_ts) / 86400);
        return `  👻 *${u.nome}* — sumido há ${dias} dia${dias !== 1 ? "s" : ""}`;
      }).join("\n")
    : "  ✅ Ninguém sumido!";

  // ── Signo do Dia (rotativo) — horóscopo completo no comando !signo ──
  const horoscopoTexto = `  ${signoDoDia()}\n  _Veja os 12 signos com *!signo*_`;

  // ── Colunas criativas (IA): manchete, notícia, piada, fato, dica ──
  const c = await colunasJornal();

  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  // ── Cabeçalho do jornal ──
  let txt =
    `╔══════════════════╗\n` +
    `    🗞️ *JORNAL GALERA DO TI* 🗞️\n` +
    `╚══════════════════╝\n` +
    `_📅 ${data} • Edição Diária_\n\n`;

  // ── Seção 1: Dados reais do grupo ──
  txt +=
    `${SEP}\n` +
    `📊 *PLACAR DO GRUPO* _• dados reais_\n` +
    `${SEP}\n` +
    `📬 Hoje: *${s.hoje}* msgs  •  📦 Semana: *${s.semana}* msgs\n\n` +
    `🏆 _Mais ativos:_\n${topTexto}\n` +
    (audios ? `\n🎙️ _Rei dos áudios:_ *${audios.nome}* (${audios.n})\n` : "") +
    `\n👻 _Sumidos há +7 dias:_\n${sumidosTexto}\n\n`;

  // ── Seção 2: Signo (dados fixos) ──
  txt +=
    `${SEP}\n` +
    `🔮 *SIGNO DO DIA*\n` +
    `${SEP}\n${horoscopoTexto}\n\n`;

  // ── Seção 3: Colunas geradas pela IA (marcadas claramente) ──
  if (c) {
    txt += `${SEP}\n_✨ As seções abaixo são geradas por IA_\n${SEP}\n\n`;
    if (c.manchete) txt += `📰 *MANCHETE DO DIA*\n🔴 *${c.manchete.toUpperCase()}*\n\n`;
    if (c.noticia)  txt += `💡 *RADAR TECH*\n${c.noticia}\n\n`;
    if (c.dica)     txt += `📚 *APRENDA HOJE*\n${c.dica}\n\n`;
    if (c.fato)     txt += `🤓 *VOCÊ SABIA?*\n${c.fato}\n\n`;
    if (c.piada)    txt += `😂 *PIADA DO DIA*\n${c.piada}\n\n`;
  }

  // ── Rodapé ──
  txt +=
    `╔══════════════════╗\n` +
    `_✨ Horóscopo completo:_ *!signo*\n` +
    `_🤖 Edição por Axolotl-Byte_\n` +
    `╚══════════════════╝`;
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
  if (!s.sumidos.length) return "✅ Ninguém sumido há mais de 7 dias!";
  const linhas = s.sumidos.map(u => {
    if (!u.ultimo_ts) return `👤 *${u.nome}* — nunca falou no grupo`;
    const dias = Math.floor((Math.floor(Date.now() / 1000) - u.ultimo_ts) / 86400);
    return `👻 *${u.nome}* — sumido há ${dias} dia${dias !== 1 ? "s" : ""}`;
  });
  return `🕵️ *Detector de Sumidos*\n_Pessoas que estão no grupo mas não falam há mais de 7 dias:_\n\n` + linhas.join("\n");
}
