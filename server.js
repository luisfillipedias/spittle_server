const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 10000;

// Middleware de CORS manual (para evitar depender do pacote 'cors')
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(bodyParser.json());

// Gerenciamento de salas
const rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    if (ip === '::1') return '127.0.0.1';
    return ip;
}

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
        createdAt: Date.now(),
        host_ws: null,
        client_ws: null
    };

    console.log(`[Sala Criada] Código: ${code} | Host: ${host_ip}:${host_port}`);
    res.json({ code, settings: rooms[code].settings });
});

app.get('/join_room/:code', (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    const playerIp = getClientIp(req);
    const room = rooms[code];

    if (!room) return res.status(404).json({ error: 'Sala não encontrada' });
    if (room.gameStarted) return res.status(403).json({ error: 'Jogo já iniciou' });

    if (!room.players.includes(playerIp)) {
        if (room.players.length >= room.maxPlayers) return res.status(403).json({ error: 'Sala cheia' });
        room.players.push(playerIp);
    }

    res.json({ 
        host_ip: room.host_ip,
        host_port: room.host_port,
        players: room.players.length, 
        maxPlayers: room.maxPlayers,
        settings: room.settings 
    });
});

app.delete('/room/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    if (rooms[code]) {
        delete rooms[code];
        res.json({ success: true });
    } else res.status(404).json({ error: 'Não encontrado' });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/relay' });

wss.on('connection', (ws, req) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const code = url.searchParams.get('room');
        const role = url.searchParams.get('role');

        if (!code || !rooms[code]) {
            ws.close(1008, "Sala invalida");
            return;
        }

        const room = rooms[code];
        if (role === 'host') {
            if (room.host_ws) room.host_ws.close();
            room.host_ws = ws;
            console.log(`[Relay] Host conectado: ${code}`);
        } else {
            if (room.client_ws) room.client_ws.close();
            room.client_ws = ws;
            console.log(`[Relay] Cliente conectado: ${code}`);
        }

        ws.on('message', (data) => {
            const target = (role === 'host') ? room.client_ws : room.host_ws;
            if (target && target.readyState === WebSocket.OPEN) {
                target.send(data);
            }
        });

        ws.on('close', () => {
            if (role === 'host') room.host_ws = null;
            else room.client_ws = null;
        });
        
        ws.on('error', (err) => console.error("[Relay Error]", err));

    } catch (e) {
        console.error("[Relay Connection Error]", e);
        ws.close();
    }
});

setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].createdAt > 2 * 60 * 60 * 1000) delete rooms[code];
    }
}, 30 * 60 * 1000);

server.listen(port, () => {
    console.log(`[Broker+Relay] Servidor rodando na porta ${port}`);
});
