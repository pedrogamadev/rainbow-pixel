/**
 * Memória de um bot entre uma decisão e a próxima. O cérebro altera este objeto a cada
 * decisão; quem guarda uma memória por bot é o servidor.
 */
export interface BotMemory {
  /** Waypoint que o bot está buscando. `null` até a primeira decisão com waypoints. */
  waypointIndex: number | null;
  /** Tempo que falta parado no waypoint alcançado. */
  pauseLeftMs: number;
  /** Menor distância ao waypoint atual desde que ele virou o alvo. */
  bestDistance: number;
  /** Tempo andando sem chegar mais perto do waypoint atual. */
  noProgressMs: number;
  /** Última mira escolhida, mantida enquanto o bot está parado. `null` antes de andar. */
  aimAngle: number | null;
}

export function createBotMemory(): BotMemory {
  return {
    waypointIndex: null,
    pauseLeftMs: 0,
    bestDistance: Number.POSITIVE_INFINITY,
    noProgressMs: 0,
    aimAngle: null,
  };
}
