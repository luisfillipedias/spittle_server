# Broker Server — Spittle In The Mouth

Servidor de gerenciamento de salas para o **Modo Amigos**.  
Não processa lógica do jogo — apenas conecta jogadores via código de sala.

## Deploy Local (Teste)

```bash
cd broker
npm install
node server.js
# Servidor rodando em http://localhost:3000
```

## Deploy em Produção (Render.com — Free Tier)

1. Crie conta em https://render.com
2. "New Web Service" → conecte seu repositório GitHub
3. Root directory: `broker`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Copie a URL gerada (ex: `https://spittle-broker.onrender.com`)
7. Atualize `BROKER_URL` em `LobbyManager.gd`

## Deploy em Produção (Railway.app — Free Tier)

1. Crie conta em https://railway.app
2. "New Project" → "Deploy from GitHub repo"
3. Selecione a pasta `broker` como root
4. Railway detecta Node.js automaticamente
5. Copie a URL pública gerada

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/create_room` | Cria sala, retorna `{ room_code }` |
| `GET` | `/join_room/:code` | Retorna `{ host_ip, host_port }` |
| `POST` | `/start_game/:code` | Marca partida como iniciada |
| `DELETE` | `/room/:code` | Remove a sala |
| `GET` | `/status` | Health check |

## Teste Manual

```bash
# Criar sala
curl -X POST http://localhost:3000/create_room \
  -H "Content-Type: application/json" \
  -d '{"host_port": 9999}'
# Resposta: {"room_code":"AB3XYZ"}

# Entrar na sala
curl http://localhost:3000/join_room/AB3XYZ
# Resposta: {"host_ip":"127.0.0.1","host_port":9999,"player_count":2}

# Status
curl http://localhost:3000/status
```

## Notas sobre NAT

Jogadores domésticos ficam atrás de NAT (roteador). O Godot usará
`WebSocketMultiplayerPeer` para atravessar o NAT automaticamente via
porta 80/443. Se usar `ENetMultiplayerPeer`, ~30% dos jogadores podem
ter falha de conexão direta — neste caso, configure um relay UDP.
