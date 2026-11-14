import type { BotDifficultyId } from '../catalog/botDifficulties.js';
import type { MoveMode } from '../sim/types.js';

/** Formato da partida (escopo, seção 3.1). */
export const MATCH_CONFIG = {
  teamCount: 2,
  teamSize: 2,
  maxPlayers: 4,
  /** Contagem entre o lobby fechar (todos prontos) e a partida começar. */
  startCountdownSeconds: 3,
  /** Marco 0.2: toda partida usa o mapa de teste. */
  mapId: 'gym_01',
} as const;

/** Movimento e simulação (escopo, seções 4, 7 e 10.1). */
export const SIM_CONFIG = {
  /** Ticks por segundo da simulação, no servidor e na previsão do cliente. */
  tickRate: 30,
  /**
   * Máximo de ticks atrasados que o servidor recupera de uma vez. Se o processo ficou parado
   * mais que isso, o tempo excedente é pulado em vez de simulado.
   */
  maxCatchUpTicks: 30,
  /**
   * Intervalo do laço da partida no servidor, em ms. O laço acorda mais vezes que o tick e o
   * acumulador decide quantos ticks rodar: assim cada tick (e cada snapshot) sai perto da hora
   * certa mesmo com a resolução grosseira do timer do sistema (~15 ms no Windows).
   */
  serverLoopIntervalMs: 4,
  /** Lado da célula do mapa, em px. */
  cellSize: 8,
  /** Raio do círculo do jogador, em px. */
  playerRadius: 12,
  /** Velocidade de cada modo de movimento, em px/s. */
  moveSpeedPxPerSec: {
    walk: 140,
    slow: 80,
    run: 200,
  } satisfies Record<MoveMode, number>,
} as const;

/** Rede: input, snapshots, relógio, previsão e interpolação (escopo, seção 10.1). */
export const NET_CONFIG = {
  /** Snapshots por segundo enviados a cada cliente. */
  snapshotRate: 20,
  /** Inputs amostrados por segundo no cliente: um por tick da simulação. */
  inputRate: 30,
  /** Inputs ainda não confirmados reenviados em cada mensagem, contra perda de pacote. */
  inputRedundancy: 3,
  /** Tamanho máximo da fila de inputs de um jogador no servidor. Os mais antigos saem. */
  inputQueueMax: 8,
  /** Inputs novos aceitos por segundo de um mesmo jogador. O excedente é descartado. */
  maxInputsPerSecond: 60,
  /** Com a fila vazia, o servidor repete o último input por estes ticks e depois para. */
  inputRepeatTicks: 3,
  pingIntervalMs: 1000,
  /** Quantos pongs entram na média móvel do RTT e do offset do relógio. */
  clockSampleCount: 10,
  /** Os outros jogadores são desenhados este tempo no passado. */
  interpolationDelayMs: 100,
  /** Sem snapshot novo, a extrapolação vai no máximo até aqui e depois para. */
  maxExtrapolationMs: 100,
  /** Por quanto tempo o cliente guarda snapshots para interpolar. */
  interpolationBufferMs: 1000,
  /** Erro de previsão a partir daqui é corrigido na hora; abaixo, suavemente. */
  reconciliationSnapPx: 32,
  /** Duração da correção suave do erro de previsão. */
  reconciliationSmoothingMs: 100,
  /** Correções acima deste tamanho entram nas métricas do cliente headless. */
  correctionMetricPx: 4,
  /**
   * Máximo de inputs que o cliente amostra de uma vez para recuperar atraso (aba que ficou em
   * segundo plano, por exemplo). O resto do tempo parado é pulado.
   */
  clientMaxCatchUpTicks: 3,
} as const;

