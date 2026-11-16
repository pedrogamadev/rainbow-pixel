// Servidor de mentira para os testes da previsão: aplica os inputs com a mesma simulação, com
// atraso de ida e de volta medido em ticks. Só para testes; o cliente não importa este arquivo.

import { SIM_CONFIG, TICK_SECONDS, stepPlayer } from '@rainbow-pixel/shared';
import type {
  CollisionMap,
  InputCommand,
  PlayerSimState,
  SnapshotMessage,
} from '@rainbow-pixel/shared';

export const openMap: CollisionMap = {
  cellSize: SIM_CONFIG.cellSize,
  width: 400,
  height: 400,
  isSolid: (cx, cy) => cx < 0 || cy < 0 || cx >= 400 || cy >= 400,
};

export class FakeServer {
  state: PlayerSimState;
  ackSeq = 0;
  tick = 0;
  private readonly arriving: { atTick: number; input: InputCommand }[] = [];
  private readonly queue: InputCommand[] = [];
  /** Ticks em que o servidor repete o último input por falta de input novo. */
  repeatOnTicks = new Set<number>();
  private last: InputCommand | null = null;

  constructor(
    start: PlayerSimState,
    private readonly upTicks: number,
  ) {
    this.state = start;
  }

  receive(input: InputCommand): void {
    this.arriving.push({ atTick: this.tick + this.upTicks, input });
  }

  step(map: CollisionMap = openMap): void {
    while ((this.arriving[0]?.atTick ?? Infinity) <= this.tick) {
      const next = this.arriving.shift();
      if (next !== undefined && next.input.seq > this.ackSeq) this.queue.push(next.input);
    }
    let input: InputCommand | null | undefined;
    if (this.repeatOnTicks.has(this.tick)) {
      input = this.last;
    } else {
      input = this.queue.shift();
      if (input !== undefined) {
        this.ackSeq = input.seq;
        this.last = input;
      }
    }
    if (input !== null && input !== undefined) {
      this.state = stepPlayer(map, this.state, input, TICK_SECONDS);
    }
    this.tick += 1;
  }

  snapshot(serverTimeMs: number): SnapshotMessage {
    return {
      tick: this.tick,
      serverTimeMs,
      ackSeq: this.ackSeq,
      players: [{ ...this.state, connected: true }],
    };
  }
}
