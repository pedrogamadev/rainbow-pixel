// Roda o cérebro de cada bot a BOT_LEVEL0_CONFIG.decisionRateHz. O cérebro devolve uma intenção
// sem seq (BotIntent); o controller numera e expande cada decisão em TICKS_PER_BOT_DECISION
// inputs, um por tick, que vão para a mesma fila de inputs dos humanos (em MatchSimulation), com
// as mesmas validações. Assim o bot atira na cadência real da arma sem depender da regra de
// repetição da fila. Cada input leva `viewTimeMs` igual ao tempo do servidor do tick: o bot vê o
// estado atual, sem interpolação.
// O cérebro só recebe a PlayerView, montada do mesmo snapshot que um cliente receberia.

import { createBotMemory, createLevel1Brain } from '@rainbow-pixel/bots';
import type { BotBrain, BotIntent, BotMemory, PlayerView } from '@rainbow-pixel/bots';
import {
  BOT_DIFFICULTY_PARAMS,
  BOT_LEVEL0_CONFIG,
  SIM_CONFIG,
  hashRandom,
} from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  CollisionMap,
  InputCommand,
  SimWorld,
  SnapshotMessage,
  Vec2,
} from '@rainbow-pixel/shared';

/** Ticks entre duas decisões dos bots. */
export const TICKS_PER_BOT_DECISION = SIM_CONFIG.tickRate / BOT_LEVEL0_CONFIG.decisionRateHz;

const DECISION_MS = 1000 / BOT_LEVEL0_CONFIG.decisionRateHz;

/** Mistura a seed da partida com o índice do bot para dar uma seed própria a cada um. */
const BOT_SEED_SALT = 0xb07;

export interface BotSetup {
  readonly playerId: string;
  readonly difficulty: BotDifficultyId;
}

/** Informação pública do mapa entregue a todo bot. */
export interface BotMapInfo {
  readonly mapId: string;
  readonly grid: CollisionMap;
  /** Waypoints de patrulha do mapa, na ordem do circuito. */
  readonly waypoints: readonly Vec2[];
}

export interface BotControllerOptions {
  readonly mapId: string;
  readonly grid: CollisionMap;
  readonly waypoints: readonly Vec2[];
  readonly bots: readonly BotSetup[];
  /** Seed da partida. A seed de cada bot é derivada dela. */
  readonly seed: number;
  /** Cérebro fixo para todos (testes). Sem ele, nível 1 com a dificuldade de cada bot. */
  readonly brain?: BotBrain;
}

/**
 * Visão do bot a partir do snapshot que um cliente com o mesmo playerId receberia, mais a
 * informação pública do mapa. Os outros jogadores entram sem vida.
 */
export function toPlayerView(
  snapshot: SnapshotMessage,
  botId: string,
  map: BotMapInfo,
): PlayerView | null {
  const self = snapshot.self;
  const me = snapshot.players.find((player) => player.playerId === botId);
  if (self === null || me === undefined) {
    return null;
  }
  const { weapon } = self;
  return {
    tick: snapshot.tick,
    self: {
      playerId: botId,
      team: me.team,
      x: self.x,
      y: self.y,
      aimAngle: self.aimAngle,
      health: self.health,
      alive: self.alive,
      activeSlot: weapon.activeSlot,
      ammo: weapon.ammo[weapon.activeSlot],
      reloading: weapon.reloadLeftMs > 0,
    },
    others: snapshot.players
      .filter((player) => player.playerId !== botId)
      .map((player) => ({
        playerId: player.playerId,
        team: player.team,
        x: player.x,
        y: player.y,
        aimAngle: player.aimAngle,
        alive: player.alive,
      })),
    mapId: map.mapId,
    map: map.grid,
    waypoints: map.waypoints,
  };
}

interface BotSlot {
  readonly brain: BotBrain;
  readonly memory: BotMemory;
  /** `seq` do próximo InputCommand. Cresce a cada tick, como no cliente humano. */
  nextSeq: number;
  /** Última decisão, repetida como um input novo em cada tick até a próxima. */
  intent: BotIntent | null;
}

export class BotController {
  private readonly bots = new Map<string, BotSlot>();
  private readonly map: BotMapInfo;

  constructor(options: BotControllerOptions) {
    this.map = { mapId: options.mapId, grid: options.grid, waypoints: options.waypoints };
    options.bots.forEach((bot, index) => {
      const seed = Math.floor(hashRandom(options.seed, BOT_SEED_SALT, index) * 2 ** 32);
      this.bots.set(bot.playerId, {
        brain: options.brain ?? createLevel1Brain(BOT_DIFFICULTY_PARAMS[bot.difficulty]),
        memory: createBotMemory(seed),
        nextSeq: 1,
        intent: null,
      });
    });
  }

  /**
   * Um input numerado por bot para o próximo tick. A cada TICKS_PER_BOT_DECISION ticks
   * (começando no tick 0), o cérebro decide antes, com a visão de `snapshotOf`; nos outros
   * ticks a última decisão vira um input novo, com seq próprio.
   * @param serverTimeMs tempo do servidor no estado que o bot vê (o `viewTimeMs` do input)
   * @param snapshotOf snapshot que um cliente com aquele playerId receberia agora
   */
  inputsForTick(
    world: SimWorld,
    serverTimeMs: number,
    snapshotOf: (botId: string) => SnapshotMessage,
  ): Map<string, InputCommand> {
    const decide = world.tick % TICKS_PER_BOT_DECISION === 0;
    const commands = new Map<string, InputCommand>();
    for (const [botId, bot] of this.bots) {
      if (decide) {
        const view = toPlayerView(snapshotOf(botId), botId, this.map);
        bot.intent = view === null ? null : bot.brain.decide(view, bot.memory, DECISION_MS);
      }
      if (bot.intent !== null) {
        commands.set(botId, { ...bot.intent, seq: bot.nextSeq, viewTimeMs: serverTimeMs });
        bot.nextSeq += 1;
      }
    }
    return commands;
  }
}
