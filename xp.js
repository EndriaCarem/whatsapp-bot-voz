import { getRanking, getUsuario, getDiasNoGrupo, isAdmin, xpTotal, getPontosHoje } from "./db.js";

// ── Cargos automáticos com tema de TI ────────────────────────────────────────
// Progressão baseada em dias no grupo + nível de XP.
// A ideia é que quanto mais tempo e participação, mais sênior você é.

const CARGOS_AUTO = [
  { diasMin: 0,  nivelMin: 1,  emoji: "🆕", titulo: "Novato"       },
  { diasMin: 4,  nivelMin: 1,  emoji: "🎓", titulo: "Estagiário"   },
  { diasMin: 9,  nivelMin: 1,  emoji: "💻", titulo: "Junior"       },
  { diasMin: 14, nivelMin: 3,  emoji: "⚙️",  titulo: "Pleno"        },
  { diasMin: 30, nivelMin: 5,  emoji: "🚀", titulo: "Sênior"       },
  { diasMin: 60, nivelMin: 8,  emoji: "🏗️",  titulo: "Tech Lead"    },
  { diasMin: 90, nivelMin: 12, emoji: "🧠", titulo: "Arquiteto"    },
  { diasMin: 180,nivelMin: 20, emoji: "👑", titulo: "CTO do Grupo" },
];

// Áreas de TI que membros podem definir via !cargo
export const AREAS_TI = [
  "Dev Frontend", "Dev Backend", "Full Stack", "Mobile", "DevOps",
  "Cloud", "Data Science", "IA/ML", "UX/UI", "Designer", "QA",
  "Segurança", "Infra", "DBA", "Product Owner", "Scrum Master",
  "Gestor de TI", "Suporte", "Redes",
];

export function getCargo(chatId, jid, nivel, ehAdmin = null) {
  const dias  = getDiasNoGrupo(chatId, jid);
  // Admin do grupo (WhatsApp) tem prioridade; cai pra tabela do bot se não vier de fora.
  const admin = ehAdmin !== null ? ehAdmin : isAdmin(jid);

  let candidatos = CARGOS_AUTO.filter(c => dias >= c.diasMin && nivel >= c.nivelMin);

  // Admin nunca aparece como Estagiário — mínimo Junior
  if (admin && candidatos.length === 0) candidatos = [CARGOS_AUTO[1]];

  return candidatos.length ? candidatos[candidatos.length - 1] : CARGOS_AUTO[0];
}

// Confere se o jid de um usuário está no conjunto de admins do grupo.
// O conjunto traz números sem sufixo (@lid / @s.whatsapp.net), por isso normalizamos.
function ehAdminGrupo(jid, adminsSet) {
  if (!adminsSet || !jid) return false;
  const numero = jid.split("@")[0].split(":")[0];
  return adminsSet.has(numero);
}

export function getTitulo(chatId, jid, nivel) {
  return getCargo(chatId, jid, nivel);
}

export function textoSubiuNivel(chatId, jid, nome, nivel) {
  const cargo    = getCargo(chatId, jid, nivel);
  const anterior = CARGOS_AUTO.filter(c => c.nivelMin < nivel).slice(-2, -1)[0];
  const mudouCargo = anterior && anterior.titulo !== cargo.titulo;

  let txt = `🎉 *${nome}* subiu para o nível *${nivel}*!\n${cargo.emoji} ${cargo.titulo}`;
  if (mudouCargo) txt += `\n🆙 Novo cargo: *${cargo.titulo}*! Parabéns!`;
  return txt;
}

export function textoRanking(chatId, adminsSet = null) {
  // Pega bastante gente pra conseguir 10 membros mesmo separando os admins.
  const lista = getRanking(chatId, 50);
  if (!lista.length) return "📊 Nenhum dado ainda. Comecem a conversar!";

  const admins  = lista.filter(u => ehAdminGrupo(u.jid, adminsSet));
  const membros = lista.filter(u => !ehAdminGrupo(u.jid, adminsSet));

  const linhaUsuario = (u, pos) => {
    const admin  = ehAdminGrupo(u.jid, adminsSet);
    // Cargo vem do nível TOTAL (senioridade permanente).
    const cargo  = getCargo(chatId, u.jid || "", u.nivel, admin);
    const area   = u.area_ti      ? ` • ${u.area_ti}`       : "";
    const custom = u.cargo_custom ? ` [${u.cargo_custom}]`  : "";
    // O número exibido é o XP DO MÊS (a competição da temporada).
    return `${pos} *${u.nome}*${custom} — ${cargo.emoji} ${cargo.titulo}${area} | ${u.xp_mes} XP`;
  };

  const medalhas = ["🥇", "🥈", "🥉"];
  let txt = "🏆 *Ranking do Grupo*\n";

  // ── Admins primeiro (seção separada, não competem com os membros) ──
  if (admins.length) {
    txt += "\n👑 *Staff (Admins)*\n";
    txt += admins.map(u => linhaUsuario(u, "👑")).join("\n");
    txt += "\n\n━━━━━━━━━━━━━━━━━━\n🙌 *Membros*\n";
  }

  // ── Membros ──
  const topMembros = membros.slice(0, 10);
  txt += (admins.length ? "" : "\n") + topMembros
    .map((u, i) => linhaUsuario(u, medalhas[i] || `${i + 1}.`))
    .join("\n");

  // Nota da temporada: o ranking (XP do mês) zera; cargo/senioridade não.
  txt += "\n\n━━━━━━━━━━━━━━━━━━\n_🏁 Temporada mensal: o XP do ranking zera todo mês. Seu cargo/senioridade não zera._";

  return txt;
}

