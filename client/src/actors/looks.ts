import { LOOK_COUNT } from '@fancave/shared';

export interface Look {
  skin: number;
  hair: number;
}

const SKINS = [0xf3cfae, 0xe4b28a, 0xc98f62, 0x9c6644, 0x6e4530, 0xf6dcc4, 0xd9a07a, 0x845339];
const HAIRS = [0x1d1512, 0x3b2516, 0x0e0d0d, 0x6b3d1d, 0x2a1d17, 0x8a5a2b, 0x151515, 0x4a2a1a];

export function lookFor(index: number): Look {
  const i = ((index % LOOK_COUNT) + LOOK_COUNT) % LOOK_COUNT;
  return { skin: SKINS[i] ?? SKINS[0]!, hair: HAIRS[(i * 3) % HAIRS.length] ?? HAIRS[0]! };
}
