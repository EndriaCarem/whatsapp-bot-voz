import { getStatsGrupo, getRanking } from "./db.js";

export function textoJornal(chatId) {
  const s = getStatsGrupo(chatId);
  const top = s.topFalantes[0];
  const audios = s.maisAudios[0];

  const sumidosTexto = s.sumidos.length
    ? s.sumidos.map(u => {
        const dias = Math.floor((Date.now() - u.ultima_msg) / 86400000);
        return `  👻 *${u.nome}* sumiu há ${dias} dia${dias !== 1 ? "s" : ""}`;
      }).join("\n")
    : "  ✅ Ninguém sumido esta semana!";

  const topTexto = s.topFalantes.length
    ? s.topFalantes.map((u, i) => `  ${i + 1}. *${u.nome}* — ${u.n} msgs`).join("\n")
    : "  Sem dados ainda";

  return (
    `🗞️ *Jornal do Grupo*\n` +
    `${"─".repeat(28)}\n\n` +
    `📬 *Mensagens hoje:* ${s.hoje}\n` +
    `📦 *Mensagens essa semana:* ${s.semana}\n\n` +
    `🏆 *Mais ativos da semana:*\n${topTexto}\n\n` +
    (audios ? `🎙️ *Rei dos áudios:* ${audios.nome} (${audios.n} áudios)\n\n` : "") +
    `👻 *Sumidos:*\n${sumidosTexto}`
  );
}

export function textoStats(chatId) {
  const s = getStatsGrupo(chatId);
  const ranking = getRanking(5);

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
