const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 10000;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(bodyParser.json());

const rooms = {};

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/create_room', (req, res) => {
    let code;
    do { code = generateCode(); } while (rooms[code]);

    rooms[code] = {
        settings: req.body.settings || { lives: 5, timer: 60 },
        maxPlayers: req.body.maxPlayers || 2,
        host_ws: null,
        peers: {}, // id -> ws
        createdAt: Date.now()
    };

    console.log(`[Sala Criada] ${code}`);
    res.json({ code, settings: rooms[code].settings });
});

app.get('/join_room/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    if (!rooms[code]) return res.status(404).json({ error: 'Sala não encontrada' });
    res.json({ ok: true, settings: rooms[code].settings });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/relay' });

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const code = url.searchParams.get('room');
    const peer_id = url.searchParams.get('peer_id'); // Opcional, o Godot gera um

    if (!code || !rooms[code]) {
        ws.close(1008, "Sala invalida");
        return;
    }

    const room = rooms[code];
    ws.room_code = code;
    ws.peer_id = peer_id || Math.random().toString().substring(2, 10);

    // O primeiro a conectar na sala via WS é o HOST
    if (!room.host_ws) {
        room.host_ws = ws;
        console.log(`[Signaling] Host conectado: ${code} (Peer: ${ws.peer_id})`);
    } else {
        room.peers[ws.peer_id] = ws;
        console.log(`[Signaling] Peer conectado: ${code} (Peer: ${ws.peer_id})`);
        // Notifica o Host que um novo peer chegou
        if (room.host_ws.readyState === WebSocket.OPEN) {
            room.host_ws.send(JSON.stringify({ type: "peer_joined", peer_id: ws.peer_id }));
        }
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        // data: { target: id, type: "offer/answer/candidate", data: ... }
        
        const target_ws = (data.target === "host") ? room.host_ws : room.peers[data.target];
        
        if (target_ws && target_ws.readyState === WebSocket.OPEN) {
            // Encaminha o sinal, incluindo quem enviou
            data.from = ws.peer_id;
            target_ws.send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        if (ws === room.host_ws) {
            console.log(`[Signaling] Host saiu: ${code}`);
            room.host_ws = null;
            // Notifica todos os peers
            Object.values(room.peers).forEach(p => p.send(JSON.stringify({ type: "host_left" })));
        } else {
            delete room.peers[ws.peer_id];
            if (room.host_ws && room.host_ws.readyState === WebSocket.OPEN) {
                room.host_ws.send(JSON.stringify({ type: "peer_left", peer_id: ws.peer_id }));
            }
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].createdAt > 4 * 60 * 60 * 1000) delete rooms[code];
    }
}, 30 * 60 * 1000);

server.listen(port, () => console.log(`[Signaling Server] Rodando na porta ${port}`));

