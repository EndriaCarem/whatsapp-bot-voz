# 🎮 Interface 3D Axolotl-Byte

Experiência futurista completamente funcional em **Three.js + WebGL** 🚀

---

## ✨ O Que Você Encontra

### 🎬 Cenas Dinâmicas

#### 🏠 Sala de Chat
- Ambiente minimalista para conversas
- Avatares do usuário (cyan) e bot (magenta)
- Ideal para bater papo

#### 🎤 Estúdio de Música  
- Reprodutor de música integrado
- Visualizador de áudio com barras animadas
- Ambiente temático para vibe musical

#### 🌃 Cyberspace
- Grid de neon futurista
- Ambiente cyberpunk imersivo
- Perfeito para se sentir no futuro

### 🤖 Avatares Reais

```
✅ Geometria 3D (esferas, cubos, cilindros)
✅ Materiais metalizados com brilho
✅ Animação de boca ao falar
✅ Sombras e iluminação dinâmica
✅ Controle de câmera com mouse (drag)
✅ Auto-rotação suave
```

### 🎵 Reprodutor de Música

- Comando `!musica` abre o player
- Visualizador de áudio sincronizado
- Controles de play/stop
- Widget flutuante (canto superior direito)

### ⌨️ Comandos Totalmente Funcionais

```
!ia <pergunta>       Chat com IA
!musica             Reprodutor com visualizador
!ranking            Top 5 do grupo
!perfil             Seu XP e nível
!jornal             Resumo do dia
!stats              Estatísticas gerais
!voz                Efeitos de voz
!sumidos            Membros inativos
!ajuda              Todos os comandos
```

---

## 🔧 Stack Técnico

| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| Renderização 3D | **Three.js** | 128+ |
| Gráficos | **WebGL** | 2.0 |
| Backend | **Node.js** | 20+ |
| Comunicação | **WebSocket** | ws 8.21 |
| Server | **Express** | 4.21 |

---

## 🎯 Features Técnicas

✅ **Three.js Scene Management**
- Múltiplas cenas com setup dinâmico
- Câmera responsiva
- Iluminação avançada (DirectionalLight, AmbientLight)
- Materiais com metalness/roughness

✅ **Avatares Animados**
- Mesh composition (head, body, eyes, mouth)
- Animações suaves de boca
- Scale transforms
- Glow effects com blur

✅ **WebSocket Real-Time**
- Conexão bidirecional
- Broadcast de mensagens
- Fallback com retry automático
- Tratamento de erros

✅ **UI/UX Moderna**
- Tema cyberpunk neon
- Gradientes e glassmorphism
- Animações fluidas
- Responsivo (desktop-first)

---

## 🚀 Como Testar

### Opção 1: Executar Agora

```bash
cd web3d
npm install
npm start
```

Abra: http://localhost:3001/advanced.html

### Opção 2: Interface Simples

Se preferir chat sem 3D:
```
http://localhost:3001/index.html
```

---

## 📊 Diagrama de Arquitetura

```
┌─────────────────────────────────────┐
│   Browser (Cliente)                  │
│  ┌──────────────────────────────────┐│
│  │ Three.js 3D Scene                ││
│  │ - Avatares animados              ││
│  │ - Múltiplas cenas                ││
│  │ - Câmera interativa              ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ UI React-like (Vanilla JS)       ││
│  │ - Chat bubble                    ││
│  │ - Input commands                 ││
│  │ - Scene selector                 ││
│  └──────────────────────────────────┘│
└─────────────────────────────────────┘
           ↕ WebSocket
┌─────────────────────────────────────┐
│   Node.js Server                     │
│  ┌──────────────────────────────────┐│
│  │ WebSocket Handler                ││
│  │ - Parse commands                 ││
│  │ - Route to bot logic             ││
│  │ - Send responses                 ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ Express HTTP                     ││
│  │ - Servir arquivos estáticos      ││
│  │ - CORS handling                  ││
│  └──────────────────────────────────┘│
└─────────────────────────────────────┘
           ↕ (Futuro)
┌─────────────────────────────────────┐
│   Bot Axolotl-Byte                   │
│   (index.js, ia.js, etc)             │
└─────────────────────────────────────┘
```

---

## 🎨 Inspirações de Design

- **Cyberpunk 2077** — Neon glow, cores vibrantes
- **Discord** — Layout intuitivo
- **Metaverse Vibes** — Avatares 3D, ambiente imersivo
- **Black Mirror** — Futurista mas acessível

---

## 🔮 Próximas Melhorias

- [ ] Importar avatares reais (ReadyPlayer Me API)
- [ ] Sincronização de áudio com animação de boca (Web Audio API)
- [ ] Partículas e efeitos visuais
- [ ] Sistema de emojis flutuantes
- [ ] Suporte a mobile (touch controls)
- [ ] Integração com Gemini API real
- [ ] Persista de chat em localStorage
- [ ] Dark/Light mode toggle

---

## 🎬 Demonstração Visual

Cada comando é testável:

```javascript
!ia "Como você funciona?"
// → Bot abre a boca, responde com IA

!musica
// → Transição para Estúdio
// → Abre reprodutor com visualizador

!ranking
// → Mostra top 5 em chat bubble
// → Animation fluida

!perfil
// → Exibe seu XP e nível
```

---

## 📚 Referências

- [Three.js Docs](https://threejs.org/docs/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WebGL Specs](https://www.khronos.org/webgl/)

---

**Desenvolvido por [@EndriaCarem](https://github.com/EndriaCarem)**

*"Tecnologia não é sobre ter os melhores gráficos. É sobre criar experiências inesquecíveis."* 🚀
