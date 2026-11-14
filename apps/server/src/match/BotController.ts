// Roda o cérebro de cada bot a BOT_LEVEL0_CONFIG.decisionRateHz. Os comandos vão para a mesma
// fila de inputs dos humanos (em MatchSimulation), com as mesmas validações; nos ticks entre
// duas decisões vale a regra de repetir o último input.
// O cérebro só recebe a PlayerView: o próprio bot e a informação pública do mapa.

import { createBotMemory, level0Brain } from '@rainbow-pixel/bots';
import type { BotBrain, BotMemory, PlayerView } from '@rainbow-pixel/bots';
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

export class BotController {
  private readonly memories = new Map<string, BotMemory>();
  private readonly brain: BotBrain;

  constructor(private readonly options: BotControllerOptions) {
    this.brain = options.brain ?? level0Brain;
    for (const botId of options.botIds) {
      this.memories.set(botId, createBotMemory());
    }
  }

  /** Decide o comando de cada bot. Chamado a cada TICKS_PER_BOT_DECISION ticks. */
  decide(world: SimWorld): Map<string, InputCommand> {
    const commands = new Map<string, InputCommand>();
    for (const [botId, memory] of this.memories) {
      const view = buildBotView(world, botId, this.options.mapId, this.options.waypoints);
      if (view !== null) {
        commands.set(botId, this.brain.decide(view, memory, DECISION_MS));
      }
    }
    return commands;
  }
}
