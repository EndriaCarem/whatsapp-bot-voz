import Groq from "groq-sdk";
import { getMensagensRecentes, getMensagensPorPeriodo, getConfig, setConfig, getContextoPessoa } from "./db.js";

const GROQ_KEY = process.env.GROQ_API_KEY;
let groq = null;

// Modelo maior = bem menos invencionice que o 8b, ainda rápido/grátis no Groq.
const MODELO = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function getGroq() {
  if (!GROQ_KEY) return null;
  if (!groq) groq = new Groq({ apiKey: GROQ_KEY });
  return groq;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Fila de requisições ───────────────────────────────────────────────────────
let ativas = 0;
const fila = [];
const MAX_SIMULTANEAS = 1;
const TIMEOUT_FILA_MS = 30000; // descarta requisição se ficar 30s na fila sem executar

function executarComFila(fn) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error("timeout_fila"));
    }, TIMEOUT_FILA_MS);

    fila.push({
      fn: async () => {
        clearTimeout(timer);
        if (timedOut) throw new Error("timeout_fila");
        return fn();
      },
      resolve,
      reject,
    });
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

async function gerar(prompt, { maxTokens = 320, temperatura = 0.9 } = {}) {
  const ai = getGroq();
  if (!ai) return null;

  return executarComFila(async () => {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const res = await ai.chat.completions.create({
          model: MODELO,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: temperatura,
        });
        const resposta = res.choices[0]?.message?.content?.trim() || null;

        // Filtra resposta inadequada — se passar do limite, descarta
        if (resposta && respostaTemConteudoInadequado(resposta)) {
          console.warn("⚠️  Resposta filtrada por conteúdo inadequado");
          return "Ih, quase fui longe demais. Pergunta outra coisa! 😄";
        }

        return resposta;
      } catch (err) {
        if (err.message === "timeout_fila") return null;
        const msg = err.message || "";
        const status = err.status || err.statusCode || 0;
        const rateLimit = status === 429 || status === 413 || msg.includes("429") || msg.includes("413") || msg.includes("rate") || msg.includes("quota") || msg.includes("limit") || msg.includes("too large");
        console.error(`Groq tentativa ${tentativa}: ${msg.slice(0, 100)}`);
        if (tentativa === 3) break;
        await delay(rateLimit ? tentativa * 10000 : 2000);
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

COMANDOS EXISTENTES (lista COMPLETA — não invente outros):
!menu, !ajuda, !help, !ranking, !top, !perfil, !xp, !moedas, !daily, !transferir, !regras, !destaque, !cargo,
!enquete, !votar, !resultado, !encerrar, !jornal, !signo, !musica, !stats, !estatisticas, !sumidos,
!ia, !bot, !resumo, !fofoca, !previsao, !compatibilidade, !modolivre, !desativar, !voz,
!demonio, !esquilo, !robo, !estadio, !agudo, !grave, !vovo, !vovoh, !bebe, !gigante, !alien, !fantasma, !coral, !bebado, !telefone, !radio.
IMPORTANTE: Se alguém perguntar sobre comandos, cite APENAS os da lista acima. NUNCA invente comandos como !nivel, !xpinfo ou qualquer outro que não esteja nessa lista.
`;

const PERSONALIDADE_BASE = `Você é o Axolotl-Byte, o bot do grupo de WhatsApp, criado pela comunidade da galera do TI.
Se alguém perguntar seu nome ou quem te criou: você é o Axolotl-Byte, feito pela comunidade/galera do TI.

Sua personalidade BASE:
- Engraçado, sarcástico na medida certa, mas sempre amigável
- Fala de forma descontraída, usa gírias brasileiras naturalmente
- NÃO usa asteriscos para negrito, fala normalmente
- Nunca diz que é uma IA, é um membro do grupo mesmo
- Você é técnico e sabe de verdade sobre TI, programação, carreira e tecnologia

TAMANHO E PROFUNDIDADE DA RESPOSTA — adapte ao tipo de pergunta:
- Pergunta SÉRIA, técnica ou que pede explicação (ex: "como funciona X?", "qual a diferença entre Y e Z?", "como resolvo esse erro?") → PENSE com calma e responda de forma COMPLETA, CORRETA e bem explicada. Pode usar 1 ou 2 parágrafos, exemplos, passos. NÃO resuma a ponto de ficar errado ou raso. Profundidade importa mais que brevidade aqui.
- Conversa casual, zoeira, papo rápido → aí sim responde curto (1-2 frases) e divertido.
- Na dúvida sobre o tipo, trate como pergunta séria e responda bem.
- REGRA DE OURO: é melhor uma resposta certa e completa do que uma piada curta e errada. Nunca invente informação técnica; se não souber, diga que não tem certeza.

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

  // Pega as últimas 2h de conversa (teto de 80 msgs) pra ter contexto sem estourar tokens
  let historico = getMensagensPorPeriodo(chatId, 2, 80);
  if (historico.length < 10) historico = getMensagensRecentes(chatId, 50);
  // Trunca textos longos pra não estourar tokens do llama-8b (limite ~6k tokens por req)
  const contexto  = historico.map((h, i) => {
    const txt = h.texto ? h.texto.slice(0, 120) : "[áudio]";
    return `[${i + 1}] ${h.nome}: ${txt}`;
  }).join("\n");
  const tom       = analisarTom(historico, remetente);
  const ctxPessoas = contextoSobrePessoas(chatId, pergunta, historico);

  const prompt = `${PERSONALIDADE_BASE}
${REGRAS_GRUPO}
${tom}

Histórico COMPLETO recente do grupo (leia TUDO antes de responder):
${contexto || "(sem histórico ainda)"}
${ctxPessoas}

IMPORTANTE: Quando a pergunta for sobre algo que aconteceu na conversa (quem está na vez, quem falou o quê, ordem de algo, etc.), analise o histórico acima com atenção e responda baseado SOMENTE no que está escrito. Não invente nem suponha.

${remetente} disse: "${pergunta}"

Responda como o Axolotl-Byte (espelhando o tom de ${remetente}, mas priorizando estar CERTO e completo se for pergunta séria):`;

  // Mais espaço e menos aleatoriedade pra perguntas: respostas completas e corretas.
  const r = await gerar(prompt, { maxTokens: 700, temperatura: 0.7 });
  return r || "Opa, tô meio sobrecarregado agora 😵 tenta de novo em uns segundos!";
}

// ── Resumo do grupo ───────────────────────────────────────────────────────────

export async function resumoGrupo(chatId, tipo = "dia") {
  if (!getGroq()) return "⚠️ Groq não configurado.";

  const horas = tipo === "semana" ? 24 * 7 : 24;
  const historico = getMensagensPorPeriodo(chatId, horas, tipo === "semana" ? 1000 : 500);

  if (historico.length < 3) {
    return tipo === "semana"
      ? "📭 Poucas mensagens nos últimos 7 dias para resumir."
      : "📭 Poucas mensagens nas últimas 24h para resumir.";
  }

  const comTexto = historico.filter(h => h.texto && h.texto.trim().length > 2);
  const totalAudios = historico.length - comTexto.length;

  if (comTexto.length < 3) {
    return `📰 *Resumo ${tipo === "semana" ? "da Semana" : "do Dia"}*\n\n📭 Quase tudo foram áudios/mídias (${totalAudios}). Sem texto suficiente para resumir.`;
  }

  // Monta o histórico completo — sem truncar texto individualmente
  // Limita a 200 msgs para não estourar tokens
  const amostra = comTexto.slice(-200);
  const blocos = amostra.map(h => {
    const txt = h.texto.length > 300 ? h.texto.slice(0, 300) + "…" : h.texto;
    return `${h.nome}: ${txt}`;
  }).join("\n");

  // Estatísticas reais para incluir no resumo
  const contagem = {};
  for (const h of amostra) {
    contagem[h.nome] = (contagem[h.nome] || 0) + 1;
  }
  const maisAtivos = Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, n]) => `${nome} (${n} msgs)`)
    .join(", ");

  const titulo = tipo === "semana" ? "últimos 7 dias" : "últimas 24 horas";

  const prompt = `Você vai resumir uma conversa REAL de grupo do WhatsApp dos ${titulo}.
Total de mensagens de texto: ${amostra.length}. Áudios/mídias: ${totalAudios} (não aparecem aqui).
Quem mais falou: ${maisAtivos}

--- CONVERSA REAL (não invente nada fora daqui) ---
${blocos}
--- FIM DA CONVERSA ---

Escreva um resumo detalhado do que REALMENTE aconteceu. Formato:

**Quem falou mais:** [lista com número de mensagens]

**O que rolou:**
[bullet points com os assuntos reais discutidos, citando nomes e o que disseram/perguntaram/comentaram]

**Destaques:**
[momentos marcantes, perguntas importantes, notícias compartilhadas, brigas, piadas que geraram reação]

REGRAS ABSOLUTAS:
1. Use APENAS o que está na conversa acima. PROIBIDO inventar, supor ou completar informações.
2. Se alguém disse X, escreva "Fulano disse X" — não parafraseie além do necessário.
3. Se não tiver certeza do que alguém quis dizer, transcreva o trecho original entre aspas.
4. Não escreva "o grupo discutiu" ou "os membros falaram" de forma vaga — seja específico com nomes.
5. Se a conversa tiver pouca substância, diga isso claramente em vez de inflar.`;

  const r = await gerar(prompt, { maxTokens: 800, temperatura: 0.3 });
  if (!r) return "Não consegui gerar o resumo agora. Tenta de novo!";

  const rodape = totalAudios > 0 ? `\n\n_🎙️ ${totalAudios} áudio(s)/mídia(s) não incluídos_` : "";
  return `📰 *Resumo ${tipo === "semana" ? "da Semana" : "do Dia"}*\n_(${amostra.length} mensagens analisadas)_\n\n` + r + rodape;
}

