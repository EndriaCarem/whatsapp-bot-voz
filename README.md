<div align="center">

# 🤖 Axolotl-Byte

**Bot de WhatsApp para grupos** — efeitos de voz, IA conversacional, gamificação e estatísticas.

Conecta direto no WhatsApp via Baileys, com interface web 3D futurista para testar comandos.

![Axolotl-Byte 3D](https://img.shields.io/badge/Interface-3D%20Futurista-blueviolet?style=for-the-badge&logo=react)
![WebSocket](https://img.shields.io/badge/Real--Time-WebSocket-brightgreen?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=for-the-badge)

---

---

<div align="center">

![Axolotl 3D Interface](web3d/preview.svg)

### 🎮 Interface 3D — Pronta para Produção

**Teste localmente:** 
```bash
cd web3d && npm install && npm start
# http://localhost:3001/advanced.html
```

**Deploy em Produção** (Hybrid Vercel + Railway):
```bash
# Ver: DEPLOY.md para instruções completas
```

</div>

</div>

---

## ✨ Funcionalidades

### 🎙️ Efeitos de voz
Transforma áudios do grupo com filtros de FFmpeg (pitch, velocidade, eco). Responda um áudio com o comando do efeito e receba o áudio modificado.

| Comando | Efeito |
|---------|--------|
| `!voz` | Abre o menu de efeitos |
| `!demonio` | Voz grave e pesada com eco |
| `!esquilo` | Voz aguda estilo chipmunk |
| `!robo` | Textura metálica com vibrato |
| `!estadio` | Reverb de arena |
| `!agudo` / `!grave` | Ajuste leve de tom |

### 🧠 IA conversacional (Google Gemini)
| Comando | O que faz |
|---------|-----------|
| `!ia <pergunta>` | Conversa direta com o bot |
| `!resumo` / `!resumo semana` | Resumo dos fatos do grupo |
| `!fofoca` | Fofoca baseada nas conversas |
| `!previsao <nome>` | Previsão do futuro |
| `!compatibilidade <a> e <b>` | Análise de compatibilidade |
| `!modolivre` / `!desativar` | *(admins)* IA participa de toda conversa |

O bot também responde quando mencionado pelo nome (`bot`, `axolotl`). Inclui **retry automático e fallback de modelo** para tolerar sobrecarga da API.

### 🏆 Gamificação
- XP por participação (texto e áudio), níveis e títulos
- `!ranking` — top do grupo
- `!perfil` — XP, nível e estatísticas pessoais

### 📊 Enquetes e estatísticas
- `!enquete Pergunta? Op1 | Op2 | Op3` → `!votar <n>` → `!resultado`
- `!jornal` — resumo de atividade do grupo
- `!stats` — estatísticas gerais
- `!sumidos` — quem está inativo

Os dados são isolados por grupo — o bot funciona em vários grupos simultaneamente sem misturar informações.

---

## 🛠️ Stack

- **Node.js** — runtime do bot
- **Baileys** — conexão com o WhatsApp
- **SQLite** (better-sqlite3) — persistência de XP, enquetes e logs
- **Google Gemini** — IA conversacional
- **FFmpeg** — processamento de áudio
- **Express** — servidor do painel
- **React + Vite** — painel web do QR code

---

## 🚀 Deploy Agora!

### 🌐 Online em 1 minuto:
```
👉 https://vercel.com/new
   Selecione: EndriaCarem/whatsapp-bot-voz
   Clique: Import
   ✨ Pronto! Interface online!
```

**Mais informações:** [DEPLOY_AGORA.md](DEPLOY_AGORA.md)

---

## 💻 Testar Localmente

```bash
cd web3d && npm install && npm start
# Abra: http://localhost:3001/advanced.html
```

---

## ⚙️ Como rodar

### Pré-requisitos
- Node.js 20+
- FFmpeg (`brew install ffmpeg` no macOS)

### Instalação

```bash
git clone https://github.com/EndriaCarem/whatsapp-bot-voz.git
cd whatsapp-bot-voz
npm install
```

### Configuração

```bash
cp .env.example .env
```

Edite o `.env` e adicione sua chave do Gemini (gratuita em [aistudio.google.com](https://aistudio.google.com/app/apikey)):

```env
PORT=3000
GEMINI_API_KEY=sua-chave-aqui
```

> Sem a chave o bot funciona normalmente, apenas sem as funções de IA.

### Iniciar - Modo Bot

```bash
npm start
```

Abra **http://localhost:3000**, escaneie o QR code (WhatsApp → Aparelhos conectados → Conectar aparelho) e pronto.

### Iniciar - Interface 3D (Modo Desenvolvimento)

```bash
cd web3d
npm install
npm start
```

**Interfaces disponíveis:**
- **Chat Simples**: http://localhost:3001/index.html
- **3D Futurista**: http://localhost:3001/advanced.html ⭐

Teste os comandos em 3D com avatares animados, múltiplas cenas e reprodutor de música! 🚀

---

## 📁 Estrutura

```
whatsapp-bot-voz/
├── index.js              # Conexão Baileys + roteamento de comandos
├── efeitos.js            # Catálogo de efeitos e processamento FFmpeg
├── ia.js                 # Integração com Gemini (NPC, resumo, fofoca)
├── xp.js                 # Sistema de XP, níveis e ranking
├── enquetes.js           # Enquetes e votações
├── stats.js              # Jornal e estatísticas do grupo
├── db.js                 # Camada de dados (SQLite)
├── QUICKSTART.md         # Guia rápido para testes
├── front/                # Painel web (React + Vite) — QR Code
└── web3d/                # 🎮 Interface 3D AVANÇADA
    ├── advanced.html     # ⭐ Interface 3D com Three.js (PRINCIPAL)
    ├── index.html        # Interface simples com chat
    ├── server.js         # WebSocket server (Node.js)
    ├── package.json      # Dependências
    ├── README.md         # Documentação da interface 3D
    └── preview.svg       # Preview visual
```

### 📌 Para desenvolver/testar:
- Vá para `web3d/` (contém tudo pronto para rodar)
- Execute `npm install && npm start`
- Abra **http://localhost:3001/advanced.html**

Ver [QUICKSTART.md](QUICKSTART.md) para mais detalhes.

---

## ⚠️ Aviso

O Baileys é uma conexão **não-oficial** com o WhatsApp e viola os Termos de Uso — o número pode ser banido. Use sempre um **número de teste**, nunca o pessoal.

---

## 📄 Licença

Distribuído sob a **Licença Apache 2.0**. Você pode usar, modificar e distribuir,
desde que mantenha os créditos de autoria. Veja o arquivo [LICENSE](LICENSE) para os termos completos.

© 2026 EndriaCarem. Todos os direitos reservados sobre a autoria original.

---

<div align="center">

### 🎬 Showcase

**Interface 3D com três cenas dinâmicas:**
1. Sala de Chat — Ambiente conversacional minimalista
2. Estúdio de Música — Reprodutor com visualizador de áudio
3. Cyberspace — Cenário futurista com grid de neon

**Tudo rodando no navegador, sem instalações extras!**

---

Desenvolvido por <a href="https://github.com/EndriaCarem">EndriaCarem</a>

</div>
