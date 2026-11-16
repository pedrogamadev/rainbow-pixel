// Fila de inputs de um jogador, em funções puras. Humanos e bots passam pelas mesmas regras.
// - descarta seq já recebido ou repetido (o cliente reenvia os últimos inputs contra perda);
// - normaliza moveX e moveY para -1, 0 ou 1; recusa aimAngle não finito e moveMode desconhecido;
// - guarda no máximo NET_CONFIG.inputQueueMax inputs (os mais antigos saem);
// - descarta o que passar de NET_CONFIG.maxInputsPerSecond inputs novos por segundo.
// A cada tick o jogador consome 1 input. Sem input na fila, o último se repete por até
// NET_CONFIG.inputRepeatTicks ticks e depois o jogador para. O input repetido sai marcado
// (`repeated`): mantém movimento e mira, mas não conta como ação (não dispara, não recarrega e
// não troca de arma). O gatilho pressionado continua o do último input real, para a detecção de
// borda das armas semiautomáticas não gerar tiro extra quando o input real voltar.

import { NET_CONFIG, isMoveMode } from '@rainbow-pixel/shared';
import type { InputCommand, MoveAxis } from '@rainbow-pixel/shared';

/** Input aceito na fila, com a hora em que chegou ao servidor. */
export interface QueuedInput {
  readonly command: InputCommand;
  /**
   * Relógio do servidor (ms) quando a mensagem chegou: o `nowMs` de `enqueueInputs`. A
   * compensação de lag mede a volta no tempo a partir daqui, não do tick em que o input é
   * processado, para a espera na fila não comer o limite.
   */
  readonly receivedAtMs: number;
}

export interface InputQueueState {
  /** Inputs aceitos e ainda não processados, em ordem de seq. */
  readonly queue: readonly QueuedInput[];
  /** Maior seq já aceito. Chegando de novo, ou menor que ele, é descartado. */
  readonly lastReceivedSeq: number;
  /** Último seq processado: é o ackSeq do snapshot. 0 se nenhum. */
  readonly lastProcessedSeq: number;
  /** Último input aplicado, para repetir enquanto a fila está vazia. */
  readonly lastInput: QueuedInput | null;
  /** Ticks seguidos em que o último input foi repetido. */
  readonly repeatedTicks: number;
  /** Janela de 1 s do limite de taxa: início e inputs novos aceitos nela. */
  readonly rateWindowStartMs: number;
  readonly rateWindowCount: number;
}

const RATE_WINDOW_MS = 1000;

export function createInputQueue(): InputQueueState {
  return {
    queue: [],
    lastReceivedSeq: 0,
    lastProcessedSeq: 0,
    lastInput: null,
    repeatedTicks: 0,
    rateWindowStartMs: Number.NEGATIVE_INFINITY,
    rateWindowCount: 0,
  };
}

function normalizeAxis(value: unknown): MoveAxis {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** Valida e normaliza um input recebido. `null`: recusado. */
export function parseInputCommand(raw: unknown): InputCommand | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { seq, moveX, moveY, aimAngle, moveMode } = raw as Record<string, unknown>;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) {
    return null;
  }
  if (typeof aimAngle !== 'number' || !Number.isFinite(aimAngle)) {
    return null;
  }
  if (!isMoveMode(moveMode)) {
    return null;
  }
  return { seq, moveX: normalizeAxis(moveX), moveY: normalizeAxis(moveY), aimAngle, moveMode };
}

export interface EnqueueResult {
  readonly state: InputQueueState;
  /** Inputs novos que entraram na fila. */
  readonly accepted: number;
  /** Inputs recusados, repetidos, acima da taxa, ou antigos empurrados para fora da fila. */
  readonly dropped: number;
}

export function enqueueInputs(
  state: InputQueueState,
  received: readonly unknown[],
  nowMs: number,
): EnqueueResult {
  const valid: InputCommand[] = [];
  let dropped = 0;
  for (const raw of received) {
    const input = parseInputCommand(raw);
    if (input === null) {
      dropped += 1;
    } else {
      valid.push(input);
    }
  }
  valid.sort((a, b) => a.seq - b.seq);

  const queue = [...state.queue];
  let { lastReceivedSeq, rateWindowStartMs, rateWindowCount } = state;
  let accepted = 0;
  for (const input of valid) {
    if (input.seq <= lastReceivedSeq) {
      dropped += 1;
      continue;
    }
    // O seq avança mesmo quando a taxa estoura: o input descartado não volta numa cópia
    // redundante da próxima mensagem.
    lastReceivedSeq = input.seq;
    if (nowMs - rateWindowStartMs >= RATE_WINDOW_MS) {
      rateWindowStartMs = nowMs;
      rateWindowCount = 0;
    }
    if (rateWindowCount >= NET_CONFIG.maxInputsPerSecond) {
      dropped += 1;
      continue;
    }
    rateWindowCount += 1;
    queue.push({ command: input, receivedAtMs: nowMs });
    accepted += 1;
    if (queue.length > NET_CONFIG.inputQueueMax) {
      queue.shift();
      dropped += 1;
    }
  }

  return {
    state: { ...state, queue, lastReceivedSeq, rateWindowStartMs, rateWindowCount },
    accepted,
    dropped,
  };
}

export interface TickInput {
  readonly state: InputQueueState;
  /** Input a aplicar neste tick. `null`: o jogador fica parado. */
  readonly input: InputCommand | null;
  /** Chegada do input ao servidor (na repetição, a do input repetido). `null` sem input. */
  readonly receivedAtMs: number | null;
  /**
   * O input é a repetição do último, com a fila vazia: vale para movimento e mira, mas não
   * para ações (disparo, recarga e troca de arma).
   */
  readonly repeated: boolean;
}

/** Input do jogador neste tick. */
export function takeTickInput(state: InputQueueState): TickInput {
  const [next, ...rest] = state.queue;
  if (next !== undefined) {
    return {
      state: {
        ...state,
        queue: rest,
        lastProcessedSeq: next.command.seq,
        lastInput: next,
        repeatedTicks: 0,
      },
      input: next.command,
      receivedAtMs: next.receivedAtMs,
      repeated: false,
    };
  }
  if (state.lastInput !== null && state.repeatedTicks < NET_CONFIG.inputRepeatTicks) {
    return {
      state: { ...state, repeatedTicks: state.repeatedTicks + 1 },
      input: state.lastInput.command,
      receivedAtMs: state.lastInput.receivedAtMs,
      repeated: true,
    };
  }
  return { state, input: null, receivedAtMs: null, repeated: false };
}

/**
 * Esvazia a fila e para o jogador, mantendo o ackSeq. Usado quando a conexão cai: o jogador
 * fica parado no lugar até voltar.
 */
export function stopInputs(state: InputQueueState): InputQueueState {
  return { ...state, queue: [], lastInput: null, repeatedTicks: 0 };
}
