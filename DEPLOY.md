# 🚀 Deploy — Axolotl-Byte 3D (Hybrid Setup)

## Arquitetura

```
┌─────────────────────┐
│    Vercel           │  (Frontend 3D)
│  - advanced.html    │  ✨ Interface interativa
│  - index.html       │  📱 Responsivo
│  https://axolotl... │
└──────────┬──────────┘
           │ WebSocket WSS
           ↓
┌─────────────────────┐
│    Railway          │  (Backend)
│  - server.js        │  🔄 WebSocket real-time
│  - Node.js 20+      │  ⚡ Auto-restart
│  https://rail...    │
└─────────────────────┘
```

---

## 📋 Setup Rápido (5 min)

### 1️⃣ Frontend — Vercel

```bash
# 1. Fazer login na Vercel
npm install -g vercel
vercel login

# 2. Deploy da pasta web3d
cd web3d
vercel --prod

# Vai perguntar algumas coisas:
# - Project name: axolotl-byte-3d (ou seu nome)
# - Framework: Other
# - Root directory: ./

# ✅ Pronto! Você terá uma URL: https://seu-projeto.vercel.app
```

### 2️⃣ Backend — Railway

```bash
# 1. Fazer login na Railway
npm install -g @railway/cli
railway login

# 2. Criar novo projeto
cd web3d
railway init

# 3. Deploy automático
git push railway main

# ✅ Railway vai automaticamente rodar npm start
```

---

## 🔧 Configurações Necessárias

### Variáveis de Ambiente (Railway)

No dashboard da Railway, adicione:

```
NODE_ENV=production
PORT=3001
```

### CORS (Vercel → Railway)

O arquivo `vercel.json` já tem CORS configurado.

No `server.js`, certifique-se:

```javascript
const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: false,
    maxPayload: 100 * 1024 * 1024
});
```

---

## 🌐 URLs Finais

Após deploy:

- **Frontend**: `https://seu-projeto.vercel.app/advanced.html`
- **Backend**: `https://seu-backend.railway.app`

O frontend automaticamente detecta se está em produção e conecta com `wss://seu-backend.railway.app`

---

## ✅ Verificar Conexão

1. Abra http://localhost:3001/advanced.html
2. Abra DevTools (F12)
3. Vá em Console
4. Procure por: `🌐 Conectando ao: wss://...`
5. Digite um comando e veja se funciona

---

## 🔄 Auto-Deploy via Git

### Vercel
- Conecte seu GitHub
- Toda vez que fizer push em `main`, Vercel redeploya automaticamente

### Railway
- Conecte seu GitHub
- Toda vez que fizer push, Railway redeploya automaticamente

---

## 💾 Passo a Passo Completo

### Opção A: Vercel + Railway (Recomendado)

```bash
# 1. Commit local
git add .
git commit -m "chore: adiciona config para deploy hybrid"
git push origin feat/jornal-ranking-xp-fixes

# 2. Fazer merge para main
git checkout main
git merge feat/jornal-ranking-xp-fixes

# 3. Deploy Vercel (na pasta web3d)
cd web3d
vercel --prod

# 4. Deploy Railway
railway link
railway up

# ✅ Pronto! Seu bot está online!
```

### Opção B: Render (Alternativa mais simples)

Se preferir não usar Railway, use Render:

```bash
# 1. Conectar GitHub em https://render.com
# 2. Criar novo Web Service
# 3. Apontar para pasta web3d
# 4. Build: npm install
# 5. Start: npm start
# 6. Environment: NODE_ENV=production
```

---

## 🐛 Troubleshooting

### "WebSocket connection failed"

Verificar:
- URL do backend no console (deve ser `wss://...`)
- Variáveis de ambiente no Railway
- Se o backend está rodando (verificar logs)

```bash
# Railway: ver logs
railway logs
```

### "CORS error"

Adicionar no `server.js`:

```javascript
const express = require('express');
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});
```

### "Port 3001 already in use"

O Railway vai atribuir uma porta automaticamente via `process.env.PORT`

---

## 📊 Monitoramento

### Vercel Dashboard
- https://vercel.com/dashboard

### Railway Dashboard
- https://railway.app/dashboard

---

## 🚀 Bonus: CI/CD automático

Adicionar ao repositório (criar `.github/workflows/deploy.yml`):

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
      - name: Deploy to Railway
        run: railway up --token ${{ secrets.RAILWAY_TOKEN }}
```

---

## ✨ Resumo Final

| Serviço | Função | URL | Status |
|---------|--------|-----|--------|
| **Vercel** | Frontend 3D | https://seu-projeto.vercel.app | ✅ |
| **Railway** | Backend WebSocket | https://seu-backend.railway.app | ✅ |

Tudo pronto para produção! 🎉

---

**Dúvidas? Verifique os logs:**
```bash
# Railway
railway logs

# Vercel
vercel logs
```
