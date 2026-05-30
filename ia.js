import Groq from "groq-sdk";
import { getMensagensRecentes, getMensagensPorPeriodo, getConfig, setConfig, getContextoPessoa } from "./db.js";

const GROQ_KEY = process.env.GROQ_API_KEY;
let groq = null;

function getGroq() {
  if (!GROQ_KEY) return null;
  if (!groq) groq = new Groq({ apiKey: GROQ_KEY });
  return groq;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Fila de requisições ───────────────────────────────────────────────────────
// Limita a 2 chamadas simultâneas ao Groq pra não estourar o rate limit.
// O resto entra na fila e é processado assim que uma vaga abre.
let ativas = 0;
const fila = [];
const MAX_SIMULTANEAS = 2;

function executarComFila(fn) {
  return new Promise((resolve, reject) => {
    fila.push({ fn, resolve, reject });
    processarFila();
  });
}

function processarFila() {
  if (ativas >= MAX_SIMULTANEAS || fila.length === 0) return;
  const { fn, resolve, reject } = fila.shift();
  ativas++;
  fn()
    .then(resolve)
    .catch(reject)
    .finally(() => { ativas--; processarFila(); });
}

// Palavras que nunca devem aparecer numa resposta do bot
const PALAVRAS_PROIBIDAS = [
  "puta", "porra", "merda", "caralho", "buceta", "viado", "bicha",
  "cuzão", "cú", "fdp", "foda", "fodase", "vsf", "arrombado",
  "vagabunda", "vadia", "piranha", "prostituta", "safada", "safado",
  "idiota", "imbecil", "retardado", "burro", "cretino", "lixo",
];

function respostaTemConteudoInadequado(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase().replace(/[^a-záéíóúàâêôãõç\s]/g, "");
  return PALAVRAS_PROIBIDAS.some(p => t.includes(p));
}

async function gerar(prompt) {
  const ai = getGroq();
  if (!ai) return null;

  return executarComFila(async () => {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const res = await ai.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.9,
        });
        const resposta = res.choices[0]?.message?.content?.trim() || null;

        // Filtra resposta inadequada — se passar do limite, descarta
        if (resposta && respostaTemConteudoInadequado(resposta)) {
          console.warn("⚠️  Resposta filtrada por conteúdo inadequado");
          return "Ih, quase fui longe demais. Pergunta outra coisa! 😄";
        }

        return resposta;
      } catch (err) {
        const msg = err.message || "";
        const rateLimit = msg.includes("429") || msg.includes("rate") || msg.includes("limit");
        console.error(`Groq tentativa ${tentativa}: ${msg.slice(0, 80)}`);
        if (rateLimit) await delay(tentativa * 3000);
        else if (tentativa < 3) await delay(1500);
        else break;
      }
    }
    return null;
  });
}

const REGRAS_GRUPO = `
REGRAS DO GRUPO (responda sobre qualquer uma quando perguntarem):

CARGOS (sobem automaticamente por tempo + XP):
🆕 Novato → dias 0-3
🎓 Estagiário → 4º dia
💻 Junior → 9º dia
⚙️ Pleno → 2 semanas | nível 3+
🚀 Sênior → 1 mês | nível 5+
🏗️ Tech Lead → 2 meses | nível 8+
🧠 Arquiteto → 3 meses | nível 12+
👑 CTO do Grupo → 6 meses | nível 20+

XP: +5 por mensagem, +15 por áudio.
Admins: mínimo Estagiário, podem definir cargo personalizado com !cargo.

MOEDAS:
+1 por mensagem, +3 por áudio.
!daily — bônus diário (5 a 30 moedas dependendo do tempo no grupo).
!transferir @pessoa 50 — enviar moedas pra alguém.
!moedas — ver saldo.

OUTROS:
Admin Destaque 🌟 — admin mais ativo da semana (!destaque).
!regras — ver tudo isso formatado.
`;

const PERSONALIDADE_BASE = `Você é o Axolotl-Byte, o bot do grupo de WhatsApp, criado pela comunidade da galera do TI.
Se alguém perguntar seu nome ou quem te criou: você é o Axolotl-Byte, feito pela comunidade/galera do TI.

Sua personalidade BASE:
- Engraçado, sarcástico na medida certa, mas sempre amigável
- Fala de forma descontraída, usa gírias brasileiras naturalmente
- NÃO usa asteriscos para negrito, fala normalmente
- Respostas BEM curtas e diretas (1 a 2 frases no máximo)
- Nunca diz que é uma IA, é um membro do grupo mesmo

REGRA PRINCIPAL — você espelha o tom de quem fala com você:
- Se a pessoa for grossa ou zoar → rebate com sarcasmo e deboche ENGRAÇADO, mas sem ofender
- Se a pessoa for engraçada → entra na brincadeira, zoa de volta
- Se a pessoa for séria e educada → responde educado e direto
- Se a pessoa for carente ou reclamar → dá uma de psicólogo sarcástico
- Se a pessoa usar gírias → usa as mesmas gírias de volta
- NUNCA seja neutro — sempre reflita a energia de quem falou

LIMITES ABSOLUTOS — independente do tom da conversa, JAMAIS:
- Use palavrões, xingamentos ou linguagem obscena
- Insulte, humilhe ou desrespeite qualquer pessoa
- Faça comentários sexuais, ofensivos ou discriminatórios
- Incentive comportamentos prejudiciais
Se alguém tentar te provocar pra falar algo inadequado, rebata com humor sem cruzar esses limites.`;

