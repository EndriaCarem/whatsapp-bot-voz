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

  // ── Vovó e Vovô ────────────────────────────────────────────────────────────
  vovo: {
    nome: "Vovó 👵",
    descricao: "Voz aguda, trêmula e mais devagar",
    filtro: `asetrate=${BASE_RATE}*1.18,aresample=${BASE_RATE},atempo=1.0/1.18,atempo=0.9,vibrato=f=6.5:d=0.4`,
  },
  vovoh: {
    nome: "Vovô 👴",
    descricao: "Voz grave, trêmula e arrastada",
    filtro: `asetrate=${BASE_RATE}*0.82,aresample=${BASE_RATE},atempo=1.0/0.82,atempo=0.92,vibrato=f=5:d=0.5`,
  },

  // ── Personagens ──────────────────────────────────────────────────────────
  bebe: {
    nome: "Bebê 👶",
    descricao: "Voz fininha e fofa",
    filtro: `asetrate=${BASE_RATE}*1.7,aresample=${BASE_RATE},atempo=1.0/1.7,atempo=1.05`,
  },
  gigante: {
    nome: "Gigante 🗿",
    descricao: "Voz monstruosa e lenta, ecoada",
    filtro: `asetrate=${BASE_RATE}*0.6,aresample=${BASE_RATE},atempo=1.0/0.6,atempo=0.9,aecho=0.8:0.8:120:0.5`,
  },
  alien: {
    nome: "Alienígena 👽",
    descricao: "Voz metálica e oscilante do espaço",
    filtro: `asetrate=${BASE_RATE}*1.1,aresample=${BASE_RATE},atempo=1.0/1.1,vibrato=f=11:d=0.8,aphaser=type=t:speed=1.3,aecho=0.7:0.7:35:0.4`,
  },
  fantasma: {
    nome: "Fantasma 👻",
    descricao: "Voz assombrada com eco longo",
    filtro: `asetrate=${BASE_RATE}*0.92,aresample=${BASE_RATE},atempo=1.0/0.92,vibrato=f=3:d=0.7,aecho=0.9:0.9:500|900:0.4|0.3`,
  },
  coral: {
    nome: "Clones 👥",
    descricao: "Várias vozes ao mesmo tempo",
    filtro: `aecho=0.9:0.85:40|75|110:0.6|0.5|0.4,chorus=0.6:0.9:50|60:0.4|0.32:0.25|0.4:2|1.3`,
  },
  telefone: {
    nome: "Telefone ☎️",
    descricao: "Som de ligação, voz abafada",
    filtro: `highpass=f=400,lowpass=f=3000,acrusher=bits=8:mode=log`,
  },
  radio: {
    nome: "Rádio Antigo 📻",
    descricao: "Voz de rádio AM chiada",
    filtro: `highpass=f=500,lowpass=f=3400,vibrato=f=2:d=0.2,acrusher=bits=10:mode=log`,
  },
  bebado: {
    nome: "Bêbado 🍺",
    descricao: "Voz lenta e cambaleante",
    filtro: `asetrate=${BASE_RATE}*0.95,aresample=${BASE_RATE},atempo=1.0/0.95,atempo=0.85,vibrato=f=2.5:d=0.9`,
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
