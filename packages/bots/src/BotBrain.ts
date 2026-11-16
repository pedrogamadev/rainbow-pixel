import type { MoveInput } from '@rainbow-pixel/shared';
import type { PlayerView } from './PlayerView.js';
import type { BotMemory } from './memory.js';

/**
 * O que o bot quer fazer até a próxima decisão: um input sem `seq`. Quem numera é o
 * BotController (servidor), que expande cada intenção em um input por tick.
 */
export type BotIntent = MoveInput;

/**
 * Cérebro de um bot (escopo, seção 16.5). Recebe só a PlayerView, como um cliente humano, e
 * devolve uma intenção que vira InputCommand e passa pelas mesmas validações do servidor.
 */
export interface BotBrain {
  /** Nível de comportamento (escopo, seção 16.3). */
  readonly level: number;
  /**
   * @param dtMs tempo desde a decisão anterior
   */
  decide(view: PlayerView, memory: BotMemory, dtMs: number): BotIntent;
}
