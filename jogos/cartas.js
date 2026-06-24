import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

const delay = ms => new Promise(r => setTimeout(r, ms));

// Converte PNG buffer para WebP (formato aceito pelo WhatsApp como sticker)
async function pngParaWebp(pngBuffer) {
  return sharp(pngBuffer).webp({ quality: 90 }).toBuffer();
}

// ── Paleta de cores ───────────────────────────────────────────────────────────
const CORES_UNO = {
  vermelho: { fundo: "#D32F2F", borda: "#B71C1C", texto: "#FFFFFF" },
  azul:     { fundo: "#1565C0", borda: "#0D47A1", texto: "#FFFFFF" },
  verde:    { fundo: "#2E7D32", borda: "#1B5E20", texto: "#FFFFFF" },
  amarelo:  { fundo: "#F9A825", borda: "#F57F17", texto: "#000000" },
  preto:    { fundo: "#212121", borda: "#000000", texto: "#FFFFFF" },
};

const NAIPES = {
  copas:    { simbolo: "♥", cor: "#C62828" },
  ouros:    { simbolo: "♦", cor: "#C62828" },
  paus:     { simbolo: "♣", cor: "#212121" },
  espadas:  { simbolo: "♠", cor: "#212121" },
};

// ── Carta genérica arredondada ────────────────────────────────────────────────
function desenharBase(ctx, w, h, corFundo, corBorda) {
  const r = 18;
  ctx.fillStyle = corBorda;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.fill();

  const pad = 4;
  ctx.fillStyle = corFundo;
  ctx.beginPath();
  ctx.moveTo(r + pad, pad); ctx.lineTo(w - r - pad, pad);
  ctx.quadraticCurveTo(w - pad, pad, w - pad, r + pad);
  ctx.lineTo(w - pad, h - r - pad); ctx.quadraticCurveTo(w - pad, h - pad, w - r - pad, h - pad);
  ctx.lineTo(r + pad, h - pad); ctx.quadraticCurveTo(pad, h - pad, pad, h - r - pad);
  ctx.lineTo(pad, r + pad); ctx.quadraticCurveTo(pad, pad, r + pad, pad);
  ctx.closePath(); ctx.fill();
}

// ── Carta UNO ─────────────────────────────────────────────────────────────────
export async function gerarCartaUno(cor, valor) {
  const W = 160, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const c = CORES_UNO[cor] || CORES_UNO.preto;

  desenharBase(ctx, W, H, c.fundo, c.borda);

  // Elipse central branca
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 6);
  ctx.beginPath();
  ctx.ellipse(0, 0, 55, 75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = c.texto;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Valor central grande
  const isEspecial = ["Pular", "Inverter", "+2", "+4", "Coringa"].includes(valor);
  ctx.font = isEspecial ? "bold 30px Arial" : "bold 64px Arial";
  ctx.fillText(valor, W / 2, H / 2);

  // Cantos
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";  ctx.textBaseline = "top";    ctx.fillText(valor, 10, 10);
  ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(valor, W - 10, H - 10);

  // Label UNO no topo
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font      = "bold 13px Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("UNO", W / 2, 4);

  return pngParaWebp(canvas.toBuffer("image/png"));
}

// ── Carta de baralho padrão ───────────────────────────────────────────────────
export async function gerarCartaBaralho(naipe, valor) {
  const W = 160, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const n = NAIPES[naipe];

  desenharBase(ctx, W, H, "#FAFAFA", "#BDBDBD");

  ctx.fillStyle = n.cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Símbolo central
  ctx.font = "80px Arial";
  ctx.fillText(n.simbolo, W / 2, H / 2 + 10);

  // Valor + naipe nos cantos
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "left";  ctx.textBaseline = "top";
  ctx.fillText(valor, 10, 8);
  ctx.font = "22px Arial";
  ctx.fillText(n.simbolo, 10, 36);

  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText(valor, 10, 8);
  ctx.font = "22px Arial";
  ctx.fillText(n.simbolo, 10, 36);
  ctx.restore();

  return pngParaWebp(canvas.toBuffer("image/png"));
}

// ── Verso da carta (carta virada) ────────────────────────────────────────────
export async function gerarVerso() {
  const W = 160, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  desenharBase(ctx, W, H, "#1A237E", "#0D1B6E");

  // Padrão de losangos
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - H, H); ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🃏", W / 2, H / 2);

  return pngParaWebp(canvas.toBuffer("image/png"));
}

// ── Helpers: montar baralhos ──────────────────────────────────────────────────

export function baralhoUno() {
  const cores = ["vermelho", "azul", "verde", "amarelo"];
  const valores = ["0","1","2","3","4","5","6","7","8","9","Pular","Inverter","+2"];
  const cartas = [];
  for (const cor of cores) {
    cartas.push({ cor, valor: "0" });
    for (const v of valores.slice(1)) {
      cartas.push({ cor, valor: v });
      cartas.push({ cor, valor: v }); // 2 de cada
    }
  }
  for (let i = 0; i < 4; i++) cartas.push({ cor: "preto", valor: "Coringa" });
  for (let i = 0; i < 4; i++) cartas.push({ cor: "preto", valor: "+4" });
  return embaralhar(cartas);
}

export function baralhoCompleto() {
  const naipes = ["copas", "ouros", "paus", "espadas"];
  const valores = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const cartas = [];
  for (const naipe of naipes)
    for (const valor of valores)
      cartas.push({ naipe, valor });
  return embaralhar(cartas);
}

export function valorBlackjack(valor) {
  if (["J","Q","K"].includes(valor)) return 10;
  if (valor === "A") return 11;
  return parseInt(valor);
}

export function somaBlackjack(mao) {
  let total = mao.reduce((s, c) => s + valorBlackjack(c.valor), 0);
  let ases = mao.filter(c => c.valor === "A").length;
  while (total > 21 && ases > 0) { total -= 10; ases--; }
  return total;
}

export function embaralhar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function labelCarta(carta) {
  if (carta.cor) return `${carta.cor.toUpperCase()} ${carta.valor}`;
  return `${carta.valor} ${NAIPES[carta.naipe]?.simbolo || carta.naipe}`;
}

export { delay };
