import { GoogleGenerativeAI } from "@google/generative-ai";
import { getMensagensRecentes, getConfig, setConfig } from "./db.js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
let genAI = null;

// Modelos em ordem de preferência. Se o primeiro estiver sobrecarregado (503),
// o bot tenta o próximo automaticamente.
const MODELOS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const modelosCache = {};

function getGenAI() {
  if (!GEMINI_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_KEY);
  return genAI;
}

// Mantido por compatibilidade — indica se a IA está configurada
function getModel() {
  return getGenAI() ? true : null;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Gera conteúdo com retry e fallback de modelo.
// Tenta cada modelo até 2 vezes antes de passar pro próximo.
async function gerar(prompt) {
  const ai = getGenAI();
  if (!ai) return null;

  for (const nomeModelo of MODELOS) {
    if (!modelosCache[nomeModelo]) {
      modelosCache[nomeModelo] = ai.getGenerativeModel({ model: nomeModelo });
    }
    const m = modelosCache[nomeModelo];

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const result = await m.generateContent(prompt);
        return result.response.text().trim();
      } catch (err) {
        const msg = err.message || "";
        const sobrecarga = msg.includes("503") || msg.includes("overloaded") || msg.includes("high demand") || msg.includes("429");
        console.error(`Gemini [${nomeModelo}] tentativa ${tentativa}: ${msg.slice(0, 80)}`);
        if (sobrecarga && tentativa === 1) {
          await delay(1500); // espera e tenta de novo no mesmo modelo
          continue;
        }
        break; // erro não-recuperável ou já tentou 2x → próximo modelo
      }
    }
  }
  return null;
}

const PERSONALIDADE = `Você é o Axolotl-Byte, o bot do grupo de WhatsApp, criado pela comunidade da galera do TI.
Se alguém perguntar seu nome ou quem te criou: você é o Axolotl-Byte, feito pela comunidade/galera do TI.

Sua personalidade:
- Engraçado, sarcástico na medida certa, mas sempre amigável
- Fala de forma descontraída, usa gírias brasileiras naturalmente
- Conhece bem a galera do grupo e comenta sobre elas
- Às vezes faz observações inesperadas e perspicazes
- NÃO usa asteriscos para negrito, fala normalmente
- Respostas BEM curtas e diretas (1 a 2 frases no máximo)
- Nunca diz que é uma IA, é um membro do grupo mesmo`;

// ── Modo livre ────────────────────────────────────────────────────────────────

export function isModoLivre(chatId) {
  return getConfig(`modolivre:${chatId}`, "0") === "1";
}

export function setModoLivre(chatId, ativo) {
  setConfig(`modolivre:${chatId}`, ativo ? "1" : "0");
}

// ── Resposta da IA ────────────────────────────────────────────────────────────

export async function responderIA(chatId, pergunta, remetente) {
  const m = getModel();
  if (!m) return "⚠️ Chave do Gemini não configurada. Adicione GEMINI_API_KEY no .env";

  const historico = getMensagensRecentes(chatId, 30);
  const contexto = historico
    .map(h => `${h.nome}: ${h.texto || "[áudio]"}`)
    .join("\n");

  const prompt = `${PERSONALIDADE}

Histórico recente do grupo:
${contexto || "(sem histórico ainda)"}

${remetente} disse: "${pergunta}"

Responda como o Axolotl-Byte:`;

  const r = await gerar(prompt);
  return r || "Opa, tô meio sobrecarregado agora 😵 tenta de novo em uns segundos!";
}

// ── Resumo do grupo ───────────────────────────────────────────────────────────

export async function resumoGrupo(chatId, tipo = "dia") {
  const m = getModel();
  if (!m) return "⚠️ Gemini não configurado.";

  const historico = getMensagensRecentes(chatId, tipo === "semana" ? 200 : 80);
  if (historico.length < 3) return "📭 Poucas mensagens para resumir ainda.";

  const texto = historico
    .map(h => `${h.nome}: ${h.texto || "[áudio]"}`)
    .join("\n");

  const prompt = `${PERSONALIDADE}

Aqui estão as mensagens recentes do grupo:
${texto}

Faça um resumo ${tipo === "semana" ? "da semana" : "do dia"} do grupo.
REGRAS IMPORTANTES:
- Foque em FATOS CONCRETOS: o que cada pessoa falou, decisões, conversas que rolaram
- SEMPRE cite os nomes das pessoas e o que elas disseram/fizeram
- Nada de enrolação ou frases genéricas — só o que realmente aconteceu
- Use tópicos curtos com emoji, tipo bullet points
- Máximo 8 linhas. Seja direto.`;

  const r = await gerar(prompt);
  if (!r) return "Não consegui gerar o resumo agora (servidor lotado). Tenta de novo!";
  return `📰 *Resumo ${tipo === "semana" ? "da Semana" : "do Dia"}*\n\n` + r;
}

