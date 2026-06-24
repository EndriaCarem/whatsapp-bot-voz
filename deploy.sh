#!/bin/bash

# 🚀 Deploy Axolotl-Byte 3D na Vercel
# Execute este script após ter um token Vercel válido

echo "╔════════════════════════════════════════════════════════╗"
echo "║  🚀 Deploy Axolotl-Byte 3D na Vercel                  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Verificar se git está clean
if [[ -n $(git status -s) ]]; then
    echo "❌ Há mudanças não commitadas. Execute:"
    echo "   git add -A && git commit -m 'suas mudanças'"
    exit 1
fi

echo "✅ Repositório limpo"
echo ""

# Fazer push para GitHub
echo "📤 Fazendo push para GitHub..."
git push origin feat/jornal-ranking-xp-fixes
echo "✅ Push realizado"
echo ""

# Deploy Vercel
echo "🚀 Iniciando deploy na Vercel..."
vercel --prod

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  ✨ DEPLOY FINALIZADO!                                ║"
echo "║                                                        ║"
echo "║  Acesse seu projeto em:                               ║"
echo "║  https://vercel.com/endrya161624-gmailcoms-projects   ║"
echo "║                                                        ║"
echo "║  Interface 3D:                                        ║"
echo "║  https://seu-projeto.vercel.app/advanced.html        ║"
echo "╚════════════════════════════════════════════════════════╝"
