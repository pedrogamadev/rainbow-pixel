// Argumentos da linha de comando do cliente headless.
//
// pnpm headless --user dev2 [--code ABC123 | --create] --script circle --duration 60
//               [--latency 150 --jitter 20 --loss 2] [--max-corrections-per-min 6]
//               [--max-other-jump-px 32] [--bots 3] [--wait] [--seed 1]

import { parseArgs } from 'node:util';
import {
  DEV_NET_SIMULATOR_CONFIG,
  DEV_SEED_USERS,
  LOBBY_CONFIG,
  isValidRoomCode,
  normalizeRoomCode,
} from '@rainbow-pixel/shared';
import type { DevNetSettings } from '@rainbow-pixel/shared';
import type { MetricsLimits } from './metrics.js';
import { SCRIPT_NAMES, isScriptName } from './scripts/index.js';
import type { ScriptName } from './scripts/index.js';

export type RoomMode =
  /** Cria a sala. Sem `wait`, o headless (host) inicia a partida na hora, com `bots` bots. */
  | { readonly kind: 'create'; readonly bots: number; readonly wait: boolean }
  /** Entra pelo código, marca pronto e espera o host iniciar a partida. */
  | { readonly kind: 'join'; readonly code: string };

export interface HeadlessOptions {
  /** Nickname de uma conta de teste (dev1 a dev4). */
  readonly user: string;
  readonly room: RoomMode;
  readonly script: ScriptName;
  readonly durationSeconds: number;
  readonly seed: number;
  /** Simulador de lag pedido para este cliente. `null`: não mexe. */
  readonly net: DevNetSettings | null;
  readonly limits: MetricsLimits;
}

export class ArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgsError';
  }
}

export const USAGE = `Uso: pnpm headless --user dev2 [--code ABC123 | --create] --script circle --duration 60
  --user <dev1..dev4>             conta de teste (padrão dev1)
  --code <código>                 entra na sala pelo código e espera o host iniciar
  --create                        cria a sala e inicia a partida na hora (padrão)
    --bots <0..3>                 bots adicionados antes de iniciar
    --wait                        não inicia: espera todos ficarem prontos
  --script <${SCRIPT_NAMES.join('|')}>  roteiro de input (padrão idle)
  --duration <segundos>           duração do roteiro (padrão 60)
  --seed <n>                      semente do random-walk (padrão 1)
  --latency <ms> --jitter <ms> --loss <%>   simulador de lag deste cliente
  --max-corrections-per-min <n>   falha se passar de n correções acima de 4 px por minuto
  --max-other-jump-px <px>        falha se outro jogador saltar mais que isso entre quadros`;

function number(
  name: string,
  value: string | undefined,
  range: { min: number; max?: number; integer?: boolean },
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  const valid =
    value.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed >= range.min &&
    (range.max === undefined || parsed <= range.max) &&
    (range.integer !== true || Number.isInteger(parsed));
  if (!valid) {
    const limit = range.max === undefined ? `>= ${range.min}` : `de ${range.min} a ${range.max}`;
    throw new ArgsError(`--${name} precisa ser um número ${limit} (recebido "${value}").`);
  }
  return parsed;
}

export function parseHeadlessArgs(argv: readonly string[]): HeadlessOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        user: { type: 'string', default: 'dev1' },
        code: { type: 'string' },
        create: { type: 'boolean', default: false },
        bots: { type: 'string' },
        wait: { type: 'boolean', default: false },
        script: { type: 'string', default: 'idle' },
        duration: { type: 'string', default: '60' },
        seed: { type: 'string', default: '1' },
        latency: { type: 'string' },
        jitter: { type: 'string' },
        loss: { type: 'string' },
        'max-corrections-per-min': { type: 'string' },
        'max-other-jump-px': { type: 'string' },
      },
    }));
  } catch (error) {
    throw new ArgsError(error instanceof Error ? error.message : String(error));
  }

  const user = values.user;
  if (!DEV_SEED_USERS.some((seed) => seed.nickname === user)) {
    throw new ArgsError(
      `--user precisa ser uma conta de teste: ${DEV_SEED_USERS.map((seed) => seed.nickname).join(', ')}.`,
    );
  }
  if (!isScriptName(values.script)) {
    throw new ArgsError(`--script precisa ser ${SCRIPT_NAMES.join(', ')}.`);
  }

  let room: RoomMode;
  if (values.code !== undefined) {
    if (values.create || values.bots !== undefined || values.wait) {
      throw new ArgsError('Use --code ou --create (com --bots e --wait), não os dois.');
    }
    const code = normalizeRoomCode(values.code);
    if (!isValidRoomCode(code)) {
      throw new ArgsError(`Código de sala inválido: "${values.code}".`);
    }
    room = { kind: 'join', code };
  } else {
    const bots =
      number('bots', values.bots, { min: 0, max: LOBBY_CONFIG.maxBots, integer: true }) ?? 0;
    room = { kind: 'create', bots, wait: values.wait };
  }

  const latencyMs = number('latency', values.latency, {
    min: 0,
    max: DEV_NET_SIMULATOR_CONFIG.maxLatencyMs,
  });
  const jitterMs = number('jitter', values.jitter, {
    min: 0,
    max: DEV_NET_SIMULATOR_CONFIG.maxJitterMs,
  });
  const lossPct = number('loss', values.loss, { min: 0, max: DEV_NET_SIMULATOR_CONFIG.maxLossPct });
  const net =
    latencyMs === undefined && jitterMs === undefined && lossPct === undefined
      ? null
      : { latencyMs: latencyMs ?? 0, jitterMs: jitterMs ?? 0, lossPct: lossPct ?? 0 };

  return {
    user,
    room,
    script: values.script,
    durationSeconds: number('duration', values.duration, { min: 1 }) ?? 60,
    seed: number('seed', values.seed, { min: 0, integer: true }) ?? 1,
    net,
    limits: {
      maxCorrectionsPerMinute: number(
        'max-corrections-per-min',
        values['max-corrections-per-min'],
        { min: 0 },
      ),
      maxOtherJumpPx: number('max-other-jump-px', values['max-other-jump-px'], { min: 0 }),
    },
  };
}
