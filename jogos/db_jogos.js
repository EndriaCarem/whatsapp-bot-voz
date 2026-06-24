import Database from "better-sqlite3";

const db = new Database("grupo.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS jogos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    TEXT NOT NULL,
    tipo       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'aguardando',
    estado     TEXT NOT NULL DEFAULT '{}',
    criado_em  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(chat_id, status) ON CONFLICT REPLACE
  );

  CREATE TABLE IF NOT EXISTS jogadores (
    jogo_id  INTEGER NOT NULL,
    jid      TEXT NOT NULL,
    nome     TEXT NOT NULL,
    mao      TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (jogo_id, jid)
  );
`);

export function criarJogo(chatId, tipo) {
  // Só um jogo ativo por grupo
  const ativo = getJogoAtivo(chatId);
  if (ativo) return null;
  const info = db.prepare(
    "INSERT INTO jogos (chat_id, tipo, status, estado) VALUES (?,?,?,?)"
  ).run(chatId, tipo, "aguardando", "{}");
  return info.lastInsertRowid;
}

export function getJogoAtivo(chatId) {
  return db.prepare(
    "SELECT * FROM jogos WHERE chat_id=? AND status != 'encerrado' ORDER BY id DESC LIMIT 1"
  ).get(chatId);
}

export function getJogadores(jogoId) {
  return db.prepare("SELECT * FROM jogadores WHERE jogo_id=?").all(jogoId);
}

export function entrarJogo(jogoId, jid, nome) {
  const jaEntrou = db.prepare("SELECT 1 FROM jogadores WHERE jogo_id=? AND jid=?").get(jogoId, jid);
  if (jaEntrou) return false;
  db.prepare("INSERT INTO jogadores (jogo_id, jid, nome) VALUES (?,?,?)").run(jogoId, jid, nome);
  return true;
}

export function getMao(jogoId, jid) {
  const j = db.prepare("SELECT mao FROM jogadores WHERE jogo_id=? AND jid=?").get(jogoId, jid);
  return j ? JSON.parse(j.mao) : [];
}

export function setMao(jogoId, jid, mao) {
  db.prepare("UPDATE jogadores SET mao=? WHERE jogo_id=? AND jid=?")
    .run(JSON.stringify(mao), jogoId, jid);
}

export function getEstado(jogoId) {
  const j = db.prepare("SELECT estado FROM jogos WHERE id=?").get(jogoId);
  return j ? JSON.parse(j.estado) : {};
}

export function setEstado(jogoId, estado) {
  db.prepare("UPDATE jogos SET estado=? WHERE id=?")
    .run(JSON.stringify(estado), jogoId);
}

export function setStatus(jogoId, status) {
  db.prepare("UPDATE jogos SET status=? WHERE id=?").run(status, jogoId);
}

export function encerrarJogo(chatId) {
  const jogo = getJogoAtivo(chatId);
  if (!jogo) return;
  db.prepare("UPDATE jogos SET status='encerrado' WHERE id=?").run(jogo.id);
  db.prepare("DELETE FROM jogadores WHERE jogo_id=?").run(jogo.id);
}

export function sairJogo(jogoId, jid) {
  db.prepare("DELETE FROM jogadores WHERE jogo_id=? AND jid=?").run(jogoId, jid);
}
