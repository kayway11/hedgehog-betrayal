import {
  PHASES,
  PHASE_DURATIONS,
  SABOTAGE_TYPES,
  SABOTAGE_EFFECTS,
  SCORING,
  MAX_ROUNDS,
  MIN_PLAYERS,
} from './constants.js';

export function canStart(room) {
  return (
    room.phase === PHASES.LOBBY &&
    room.players.length >= MIN_PLAYERS &&
    room.players.length <= 8
  );
}

export function startGame(room) {
  room.round = 0;
  startRound(room);
}

export function startRound(room) {
  room.round += 1;
  room.phase = PHASES.SABOTAGE;
  room.revealLog = [];
  room.lastSabotagedBy = {};

  room.players.forEach((p) => {
    p.sabotage = null;
    p.vote = null;
    p.blocked = false;
  });

  setTimer(room, PHASE_DURATIONS[PHASES.SABOTAGE], () => resolveSabotage(room));
}

export function setTimer(room, seconds, onEnd) {
  if (room.timer) clearTimeout(room.timer);
  room.phaseEndsAt = Date.now() + seconds * 1000;
  room.timer = setTimeout(() => {
    room.timer = null;
    room.phaseEndsAt = null;
    onEnd();
  }, seconds * 1000);
}

export function submitSabotage(room, playerId, targetId, type) {
  if (room.phase !== PHASES.SABOTAGE) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.exiled || !player.connected) return;
  if (playerId === targetId) return;
  if (!Object.values(SABOTAGE_TYPES).includes(type)) return;

  player.sabotage = { targetId, type };

  const activePlayers = room.players.filter((p) => !p.exiled && p.connected);
  const allSubmitted = activePlayers.every((p) => p.sabotage !== null);
  if (allSubmitted) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.phaseEndsAt = null;
    resolveSabotage(room);
  }
}

function resolveSabotage(room) {
  const log = [];

  room.players.forEach((actor) => {
    if (actor.exiled || !actor.sabotage) return;
    const target = room.players.find((p) => p.id === actor.sabotage.targetId);
    if (!target || target.exiled) return;

    const type = actor.sabotage.type;
    const effect = SABOTAGE_EFFECTS[type];

    if (type === SABOTAGE_TYPES.BLOCK) {
      target.blocked = true;
    } else {
      target.score += effect;
    }

    actor.sabotagesLanded += 1;
    actor.score += SCORING.SABOTAGE_LANDED;
    room.lastSabotagedBy[target.id] = actor.id;

    log.push({
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      type,
      effect,
    });
  });

  room.revealLog = log;
  room.phase = PHASES.REVEAL;
  setTimer(room, PHASE_DURATIONS[PHASES.REVEAL], () => startVote(room));
}

export function startVote(room) {
  room.phase = PHASES.VOTE;
  room.players.forEach((p) => (p.vote = null));
  setTimer(room, PHASE_DURATIONS[PHASES.VOTE], () => resolveVote(room));
}

export function submitVote(room, playerId, targetId) {
  if (room.phase !== PHASES.VOTE) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.exiled || !player.connected) return;
  if (playerId === targetId) return;

  player.vote = targetId;

  const activePlayers = room.players.filter((p) => !p.exiled && p.connected);
  const allVoted = activePlayers.every((p) => p.vote !== null);
  if (allVoted) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.phaseEndsAt = null;
    resolveVote(room);
  }
}

function resolveVote(room) {
  const votes = {};
  room.players.forEach((p) => {
    if (!p.exiled && p.connected && p.vote) {
      votes[p.vote] = (votes[p.vote] || 0) + 1;
    }
  });

  let maxVotes = 0;
  let exiledId = null;
  let tie = false;

  Object.entries(votes).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      exiledId = id;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  if (tie) exiledId = null;

  room.players.forEach((p) => {
    if (p.exiled || !p.connected) return;

    if (exiledId && p.id === exiledId) {
      p.score += SCORING.EXILED;
      p.exiled = true;
      p.timesExiled += 1;
    } else if (!p.blocked) {
      p.score += SCORING.SURVIVE_ROUND;
    }

    if (p.vote) {
      if (exiledId && p.vote === exiledId) {
        p.score += SCORING.VOTE_MAJORITY;
        if (room.lastSabotagedBy[p.id] === exiledId) {
          p.score += SCORING.CORRECT_SABOTEUR_VOTE;
        }
      } else {
        p.score += SCORING.VOTE_MINORITY;
      }
    }
  });

  const remaining = room.players.filter((p) => !p.exiled && p.connected);

  if (room.round >= MAX_ROUNDS || remaining.length <= 2) {
    endGame(room);
  } else {
    startRound(room);
  }
}

function endGame(room) {
  room.phase = PHASES.GAME_OVER;
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.phaseEndsAt = null;
}

export function addChat(room, playerId, text) {
  if (room.phase !== PHASES.REVEAL && room.phase !== PHASES.VOTE) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.exiled) return;
  const trimmed = text.slice(0, 200).trim();
  if (!trimmed) return;
  room.chat.push({
    id: Date.now() + Math.random(),
    playerId,
    name: player.name,
    text: trimmed,
    at: Date.now(),
  });
  if (room.chat.length > 200) room.chat.shift();
}

export function addReaction(room, playerId, emoji) {
  if (room.phase !== PHASES.REVEAL && room.phase !== PHASES.VOTE) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.exiled) return;

  room.chat.push({
    id: Date.now() + Math.random(),
    playerId,
    name: `${player.name} (spectator)`,
    text: emoji,
    at: Date.now(),
    isReaction: true,
  });
}

export function publicState(room, forPlayerId) {
  const player = room.players.find((p) => p.id === forPlayerId);
  const isSpectator = player?.exiled || false;

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    maxRounds: MAX_ROUNDS,
    phaseEndsAt: room.phaseEndsAt,
    isSpectator,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      exiled: p.exiled,
      hasSabotaged: p.sabotage !== null,
      hasVoted: p.vote !== null,
      isYou: p.id === forPlayerId,
    })),
    chat: room.chat,
    revealLog: room.revealLog,
    yourSabotage: player?.sabotage || null,
    yourVote: player?.vote || null,
  };
}