import type { BotDifficultyId } from '../catalog/botDifficulties.js';
import type { WeaponId, WeaponSlot } from '../catalog/weapons.js';
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
  /**
   * Cada snapshot repete os eventos (tiros, acertos, abates) dos últimos snapshots daquele
   * cliente, contra perda de pacote. O cliente descarta o eventId já visto.
   */
  eventRedundancySnapshots: 3,
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

/** Combate (escopo, seções 3.1, 4 e 4.1). */
export const COMBAT_CONFIG = {
  /** Vida de cada jogador, sem regeneração. */
  maxHealth: 100,
  /**
   * Loadout fixo do marco 0.3, para humanos e bots. A escolha de loadout é do marco 0.8; o
   * banco e a simulação guardam só os ids do catálogo.
   */
  matchLoadout: { primary: 'm4a1', secondary: 'm9' } as const satisfies Record<
    WeaponSlot,
    WeaponId
  >,
  /** Duração da troca de arma. Durante a troca não dispara. */
  weaponSwitchMs: 400,
  /** Fogo amigo: o aliado recebe esta fração do dano. */
  friendlyFireMultiplier: 0.5,
  /** Queda de dano: depois de rangePx, cai linearmente até este fator do dano... */
  damageFalloffMinMultiplier: 0.6,
  /** ...que é atingido neste múltiplo de rangePx e vale daí em diante. */
  damageFalloffEndRangeMultiplier: 2,
  /** Renascimento temporário do marco 0.3: tempo morto antes de voltar ao spawn. */
  respawnDelayMs: 3000,
} as const;

/** Manuseio de uma arma: dispersão e recuo (marco 0.3). Ângulos em graus. */
export interface WeaponHandling {
  /** Dispersão parado (meia abertura do cone de tiro). */
  readonly baseSpreadDeg: number;
  /** Acréscimo andando. */
  readonly walkSpreadDeg: number;
  /** Acréscimo andando lento. */
  readonly slowSpreadDeg: number;
  /** Acréscimo por tiro seguido. */
  readonly shotSpreadDeg: number;
  /** Teto do acréscimo acumulado pelos tiros seguidos. */
  readonly maxShotSpreadDeg: number;
  readonly spreadRecoveryDegPerSec: number;
  /** Recuo somado à mira a cada tiro, em ciclo. */
  readonly recoilPatternDeg: readonly number[];
  /** Teto do recuo acumulado, para cada lado. */
  readonly maxRecoilDeg: number;
  readonly recoilRecoveryDegPerSec: number;
}

// Valores iniciais do marco 0.3, só para as armas do loadout fixo. As outras armas ganham
// manuseio no marco 0.8.
export const WEAPON_HANDLING = {
  m4a1: {
    baseSpreadDeg: 1,
    walkSpreadDeg: 2,
    slowSpreadDeg: 1,
    shotSpreadDeg: 0.6,
    maxShotSpreadDeg: 5,
    spreadRecoveryDegPerSec: 10,
    recoilPatternDeg: [1.2, 1, -0.8, 1.4, -1.2],
    maxRecoilDeg: 8,
    recoilRecoveryDegPerSec: 20,
  },
  m9: {
    baseSpreadDeg: 0.8,
    walkSpreadDeg: 1.5,
    slowSpreadDeg: 0.8,
    shotSpreadDeg: 1.5,
    maxShotSpreadDeg: 6,
    spreadRecoveryDegPerSec: 12,
    recoilPatternDeg: [1.5, -1.5],
    maxRecoilDeg: 5,
    recoilRecoveryDegPerSec: 25,
  },
} as const satisfies Partial<Record<WeaponId, WeaponHandling>>;

/** Manuseio da arma. Falha se a arma não tem manuseio cadastrado. */
export function getWeaponHandling(weaponId: WeaponId): WeaponHandling {
  const handling: WeaponHandling | undefined = (
    WEAPON_HANDLING as Partial<Record<WeaponId, WeaponHandling>>
  )[weaponId];
  if (handling === undefined) {
    throw new Error(`Arma sem manuseio em WEAPON_HANDLING: ${weaponId}`);
  }
  return handling;
}

/** Compensação de lag no servidor (escopo, seções 4.1 e 10.1). */
export const LAG_COMP_CONFIG = {
  /** Histórico de posições guardado pelo servidor. */
  historyMs: 300,
  /** Máximo que o servidor volta no tempo, contado da chegada do input. */
  maxRewindMs: 200,
} as const;

/** Visão (escopo, seção 8.1). No marco 0.3 só a percepção do bot nível 1 usa. */
export const VISION_CONFIG = {
  /** Abertura total do cone para onde o jogador mira. */
  coneDeg: 100,
  rangePx: 900,
  /** Visão periférica em 360°, medida do centro do jogador. */
  peripheralPx: 48,
} as const;

/** Partes mínimas da tela da partida (marco 0.3). O HUD final é do marco 1.0. */
export const HUD_CONFIG = {
  /** Tempo até o tracer de um tiro sumir. */
  tracerMs: 80,
  /** Tempo do marcador de acerto na mira, depois do hit_confirm. */
  hitMarkerMs: 250,
  /** Tempo do arco de dano na borda da tela, depois do damage_taken. */
  damageIndicatorMs: 1000,
  /** Abates mostrados no feed e por quanto tempo cada um fica. */
  killFeedSize: 4,
  killFeedMs: 5000,
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

/** Bot nível 1: atirador (escopo, seção 16.3). A dificuldade fica em BOT_DIFFICULTY_PARAMS. */
export const BOT_LEVEL1_CONFIG = {
  /** Dispara quando a mira está até aqui do ponto escolhido (alvo + erro de mira). */
  fireToleranceDeg: 2,
  /** Depois da rajada máxima, solta o gatilho por este tempo e sorteia novo erro de mira. */
  burstPauseMs: 250,
  /** Neste marco os bots usam sempre a primária. */
  weaponSlot: 'primary',
} as const satisfies {
  readonly fireToleranceDeg: number;
  readonly burstPauseMs: number;
  readonly weaponSlot: WeaponSlot;
};

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
  /** Roteiro strafe: tempo em cada sentido do eixo. */
  strafeLegMs: 1500,
  /** Roteiro aim-test: intervalo padrão entre dois disparos. */
  defaultFireIntervalMs: 300,
  /**
   * Roteiro aim-test: não dispara no fim do roteiro, para o hit_confirm dos últimos disparos
   * chegar antes do resumo.
   */
  hitConfirmGraceMs: 1500,
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

// Valores iniciais da seção 16.4 do escopo. O nível 1 (marco 0.3) usa reação, erro de mira, giro
// e rajada; atenção a som e memória ficam para o nível 2.
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
