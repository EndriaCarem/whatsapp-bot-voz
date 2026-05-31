import Database from "better-sqlite3";

const db = new Database("grupo.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    chat_id    TEXT NOT NULL DEFAULT 'global',
    jid        TEXT NOT NULL,
    nome       TEXT NOT NULL DEFAULT 'Anônimo',
    xp         INTEGER NOT NULL DEFAULT 0,
    xp_mes     INTEGER NOT NULL DEFAULT 0,
    nivel      INTEGER NOT NULL DEFAULT 1,
    moedas     INTEGER NOT NULL DEFAULT 0,
    msgs       INTEGER NOT NULL DEFAULT 0,
    audios     INTEGER NOT NULL DEFAULT 0,
    ultima_msg INTEGER NOT NULL DEFAULT 0,
    entrou_em  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    cargo_custom TEXT,
    area_ti    TEXT,
    signo      TEXT,
    PRIMARY KEY (chat_id, jid)
  );

  CREATE TABLE IF NOT EXISTS conquistas (
    jid        TEXT NOT NULL,
    conquista  TEXT NOT NULL,
    obtida_em  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (jid, conquista)
  );

  CREATE TABLE IF NOT EXISTS enquetes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id   TEXT NOT NULL,
    criador   TEXT NOT NULL,
    pergunta  TEXT NOT NULL,
    opcoes    TEXT NOT NULL,
    ativa     INTEGER NOT NULL DEFAULT 1,
    criada_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS votos (
    enquete_id INTEGER NOT NULL,
    jid        TEXT NOT NULL,
    opcao      INTEGER NOT NULL,
    PRIMARY KEY (enquete_id, jid)
  );

  CREATE TABLE IF NOT EXISTS mensagens_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id   TEXT NOT NULL,
    jid       TEXT NOT NULL,
    nome      TEXT NOT NULL,
    tipo      TEXT NOT NULL DEFAULT 'text',
    texto     TEXT,
    ts        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    jid TEXT PRIMARY KEY
  );
