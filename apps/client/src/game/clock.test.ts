import { describe, expect, it } from 'vitest';
import { ServerClock } from './clock.js';

describe('ServerClock', () => {
  it('sem referência, não sabe a hora do servidor', () => {
    const clock = new ServerClock();
    expect(clock.rttMs).toBeNull();
    expect(clock.serverTime(1000)).toBeNull();
  });

  it('estima o RTT e o relógio pela média móvel dos últimos pongs', () => {
    const clock = new ServerClock(3);
    // Servidor 5000 ms à frente; o pong leva 40 ms para voltar.
    clock.onPong({ clientTimeMs: 0, serverTimeMs: 5040 }, 80);
    clock.onPong({ clientTimeMs: 1000, serverTimeMs: 6060 }, 1100);
    expect(clock.rttMs).toBe(90);
    // offset = hora do servidor no pong - hora em que ele chegou: 4960 e 4960.
    expect(clock.serverTime(2000)).toBe(6960);
  });

  it('a média só guarda as últimas amostras', () => {
    const clock = new ServerClock(2);
    clock.onPong({ clientTimeMs: 0, serverTimeMs: 0 }, 1000);
    clock.onPong({ clientTimeMs: 0, serverTimeMs: 0 }, 100);
    clock.onPong({ clientTimeMs: 0, serverTimeMs: 0 }, 300);
    expect(clock.rttMs).toBe(200);
  });

  it('antes do primeiro pong, usa o primeiro snapshot como referência', () => {
    const clock = new ServerClock();
    clock.onSnapshot(9000, 100);
    clock.onSnapshot(99_999, 100);
    expect(clock.serverTime(200)).toBe(9100);
    clock.onPong({ clientTimeMs: 150, serverTimeMs: 9500 }, 250);
    expect(clock.serverTime(300)).toBe(9550);
  });
});