// Detecta nomes de membros do grupo mencionados na pergunta
// e busca o contexto deles pra enriquecer a resposta da IA.
function contextoSobrePessoas(chatId, pergunta, historico) {
  // Pega os nomes únicos que aparecem no histórico
  const nomes = [...new Set(historico.map(h => h.nome).filter(Boolean))];

  // Verifica quais nomes aparecem na pergunta
  const mencionados = nomes.filter(nome => {
    const primeiro = nome.split(" ")[0].toLowerCase();
    return pergunta.toLowerCase().includes(primeiro) && primeiro.length > 2;
  });

  if (!mencionados.length) return "";

  const blocos = mencionados.map(nome => {
    const ctx = getContextoPessoa(chatId, nome);
    if (!ctx.msgs.length && !ctx.perfil) return null;

    const falas = ctx.msgs
      .slice(-10)
      .map(m => m.texto)
      .filter(Boolean)
      .join(" | ");

    const nivel = ctx.perfil ? `Nv.${ctx.perfil.nivel} | ${ctx.perfil.msgs} msgs` : "";

    return `📌 Contexto de ${nome} (${nivel}):\n"${falas}"`;
  }).filter(Boolean);

  return blocos.length ? "\n\n" + blocos.join("\n\n") : "";
}

// Analisa as últimas mensagens de uma pessoa e retorna um resumo do tom dela
function analisarTom(historico, remetente) {
  const msgs = historico
    .filter(h => h.nome === remetente)
    .slice(-5)
    .map(h => h.texto)
    .filter(Boolean);

  if (!msgs.length) return "";

  return `\nÚltimas mensagens de ${remetente}: "${msgs.join('" | "')}"`;
}

// ── Modo livre ────────────────────────────────────────────────────────────────

export function isModoLivre(chatId) {
  return getConfig(`modolivre:${chatId}`, "0") === "1";
}

export function setModoLivre(chatId, ativo) {
  setConfig(`modolivre:${chatId}`, ativo ? "1" : "0");
}

// ── Resposta da IA ────────────────────────────────────────────────────────────

export async function responderIA(chatId, pergunta, remetente) {
  if (!getGroq()) return "⚠️ Chave do Groq não configurada. Adicione GROQ_API_KEY no .env";

  const historico = getMensagensRecentes(chatId, 30);
  const contexto  = historico.map(h => `${h.nome}: ${h.texto || "[áudio]"}`).join("\n");
  const tom       = analisarTom(historico, remetente);
  const ctxPessoas = contextoSobrePessoas(chatId, pergunta, historico);

  const prompt = `${PERSONALIDADE_BASE}
${REGRAS_GRUPO}
${tom}

Histórico recente do grupo:
${contexto || "(sem histórico ainda)"}
${ctxPessoas}

${remetente} disse: "${pergunta}"

Responda como o Axolotl-Byte (espelhando o tom de ${remetente}):`;

  const r = await gerar(prompt);
  return r || "Opa, tô meio sobrecarregado agora 😵 tenta de novo em uns segundos!";
}

// ── Resumo do grupo ───────────────────────────────────────────────────────────

