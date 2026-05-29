<div align="center">

# 🤖 Axolotl-Byte

**Bot de WhatsApp para grupos** — efeitos de voz, IA conversacional, gamificação e estatísticas.

Conecta direto no WhatsApp via Baileys, com painel web para leitura do QR code.

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

### Iniciar

```bash
npm start
```

Abra **http://localhost:3000**, escaneie o QR code (WhatsApp → Aparelhos conectados → Conectar aparelho) e pronto.

---

## 📁 Estrutura

```
whatsapp-bot-voz/
├── index.js        # Conexão Baileys + roteamento de comandos
├── efeitos.js      # Catálogo de efeitos e processamento FFmpeg
├── ia.js           # Integração com Gemini (NPC, resumo, fofoca)
├── xp.js           # Sistema de XP, níveis e ranking
├── enquetes.js     # Enquetes e votações
├── stats.js        # Jornal e estatísticas do grupo
├── db.js           # Camada de dados (SQLite)
└── front/          # Painel web (React + Vite)
```

---

## ⚠️ Aviso

O Baileys é uma conexão **não-oficial** com o WhatsApp e viola os Termos de Uso — o número pode ser banido. Use sempre um **número de teste**, nunca o pessoal.

---

<div align="center">
  Feito por <a href="https://github.com/EndriaCarem">EndriaCarem</a>
</div>
