# 🚀 Axolotl-Byte 3D Interface

Interface futurista em **3D WebGL** com avatares animados, múltiplas cenas e integração com o bot.

## ✨ Features

### 🎮 Cenas 3D Dinâmicas
- **Sala de Chat** — Ambiente minimalista para conversas
- **Estúdio de Música** — Reprodutor de música com visualizador de áudio
- **Cyberspace** — Ambiente cyberpunk com grid de neon

### 🤖 Avatares Animados
- Avatar do usuário (Cyan 🔷)
- Avatar do bot (Magenta 🔶)
- Animação de boca ao falar
- Movimentos fluidos e realistas

### 🎵 Reprodutor de Música
- Visualizador de áudio em tempo real
- Controles de play/stop
- Integrado com comando `!musica`

### ⌨️ Comandos Interativos
```
!ia <pergunta>       → Chat com IA
!musica             → Reprodutor de música
!ranking            → Top 5 do grupo
!perfil             → Seu perfil
!jornal             → Resumo de atividades
!stats              → Estatísticas gerais
!voz                → Efeitos de voz
!sumidos            → Membros inativos
!ajuda              → Lista completa de comandos
```

## 🚀 Como Usar

### 1. Instalar dependências
```bash
cd web3d
npm install
```

### 2. Iniciar servidor WebSocket
```bash
npm start
# Servidor rodando em http://localhost:3001
```

### 3. Abrir interface 3D
- **Básica**: http://localhost:3001/index.html
- **Avançada (3D)**: http://localhost:3001/advanced.html

## 📚 Stack Técnico

| Tecnologia | Uso |
|-----------|-----|
| **Three.js** | Renderização 3D WebGL |
| **Node.js** | Servidor WebSocket |
| **Express** | Servidor HTTP |
| **WebSocket** | Comunicação em tempo real |

## 🎨 Arquitetura

```
web3d/
├── index.html        → Interface 2D com chat
├── advanced.html     → Interface 3D com Three.js
├── server.js         → WebSocket server
├── package.json      → Dependências
└── README.md         → Esta documentação
```

## 🔌 Integração com Bot

Adapte o `server.js` para:

```javascript
// Conectar ao bot real
import { handleBotCommand } from '../index.js';

ws.on('message', async (data) => {
    const { content } = JSON.parse(data);
    const response = await handleBotCommand(content);
    ws.send(JSON.stringify({ type: 'response', content: response }));
});
```

## 🎯 Próximos Passos

- [ ] Importar avatares 3D reais (ReadyPlayer Me)
- [ ] Sincronização de áudio com animação de boca
- [ ] Integração com API de música
- [ ] Sistema de partículas para efeitos
- [ ] Suporte a mobile com touch controls

## 📄 Licença

Apache 2.0 — © 2026 EndriaCarem

---

**Feito com ❤️ e muita criatividade**