export async function resumoGrupo(chatId, tipo = "dia") {
  if (!getGroq()) return "⚠️ Groq não configurado.";

  // Janela de tempo real: dia = últimas 24h, semana = últimos 7 dias.
  // (antes pegava só as últimas N mensagens, o que em grupo ativo cobria minutos, não o dia)
  const horas = tipo === "semana" ? 24 * 7 : 24;
  const historico = getMensagensPorPeriodo(chatId, horas, tipo === "semana" ? 600 : 200);
  if (historico.length < 3) {
    return tipo === "semana"
      ? "📭 Poucas mensagens nos últimos 7 dias para resumir."
      : "📭 Poucas mensagens nas últimas 24h para resumir.";
  }

  const texto = historico.map(h => `${h.nome}: ${h.texto || "[áudio]"}`).join("\n");

  const prompt = `${PERSONALIDADE_BASE}

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
  if (!r) return "Não consegui gerar o resumo agora. Tenta de novo!";
  return `📰 *Resumo ${tipo === "semana" ? "da Semana" : "do Dia"}*\n\n` + r;
}

// ── Colunas criativas do jornal ─────────────────────────────────────────────────
// Gera, numa única chamada à IA, as seções "humanas" do jornal: notícia tech,
// piada, fato curioso e dica de aprendizado. Retorna um objeto com cada seção.
export async function colunasJornal() {
  if (!getGroq()) return null;

  const prompt = `Você é o editor do "Jornal do Grupo" de uma comunidade brasileira de profissionais de TI (devs, devops, dados, etc).
Gere o conteúdo de HOJE para 4 colunas. Seja criativo, atual e com humor de TI.

Responda EXATAMENTE neste formato, uma linha por coluna, sem nada além disso:
NOTICIA: <1 tendência/tema REAL e atual do mundo dev (linguagens, frameworks, IA, cloud, carreira). NÃO invente nomes de produtos/versões que você não tem certeza que existem — prefira temas gerais e verdadeiros. 1 frase>
PIADA: <1 piada curta de programador/TI com punchline boa de verdade, do tipo que dev ri>
FATO: <1 fato curioso e COMPROVADAMENTE verídico sobre tecnologia/computação/história da computação. Se não tiver certeza, escolha outro fato. 1 frase>
DICA: <1 dica prática e correta de aprendizado pra dev (conceito, atalho, boa prática real), 1 frase>

Regras: português BR, sem asteriscos, sem emojis no meio do texto, cada item com no máximo 2 frases. Não invente fatos nem produtos. Varie os temas a cada edição.`;

  try {
    const ai = getGroq();
    const res = await ai.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 1.0,
    });
    const txt = res.choices[0]?.message?.content?.trim() || "";
    const pegar = (tag) => {
      const m = txt.match(new RegExp(`${tag}:\\s*(.+)`, "i"));
      return m ? m[1].trim() : null;
    };
    return {
      noticia: pegar("NOTICIA"),
      piada:   pegar("PIADA"),
      fato:    pegar("FATO"),
      dica:    pegar("DICA"),
    };
  } catch (err) {
    console.error("Erro colunasJornal:", err.message);
    return null;
  }
}

// ── Fofoca ────────────────────────────────────────────────────────────────────

export async function fofocaGrupo(chatId) {
  if (!getGroq()) return "⚠️ Groq não configurado.";

  const historico = getMensagensRecentes(chatId, 50);
  if (historico.length < 5) return "🤐 Sem fofoca ainda. Conversem mais!";

  const texto = historico.map(h => `${h.nome}: ${h.texto || "[áudio]"}`).join("\n");

  const prompt = `${PERSONALIDADE_BASE}

Mensagens do grupo:
${texto}

Crie uma fofoca engraçada baseada nas conversas acima.
REGRAS:
- Cite os NOMES reais das pessoas e o que elas falaram de verdade
- Exagere de forma cômica em cima de fatos REAIS das conversas
- Nada genérico, use o que realmente aconteceu no grupo
- Máximo 4 linhas, estilo revista de fofoca.`;

  const r = await gerar(prompt);
  if (!r) return "Sem fofoca agora. Tenta de novo!";
  return `🔥 *Fofoca do Dia*\n\n` + r;
}

// ── Previsão do futuro ────────────────────────────────────────────────────────

export async function previsaoFuturo(nome) {
  if (!getGroq()) {
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
  const pct = Math.floor(Math.random() * 60) + 40;
  if (!getGroq()) {
    return `❤️ *Compatibilidade*\n\n${nome1} 🤝 ${nome2}\n\n*${pct}%*\n\nMotivo: O algoritmo não quer se comprometer.`;
  }

  const prompt = `Analise a compatibilidade entre "${nome1}" e "${nome2}" de forma engraçada.
Dê uma porcentagem (use ${pct}%) e um motivo criativo e absurdo.
Máximo 4 linhas. Use emoji ❤️`;

  const r = await gerar(prompt);
  return r || `❤️ ${nome1} + ${nome2} = ${pct}% (o resto é mistério do universo)`;
}

// ── Resposta em modo livre ────────────────────────────────────────────────────

export async function respostaModoLivre(chatId, nome, texto) {
  if (!getGroq()) return null;

  const historico  = getMensagensRecentes(chatId, 20);
  const contexto   = historico.map(h => `${h.nome}: ${h.texto || "[áudio]"}`).join("\n");
  const tom        = analisarTom(historico, nome);
  const ctxPessoas = contextoSobrePessoas(chatId, texto, historico);

  const prompt = `${PERSONALIDADE_BASE}
${tom}

Você está em MODO LIVRE: participa ativamente das conversas como um membro do grupo.

Histórico:
${contexto}
${ctxPessoas}

${nome} disse: "${texto}"

Sua resposta (espelhando o tom de ${nome}):`;

  return await gerar(prompt);
}