`);

// Migrações para bancos já existentes (CREATE TABLE IF NOT EXISTS não altera colunas).
function adicionarColuna(tabela, coluna, tipo) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (!cols.some(c => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
}
adicionarColuna("usuarios", "signo", "TEXT");
// XP da temporada (mensal): zera todo mês, usado só no ranking. O `xp`/`nivel`
// continuam sendo o total permanente que define cargo/senioridade.
adicionarColuna("usuarios", "xp_mes", "INTEGER NOT NULL DEFAULT 0");

// ── Usuários ──────────────────────────────────────────────────────────────────

export function getUsuario(chatId, jid) {
  return db.prepare("SELECT * FROM usuarios WHERE chat_id=? AND jid=?").get(chatId, jid);
}

export function upsertUsuario(chatId, jid, nome) {
  db.prepare(`
    INSERT INTO usuarios (chat_id, jid, nome) VALUES (?,?,?)
    ON CONFLICT(chat_id, jid) DO UPDATE SET nome = excluded.nome
  `).run(chatId, jid, nome || "Anônimo");
}

// ── XP e níveis ───────────────────────────────────────────────────────────────

const XP_POR_NIVEL = (n) => 100 * n * n;

// XP total acumulado = soma do XP necessário pra chegar no nível atual + XP residual.
// Usado no ranking pra refletir o esforço real (o campo `xp` guarda só o residual).
export function xpTotal(nivel, xpResidual) {
  let total = xpResidual;
  for (let n = 2; n <= nivel; n++) total += XP_POR_NIVEL(n);
  return total;
}

export function addXP(chatId, jid, nome, qtd) {
  upsertUsuario(chatId, jid, nome);
  const u = getUsuario(chatId, jid);
  let xpNovo = u.xp + qtd;
  let nivel = u.nivel;
  while (xpNovo >= XP_POR_NIVEL(nivel + 1)) {
    xpNovo -= XP_POR_NIVEL(nivel + 1);
    nivel++;
  }
  // xp/nivel = total permanente (define cargo). xp_mes = temporada (zera no mês).
  db.prepare("UPDATE usuarios SET xp=?, nivel=?, xp_mes=xp_mes+?, msgs=msgs+1, ultima_msg=? WHERE chat_id=? AND jid=?")
    .run(xpNovo, nivel, qtd, Date.now(), chatId, jid);
  return { subiuNivel: nivel > u.nivel, nivelNovo: nivel };
}

export function addAudio(chatId, jid, nome) {
  upsertUsuario(chatId, jid, nome);
  db.prepare("UPDATE usuarios SET audios=audios+1 WHERE chat_id=? AND jid=?").run(chatId, jid);
}

export function addMoedas(chatId, jid, qtd) {
  db.prepare("UPDATE usuarios SET moedas=moedas+? WHERE chat_id=? AND jid=?").run(qtd, chatId, jid);
}

export function getMoedas(chatId, jid) {
  const u = getUsuarioPorJid(chatId, jid);
  return u?.moedas ?? 0;
}

export function transferirMoedas(chatId, jidOrigem, jidDestino, qtd) {
  // Usa os jids reais do banco (resolve formato @lid vs @s.whatsapp.net)
  const uOrigem  = getUsuarioPorJid(chatId, jidOrigem);
  const uDestino = getUsuarioPorJid(chatId, jidDestino);
  if (!uOrigem || !uDestino) return { ok: false, saldo: uOrigem?.moedas ?? 0, erro: "usuario_nao_encontrado" };
  if (uOrigem.moedas < qtd) return { ok: false, saldo: uOrigem.moedas };
  db.prepare("UPDATE usuarios SET moedas=moedas-? WHERE chat_id=? AND jid=?").run(qtd, chatId, uOrigem.jid);
  db.prepare("UPDATE usuarios SET moedas=moedas+? WHERE chat_id=? AND jid=?").run(qtd, chatId, uDestino.jid);
  return { ok: true, saldo: uOrigem.moedas - qtd };
}

// Bônus diário — retorna as moedas ganhas ou 0 se já resgatou hoje
export function bonusDiario(chatId, jid, dias) {
  const chave = `daily:${chatId}:${jid}`;
  const hoje  = new Date().toDateString();
  const ultimo = getConfig(chave, "");
  if (ultimo === hoje) return 0;
  // Quanto mais tempo no grupo, maior o bônus diário
  const bonus = dias >= 30 ? 30 : dias >= 14 ? 20 : dias >= 7 ? 15 : dias >= 3 ? 10 : 5;
  db.prepare("UPDATE usuarios SET moedas=moedas+? WHERE chat_id=? AND jid=?").run(bonus, chatId, jid);
  setConfig(chave, hoje);
  return bonus;
}

// Busca usuário por parte do nome (pra transferência)
export function buscarUsuarioPorNome(chatId, nome) {
  return db.prepare(
    "SELECT * FROM usuarios WHERE chat_id=? AND LOWER(nome) LIKE LOWER(?)"
  ).get(chatId, `%${nome}%`);
}

// Busca usuário por jid — tenta tanto @lid quanto @s.whatsapp.net
// O WhatsApp usa dois formatos de JID e a menção pode vir em qualquer um.
export function getUsuarioPorJid(chatId, jid) {
  const numero = jid.split("@")[0].split(":")[0];
  // Tenta match direto primeiro
  const direto = db.prepare("SELECT * FROM usuarios WHERE chat_id=? AND jid=?").get(chatId, jid);
  if (direto) return direto;
  // Tenta pelo número sem sufixo (funciona com @lid e @s.whatsapp.net)
  return db.prepare("SELECT * FROM usuarios WHERE chat_id=? AND (jid LIKE ? OR jid LIKE ?)")
    .get(chatId, `${numero}@%`, `${numero}:%`);
}

export function getRanking(chatId, limit = 10) {
  const rows = db.prepare(`
    SELECT jid, nome, nivel, xp, xp_mes, moedas, msgs, cargo_custom, area_ti
    FROM usuarios WHERE chat_id=?
  `).all(chatId);
  // Ranking = competição da temporada → ordena pelo XP do mês.
  // O cargo/nível continua usando o XP total (campo nivel), preservado no reset.
  return rows
    .map(u => ({ ...u, xpTotal: xpTotal(u.nivel, u.xp) }))
    .sort((a, b) => (b.xp_mes - a.xp_mes) || (b.xpTotal - a.xpTotal))
    .slice(0, limit);
}

// ── Temporada mensal ────────────────────────────────────────────────────────
// O RANKING é uma "temporada" mensal: compete-se pelo XP do mês (xp_mes), que
// zera todo mês. O XP TOTAL (xp/nivel) e a senioridade/cargo NÃO zeram — assim
// quem é Sênior continua Sênior, e o cargo não despenca toda virada de mês.
// Preservados no reset: xp, nivel, moedas, entrou_em, cargos. Zera só: xp_mes.

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Verifica se virou o mês para este grupo. Se virou, zera a temporada e
// retorna o mês anterior (pra avisar no grupo); senão retorna null.
export function checarResetMensal(chatId) {
  const chave = `temporada:${chatId}`;
  const mes   = mesAtual();
  const ultimo = getConfig(chave, null);

  // Primeira vez que vemos o grupo: só registra o mês, não zera nada.
  if (ultimo === null) {
    setConfig(chave, mes);
    return null;
  }
  if (ultimo === mes) return null;

  // Virou o mês → zera SÓ o XP da temporada. Cargo/nível/total continuam.
  db.prepare("UPDATE usuarios SET xp_mes=0 WHERE chat_id=?").run(chatId);
  setConfig(chave, mes);
  return ultimo; // mês que acabou
}

export function getMesTemporada() {
  return mesAtual();
}

// ── Enquetes ──────────────────────────────────────────────────────────────────

export function criarEnquete(chatId, criador, pergunta, opcoes) {
  const res = db.prepare(
    "INSERT INTO enquetes (chat_id, criador, pergunta, opcoes) VALUES (?,?,?,?)"
  ).run(chatId, criador, pergunta, JSON.stringify(opcoes));
  return res.lastInsertRowid;
}

export function getEnqueteAtiva(chatId) {
  return db.prepare("SELECT * FROM enquetes WHERE chat_id=? AND ativa=1 ORDER BY id DESC LIMIT 1").get(chatId);
}

export function votar(enqueteId, jid, opcao) {
  try {
    db.prepare("INSERT INTO votos (enquete_id, jid, opcao) VALUES (?,?,?)").run(enqueteId, jid, opcao);
    return true;
  } catch {
    db.prepare("UPDATE votos SET opcao=? WHERE enquete_id=? AND jid=?").run(opcao, enqueteId, jid);
    return false;
  }
}

export function getResultados(enqueteId) {
  return db.prepare(`
    SELECT opcao, COUNT(*) as total FROM votos WHERE enquete_id=? GROUP BY opcao ORDER BY opcao
  `).all(enqueteId);
}

export function encerrarEnquete(enqueteId) {
  db.prepare("UPDATE enquetes SET ativa=0 WHERE id=?").run(enqueteId);
}

// ── Log de mensagens ──────────────────────────────────────────────────────────

export function logMsg(chatId, jid, nome, tipo, texto) {
  db.prepare("INSERT INTO mensagens_log (chat_id,jid,nome,tipo,texto) VALUES (?,?,?,?,?)").run(chatId, jid, nome, tipo, texto || null);
  // mantém só as últimas 3000 mensagens por grupo
  // (suficiente pra cobrir o resumo da semana mesmo em grupos bem ativos)
  db.prepare(`
    DELETE FROM mensagens_log WHERE chat_id=? AND id NOT IN (
      SELECT id FROM mensagens_log WHERE chat_id=? ORDER BY id DESC LIMIT 3000
    )
  `).run(chatId, chatId);
}

export function getMensagensRecentes(chatId, limit = 80) {
  return db.prepare(
    "SELECT nome, tipo, texto, ts FROM mensagens_log WHERE chat_id=? ORDER BY id DESC LIMIT ?"
  ).all(chatId, limit).reverse();
}

// Mensagens dentro de uma janela de tempo (em horas a partir de agora).
// Usado pelo resumo pra cobrir "o dia" / "a semana" de verdade, e não só as últimas N.
// O `limit` serve só de teto pra não estourar o tamanho do prompt.
export function getMensagensPorPeriodo(chatId, horas, limit = 300) {
  const desde = Math.floor(Date.now() / 1000) - horas * 3600;
  return db.prepare(
    "SELECT nome, tipo, texto, ts FROM mensagens_log WHERE chat_id=? AND ts>=? ORDER BY id DESC LIMIT ?"
  ).all(chatId, desde, limit).reverse();
}

// Busca tudo que o bot sabe sobre uma pessoa específica no grupo.
// Usado pela IA pra responder perguntas sobre alguém com contexto real.
export function getContextoPessoa(chatId, nome) {
  // Últimas 30 mensagens da pessoa
  const msgs = db.prepare(`
    SELECT texto, tipo, ts FROM mensagens_log
    WHERE chat_id=? AND nome=? AND texto IS NOT NULL
    ORDER BY id DESC LIMIT 30
  `).all(chatId, nome);

  // Dados de XP/perfil (busca por nome pois pode não ter o jid)
  const perfil = db.prepare(
    "SELECT nivel, xp, msgs, audios FROM usuarios WHERE chat_id=? AND nome=?"
  ).get(chatId, nome);

  // Com quem ela mais interagiu (quem ela mais respondeu)
  const interacoes = db.prepare(`
    SELECT nome, COUNT(*) as total FROM mensagens_log
    WHERE chat_id=? AND texto LIKE '%' || ? || '%' AND nome != ?
    ORDER BY total DESC LIMIT 3
  `).all(chatId, nome, nome);

  return { msgs: msgs.reverse(), perfil, interacoes };
}

export function getStatsGrupo(chatId) {
  const hoje = Math.floor(Date.now() / 1000) - 86400;
  const semana = Math.floor(Date.now() / 1000) - 604800;
  return {
    hoje: db.prepare("SELECT COUNT(*) as n FROM mensagens_log WHERE chat_id=? AND ts>?").get(chatId, hoje).n,
    semana: db.prepare("SELECT COUNT(*) as n FROM mensagens_log WHERE chat_id=? AND ts>?").get(chatId, semana).n,
    topFalantes: db.prepare(`
      SELECT nome, COUNT(*) as n FROM mensagens_log WHERE chat_id=? AND ts>?
      GROUP BY jid ORDER BY n DESC LIMIT 5
    `).all(chatId, semana),
    maisAudios: db.prepare(`
      SELECT nome, COUNT(*) as n FROM mensagens_log WHERE chat_id=? AND tipo='audio' AND ts>?
      GROUP BY jid ORDER BY n DESC LIMIT 3
    `).all(chatId, semana),
    sumidos: db.prepare(`
      SELECT u.nome, u.ultima_msg FROM usuarios u
      WHERE u.ultima_msg > 0 AND u.ultima_msg < ? AND u.jid IN (
        SELECT DISTINCT jid FROM mensagens_log WHERE chat_id=?
      ) ORDER BY u.ultima_msg ASC LIMIT 5
    `).all((Date.now() - 3 * 86400000), chatId),
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

export function getConfig(chave, padrao = null) {
  const row = db.prepare("SELECT valor FROM config WHERE chave=?").get(chave);
  return row ? row.valor : padrao;
}

export function setConfig(chave, valor) {
  db.prepare("INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor")
    .run(chave, valor);
}

// ── Admins ────────────────────────────────────────────────────────────────────

export function isAdmin(jid) {
  return !!db.prepare("SELECT 1 FROM admins WHERE jid=?").get(jid);
}

export function addAdmin(jid) {
  db.prepare("INSERT OR IGNORE INTO admins (jid) VALUES (?)").run(jid);
}

export function removeAdmin(jid) {
  db.prepare("DELETE FROM admins WHERE jid=?").run(jid);
}

// Retorna o admin que mais mandou mensagens nos últimos 7 dias
export function getAdminDestaque(chatId) {
  const semanaAtras = Math.floor(Date.now() / 1000) - 7 * 86400;
  return db.prepare(`
    SELECT m.nome, m.jid, COUNT(*) as total
    FROM mensagens_log m
    INNER JOIN admins a ON a.jid = m.jid
    WHERE m.chat_id = ? AND m.ts >= ?
    GROUP BY m.jid
    ORDER BY total DESC
    LIMIT 1
  `).get(chatId, semanaAtras);
}

// ── Cargos ────────────────────────────────────────────────────────────────────

export function setCargoCustom(chatId, jid, cargo) {
  db.prepare("UPDATE usuarios SET cargo_custom=? WHERE chat_id=? AND jid=?")
    .run(cargo, chatId, jid);
}

export function setAreaTi(chatId, jid, area) {
  db.prepare("UPDATE usuarios SET area_ti=? WHERE chat_id=? AND jid=?")
    .run(area, chatId, jid);
}


export function getDiasNoGrupo(chatId, jid) {
  const u = db.prepare("SELECT entrou_em FROM usuarios WHERE chat_id=? AND jid=?").get(chatId, jid);
  if (!u) return 0;
  return Math.floor((Date.now() / 1000 - u.entrou_em) / 86400);
}

export default db;
