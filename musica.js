import { spawn } from "node:child_process";
import { readFile, unlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Baixa música via yt-dlp (busca no YouTube por nome ou usa link direto)
// e devolve o áudio em MP3, pronto pra mandar no WhatsApp.

const LIMITE_SEGUNDOS = 600; // 10 min — evita baixar vídeo/álbum gigante
const LIMITE_BYTES = 16 * 1024 * 1024; // ~16MB, limite prático de envio no WhatsApp

function ehLink(texto) {
  return /^https?:\/\//i.test(texto.trim());
}

// Roda um comando e captura stdout/stderr.
function rodar(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => (stdout += c.toString()));
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${cmd} saiu com código ${code}`));
    });
  });
}

/**
 * Busca e baixa uma música.
 * @param {string} consulta  Nome da música ou link do YouTube
 * @returns {Promise<{buffer: Buffer, titulo: string, duracao: number}>}
 */
export async function baixarMusica(consulta) {
  const termo = consulta.trim();
  if (!termo) throw new Error("Diz o nome ou manda o link da música.");

  // Se não for link, busca o primeiro resultado no YouTube (ytsearch1).
  const alvo = ehLink(termo) ? termo : `ytsearch1:${termo}`;

  const id = randomUUID();
  // Template fixo pra localizar o arquivo certinho depois (sem depender do título).
  const base = join(tmpdir(), `musica-${id}`);

  try {
    // --print title imprime o título real do vídeo (antes da conversão).
    const stdout = await rodar("yt-dlp", [
      "-x",                          // extrai só o áudio
      "--audio-format", "mp3",       // converte pra mp3 (usa o ffmpeg)
      "--audio-quality", "128K",     // 128kbps: ótimo pra voz/música no WhatsApp e leve
      "-f", "bestaudio/best",        // pega só a faixa de áudio (não o vídeo inteiro)
      "--no-playlist",               // nunca baixa playlist inteira
      "--match-filter", `duration < ${LIMITE_SEGUNDOS}`, // ignora coisas longas demais
      "--print", "after_move:%(title)s", // título APÓS baixar (não ativa modo simulação)
      "--no-warnings",
      "-o", `${base}.%(ext)s`,
      alvo,
    ]);

    // Localiza o arquivo .mp3 gerado (o yt-dlp resolve a extensão).
    const dir = tmpdir();
    const arquivos = await readdir(dir);
    const nome = arquivos.find((f) => f.startsWith(`musica-${id}`) && f.endsWith(".mp3"));
    if (!nome) throw new Error("Não achei nenhuma música pra esse termo.");

    const caminho = join(dir, nome);
    const buffer = await readFile(caminho);
    await unlink(caminho).catch(() => {});

    if (buffer.length > LIMITE_BYTES) {
      throw new Error("Essa música ficou grande demais pra mandar aqui.");
    }

    const titulo = stdout.trim().split("\n")[0] || "Música";
    return { buffer, titulo };
  } catch (err) {
    // Limpa qualquer arquivo parcial que tenha sobrado.
    try {
      const sobras = (await readdir(tmpdir())).filter((f) => f.startsWith(`musica-${id}`));
      for (const f of sobras) await unlink(join(tmpdir(), f)).catch(() => {});
    } catch { /* ignora */ }

    const m = err.message || "";
    if (/match-filter|duration/.test(m)) throw new Error("Essa música é longa demais (máx 10 min).");
    if (/Unsupported URL|is not a valid URL/.test(m)) throw new Error("Esse link não é suportado.");
    if (/Sign in|age|private|unavailable/i.test(m)) throw new Error("Não consegui acessar essa música (privada ou restrita).");
    throw new Error(m.split("\n").slice(-1)[0] || "Falha ao baixar a música.");
  }
}
