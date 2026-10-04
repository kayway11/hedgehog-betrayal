import { PHASES, MAX_PLAYERS } from './constants.js';

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(hostId, hostName) {
  const code = generateCode();
  const room = {
    code,
    hostId,
    players: [
      {
        id: hostId,
        name: hostName,
        score: 0,
        connected: true,
        exiled: false,
        blocked: false,
        sabotage: null,
        vote: null,
        timesExiled: 0,
        sabotagesLanded: 0,
      },
    ],
    phase: PHASES.LOBBY,
    round: 0,
    timer: null,
    phaseEndsAt: null,
    chat: [],
    revealLog: [],
    lastSabotagedBy: {},
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code);
}

export function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.phase !== PHASES.LOBBY) return { error: 'Game already started' };
  if (room.players.length >= MAX_PLAYERS) return { error: 'Room full' };
  if (room.players.find((p) => p.id === playerId)) return { room };

  room.players.push({
    id: playerId,
    name: playerName,
    score: 0,
    connected: true,
    exiled: false,
    blocked: false,
    sabotage: null,
    vote: null,
    timesExiled: 0,
    sabotagesLanded: 0,
  });
  return { room };
}

export function removePlayer(code, playerId) {
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  if (room.phase === PHASES.LOBBY) {
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      rooms.delete(code);
      return;
    }
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
    }
  } else {
    player.connected = false;
  }
}

export function allRooms() {
  return rooms;
}