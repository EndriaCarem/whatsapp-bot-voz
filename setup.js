// setup.js
// ----------------------------------------------------------------------------
// Configura a Evolution API de uma vez:
//   1. Cria a instancia do WhatsApp (se nao existir).
//   2. Aponta o webhook pra ele chamar nosso bot quando chegar mensagem.
//   3. Mostra o QR code (link) pra voce escanear e conectar o WhatsApp.
//
// Rode:  npm run setup
// (precisa do docker compose up -d e do bot rodando, ou pelo menos da Evolution)
// ----------------------------------------------------------------------------

import "dotenv/config";

const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://localhost:8080";
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.INSTANCE_NAME || "bot-voz";
const PORT = process.env.PORT || 3000;

// IMPORTANTE: a Evolution roda DENTRO do Docker. Pra ela achar o nosso bot
// (que roda na maquina, fora do Docker), no Mac usamos host.docker.internal.
const WEBHOOK_URL = `http://host.docker.internal:${PORT}/webhook`;

async function api(metodo, caminho, corpo) {
  const resp = await fetch(`${EVOLUTION_URL}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", apikey: API_KEY },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let json; try { json = JSON.parse(texto); } catch { json = texto; }
  return { ok: resp.ok, status: resp.status, json };
}

async function main() {
  console.log(`🔧 Configurando instancia "${INSTANCE}" em ${EVOLUTION_URL}\n`);

  // 1. Cria a instancia (ja com o webhook configurado).
  console.log("→ Criando instancia...");
  const criar = await api("POST", "/instance/create", {
    instanceName: INSTANCE,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    webhook: {
      url: WEBHOOK_URL,
      byEvents: false,
      events: ["MESSAGES_UPSERT"],
    },
  });

  if (criar.ok) {
    console.log("  ✅ Instancia criada.");
  } else if (criar.status === 403 || JSON.stringify(criar.json).includes("already")) {
    console.log("  ℹ️  Instancia ja existia, seguindo...");
    // Garante o webhook mesmo se a instancia ja existia.
    await api("POST", `/webhook/set/${INSTANCE}`, {
      webhook: { enabled: true, url: WEBHOOK_URL, byEvents: false, events: ["MESSAGES_UPSERT"] },
    });
  } else {
    console.error("  ❌ Erro ao criar instancia:", criar.status, criar.json);
    process.exit(1);
  }

  // 2. Pega o QR code pra conectar.
  console.log("\n→ Gerando QR code...");
  const conectar = await api("GET", `/instance/connect/${INSTANCE}`);

  const qrBase64 = conectar.json?.base64 || conectar.json?.qrcode?.base64;
  const pairingCode = conectar.json?.pairingCode || conectar.json?.qrcode?.pairingCode;

  if (pairingCode) {
    console.log(`\n📱 CODIGO DE PAREAMENTO: ${pairingCode}`);
    console.log("   No WhatsApp: Aparelhos conectados > Conectar > Conectar com numero de telefone\n");
  }

  if (qrBase64) {
    // Salva o QR como imagem pra voce abrir e escanear.
    const fs = await import("node:fs/promises");
    const limpo = qrBase64.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile("qrcode.png", Buffer.from(limpo, "base64"));
    console.log("📷 QR code salvo em qrcode.png — abra e escaneie no WhatsApp:");
    console.log("   WhatsApp > Aparelhos conectados > Conectar aparelho\n");
  } else if (!pairingCode) {
    console.log("ℹ️  Resposta:", JSON.stringify(conectar.json, null, 2));
    console.log("   (Se ja estiver conectado, e isso mesmo.)");
  }
}

main().catch((e) => {
  console.error("Falhou:", e.message);
  console.error("A Evolution esta rodando? (docker compose up -d)");
  process.exit(1);
});
