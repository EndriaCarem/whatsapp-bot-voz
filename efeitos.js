import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Frequência de amostragem base. Todos os cálculos de pitch partem daqui.
const BASE_RATE = 44100;

/**
 * Catálogo de efeitos de voz.
 *
 * Cada efeito é uma cadeia de filtros do FFmpeg (-af).
 * Não usa IA — é pura manipulação de áudio:
 *   • asetrate  → muda a freq. de amostragem (grave/agudo)
 *   • atempo    → corrige a velocidade para não ficar lento/acelerado
 *   • aecho     → cria eco/reverb
 *   • vibrato   → oscilação rápida de pitch (textura robótica)
 *
 * Para adicionar um efeito novo, basta incluir uma entrada aqui.
 * A chave (ex: "fantasma") vira automaticamente o comando !fantasma no bot.
 */
export const EFEITOS = {
  demonio: {
    nome: "Demônio 😈",
    descricao: "Voz grave e pesada com eco",
    filtro: `asetrate=${BASE_RATE}*0.7,aresample=${BASE_RATE},atempo=1.0/0.7,aecho=0.8:0.7:60:0.5`,
  },
  esquilo: {
    nome: "Esquilo 🐿️",
    descricao: "Voz bem aguda, estilo chipmunk",
    filtro: `asetrate=${BASE_RATE}*1.5,aresample=${BASE_RATE},atempo=1.0/1.5`,
  },
  robo: {
    nome: "Robô 🤖",
    descricao: "Textura metálica com vibrato",
    filtro: `asetrate=${BASE_RATE}*0.9,aresample=${BASE_RATE},atempo=1.0/0.9,vibrato=f=8:d=0.6,aecho=0.6:0.5:20:0.4`,
  },
  estadio: {
    nome: "Estádio 🏟️",
    descricao: "Reverb enorme, como em uma arena",
    filtro: `aecho=0.8:0.9:1000|1800:0.3|0.25`,
  },
  agudo: {
    nome: "Agudo 🎵",
    descricao: "Voz levemente mais aguda",
    filtro: `asetrate=${BASE_RATE}*1.25,aresample=${BASE_RATE},atempo=1.0/1.25`,
  },
  grave: {
    nome: "Grave 🔊",
    descricao: "Voz levemente mais grave",
    filtro: `asetrate=${BASE_RATE}*0.8,aresample=${BASE_RATE},atempo=1.0/0.8`,
  },
};

// Executa o FFmpeg e aguarda a conclusão.
function rodarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg encerrou com código ${code}:\n${stderr}`));
    });
  });
}

/**
 * Aplica um efeito de voz em um buffer de áudio.
 *
 * @param {Buffer} bufferEntrada  Bytes do áudio original (qualquer formato que o FFmpeg leia)
 * @param {string} chaveEfeito    Chave do efeito, ex: "demonio", "robo"
 * @returns {Promise<Buffer>}     Áudio modificado em OGG/Opus (formato do WhatsApp PTT)
 */
export async function aplicarEfeito(bufferEntrada, chaveEfeito) {
  const efeito = EFEITOS[chaveEfeito];
  if (!efeito) throw new Error(`Efeito desconhecido: "${chaveEfeito}"`);

  // FFmpeg lê e escreve em disco — usamos arquivos temporários únicos.
  const id = randomUUID();
  const caminhoEntrada = join(tmpdir(), `voz-in-${id}`);
  const caminhoSaida   = join(tmpdir(), `voz-out-${id}.ogg`);

  try {
    await writeFile(caminhoEntrada, bufferEntrada);

    await rodarFFmpeg([
      "-y",                       // sobrescreve saída sem perguntar
      "-i", caminhoEntrada,       // arquivo de entrada
      "-af", efeito.filtro,       // cadeia de filtros do efeito
      "-c:a", "libopus",          // codec Opus (padrão do WhatsApp PTT)
      "-b:a", "64k",              // bitrate adequado para voz
      caminhoSaida,
    ]);

    return await readFile(caminhoSaida);
  } finally {
    // Sempre limpa os temporários, mesmo se ocorrer erro.
    await unlink(caminhoEntrada).catch(() => {});
    await unlink(caminhoSaida).catch(() => {});
  }
}

/**
 * Gera o texto do menu exibido quando alguém envia !menu.
 */
export function textoMenu() {
  const linhaEfeitos = Object.entries(EFEITOS)
    .map(([, e]) => `  • ${e.nome} — ${e.descricao}`)
    .join("\n");

  return (
    "🎙️ *Bot de Efeitos de Voz*\n\n" +
    "*Como usar:*\n" +
    "1️⃣ Grave ou abra uma mensagem de áudio no grupo\n" +
    "2️⃣ Responda esse áudio escrevendo *!voz*\n" +
    "3️⃣ Escolha o efeito nos botões que aparecerem\n" +
    "4️⃣ O bot devolve o áudio já modificado 🎉\n\n" +
    "*Efeitos disponíveis:*\n" +
    linhaEfeitos
  );
}
