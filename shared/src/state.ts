/**
 * Shape of the synchronised Colyseus room state. The server implements these with
 * @colyseus/schema classes; the client decodes them via schema reflection and reads
 * them through these interfaces.
 */
export interface PlayerState {
  name: string;
  x: number;
  z: number;
  ry: number;
  /** Last input sequence number the server has applied for this player. */
  seq: number;
  /** Index into the client's look table (skin / hair). */
  look: number;
  /** False while the player is inside the reconnection window. */
  online: boolean;
}

export interface CaveStateShape {
  players: {
    get(key: string): PlayerState | undefined;
    forEach(cb: (value: PlayerState, key: string) => void): void;
    readonly size: number;
  };
}
