import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = await new Promise(resolve => {
    const httpServer = app.listen(3001, () => {
        console.log('🚀 Servidor rodando em http://localhost:3001');
        resolve(httpServer);
    });
});

const wss = new WebSocketServer({ server });
const clients = new Set();

// Servir arquivos estáticos
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`✨ Cliente conectado (${clients.size} total)`);

    ws.send(JSON.stringify({
        type: 'response',
        content: '✅ Conectado ao servidor Axolotl-Byte!'
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'command') {
                console.log(`📨 Comando recebido: ${message.content}`);

                // Simular resposta do bot
                const response = handleCommand(message.content);

                // Enviar para o cliente que enviou
                ws.send(JSON.stringify({
                    type: 'response',
                    content: response
                }));

                // Broadcast para outros clientes
                broadcast({
                    type: 'response',
                    content: `[Sistema]: ${message.content}`,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            ws.send(JSON.stringify({
                type: 'error',
                content: 'Erro ao processar comando'
            }));
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`👋 Cliente desconectado (${clients.size} restantes)`);
    });

    ws.on('error', (error) => {
        console.error('Erro WebSocket:', error);
    });
});

function handleCommand(input) {
    const cmd = input.toLowerCase().trim();

    const responses = {
        '!ia': 'IA: Olá! Como posso ajudar? 🧠',
        '!ranking': '🏆 TOP 5 DO RANKING:\n1. EndriaCarem - 5000 XP\n2. Dev Master - 4500 XP\n3. Code Ninja - 4000 XP\n4. Tech Wizard - 3500 XP\n5. Bot Lover - 3000 XP',
        '!perfil': '👤 PERFIL:\nNível: 25\nXP: 2500\nRank: 12º\nMensagens: 342\nAudios: 45',
        '!jornal': '📰 JORNAL DO DIA:\n• 15 mensagens trocadas\n• 3 enquetes realizadas\n• 2 novos membros\n• Top do dia: EndriaCarem com 850 XP',
        '!stats': '📊 ESTATÍSTICAS GERAIS:\nMembros: 24\nMensagens: 12.450\nAudios: 543\nUptime: 45 dias',
        '!voz': '🎙️ EFEITOS DE VOZ:\n!demonio - !esquilo - !robo - !estadio - !agudo - !grave',
        '!sumidos': '🚫 INATIVOS (7+ dias):\n• João Silva - 12 dias\n• Maria Santos - 9 dias\n• Pedro Costa - 8 dias',
        '!enquete': '📋 Para criar enquete use: !enquete Pergunta? Op1|Op2|Op3',
        '!ajuda': '❓ COMANDOS:\n!ia - Chat com IA\n!ranking - Ranking\n!perfil - Seu perfil\n!jornal - Resumo\n!stats - Estatísticas\n!voz - Efeitos\n!sumidos - Inativos\n!enquete - Criar enquete'
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
        return `🤖 Respondendo sua pergunta: "${question}"\n\n✨ Eu sou o Axolotl-Byte, um bot inteligente! Essa é uma resposta simulada. Para respostas reais, conecte à API do Gemini.`;
    }

    // Default
    return '❓ Comando não encontrado. Digite !ajuda para ver os comandos disponíveis.';
}

function broadcast(data) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

console.log('🤖 Servidor Axolotl-Byte 3D aguardando conexões...');