// ── Colunas criativas do jornal ─────────────────────────────────────────────────
// Gera, numa única chamada à IA, as seções "humanas" do jornal: notícia tech,
// piada, fato curioso e dica de aprendizado. Retorna um objeto com cada seção.
export async function colunasJornal() {
  if (!getGroq()) return null;

  const prompt = `Você é o editor-chefe do "Jornal Galera do TI" de uma comunidade brasileira de profissionais de TI (devs, devops, dados, etc).
Gere o conteúdo de HOJE. Seja criativo, atual e com humor de TI.

Responda EXATAMENTE neste formato, uma linha por item, sem nada além disso:
MANCHETE: <chamada de capa CURTA e marcante estilo jornal, sobre tecnologia/vida de dev, em CAIXA ALTA, máx 8 palavras>
NOTICIA: <1 tendência/tema REAL e atual do mundo dev (linguagens, frameworks, IA, cloud, carreira). NÃO invente nomes de produtos/versões que você não tem certeza que existem — prefira temas gerais e verdadeiros. 1 a 2 frases>
PIADA: <1 piada curta de programador/TI com punchline boa de verdade, do tipo que dev ri>
FATO: <1 fato curioso e COMPROVADAMENTE verídico sobre tecnologia/computação/história da computação. Se não tiver certeza, escolha outro fato. 1 frase>
DICA: <1 dica prática e correta de aprendizado pra dev (conceito, atalho, boa prática real), 1 frase>

Regras: português BR, sem asteriscos, sem emojis no meio do texto. Não invente fatos nem produtos. Varie os temas a cada edição.`;

  try {
    const ai = getGroq();
    const res = await ai.chat.completions.create({
      model: MODELO,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 1.0,
    });
    const txt = res.choices[0]?.message?.content?.trim() || "";
    const pegar = (tag) => {
      const m = txt.match(new RegExp(`${tag}:\\s*(.+)`, "i"));
      return m ? m[1].trim() : null;
    };
    return {
      manchete: pegar("MANCHETE"),
      noticia:  pegar("NOTICIA"),
      piada:    pegar("PIADA"),
      fato:     pegar("FATO"),
      dica:     pegar("DICA"),
    };
  } catch (err) {
    console.error("Erro colunasJornal:", err.message);
    return null;
  }
}