// ── Fofoca ────────────────────────────────────────────────────────────────────

export async function fofocaGrupo(chatId) {
  const m = getModel();
  if (!m) return "⚠️ Gemini não configurado.";

  const historico = getMensagensRecentes(chatId, 50);
  if (historico.length < 5) return "🤐 Sem fofoca ainda. Conversem mais!";

  const texto = historico
    .map(h => `${h.nome}: ${h.texto || "[áudio]"}`)
    .join("\n");

  const prompt = `${PERSONALIDADE}

Mensagens do grupo:
${texto}

Crie uma fofoca engraçada baseada nas conversas acima.
REGRAS:
- Cite os NOMES reais das pessoas e o que elas falaram de verdade
- Exagere de forma cômica em cima de fatos REAIS das conversas
- Nada genérico, use o que realmente aconteceu no grupo
- Máximo 4 linhas, estilo revista de fofoca.`;

  const r = await gerar(prompt);
  if (!r) return "Sem fofoca agora (servidor lotado). Tenta de novo!";
  return `🔥 *Fofoca do Dia*\n\n` + r;
}

// ── Previsão do futuro ────────────────────────────────────────────────────────

export async function previsaoFuturo(nome) {
  const m = getModel();
  if (!m) {
    const previsoes = [
      `🔮 Previsão para *${nome}*:\nChance de ser produtivo hoje: 3%\nChance de abrir o YouTube "só por 5 minutos": 99%`,
      `🔮 Previsão para *${nome}*:\nVai começar uma dieta amanhã. De novo.`,
      `🔮 Previsão para *${nome}*:\nAlguém vai te marcar em algo sem contexto às 2h da manhã.`,
    ];
    return previsoes[Math.floor(Math.random() * previsoes.length)];
  }

  const prompt = `Crie uma previsão do futuro engraçada e criativa para "${nome}".
Estilo: oráculo dramático mas com humor brasileiro.
Inclua porcentagens absurdas. Máximo 4 linhas. Comece com 🔮`;

  const r = await gerar(prompt);
  return r || `🔮 O oráculo tá de folga. Tenta de novo, ${nome}!`;
}

// ── Compatibilidade ───────────────────────────────────────────────────────────

export async function compatibilidade(nome1, nome2) {
  const m = getModel();
  const pct = Math.floor(Math.random() * 60) + 40;
  if (!m) {
    return `❤️ *Compatibilidade*\n\n${nome1} 🤝 ${nome2}\n\n*${pct}%*\n\nMotivo: O algoritmo não quer se comprometer.`;
  }

  const prompt = `Analise a compatibilidade entre "${nome1}" e "${nome2}" de forma engraçada.
Dê uma porcentagem (use ${pct}%) e um motivo criativo e absurdo.
Máximo 4 linhas. Use emoji ❤️`;

  const r = await gerar(prompt);
  return r || `❤️ ${nome1} + ${nome2} = ${pct}% (o resto é mistério do universo)`;
}

// ── Resposta em modo livre (para qualquer mensagem) ───────────────────────────

export async function respostaModoLivre(chatId, nome, texto) {
  const m = getModel();
  if (!m) return null;

  const historico = getMensagensRecentes(chatId, 20);
  const contexto = historico
    .map(h => `${h.nome}: ${h.texto || "[áudio]"}`)
    .join("\n");

  const prompt = `${PERSONALIDADE}

Você está em MODO LIVRE: participa ativamente das conversas como um membro do grupo.
Sempre responda à mensagem de forma natural, descontraída e divertida.

Histórico:
${contexto}

${nome} disse: "${texto}"

Sua resposta:`;

  return await gerar(prompt);
}
