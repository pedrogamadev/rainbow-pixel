// Roda o cérebro de cada bot a BOT_LEVEL0_CONFIG.decisionRateHz. O cérebro devolve uma intenção
// sem seq (BotIntent); o controller numera e expande cada decisão em TICKS_PER_BOT_DECISION
// inputs, um por tick, que vão para a mesma fila de inputs dos humanos (em MatchSimulation), com
// as mesmas validações. Assim o bot não depende da regra de repetição da fila.
// O cérebro só recebe a PlayerView: o próprio bot e a informação pública do mapa.

import { createBotMemory, level0Brain } from '@rainbow-pixel/bots';
import type { BotBrain, BotIntent, BotMemory, PlayerView } from '@rainbow-pixel/bots';
import { BOT_LEVEL0_CONFIG, SIM_CONFIG } from '@rainbow-pixel/shared';
import type { InputCommand, SimWorld, Vec2 } from '@rainbow-pixel/shared';

/** Ticks entre duas decisões dos bots. */
export const TICKS_PER_BOT_DECISION = SIM_CONFIG.tickRate / BOT_LEVEL0_CONFIG.decisionRateHz;

const DECISION_MS = 1000 / BOT_LEVEL0_CONFIG.decisionRateHz;

export interface BotControllerOptions {
  readonly mapId: string;
  /** Waypoints de patrulha do mapa, na ordem do circuito. */
  readonly waypoints: readonly Vec2[];
  readonly botIds: readonly string[];
  /** A dificuldade não muda o nível 0; todos os bots usam o mesmo cérebro neste marco. */
  readonly brain?: BotBrain;
}

/** Visão do bot: igual à que um cliente receberia, sem outros jogadores neste marco. */
export function buildBotView(
  world: SimWorld,
  botId: string,
  mapId: string,
  waypoints: readonly Vec2[],
): PlayerView | null {
  const self = world.players.find((player) => player.playerId === botId);
  if (self === undefined) {
    return null;
  }
  return {
    tick: world.tick,
    self: { playerId: self.playerId, x: self.x, y: self.y, aimAngle: self.aimAngle },
    mapId,
    waypoints,
  };
}

interface BotSlot {
  readonly memory: BotMemory;
  /** `seq` do próximo InputCommand. Cresce a cada tick, como no cliente humano. */
  nextSeq: number;
  /** Última decisão, repetida como um input novo em cada tick até a próxima. */
  intent: BotIntent | null;
}

export class BotController {
  private readonly bots = new Map<string, BotSlot>();
  private readonly brain: BotBrain;

  constructor(private readonly options: BotControllerOptions) {
    this.brain = options.brain ?? level0Brain;
    for (const botId of options.botIds) {
      this.bots.set(botId, { memory: createBotMemory(), nextSeq: 1, intent: null });
    }
  }

  /**
   * Um input numerado por bot para o próximo tick. A cada TICKS_PER_BOT_DECISION ticks
   * (começando no tick 0), o cérebro decide antes; nos outros ticks a última decisão vira um
   * input novo, com seq próprio.
   */
  inputsForTick(world: SimWorld): Map<string, InputCommand> {
    const decide = world.tick % TICKS_PER_BOT_DECISION === 0;
    const commands = new Map<string, InputCommand>();
    for (const [botId, bot] of this.bots) {
      if (decide) {
        const view = buildBotView(world, botId, this.options.mapId, this.options.waypoints);
        bot.intent = view === null ? null : this.brain.decide(view, bot.memory, DECISION_MS);
      }
      if (bot.intent !== null) {
        commands.set(botId, { ...bot.intent, seq: bot.nextSeq });
        bot.nextSeq += 1;
      }
    }
    return commands;
  }
}