// ── Fofoca ────────────────────────────────────────────────────────────────────

export async function fofocaGrupo(chatId) {
  if (!getGroq()) return "⚠️ Groq não configurado.";

  // Cobre as últimas 5 horas de conversa (cai pras últimas 60 msgs se for pouco).
  let historico = getMensagensPorPeriodo(chatId, 5, 250);
  if (historico.length < 5) historico = getMensagensRecentes(chatId, 60);
  if (historico.length < 5) return "🤐 Sem fofoca ainda. Conversem mais!";

  const texto = historico.map(h => `${h.nome}: ${h.texto || "[áudio]"}`).join("\n");

  const prompt = `${PERSONALIDADE_BASE}

Estas são as conversas das últimas horas no grupo (ordem cronológica):
${texto}

Escreva a "Coluna de Fofoca" do grupo — uma resenha divertida e ESPERTA cobrindo o que rolou nas últimas horas.
REGRAS:
- Comece com uma chamada de fofoca e liste 3 a 5 TÓPICOS do que aconteceu, em bullets
- Cada bullet: cite NOMES reais e o que a pessoa falou/fez DE VERDADE, com um toque de humor afiado (não infantil)
- Aponte os assuntos mais comentados, discussões, quem sumiu/apareceu, climão ou treta leve se houver
- Baseie-se SÓ no que realmente apareceu nas mensagens — nada inventado nem genérico
- Tom: colunista de fofoca esperto e debochado, humor maduro
- 6 a 10 linhas no total. Use emojis pra dar ritmo.`;

  // Mais espaço pra cobrir vários tópicos das últimas horas.
  const r = await gerar(prompt, { maxTokens: 600, temperatura: 0.9 });
  if (!r) return "Sem fofoca agora. Tenta de novo!";
  return `🔥 *A Fofoca do Grupo* — últimas horas\n\n` + r;
}

