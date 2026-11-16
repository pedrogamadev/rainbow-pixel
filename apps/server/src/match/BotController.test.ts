import type { BotBrain, BotIntent, PlayerView } from '@rainbow-pixel/bots';
import { createCollisionGrid, getMap, patrolWaypoints } from '@rainbow-pixel/maps';
import { createPlayerState, createWorld } from '@rainbow-pixel/shared';
import type { SimWorld } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { BotController, TICKS_PER_BOT_DECISION, toPlayerView } from './BotController.js';
import { buildSnapshot } from './snapshots.js';

const map = getMap('gym_01');
const grid = createCollisionGrid(map);
const mapInfo = { mapId: map.id, grid, waypoints: patrolWaypoints(map) };

const PLAYERS = [
  createPlayerState({ playerId: 'bot:1', team: 0, x: 100, y: 100 }),
  createPlayerState({ playerId: 'bot:2', team: 1, x: 200, y: 100 }),
  { ...createPlayerState({ playerId: 'ana', team: 1, x: 300, y: 100 }), health: 40 },
];

function world(tick: number): SimWorld {
  return { ...createWorld(grid, PLAYERS), tick };
}

function snapshotOf(state: SimWorld) {
  return (botId: string) =>
    buildSnapshot({
      world: state,
      viewerId: botId,
      ackSeq: 0,
      serverTimeMs: 0,
      isConnected: () => true,
    });
}

/** Cérebro de teste: anda para o leste, guarda as visões e conta as decisões. */
function countingBrain(): BotBrain & { decisions: number; views: PlayerView[] } {
  const brain = {
    level: 0,
    decisions: 0,
    views: [] as PlayerView[],
    decide(view: PlayerView): BotIntent {
      brain.decisions += 1;
      brain.views.push(view);
      return {
        moveX: 1,
        moveY: 0,
        aimAngle: 0,
        moveMode: 'walk',
        fire: false,
        reload: false,
        weaponSlot: 'primary',
      };
    },
  };
  return brain;
}

function controller(brain?: BotBrain) {
  return new BotController({
    ...mapInfo,
    bots: [
      { playerId: 'bot:1', difficulty: 'easy' },
      { playerId: 'bot:2', difficulty: 'hard' },
    ],
    seed: 42,
    ...(brain === undefined ? {} : { brain }),
  });
}

function inputs(bots: BotController, tick: number, serverTimeMs = 1000) {
  const state = world(tick);
  return bots.inputsForTick(state, serverTimeMs, snapshotOf(state));
}

describe('BotController', () => {
  it('decide a 10 Hz e manda um input por tick para cada bot', () => {
    const brain = countingBrain();
    const bots = controller(brain);
    const perTick: number[] = [];
    for (let tick = 0; tick < TICKS_PER_BOT_DECISION * 4; tick += 1) {
      perTick.push(inputs(bots, tick).size);
    }
    expect(perTick.every((count) => count === 2)).toBe(true);
    // 4 decisões para cada um dos 2 bots.
    expect(brain.decisions).toBe(8);
  });

  it('numera os inputs de cada bot em ordem crescente, um seq por tick', () => {
    const bots = controller(countingBrain());
    const seqs: number[] = [];
    for (let tick = 0; tick < TICKS_PER_BOT_DECISION * 2; tick += 1) {
      seqs.push(inputs(bots, tick).get('bot:1')?.seq ?? -1);
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('repete a intenção da decisão nos ticks seguintes, como inputs novos', () => {
    const bots = controller(countingBrain());
    const first = inputs(bots, 0, 1000).get('bot:2');
    const second = inputs(bots, 1, 1033).get('bot:2');
    expect(second).toEqual({ ...first, seq: 2, viewTimeMs: 1033 });
  });

  it('cada input leva viewTimeMs igual ao tempo do servidor do tick', () => {
    const bots = controller(countingBrain());
    expect(inputs(bots, 0, 5000).get('bot:1')?.viewTimeMs).toBe(5000);
  });

  it('bot que não está no mundo não recebe input', () => {
    const bots = controller(countingBrain());
    const onlyOne: SimWorld = { ...world(0), players: PLAYERS.slice(0, 1) };
    expect([...bots.inputsForTick(onlyOne, 0, snapshotOf(onlyOne)).keys()]).toEqual(['bot:1']);
  });

  it('a visão do bot vem do snapshot de um cliente: sem vida de ninguém além dele', () => {
    const brain = countingBrain();
    inputs(controller(brain), 0);
    const view = brain.views[0];
    expect(view?.self).toMatchObject({
      playerId: 'bot:1',
      team: 0,
      health: 100,
      alive: true,
      activeSlot: 'primary',
      ammo: 30,
      reloading: false,
    });
    expect(view?.others.map((other) => other.playerId)).toEqual(['bot:2', 'ana']);
    expect(JSON.stringify(view?.others)).not.toContain('health');
    expect(view?.waypoints).toEqual(mapInfo.waypoints);
  });

  it('toPlayerView devolve null para quem não está na partida', () => {
    expect(toPlayerView(snapshotOf(world(0))('ninguém'), 'ninguém', mapInfo)).toBeNull();
  });

  it('sem cérebro fixo, usa o nível 1 com a dificuldade de cada bot', () => {
    // Sem inimigo à vista, o nível 1 patrulha: anda.
    const command = inputs(controller(), 0).get('bot:1');
    expect(command).toMatchObject({ fire: false, weaponSlot: 'primary' });
  });
});
