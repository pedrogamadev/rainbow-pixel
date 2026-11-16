// Compensação de lag (escopo, seções 4.1 e 10.1), em funções puras.
// O servidor guarda as posições e o `alive` de cada jogador ao fim de cada tick, por
// LAG_COMP_CONFIG.historyMs. Para cada disparo, mede os alvos no instante que o atirador estava
// vendo (`viewTimeMs`), limitado a LAG_COMP_CONFIG.maxRewindMs antes da chegada do input.
// Paredes e atirador ficam sempre no estado atual.

import { LAG_COMP_CONFIG } from '@rainbow-pixel/shared';
import type { ShotTarget } from '@rainbow-pixel/shared';

export interface HistoryPlayer {
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
}

/** Posições de todos os jogadores ao fim de um tick. */
export interface HistoryFrame {
  readonly tick: number;
  /** Instante do tick no relógio do servidor (ms). */
  readonly timeMs: number;
  readonly players: ReadonlyMap<string, HistoryPlayer>;
}

/** Quadros em ordem de tempo, do mais antigo ao mais novo. */
export type PositionHistory = readonly HistoryFrame[];

/** Acrescenta o quadro do tick e descarta os mais velhos que `historyMs`. */
export function recordFrame(
  history: PositionHistory,
  frame: HistoryFrame,
  historyMs: number = LAG_COMP_CONFIG.historyMs,
): PositionHistory {
  const oldest = frame.timeMs - historyMs;
  return [...history.filter((kept) => kept.timeMs >= oldest), frame];
}

/**
 * Instante em que o disparo mede os alvos: o que o cliente estava vendo, sem ir além de
 * `maxRewindMs` antes da chegada do input nem depois do tick atual.
 */
export function rewindTargetMs(
  viewTimeMs: number,
  receivedAtMs: number,
  tickTimeMs: number,
  maxRewindMs: number = LAG_COMP_CONFIG.maxRewindMs,
): number {
  const earliest = Math.min(receivedAtMs - maxRewindMs, tickTimeMs);
  return Math.min(Math.max(viewTimeMs, earliest), tickTimeMs);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Onde cada jogador estava em `timeMs`: interpolação linear entre os dois quadros vizinhos.
 * Só entra quem estava vivo nos dois quadros (quem morreu ou renasceu no meio fica de fora).
 * Antes do primeiro quadro vale o primeiro; depois do último, o último.
 */
export function sampleHistory(
  history: PositionHistory,
  timeMs: number,
): Map<string, { readonly x: number; readonly y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const first = history[0];
  const last = history.at(-1);
  if (first === undefined || last === undefined) {
    return result;
  }
  let before = first;
  let after = first;
  if (timeMs >= last.timeMs) {
    before = last;
    after = last;
  } else if (timeMs > first.timeMs) {
    const next = history.findIndex((frame) => frame.timeMs >= timeMs);
    after = history[next] ?? last;
    before = after.timeMs === timeMs ? after : (history[next - 1] ?? after);
  }
  const span = after.timeMs - before.timeMs;
  const t = span > 0 ? (timeMs - before.timeMs) / span : 0;
  for (const [playerId, from] of before.players) {
    const to = after.players.get(playerId);
    if (to === undefined || !from.alive || !to.alive) {
      continue;
    }
    result.set(playerId, { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });
  }
  return result;
}

/**
 * Alvos de um disparo com a compensação: os candidatos atuais (vivos agora, sem o atirador)
 * nas posições de `timeMs`. Os candidatos atuais valem como o quadro do tick em andamento
 * (`tickTimeMs`), depois do último quadro do histórico. Quem não estava vivo naquele instante
 * fica de fora.
 */
export function compensatedTargets(
  history: PositionHistory,
  timeMs: number,
  current: readonly ShotTarget[],
  tickTimeMs: number,
): ShotTarget[] {
  const now: HistoryFrame = {
    tick: (history.at(-1)?.tick ?? 0) + 1,
    timeMs: tickTimeMs,
    players: new Map(current.map((target) => [target.playerId, { ...target, alive: true }])),
  };
  const past = sampleHistory([...history, now], timeMs);
  const targets: ShotTarget[] = [];
  for (const target of current) {
    const position = past.get(target.playerId);
    if (position !== undefined) {
      targets.push({ playerId: target.playerId, x: position.x, y: position.y });
    }
  }
  return targets;
}
