const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Gerenciamento de salas (em memória para este exemplo)
const rooms = {};

// Helper: Gera código aleatório
function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper: Extrai IP real (considerando proxies como Heroku/Render)
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    // Normalizar IPv6 loopback para IPv4 se necessário
    if (ip === '::1') return '127.0.0.1';
    return ip;
}

// ── Rota: Criar Sala ─────────────────────────────────────────────────────────
// POST /create_room
// Body: { "host_port": 9999, "maxPlayers": 8, "settings": { "lives": 5, "timer": 60 } }
app.post('/create_room', (req, res) => {
    const host_ip = getClientIp(req);
    const host_port = parseInt(req.body.host_port) || 9999;
    
    let code;
    do {
        code = generateCode();
    } while (rooms[code]);

    const maxPlayers = Math.min(Math.max(parseInt(req.body.maxPlayers) || 2, 2), 8);
    const settings = req.body.settings || { lives: 5, timer: 60 };

    rooms[code] = {
        host_ip,
        host_port,
        maxPlayers,
        settings,
        players: [host_ip],
        gameStarted: false,
        createdAt: Date.now()
    };

    console.log(`[Sala Criada] Código: ${code} | Host: ${host_ip}:${host_port} | Max: ${maxPlayers}`);
    res.json({ code, settings: rooms[code].settings });
});

// ── Rota: Entrar na Sala ──────────────────────────────────────────────────────
// GET /join_room/:code
app.get('/join_room/:code', (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const playerIp = getClientIp(req);
    const room = rooms[code];

    if (!room) {
        return res.status(404).json({ error: 'Sala não encontrada' });
    }

    if (room.gameStarted) {
        return res.status(403).json({ error: 'Jogo já iniciou' });
    }

    // Permitir se já estiver na sala
    const isAlreadyIn = room.players.includes(playerIp);

    if (!isAlreadyIn && room.players.length >= room.maxPlayers) {
        return res.status(403).json({ error: 'Sala cheia' });
    }

    if (!isAlreadyIn) {
        room.players.push(playerIp);
    }

    console.log(`[Sala Entrou] Código: ${code} | Jogadores: ${room.players.length}/${room.maxPlayers}`);
    res.json({ 
        host_ip: room.host_ip,
        host_port: room.host_port,
        players: room.players.length, 
        maxPlayers: room.maxPlayers,
        settings: room.settings 
    });
});

// ── Rota: Marcar partida iniciada ─────────────────────────────────────────────
// DELETE /room/:code (ou POST /start_game/:code)
app.delete('/room/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    if (rooms[code]) {
        console.log(`[Sala Fechada] Código: ${code}`);
        delete rooms[code];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Não encontrado' });
    }
});

// Limpeza de salas antigas (> 2 horas)
setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].createdAt > 2 * 60 * 60 * 1000) {
            delete rooms[code];
        }
    }
}, 30 * 60 * 1000);

app.listen(port, () => {
    console.log(`[Broker] Servidor rodando na porta ${port}`);
    console.log(`[Broker] Rotas: POST /create_room | GET /join_room/:code | DELETE /room/:code`);
});
