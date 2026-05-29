# 🎙️ WhatsApp Bot de Efeitos de Voz

Bot para grupos de WhatsApp que transforma mensagens de áudio com efeitos de voz — estilo Instagram (Demônio, Esquilo, Robô e mais). Desenvolvido por **[@EndriaCarem](https://github.com/EndriaCarem)**.

---

## ✨ Como funciona

```
Você (grupo)          Evolution API (Docker)          Bot (Node.js)
──────────────────────────────────────────────────────────────────
1. Manda um áudio
2. Responde com !voz ──→ dispara webhook ──────────────→ recebe evento
                                                         exibe botões ←──
3. Toca em "Demônio"  ──→ dispara webhook ──────────────→ baixa o áudio
                                                         aplica FFmpeg
                         ←── envia áudio modificado ←──
4. Ouve o áudio já transformado 🎉
```

Não usa IA — os efeitos são **filtros de áudio do FFmpeg** (manipulação de pitch, velocidade e eco), exatamente como o Instagram faz nos efeitos clássicos.

---

## 🎛️ Efeitos disponíveis

| Comando | Efeito | O que faz |
|---------|--------|-----------|
| `!voz` | *(abre o menu de botões)* | Mostra todos os efeitos para clicar |
| `!demonio` | Demônio 😈 | Voz grave e pesada com eco |
| `!esquilo` | Esquilo 🐿️ | Voz bem aguda, estilo chipmunk |
| `!robo` | Robô 🤖 | Textura metálica com vibrato |
| `!estadio` | Estádio 🏟️ | Reverb enorme, como em uma arena |
| `!agudo` | Agudo 🎵 | Voz levemente mais aguda |
| `!grave` | Grave 🔊 | Voz levemente mais grave |
| `!menu` | — | Exibe as instruções de uso |

---

## 🚀 Como usar no grupo

1. Alguém manda (ou você grava) um **áudio** no grupo
2. **Segure o áudio** → toque em **Responder**
3. Escreva **`!voz`** e envie
4. O bot mostra os **botões de efeito** — toque no que quiser
5. O áudio modificado aparece no grupo 🎉

---

## 🛠️ Tecnologias

- **[Node.js](https://nodejs.org)** — runtime do bot
- **[Evolution API](https://github.com/EvolutionAPI/evolution-api)** — conexão com o WhatsApp
- **[FFmpeg](https://ffmpeg.org)** — processamento de áudio
- **[Express](https://expressjs.com)** — servidor de webhook
- **[Docker](https://docker.com)** — containerização da Evolution API

---

## ⚙️ Configuração local

### Pré-requisitos

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [FFmpeg](https://ffmpeg.org) — `brew install ffmpeg` no Mac

### 1. Clone o repositório

```bash
git clone https://github.com/EndriaCarem/whatsapp-bot-voz.git
cd whatsapp-bot-voz
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o arquivo `.env`

Crie um arquivo `.env` na raiz do projeto:

```env
EVOLUTION_URL=http://localhost:8082
EVOLUTION_API_KEY=sua-chave-aqui
INSTANCE_NAME=bot-voz
PORT=3000
```

### 4. Suba a Evolution API

```bash
docker compose up -d
```

Aguarde ~10 segundos para o serviço inicializar.

### 5. Configure a instância e gere o QR code

```bash
npm run setup
```

Abra o painel no navegador → **http://localhost:8082/manager**, logue com sua API key e escaneie o QR code que aparece na instância `bot-voz`.

> **Celular:** WhatsApp → Aparelhos conectados → Conectar aparelho

### 6. Inicie o bot

```bash
npm start
```

---

## ☁️ Deploy no Railway (grátis)

O Railway oferece **$5 de crédito gratuito** (~2-3 meses de uso sem custo).

### Serviços necessários no Railway

| Serviço | Tipo | Observação |
|---------|------|------------|
| **Bot** | GitHub repo | Este repositório |
| **Evolution API** | Docker image | `atendai/evolution-api:v2.1.1` |
| **PostgreSQL** | Database | Template pronto no Railway |
| **Redis** | Database | Template pronto no Railway |

### Variáveis de ambiente do Bot (Railway)

```env
EVOLUTION_URL=https://sua-evolution.railway.app
EVOLUTION_API_KEY=sua-chave
INSTANCE_NAME=bot-voz
PORT=3000
```

### Variáveis de ambiente da Evolution (Railway)

```env
AUTHENTICATION_API_KEY=sua-chave
SERVER_URL=https://sua-evolution.railway.app
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
CACHE_LOCAL_ENABLED=false
```

---

## 📁 Estrutura do projeto

```
whatsapp-bot-voz/
├── index.js          # Servidor webhook + lógica principal do bot
├── efeitos.js        # Catálogo de efeitos e processamento FFmpeg
├── setup.js          # Script de configuração inicial (cria instância + webhook)
├── docker-compose.yml # Stack isolada da Evolution API para rodar local
├── Dockerfile        # Imagem Docker do bot (para deploy no Railway)
├── .env.example      # Modelo do arquivo de configuração
└── package.json      # Dependências e scripts
```

---

## ⚠️ Aviso importante

A Evolution API utiliza o **Baileys** por baixo — uma conexão **não-oficial** com o WhatsApp. Isso viola os Termos de Uso do WhatsApp e o número pode ser **banido**.

> Sempre use um **número de teste** (chip separado), nunca o seu número pessoal principal.

---

## 🤝 Contribuições

Sugestões de novos efeitos, melhorias ou correções são bem-vindas! Abra uma [issue](https://github.com/EndriaCarem/whatsapp-bot-voz/issues) ou um pull request.

---

<div align="center">
  Feito com ♥ por <a href="https://github.com/EndriaCarem">EndriaCarem</a>
</div>