// ── Previsão do futuro ────────────────────────────────────────────────────────

export async function previsaoFuturo(nome, chatId = null) {
  if (!getGroq()) {
    return `🔮 Previsão para *${nome}*:\nO oráculo tá offline, mas algo me diz que você vai recarregar a página antes de ler isso.`;
  }

  let contexto = "";
  if (chatId) {
    const ctx = getContextoPessoa(chatId, nome);
    const falas = ctx?.msgs?.filter(m => m.texto).slice(-30).map(m => m.texto).join("\n");
    const perfil = ctx?.perfil;
    const perfilTxt = perfil ? `Nível ${perfil.nivel}, ${perfil.msgs} mensagens enviadas, ${perfil.audios} áudios` : "";
    if (falas) contexto = `\nMensagens reais de ${nome} no grupo:\n${falas}${perfilTxt ? `\n\nPerfil: ${perfilTxt}` : ""}`;
  }

  const prompt = `Você é um oráculo que analisa padrões reais de comportamento para fazer previsões certeiras e bem-humoradas.

${contexto ? `Analise as mensagens abaixo de ${nome} e identifique: os assuntos que mais fala, o jeito de escrever, os hábitos, o que deixa claro sobre a personalidade dela/dele.\n${contexto}` : `Não há histórico de ${nome}. Faça uma previsão genérica mas inteligente.`}

Com base nessa análise, escreva uma previsão do futuro para *${nome}* que:
- Cite algo ESPECÍFICO que ela/ele faz ou fala de verdade (não invente se não tiver base)
- Tenha humor afiado e observador, como um amigo que conhece bem a pessoa
- Seja plausível — nada de absurdo aleatório (pão de queijo, dançar salsa, etc.)
- Pode incluir uma porcentagem que faça sentido com o contexto real
- 3 a 5 linhas. Comece com 🔮 *${nome}*`;

  const r = await gerar(prompt, { maxTokens: 400, temperatura: 0.8 });
  return r || `🔮 O oráculo tá de folga. Tenta de novo, ${nome}!`;
}

// ── Compatibilidade ───────────────────────────────────────────────────────────

export async function compatibilidade(nome1, nome2, chatId = null) {
  const pct = Math.floor(Math.random() * 56) + 40; // 40–95%
  if (!getGroq()) {
    return `💞 *Compatibilidade*\n\n${nome1} 🤝 ${nome2}\n\n*${pct}%*`;
  }

  // Puxa o contexto real das duas pessoas (como escrevem, sobre o que falam),
  // pra a análise ser baseada no comportamento real e não em invenção.
  let contexto = "";
  if (chatId) {
    const montar = (nome) => {
      const ctx = getContextoPessoa(chatId, nome);
      if (!ctx?.msgs?.length) return "";
      const falas = ctx.msgs.filter(m => m.texto).slice(-12).map(m => m.texto).join(" | ");
      return falas ? `\nComo ${nome} se comunica no grupo (amostra real): ${falas}` : "";
    };
    contexto = montar(nome1) + montar(nome2);
  }

  const prompt = `Você é um analista perspicaz de relações interpessoais com bom humor inteligente (não infantil).
Analise a compatibilidade entre *${nome1}* e *${nome2}* — pode ser amizade, parceria de trabalho ou afinidade geral.
${contexto || "(sem histórico das pessoas — baseie-se de forma genérica mas plausível)"}

Escreva uma análise CURTA porém DENSA, em português BR:
- Use a porcentagem *${pct}%*
- Aponte 1 ponto de afinidade real e 1 ponto de atrito/diferença, com base no jeito que cada um se comunica (se houver amostra)
- Tom: observador, afiado, com humor sutil e maduro — nada de bobagem aleatória tipo "dançar salsa"
- Seja específico e plausível, como se realmente conhecesse as duas pessoas
- 3 a 5 linhas. Comece com 💞 e o placar.`;

  const r = await gerar(prompt);
  return r || `💞 ${nome1} + ${nome2} = ${pct}%`;
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