export function textoPerfil(chatId, jid) {
  const u = getUsuario(chatId, jid);
  if (!u) return "❓ Você ainda não tem perfil. Manda uma mensagem primeiro!";

  const cargo  = getCargo(chatId, jid, u.nivel);
  const dias   = getDiasNoGrupo(chatId, jid);
  const area   = u.area_ti    ? `\n├ Especialidade: *${u.area_ti}*`   : "";
  const custom = u.cargo_custom ? `\n├ Cargo: *[${u.cargo_custom}]*`  : "";

  const total = xpTotal(u.nivel, u.xp);

  const tipoEmoji = { entrada: "🟢", intervalo: "🟡", retorno: "🔵", saida: "🔴" };
  const tipoLabel = { entrada: "Entrada", intervalo: "Intervalo", retorno: "Retorno", saida: "Saída" };
  const pontos = getPontosHoje(chatId, jid);
  const pontoTxt = pontos.length
    ? "\n├ 🕐 *Ponto hoje:*\n" +
      pontos.map(p => {
        const h = new Date(p.ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `│  ${tipoEmoji[p.tipo] || "⚪"} ${tipoLabel[p.tipo] || p.tipo} — ${h}`;
      }).join("\n")
    : "";

  return (
    `${cargo.emoji} *${u.nome}*\n` +
    `├ Cargo: *${cargo.titulo}* (${dias} dias no grupo)` +
    custom + area + "\n" +
    `├ Nível: *${u.nivel}* | XP total: *${total}*\n` +
    `├ 🏁 XP da temporada: *${u.xp_mes}*\n` +
    `├ Moedas: 💰 *${u.moedas}*\n` +
    `├ Msgs: *${u.msgs}* | Áudios: *${u.audios}*` +
    pontoTxt
  );
}

export function textoRegras() {
  const descricoes = {
    "Novato":       "dias 0 a 3 — todo mundo começa aqui",
    "Estagiário":   "a partir do 4º dia",
    "Junior":       "a partir do 9º dia",
    "Pleno":        "2 semanas no grupo | nível 3+",
    "Sênior":       "1 mês no grupo | nível 5+",
    "Tech Lead":    "2 meses no grupo | nível 8+",
    "Arquiteto":    "3 meses no grupo | nível 12+",
    "CTO do Grupo": "6 meses no grupo | nível 20+",
  };
  const linhas = CARGOS_AUTO.map(c => `${c.emoji} *${c.titulo}* — ${descricoes[c.titulo]}`);
  return (
    `📋 *Regras do Grupo — Galera do TI*\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🎖️ *CARGOS*\n` +
    `Sobem automaticamente com tempo + participação:\n\n` +
    linhas.join("\n") +

    `\n\n━━━━━━━━━━━━━━━━━━\n` +
    `⚡ *XP*\n` +
    `• +5 XP por mensagem de texto\n` +
    `• +15 XP por áudio\n` +
    `• Subir de nível = novo cargo quando atingir os requisitos\n` +

    `\n━━━━━━━━━━━━━━━━━━\n` +
    `💰 *MOEDAS*\n` +
    `• +1 moeda por mensagem\n` +
    `• +3 moedas por áudio\n` +
    `• *!daily* — bônus diário (resgate 1x por dia):\n` +
    `  0-3 dias no grupo → +5 💰\n` +
    `  3-7 dias → +10 💰\n` +
    `  7-14 dias → +15 💰\n` +
    `  14-30 dias → +20 💰\n` +
    `  30+ dias → +30 💰\n` +
    `• *!transferir @pessoa 50* — envie moedas pra quem quiser\n` +

    `\n━━━━━━━━━━━━━━━━━━\n` +
    `🌟 *ADMIN DESTAQUE*\n` +
    `Admin mais ativo da semana, renovado toda segunda-feira.\n` +
    `Use *!destaque* pra ver quem é.\n` +

    `\n━━━━━━━━━━━━━━━━━━\n` +
    `🔧 *COMANDOS ÚTEIS*\n` +
    `!perfil • !ranking • !moedas • !daily\n` +
    `!transferir • !regras • !destaque\n` +
    `!cargo (só admins) — define cargo personalizado`
  );
}
