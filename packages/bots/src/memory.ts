/** Alvo do bot nível 1 e desde quando ele está visível. */
export interface BotTarget {
  readonly playerId: string;
  /** Tick da decisão em que o alvo ficou visível: conta o tempo de reação. */
  readonly sinceTick: number;
}

/**
 * Memória de um bot entre uma decisão e a próxima. O cérebro altera este objeto a cada
 * decisão; quem guarda uma memória por bot é o servidor.
 */
export interface BotMemory {
  // Nível 0 (patrulha)
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

  // Nível 1 (atirador)
  /** Semente dos sorteios do bot: `hashRandom(seed, randomCounter)`. */
  readonly seed: number;
  /** Sorteios já feitos. Cresce a cada sorteio. */
  randomCounter: number;
  /** Inimigo que o bot está enfrentando. `null`: nenhum à vista. */
  target: BotTarget | null;
  /** Erro de mira da rajada atual, em graus. */
  aimErrorDeg: number;
  /** Disparos da rajada atual, contados pela munição que saiu do pente. */
  burstShots: number;
  /** Tempo que falta da pausa entre rajadas (gatilho solto). */
  burstPauseLeftMs: number;
  /** Munição no pente na decisão anterior. `null` antes da primeira. */
  lastAmmo: number | null;
}

export function createBotMemory(seed = 0): BotMemory {
  return {
    waypointIndex: null,
    pauseLeftMs: 0,
    bestDistance: Number.POSITIVE_INFINITY,
    noProgressMs: 0,
    aimAngle: null,
    seed,
    randomCounter: 0,
    target: null,
    aimErrorDeg: 0,
    burstShots: 0,
    burstPauseLeftMs: 0,
    lastAmmo: null,
  };
}
