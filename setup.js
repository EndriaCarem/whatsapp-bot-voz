/**
 * setup.js — Configuração inicial do bot
 * ----------------------------------------
 * Esse script faz tudo que é necessário uma única vez antes de rodar o bot:
 *  1. Cria a instância do WhatsApp na Evolution API
 *  2. Configura o webhook para receber mensagens
 *  3. Gera o QR code para você escanear com o celular
 *
 * Como rodar: npm run setup
 */

import "dotenv/config";
import { writeFile } from "node:fs/promises";

const EVOLUTION_URL  = process.env.EVOLUTION_URL  || "http://localhost:8080";
const API_KEY        = process.env.EVOLUTION_API_KEY;
const INSTANCE       = process.env.INSTANCE_NAME  || "bot-voz";
const PORT           = process.env.PORT            || 3000;

// A Evolution roda dentro do Docker. Para ela alcançar o bot (que roda fora),
// usamos host.docker.internal — endereço especial que o Docker Desktop cria no Mac.
const WEBHOOK_URL = `http://host.docker.internal:${PORT}/webhook`;

async function api(metodo, caminho, corpo) {
  const resp = await fetch(`${EVOLUTION_URL}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { ok: resp.ok, status: resp.status, json };
}

async function main() {
  console.log("─────────────────────────────────────────");
  console.log("  🔧 Setup — WhatsApp Bot de Voz        ");
  console.log("─────────────────────────────────────────");
  console.log(`  Evolution : ${EVOLUTION_URL}`);
  console.log(`  Instância : ${INSTANCE}`);
  console.log(`  Webhook   : ${WEBHOOK_URL}`);
  console.log("─────────────────────────────────────────\n");

  // ── Passo 1: Criar (ou confirmar) a instância ────────────────────────────
  console.log("→ Criando instância...");
  const criar = await api("POST", "/instance/create", {
    instanceName: INSTANCE,
    qrcode:       true,
    integration:  "WHATSAPP-BAILEYS",
  });

  if (criar.ok) {
    console.log("  ✅ Instância criada com sucesso.\n");
  } else if (criar.status === 403 || JSON.stringify(criar.json).includes("already")) {
    console.log("  ℹ️  Instância já existe. Continuando...\n");
  } else {
    console.error("  ❌ Erro ao criar instância:", criar.status, criar.json);
    process.exit(1);
  }

  // ── Passo 2: Configurar o webhook ────────────────────────────────────────
  console.log("→ Configurando webhook...");
  await api("POST", `/webhook/set/${INSTANCE}`, {
    webhook: {
      enabled:      true,
      url:          WEBHOOK_URL,
      webhookBase64: true,
      byEvents:     false,
      events:       ["MESSAGES_UPSERT"],
    },
  });
  console.log("  ✅ Webhook configurado.\n");

  // ── Passo 3: Gerar QR code ────────────────────────────────────────────────
  console.log("→ Gerando QR code...");
  const conectar = await api("GET", `/instance/connect/${INSTANCE}`);

  const qrBase64    = conectar.json?.base64 || conectar.json?.qrcode?.base64;
  const pairingCode = conectar.json?.pairingCode || conectar.json?.qrcode?.pairingCode;

  if (pairingCode) {
    console.log(`\n  📱 CÓDIGO DE PAREAMENTO: ${pairingCode}`);
    console.log("  No WhatsApp: Aparelhos conectados → Conectar → Conectar com número\n");
  }

  if (qrBase64) {
    const raw = qrBase64.replace(/^data:image\/\w+;base64,/, "");
    await writeFile("qrcode.png", Buffer.from(raw, "base64"));
    console.log("  📷 QR code salvo em qrcode.png");
    console.log("  No celular: WhatsApp → Aparelhos conectados → Conectar aparelho\n");
  } else if (!pairingCode) {
    // Na v2.1.1, o QR é entregue de forma assíncrona via evento.
    // O painel web (manager) o exibe automaticamente.
    console.log(`  🌐 Abra o painel no navegador para escanear o QR:`);
    console.log(`     ${EVOLUTION_URL}/manager\n`);
    console.log(`  API Key para logar no painel:`);
    console.log(`     ${API_KEY}\n`);
  }

  console.log("─────────────────────────────────────────");
  console.log("  Setup concluído! Rode: npm start");
  console.log("─────────────────────────────────────────");
}

main().catch((err) => {
  console.error("\n❌ Setup falhou:", err.message);
  console.error("   Verifique se a Evolution está rodando: docker compose up -d");
  process.exit(1);
});
