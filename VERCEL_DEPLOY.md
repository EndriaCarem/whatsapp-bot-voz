# 🚀 Deploy Vercel — Axolotl-Byte 3D

**Tudo em um só lugar!** Frontend + Backend (Serverless Functions) na Vercel.

---

## 📋 Arquitetura

```
┌──────────────────────────────────────┐
│         VERCEL (Tudo)                │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │  Frontend 3D                    │ │
│  │  - advanced.html (Three.js)     │ │
│  │  - index.html (Chat simples)    │ │
│  │  https://seu-projeto.vercel.app │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │  Serverless Functions (Node.js) │ │
│  │  - /api/command                 │ │
│  │  Processa comandos do bot       │ │
│  └─────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

---

## 🎯 Deploy em 2 Passos

### 1️⃣ Conectar ao GitHub

```bash
# Ir em https://vercel.com/dashboard
# Clicar "Add New..." → "Project"
# Selecionar: EndriaCarem/whatsapp-bot-voz
# Clicar "Import"
```

### 2️⃣ Deploy automático

```bash
# Vercel vai automaticamente:
# 1. Detectar vercel.json
# 2. Buildar /api
# 3. Buildar /web3d
# 4. Deploy tudo
```

**Pronto!** Sua URL será gerada automaticamente:
- `https://seu-projeto.vercel.app/advanced.html`

---

## 🔧 Configuração

### Variáveis de Ambiente (Opcional)

No dashboard Vercel, você pode adicionar:

```
NODE_ENV=production
DEBUG=false
```

Mas o projeto já funciona sem elas!

---

## 📁 Estrutura de Deploy

```
whatsapp-bot-voz/
├── vercel.json                # Config principal (raiz)
├── api/
│   └── command.js            # Serverless Function (POST /api/command)
├── web3d/
│   ├── vercel.json           # Config do frontend
│   ├── advanced.html         # Interface 3D principal
│   ├── index.html            # Chat simples
│   └── package.json
└── README.md
```

---

## 🌐 URLs Finais

Após deploy:

- **Frontend 3D**: `https://seu-projeto.vercel.app/advanced.html`
- **Frontend Simples**: `https://seu-projeto.vercel.app/index.html`
- **API Comando**: `https://seu-projeto.vercel.app/api/command` (POST)

---

## 📡 Como Funciona

### 1. Usuário abre a interface 3D

```
https://seu-projeto.vercel.app/advanced.html
```

### 2. Digita um comando

```
!ia Como você funciona?
```

### 3. Frontend envia requisição HTTP

```javascript
fetch('/api/command', {
    method: 'POST',
    body: JSON.stringify({ command: '!ia Como você funciona?' })
})
```

### 4. Serverless Function processa

```javascript
// api/command.js
export default function handler(req, res) {
    const { command } = req.body;
    const response = handleCommand(command);
    res.json({ content: response });
}
```

### 5. Resposta volta para o frontend

```
Bot responde com animação de boca 🤖
```

---

## ✅ Verificar Funcionamento

### Local (para testar antes)

```bash
cd web3d
npm install
npm start

# Abra: http://localhost:3001/advanced.html
```

### Em Produção

1. Abra o console (F12)
2. Procure por: `🌐 API URL: /api/command`
3. Digite um comando e veja se a resposta aparece

---

## 🐛 Troubleshooting

### "API retorna 404"

Verificar em Vercel Dashboard:
- Functions → `api/command.js` deve estar em "Ready"

### "CORS error"

Já está configurado em `vercel.json`:
```json
"Access-Control-Allow-Origin": "*"
```

### "Função tarda muito"

Aumentar timeout em `vercel.json`:
```json
"functions": {
    "api/**/*.js": {
        "maxDuration": 30
    }
}
```

---

## 🔄 Redeploy após mudanças

Simples! Já configurado com auto-deploy:

```bash
# Fazer alteração em qualquer arquivo
git add .
git commit -m "fix: algo"
git push origin main

# Vercel detecta e redeploya automaticamente! ✨
```

---

## 📊 Monitoramento

### Dashboard Vercel

- **Logs**: https://vercel.com/seu-usuario/seu-projeto/logs
- **Functions**: https://vercel.com/seu-usuario/seu-projeto/functions
- **Analytics**: https://vercel.com/seu-usuario/seu-projeto/analytics

---

## 💾 Dados & Persistência

### Armazenar dados entre requisições?

Você pode adicionar:
- **Vercel KV** (Redis) para cache
- **Vercel Postgres** para banco de dados
- **MongoDB** conectado via string

Mas por enquanto o bot é stateless!

---

## 🎁 Bonus: Adicionar mais Endpoints

Para adicionar novos endpoints, crie:

```javascript
// api/stats.js
export default function handler(req, res) {
    res.json({ members: 24, messages: 12450 });
}
```

Será automaticamente exposto em:
```
https://seu-projeto.vercel.app/api/stats
```

---

## ✨ Resumo

| Item | Status |
|------|--------|
| Frontend 3D | ✅ Vercel |
| API Backend | ✅ Serverless |
| WebSocket | ❌ Não precisa (HTTP é mais simples) |
| Auto-deploy | ✅ Via GitHub |
| CORS | ✅ Configurado |
| Custo | 💰 Free tier |

---

## 🚀 Próximo Passo

1. Fazer commit de tudo
2. Ir em https://vercel.com/dashboard
3. Clicar "Add New Project"
4. Selecionar repositório
5. Pronto! ✨

---

**Dúvidas? Verifique os logs:**
```bash
vercel logs
```
