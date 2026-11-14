// Estimativa do RTT e do relógio do servidor, pela média móvel dos últimos pongs.
// TypeScript puro (sem DOM): também usado pelo cliente headless.
//
// O offset é a diferença entre a hora do servidor que veio no pong e a hora em que o pong
// chegou. Assim, `serverTime(agora)` é a hora do servidor como o cliente a enxerga, já com o
// atraso de descida: é o relógio em que os snapshots chegam. Desenhar os outros jogadores em
// `serverTime - 100 ms` deixa sempre ~100 ms de snapshots no buffer, qualquer que seja a
// latência, e mesmo com atraso diferente na ida e na volta (o simulador de lag atrasa o pong
// na volta, mas não o ping na ida).

import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { PongMessage } from '@rainbow-pixel/shared';

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class ServerClock {
  private readonly rttSamples: number[] = [];
  private readonly offsetSamples: number[] = [];
  /** Offset tirado do primeiro snapshot, usado até chegar o primeiro pong. */
  private bootstrapOffset: number | null = null;

  constructor(private readonly sampleCount: number = NET_CONFIG.clockSampleCount) {}

  /** Pong recebido no instante `nowMs` do relógio do cliente. */
  onPong(pong: PongMessage, nowMs: number): void {
    this.push(this.rttSamples, Math.max(0, nowMs - pong.clientTimeMs));
    this.push(this.offsetSamples, pong.serverTimeMs - nowMs);
  }

  /** Snapshot recebido: antes do primeiro pong, serve de referência para o relógio. */
  onSnapshot(serverTimeMs: number, nowMs: number): void {
    this.bootstrapOffset ??= serverTimeMs - nowMs;
  }

  /** RTT médio, em ms. `null` antes do primeiro pong. */
  get rttMs(): number | null {
    return this.rttSamples.length === 0 ? null : average(this.rttSamples);
  }

  /** Hora do servidor que o cliente enxerga agora. `null` antes de qualquer referência. */
  serverTime(nowMs: number): number | null {
    if (this.offsetSamples.length > 0) {
      return nowMs + average(this.offsetSamples);
    }
    return this.bootstrapOffset === null ? null : nowMs + this.bootstrapOffset;
  }

  private push(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > this.sampleCount) {
      samples.shift();
    }
  }
}
