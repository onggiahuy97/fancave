/** Client -> server message types. */
export const C2S = {
  Hello: 'hello',
  Input: 'input',
  Chat: 'chat',
  Emote: 'emote',
  Ping: 'ping',
} as const;

/** Server -> client message types. */
export const S2C = {
  Welcome: 'welcome',
  Chat: 'chat',
  Emote: 'emote',
  Pong: 'pong',
  Notice: 'notice',
} as const;

/** Options passed to joinOrCreate. */
export interface JoinOptions {
  name: string;
}

/** [seq, dx, dz, dt] — compact input frame. dx/dz is a world-space direction (|v| <= 1). */
export type InputTuple = [seq: number, dx: number, dz: number, dt: number];

export interface InputBatchMsg {
  i: InputTuple[];
}

export interface ChatSendMsg {
  text: string;
}

export interface ChatEntry {
  id: number;
  /** Speaker session id; empty for system messages. */
  from: string;
  name: string;
  text: string;
  /** Server timestamp (ms since epoch). */
  t: number;
  system?: boolean;
}

export const EMOTES = ['punch', 'celebrate'] as const;
export type EmoteType = (typeof EMOTES)[number];

export function isEmoteType(v: unknown): v is EmoteType {
  return typeof v === 'string' && (EMOTES as readonly string[]).includes(v);
}

export interface EmoteSendMsg {
  type: EmoteType;
}

export interface EmoteEventMsg {
  type: EmoteType;
  from: string;
  /** Session ids knocked back by a punch. */
  hits: string[];
}

export interface PingMsg {
  t: number;
}

export interface WelcomeMsg {
  sessionId: string;
  history: ChatEntry[];
}

export type NoticeKind = 'chat-rate' | 'emote-cooldown' | 'invalid';

export interface NoticeMsg {
  kind: NoticeKind;
  text: string;
}