/** Bot nível 0: patrulha de waypoints (escopo, seção 16.3). */
export const BOT_LEVEL0_CONFIG = {
  /** Decisões por segundo. Nos ticks intermediários vale o último input. */
  decisionRateHz: 10,
  /** Parada em cada waypoint. */
  waypointPauseMs: 1000,
  /** Sem progresso por este tempo, o bot pula para o próximo waypoint. */
  stuckTimeoutMs: 2000,
  /** Distância em que o waypoint conta como alcançado. */
  arriveRadiusPx: 8,
  /** Aproximação mínima do waypoint que conta como progresso. */
  minProgressPx: 1,
} as const;

/** Limites do simulador de lag (ferramenta de teste, escopo, seção 17). */
export const DEV_NET_SIMULATOR_CONFIG = {
  maxLatencyMs: 1000,
  maxJitterMs: 500,
  maxLossPct: 50,
} as const;

/** Cliente headless (ferramenta de teste, escopo, seção 17). */
export const DEV_HEADLESS_CONFIG = {
  /** Quadros por segundo simulados para medir os saltos dos outros jogadores. */
  frameRate: 60,
  /** Espera máxima pelo início da partida depois de entrar na sala. */
  matchWaitTimeoutSeconds: 120,
} as const;

/** Regras do lobby (escopo, seções 3.1 e 16.2). */
export const LOBBY_CONFIG = {
  /** A sala precisa de pelo menos 1 humano, então no máximo 3 bots. */
  maxBots: 3,
  /** Tempo que a vaga de um jogador desconectado fica reservada. */
  reconnectionWindowSeconds: 60,
} as const;

export const ROOM_CODE_CONFIG = {
  length: 6,
  /** Sem I, L, O, 0 e 1, que se confundem ao ler ou ditar o código. */
  alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
} as const;

export const NICKNAME_CONFIG = {
  minLength: 3,
  maxLength: 16,
} as const;

/**
 * Contas de teste criadas por `pnpm dev:seed-users` (escopo, seção 17).
 * Só existem em ambiente com DEV_TOOLS ligado; a senha fica fora do código.
 */
export const DEV_SEED_USERS = [
  { nickname: 'dev1', email: 'dev1@rainbowpixel.local' },
  { nickname: 'dev2', email: 'dev2@rainbowpixel.local' },
  { nickname: 'dev3', email: 'dev3@rainbowpixel.local' },
  { nickname: 'dev4', email: 'dev4@rainbowpixel.local' },
] as const;

/** Quais sons o bot percebe (escopo, seção 16.4, "Atenção a som"). */
export type BotSoundAttention = 'loud_only' | 'all' | 'all_prioritized';

export interface BotDifficultyParams {
  /** Tempo de reação ao ver um inimigo. */
  readonly reactionMs: number;
  /** Erro de mira, em graus para cada lado. */
  readonly aimErrorDeg: number;
  readonly turnSpeedDegPerSec: number;
  /** Rajada máxima antes de corrigir a mira. `null`: controle contínuo. */
  readonly maxBurst: number | null;
  readonly soundAttention: BotSoundAttention;
  /** Por quanto tempo o bot lembra a última posição vista do inimigo. */
  readonly memoryMs: number;
}

// Valores iniciais da seção 16.4 do escopo. O nível 0 (marco 0.2) ainda não usa nenhum.
export const BOT_DIFFICULTY_PARAMS = {
  easy: {
    reactionMs: 700,
    aimErrorDeg: 12,
    turnSpeedDegPerSec: 180,
    maxBurst: 3,
    soundAttention: 'loud_only',
    memoryMs: 3000,
  },
  medium: {
    reactionMs: 450,
    aimErrorDeg: 7,
    turnSpeedDegPerSec: 300,
    maxBurst: 6,
    soundAttention: 'all',
    memoryMs: 6000,
  },
  hard: {
    reactionMs: 250,
    aimErrorDeg: 3,
    turnSpeedDegPerSec: 480,
    maxBurst: null,
    soundAttention: 'all_prioritized',
    memoryMs: 10000,
  },
} as const satisfies Record<BotDifficultyId, BotDifficultyParams>;
