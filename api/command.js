// API Endpoint para comandos do bot
// Vercel Serverless Function

export default function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { command } = req.body;

    if (!command) {
        return res.status(400).json({ error: 'Comando não fornecido' });
    }

    const response = handleCommand(command);

    return res.status(200).json({
        type: 'response',
        content: response,
        timestamp: new Date().toISOString()
    });
}

function handleCommand(input) {
    const cmd = input.toLowerCase().trim();

    const responses = {
        '!ia': '🧠 IA: Olá! Como posso ajudar?',
        '!ranking': '🏆 TOP 5 DO RANKING:\n1. EndriaCarem - 5000 XP\n2. Dev Master - 4500 XP\n3. Code Ninja - 4000 XP\n4. Tech Wizard - 3500 XP\n5. Bot Lover - 3000 XP',
        '!perfil': '👤 PERFIL:\nNível: 25\nXP: 2500\nRank: 12º\nMensagens: 342\nÁudios: 45',
        '!jornal': '📰 JORNAL DO DIA:\n• 15 mensagens trocadas\n• 3 enquetes realizadas\n• 2 novos membros\n• Top do dia: EndriaCarem com 850 XP',
        '!stats': '📊 ESTATÍSTICAS GERAIS:\nMembros: 24\nMensagens: 12.450\nÁudios: 543\nUptime: 45 dias',
        '!voz': '🎙️ EFEITOS DE VOZ:\n!demonio - !esquilo - !robo - !estadio - !agudo - !grave',
        '!sumidos': '🚫 INATIVOS (7+ dias):\n• João Silva - 12 dias\n• Maria Santos - 9 dias\n• Pedro Costa - 8 dias',
        '!musica': '🎵 Reprodutor ativado. Use !musica <nome> para tocar',
        '!ajuda': '❓ COMANDOS:\n!ia - Chat com IA\n!ranking - Ranking\n!perfil - Seu perfil\n!jornal - Resumo\n!stats - Estatísticas\n!voz - Efeitos\n!sumidos - Inativos\n!musica - Reprodutor'
    };

    // Procurar por comando
    for (const [key, value] of Object.entries(responses)) {
        if (cmd.startsWith(key)) {
            return value;
        }
    }

    // Se for pergunta para IA
    if (cmd.startsWith('!ia ')) {
        const question = cmd.substring(4);
        return `🤖 Respondendo sua pergunta: "${question}"\n\n✨ Eu sou o Axolotl-Byte, um bot inteligente!`;
    }

    // Default
    return '❓ Comando não encontrado. Digite !ajuda para ver os comandos disponíveis.';
}
