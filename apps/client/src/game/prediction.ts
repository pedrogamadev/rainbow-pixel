// Previsão e reconciliação do próprio movimento.
// TypeScript puro (sem DOM): também usado pelo cliente headless.
//
// Cada input é aplicado na hora com a mesma simulação do servidor e guardado como pendente.
// Quando chega um snapshot, a previsão recomeça da posição do servidor e reaplica só os
// inputs com seq > ackSeq. Se o resultado difere do que estava previsto, o erro abaixo de
// 32 px é desfeito suavemente em 100 ms; acima disso, a correção é imediata.

import { NET_CONFIG, TICK_SECONDS, stepPlayer } from '@rainbow-pixel/shared';
import type { CollisionMap, InputCommand, PlayerSimState, Vec2 } from '@rainbow-pixel/shared';

/** Estado do próprio jogador que veio no snapshot. */
export type ServerPlayerState = Omit<PlayerSimState, 'playerId'>;

export interface Correction {
  /** Distância entre o que estava previsto e a previsão refeita a partir do servidor. */
  readonly errorPx: number;
  /** Corrigida na hora (erro grande) em vez de suavemente. */
  readonly snapped: boolean;
}

const NO_OFFSET: Vec2 = { x: 0, y: 0 };

export class Predictor {
  private state: PlayerSimState | null = null;
  private pending: InputCommand[] = [];
  /** Diferença entre a posição mostrada e a prevista no início da correção suave. */
  private offset: Vec2 = NO_OFFSET;
  private offsetStartMs = 0;

  constructor(
    private readonly map: CollisionMap,
    private readonly playerId: string,
  ) {}

  /** Estado previsto, já com todos os inputs aplicados. `null` antes do primeiro snapshot. */
  get predicted(): PlayerSimState | null {
    return this.state;
  }

  get pendingInputs(): readonly InputCommand[] {
    return this.pending;
  }

  /** Aplica o input agora e guarda até o servidor confirmar. */
  applyInput(input: InputCommand): void {
    this.pending.push(input);
    if (this.state !== null) {
      this.state = stepPlayer(this.map, this.state, input, TICK_SECONDS);
    }
  }

  /**
   * Snapshot do servidor com o estado deste jogador e o último seq processado.
   * Devolve a correção feita, ou `null` no primeiro snapshot.
   */
  reconcile(server: ServerPlayerState, ackSeq: number, nowMs: number): Correction | null {
    this.pending = this.pending.filter((input) => input.seq > ackSeq);
    let replayed: PlayerSimState = { playerId: this.playerId, ...server };
    for (const input of this.pending) {
      replayed = stepPlayer(this.map, replayed, input, TICK_SECONDS);
    }

    const previous = this.state;
    if (previous === null) {
      this.state = replayed;
      return null;
    }
    const errorPx = Math.hypot(replayed.x - previous.x, replayed.y - previous.y);
    const shown = this.displayPosition(nowMs);
    this.state = replayed;
    const snapped = errorPx >= NET_CONFIG.reconciliationSnapPx;
    if (snapped) {
      this.offset = NO_OFFSET;
    } else if (errorPx > 0) {
      // A posição mostrada continua onde estava e vai até a nova previsão em 100 ms.
      this.offset = { x: shown.x - replayed.x, y: shown.y - replayed.y };
      this.offsetStartMs = nowMs;
    }
    return { errorPx, snapped };
  }

  /** Onde desenhar o jogador: a previsão mais o que falta da correção suave. */
  displayPosition(nowMs: number): Vec2 {
    if (this.state === null) {
      return NO_OFFSET;
    }
    const elapsed = nowMs - this.offsetStartMs;
    const left = Math.max(0, 1 - elapsed / NET_CONFIG.reconciliationSmoothingMs);
    return { x: this.state.x + this.offset.x * left, y: this.state.y + this.offset.y * left };
  }

  /** Esquece os inputs pendentes (a fila do servidor recomeçou, por exemplo numa reconexão). */
  clearPending(): void {
    this.pending = [];
  }
}
