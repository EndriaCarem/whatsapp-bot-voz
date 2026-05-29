import { getRanking, getUsuario } from "./db.js";

const NIVEIS = [
  { min: 1,  emoji: "🌱", titulo: "Novato" },
  { min: 3,  emoji: "🌿", titulo: "Participante" },
  { min: 5,  emoji: "⚡", titulo: "Ativo" },
  { min: 8,  emoji: "🔥", titulo: "Veterano" },
  { min: 12, emoji: "💎", titulo: "Lendário" },
  { min: 20, emoji: "👑", titulo: "Rei do Grupo" },
];

export function getTitulo(nivel) {
  let t = NIVEIS[0];
  for (const n of NIVEIS) if (nivel >= n.min) t = n;
  return t;
}

export function textoSubiuNivel(nome, nivel) {
  const t = getTitulo(nivel);
  return `🎉 *${nome}* subiu para o nível *${nivel}*!\n${t.emoji} Título: *${t.titulo}*`;
}

export function textoRanking() {
  const lista = getRanking(10);
  if (!lista.length) return "📊 Nenhum dado ainda. Comecem a conversar!";
  const medalhas = ["🥇", "🥈", "🥉"];
  const linhas = lista.map((u, i) => {
    const t = getTitulo(u.nivel);
    const pos = medalhas[i] || `${i + 1}.`;
    return `${pos} *${u.nome}* — Nv.${u.nivel} ${t.emoji} | ${u.xp} XP | 💰${u.moedas}`;
  });
  return "🏆 *Ranking do Grupo*\n\n" + linhas.join("\n");
}

export function textoPerfil(jid) {
  const u = getUsuario(jid);
  if (!u) return "❓ Você ainda não tem perfil. Manda uma mensagem primeiro!";
  const t = getTitulo(u.nivel);
  return (
    `${t.emoji} *${u.nome}*\n` +
    `├ Nível: *${u.nivel}* — ${t.titulo}\n` +
    `├ XP: *${u.xp}*\n` +
    `├ Moedas: 💰 *${u.moedas}*\n` +
    `├ Mensagens: *${u.msgs}*\n` +
    `└ Áudios: *${u.audios}*`
  );
}
