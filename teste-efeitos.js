// teste-efeitos.js
// Testa os efeitos sem precisar do WhatsApp. Gera um audio de fala (via macOS
// "say"), aplica cada efeito e salva os resultados em ./teste-saidas/.
// Rode com: node teste-efeitos.js  (e depois ouca os .ogg gerados)

import { aplicarEfeito, EFEITOS } from "./efeitos.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";

const DIR = "teste-saidas";
await mkdir(DIR, { recursive: true });

// Gera uma fala base usando o comando "say" do macOS -> aiff -> buffer.
console.log("Gerando audio de teste com a voz do macOS...");
execSync(`say -o ${DIR}/base.aiff "Ola, isso e um teste do bot de efeitos de voz"`);
const base = await readFile(`${DIR}/base.aiff`);

for (const chave of Object.keys(EFEITOS)) {
  process.stdout.write(`Aplicando ${chave}... `);
  const saida = await aplicarEfeito(base, chave);
  await writeFile(`${DIR}/${chave}.ogg`, saida);
  console.log(`ok (${(saida.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n✅ Pronto! Ouca os arquivos em ./${DIR}/`);
