import Database from "better-sqlite3";

const db = new Database("grupo.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    jid       TEXT PRIMARY KEY,
    nome      TEXT NOT NULL DEFAULT 'Anônimo',
    xp        INTEGER NOT NULL DEFAULT 0,
    nivel     INTEGER NOT NULL DEFAULT 1,
    moedas    INTEGER NOT NULL DEFAULT 0,
    msgs      INTEGER NOT NULL DEFAULT 0,
    audios    INTEGER NOT NULL DEFAULT 0,
    ultima_msg INTEGER NOT NULL DEFAULT 0
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

// ── Usuários ──────────────────────────────────────────────────────────────────

export function getUsuario(jid) {
  return db.prepare("SELECT * FROM usuarios WHERE jid = ?").get(jid);
}

export function upsertUsuario(jid, nome) {
  db.prepare(`
    INSERT INTO usuarios (jid, nome) VALUES (?, ?)
    ON CONFLICT(jid) DO UPDATE SET nome = excluded.nome
  `).run(jid, nome || "Anônimo");
}

// ── XP e níveis ───────────────────────────────────────────────────────────────

const XP_POR_NIVEL = (n) => 100 * n * n;

export function addXP(jid, nome, qtd) {
  upsertUsuario(jid, nome);
  const u = getUsuario(jid);
  let xpNovo = u.xp + qtd;
  let nivel = u.nivel;
  while (xpNovo >= XP_POR_NIVEL(nivel + 1)) {
    xpNovo -= XP_POR_NIVEL(nivel + 1);
    nivel++;
  }
  db.prepare("UPDATE usuarios SET xp=?, nivel=?, msgs=msgs+1, ultima_msg=? WHERE jid=?")
    .run(xpNovo, nivel, Date.now(), jid);
  return { subiuNivel: nivel > u.nivel, nivelNovo: nivel };
}

export function addAudio(jid, nome) {
  upsertUsuario(jid, nome);
  db.prepare("UPDATE usuarios SET audios=audios+1 WHERE jid=?").run(jid);
}

export function addMoedas(jid, qtd) {
  db.prepare("UPDATE usuarios SET moedas=moedas+? WHERE jid=?").run(qtd, jid);
}

export function getRanking(limit = 10) {
  return db.prepare(`
    SELECT nome, nivel, xp, moedas, msgs
    FROM usuarios ORDER BY nivel DESC, xp DESC LIMIT ?
  `).all(limit);
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
  // mantém só as últimas 500 mensagens por grupo
  db.prepare(`
    DELETE FROM mensagens_log WHERE chat_id=? AND id NOT IN (
      SELECT id FROM mensagens_log WHERE chat_id=? ORDER BY id DESC LIMIT 500
    )
  `).run(chatId, chatId);
}

export function getMensagensRecentes(chatId, limit = 80) {
  return db.prepare(
    "SELECT nome, tipo, texto, ts FROM mensagens_log WHERE chat_id=? ORDER BY id DESC LIMIT ?"
  ).all(chatId, limit).reverse();
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

export default db;
