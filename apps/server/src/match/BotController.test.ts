import type { BotBrain, BotIntent } from '@rainbow-pixel/bots';
import { createCollisionGrid, getMap, patrolWaypoints } from '@rainbow-pixel/maps';
import type { PlayerSimState, SimWorld } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { BotController, TICKS_PER_BOT_DECISION } from './BotController.js';

const map = getMap('gym_01');
const grid = createCollisionGrid(map);

const BOTS: readonly PlayerSimState[] = [
  { playerId: 'bot:1', x: 100, y: 100, aimAngle: 0, moveMode: 'walk' },
  { playerId: 'bot:2', x: 200, y: 100, aimAngle: 0, moveMode: 'walk' },
];

function world(tick: number): SimWorld {
  return { map: grid, tick, players: BOTS };
}

/** Cérebro de teste: anda para o leste e conta as decisões. */
function countingBrain(): BotBrain & { decisions: number } {
  const brain = {
    level: 0,
    decisions: 0,
    decide(): BotIntent {
      brain.decisions += 1;
      return { moveX: 1, moveY: 0, aimAngle: 0, moveMode: 'walk' };
    },
  };
  return brain;
}

function controller(brain: BotBrain) {
  return new BotController({
    mapId: map.id,
    waypoints: patrolWaypoints(map),
    botIds: ['bot:1', 'bot:2'],
    brain,
  });
}

describe('BotController', () => {
  it('decide a 10 Hz e manda um input por tick para cada bot', () => {
    const brain = countingBrain();
    const bots = controller(brain);
    const perTick: number[] = [];
    for (let tick = 0; tick < TICKS_PER_BOT_DECISION * 4; tick += 1) {
      perTick.push(bots.inputsForTick(world(tick)).size);
    }
    expect(perTick.every((count) => count === 2)).toBe(true);
    // 4 decisões para cada um dos 2 bots.
    expect(brain.decisions).toBe(8);
  });

  it('numera os inputs de cada bot em ordem crescente, um seq por tick', () => {
    const bots = controller(countingBrain());
    const seqs: number[] = [];
    for (let tick = 0; tick < TICKS_PER_BOT_DECISION * 2; tick += 1) {
      seqs.push(bots.inputsForTick(world(tick)).get('bot:1')?.seq ?? -1);
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('repete a intenção da decisão nos ticks seguintes, como inputs novos', () => {
    const bots = controller(countingBrain());
    const first = bots.inputsForTick(world(0)).get('bot:2');
    const second = bots.inputsForTick(world(1)).get('bot:2');
    expect(second).toEqual({ ...first, seq: 2 });
  });

  it('bot que não está no mundo não recebe input', () => {
    const bots = controller(countingBrain());
    const inputs = bots.inputsForTick({ map: grid, tick: 0, players: [BOTS[0] as PlayerSimState] });
    expect([...inputs.keys()]).toEqual(['bot:1']);
  });
});
