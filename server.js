import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRoom, getRoom, joinRoom, removePlayer, allRooms } from './rooms.js';
import {
  canStart,
  startGame,
  submitSabotage,
  submitVote,
  addChat,
  addReaction,
  publicState,
} from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log('__dirname is:', __dirname);
console.log('public path is:', path.join(__dirname, 'public'));
const app = express();
const publicPath = path.join(__dirname, 'public');
console.log('Serving static from:', publicPath);
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function broadcast(room) {
  room.players.forEach((p) => {
    if (p.connected) {
      io.to(p.id).emit('state', publicState(room, p.id));
    }
  });
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }, cb) => {
    const room = createRoom(socket.id, name || 'Player');
    socket.join(socket.id);
    cb?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const result = joinRoom(code?.toUpperCase(), socket.id, name || 'Player');
    if (result.error) return cb?.({ ok: false, error: result.error });
    socket.join(socket.id);
    cb?.({ ok: true, code: result.room.code });
    broadcast(result.room);
  });

  socket.on('start_game', ({ code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Not host' });
    if (!canStart(room)) return cb?.({ ok: false, error: 'Cannot start' });
    startGame(room);
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('sabotage', ({ code, targetId, type }) => {
    const room = getRoom(code);
    if (!room) return;
    submitSabotage(room, socket.id, targetId, type);
    broadcast(room);
  });

  socket.on('vote', ({ code, targetId }) => {
    const room = getRoom(code);
    if (!room) return;
    submitVote(room, socket.id, targetId);
    broadcast(room);
  });

  socket.on('chat', ({ code, text }) => {
    const room = getRoom(code);
    if (!room) return;
    addChat(room, socket.id, text);
    broadcast(room);
  });

  socket.on('reaction', ({ code, emoji }) => {
    const room = getRoom(code);
    if (!room) return;
    addReaction(room, socket.id, emoji);
    broadcast(room);
  });

  socket.on('disconnect', () => {
    allRooms().forEach((room) => {
      if (room.players.find((p) => p.id === socket.id)) {
        removePlayer(room.code, socket.id);
        broadcast(room);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));