# ⚡ Quick Start — Axolotl-Byte 3D

Teste a interface 3D em 3 comandos:

```bash
# 1. Entrar na pasta web3d
cd web3d

# 2. Instalar dependências (primeira vez)
npm install

# 3. Iniciar servidor
npm start
```

**Pronto!** Abra no navegador:
- http://localhost:3001/advanced.html (3D com Three.js) ⭐
- http://localhost:3001/index.html (Interface simples)

---

## 🎮 Comandos para Testar

Digite na interface:

```
!ia Olá, como funciona?        → Conversar com IA
!musica                        → Reprodutor de música com visualizador
!ranking                       → Top 5 do grupo
!perfil                        → Seu perfil e XP
!jornal                        → Resumo de atividades
!stats                         → Estatísticas gerais
!voz                           → Efeitos de voz disponíveis
!sumidos                       → Membros inativos
!ajuda                         → Listar todos os comandos
```

---

## 🎬 Trocar de Cena

Clique nos botões no topo:
- **Sala de Chat** — Ambiente conversacional
- **Estúdio de Música** — Para reproduzir músicas
- **Cyberspace** — Ambiente futurista com grid de neon

---

## 📱 O que Você Vai Ver

✅ Avatar do bot e do usuário em 3D
✅ Animações de boca ao falar
✅ Múltiplas cenas dinâmicas
✅ Reprodutor de música com visualizador
✅ Chat em tempo real via WebSocket
✅ Interface futurista cyberpunk

---

## 🔧 Próximas Integrações

Para conectar com o bot real, edite `web3d/server.js`:

```javascript
// Importar funções reais do bot
import { handleCommand } from '../index.js';

ws.on('message', async (data) => {
    const message = JSON.parse(data);
    const response = await handleCommand(message.content);
    ws.send(JSON.stringify({ type: 'response', content: response }));
});
```

---

**Divirta-se! 🚀**
