import type { InputCommand } from '@rainbow-pixel/shared';
import type { PlayerView } from './PlayerView.js';
import type { BotMemory } from './memory.js';

/**
 * Cérebro de um bot (escopo, seção 16.5). Recebe só a PlayerView, como um cliente humano, e
 * devolve um InputCommand que passa pelas mesmas validações do servidor.
 */
export interface BotBrain {
  /** Nível de comportamento (escopo, seção 16.3). */
  readonly level: number;
  /**
   * @param dtMs tempo desde a decisão anterior
   */
  decide(view: PlayerView, memory: BotMemory, dtMs: number): InputCommand;
}
