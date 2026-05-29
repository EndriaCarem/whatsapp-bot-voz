// efeitos.js
// ----------------------------------------------------------------------------
// Aqui ficam os "efeitos de voz". Cada efeito e so um conjunto de filtros do
// FFmpeg aplicados no audio. Nao usa IA nenhuma: e manipulacao de pitch
// (tom grave/agudo), velocidade, eco e filtros. E exatamente o tipo de coisa
// que o Instagram faz por baixo dos panos nos efeitos classicos.
//
// O "asetrate" muda a frequencia de amostragem -> deixa a voz mais grave ou
// aguda. O "atempo" corrige a velocidade pra voz nao ficar acelerada/lenta.
// O "aecho" cria eco. O "afftdn"/filtros criam o ambiente (estadio, agua...).
// ----------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Taxa de amostragem base usada nos calculos de pitch.
const BASE_RATE = 44100;

// Cada efeito define a cadeia de filtros (-af) do FFmpeg.
// A chave (ex: "demonio") e o comando que o usuario digita: !demonio
export const EFEITOS = {
  demonio: {
    nome: "Demonio",
    // Voz bem grave + um eco curto pra dar peso.
    filtro: `asetrate=${BASE_RATE}*0.7,aresample=${BASE_RATE},atempo=1.0/0.7,aecho=0.8:0.7:60:0.5`,
  },
  esquilo: {
    nome: "Esquilo",
    // Voz bem aguda (tipo helio / chipmunk).
    filtro: `asetrate=${BASE_RATE}*1.5,aresample=${BASE_RATE},atempo=1.0/1.5`,
  },
  robo: {
    nome: "Robo",
    // Vibrato rapido + leve pitch dá uma textura metalica/robotica.
    filtro: `asetrate=${BASE_RATE}*0.9,aresample=${BASE_RATE},atempo=1.0/0.9,vibrato=f=8:d=0.6,aecho=0.6:0.5:20:0.4`,
  },
  estadio: {
    nome: "Estadio",
    // Reverb grande, como se estivesse num lugar enorme.
    filtro: `aecho=0.8:0.9:1000|1800:0.3|0.25`,
  },
  agudo: {
    nome: "Agudo",
    filtro: `asetrate=${BASE_RATE}*1.25,aresample=${BASE_RATE},atempo=1.0/1.25`,
  },
  grave: {
    nome: "Grave",
    filtro: `asetrate=${BASE_RATE}*0.8,aresample=${BASE_RATE},atempo=1.0/0.8`,
  },
};

// Roda o FFmpeg como um processo separado e espera ele terminar.
function rodarFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject); // ex: ffmpeg nao instalado
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg saiu com codigo ${code}:\n${stderr}`));
    });
  });
}

/**
 * Recebe o audio original (Buffer), aplica o efeito e devolve o novo audio.
 * @param {Buffer} bufferEntrada - bytes do audio recebido no WhatsApp
 * @param {string} chaveEfeito  - "demonio", "esquilo", etc.
 * @returns {Promise<Buffer>} bytes do audio modificado (formato .ogg/opus)
 */
export async function aplicarEfeito(bufferEntrada, chaveEfeito) {
  const efeito = EFEITOS[chaveEfeito];
  if (!efeito) throw new Error(`Efeito desconhecido: ${chaveEfeito}`);

  // Arquivos temporarios (FFmpeg le/escreve em disco).
  const id = randomUUID();
  const entrada = join(tmpdir(), `in-${id}`);
  const saida = join(tmpdir(), `out-${id}.ogg`);

  try {
    await writeFile(entrada, bufferEntrada);

    // -i entrada : arquivo de entrada
    // -af <filtro>: a cadeia de filtros do efeito
    // -c:a libopus -b:a 64k : exporta como opus, que e o codec de audio do
    //   WhatsApp (PTT/voice note). Isso garante que reproduza como mensagem
    //   de voz no app.
    await rodarFFmpeg([
      "-y",
      "-i", entrada,
      "-af", efeito.filtro,
      "-c:a", "libopus",
      "-b:a", "64k",
      saida,
    ]);

    return await readFile(saida);
  } finally {
    // Limpa os temporarios mesmo se der erro.
    await unlink(entrada).catch(() => {});
    await unlink(saida).catch(() => {});
  }
}

// Monta o texto do "menu" que o bot manda quando alguem pede ajuda.
export function textoMenu() {
  const nomes = Object.values(EFEITOS).map((e) => e.nome).join(", ");
  return (
    "🎙️ *Bot de Efeitos de Voz*\n\n" +
    "1️⃣ Responda a uma *mensagem de audio* escrevendo *!voz*\n" +
    "2️⃣ Toque no efeito que aparecer nos botoes\n" +
    "3️⃣ O bot devolve o audio ja modificado 🎉\n\n" +
    `Efeitos: ${nomes}`
  );
}
