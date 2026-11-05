import { MapSchema, Schema, type } from '@colyseus/schema';
import type { PlayerState } from '@fancave/shared';

export class Player extends Schema implements PlayerState {
  @type('string') name = '';
  @type('float32') x = 0;
  @type('float32') z = 0;
  @type('float32') ry = 0;
  @type('uint32') seq = 0;
  @type('uint8') look = 0;
  @type('boolean') online = true;
}

export class CaveState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
