export const PHASES = {
  LOBBY: 'lobby',
  SABOTAGE: 'sabotage',
  REVEAL: 'reveal',
  VOTE: 'vote',
  GAME_OVER: 'game_over',
};

export const PHASE_DURATIONS = {
  [PHASES.SABOTAGE]: 25,
  [PHASES.REVEAL]: 20,
  [PHASES.VOTE]: 40,
};

export const SABOTAGE_TYPES = {
  STEAL: 'steal',
  BLOCK: 'block',
  FRAME: 'frame',
};

export const SABOTAGE_EFFECTS = {
  [SABOTAGE_TYPES.STEAL]: -100,
  [SABOTAGE_TYPES.BLOCK]: 0,
  [SABOTAGE_TYPES.FRAME]: -75,
};

export const SCORING = {
  SURVIVE_ROUND: 100,
  SABOTAGE_LANDED: 50,
  EXILED: -200,
  VOTE_MAJORITY: 25,
  VOTE_MINORITY: -50,
  CORRECT_SABOTEUR_VOTE: 75,
  SPECTATOR_REACTION: 5,
};

export const MAX_ROUNDS = 5;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;