/** Display name of the fan club. Change this one value to rebrand the cave. */
export const CLUB_NAME = 'hangphandao';
export const CAVE_TITLE = `${CLUB_NAME} Cave`;

export const ROOM_NAME = 'cave';
export const MAX_PLAYERS = 100;

/** Server simulation + state patch rate. */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

/** Movement (metres, seconds). */
export const PLAYER_SPEED = 4.5;
export const PLAYER_RADIUS = 0.35;
/** Largest dt a single input frame may claim. */
export const MAX_INPUT_DT = 0.1;
/** Most input frames accepted per batch message. */
export const MAX_INPUTS_PER_BATCH = 12;
/** Movement time a player may "bank" while idle (anti speed-hack budget cap). */
export const MOVE_BUDGET_CAP_S = 0.5;

/** Nicknames. */
export const NICK_MIN = 3;
export const NICK_MAX = 16;
export const NICK_STORAGE_KEY = 'fancave.nickname';

/** Chat. */
export const CHAT_MAX_LEN = 200;
export const CHAT_HISTORY = 50;
export const CHAT_RATE_MS = 1000;
export const BUBBLE_MS = 4000;

/** Emotes. */
export const EMOTE_COOLDOWN_MS = 2000;
export const PUNCH_RANGE = 1.5;
/** cos(60deg): target must be inside a 120deg cone in front of the puncher. */
export const PUNCH_MIN_DOT = 0.5;
/** Celebrations are only sent to players within this radius. */
export const EMOTE_BROADCAST_RADIUS = 25;

/** Connection lifecycle. */
export const RECONNECT_WINDOW_S = 5;
/** Remote players are rendered this far in the past. */
export const INTERP_DELAY_MS = 100;

/** Number of distinct character looks (skin/hair combos). */
export const LOOK_COUNT = 8;
