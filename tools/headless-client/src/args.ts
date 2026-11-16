// Argumentos da linha de comando do cliente headless.
//
// pnpm headless --user dev2 [--code ABC123 | --create] --script circle --duration 60
//               [--latency 150 --jitter 20 --loss 2] [--max-corrections-per-min 6]
//               [--max-other-jump-px 32] [--bots 3] [--wait] [--humans 2] [--seed 1]
//               [--teleport x,y] [--god] [--no-spread] [--weapon primary|secondary]
//               [--axis x|y] [--fire-interval-ms 300] [--min-hit-ratio 0.95]

import { parseArgs } from 'node:util';
import {
  DEV_HEADLESS_CONFIG,
  DEV_NET_SIMULATOR_CONFIG,
  DEV_SEED_USERS,
  LOBBY_CONFIG,
  MATCH_CONFIG,
  WEAPON_SLOTS,
  isValidRoomCode,
  isWeaponSlot,
  normalizeRoomCode,
} from '@rainbow-pixel/shared';
import type { DevNetSettings, Vec2, WeaponSlot } from '@rainbow-pixel/shared';
import type { MetricsLimits } from './metrics.js';
import { SCRIPT_NAMES, isScriptName } from './scripts/index.js';
import type { ScriptName, StrafeAxis } from './scripts/index.js';

export type RoomMode =
  /**
   * Cria a sala com `bots` bots. Sem `wait`, o headless (host) inicia a partida assim que houver
   * `humans` humanos prontos na sala (padrão 1: na hora).
   */
  | {
      readonly kind: 'create';
      readonly bots: number;
      readonly wait: boolean;
      readonly humans: number;
    }
  /** Entra pelo código, marca pronto e espera o host iniciar a partida. */
  | { readonly kind: 'join'; readonly code: string };

/** Comandos de debug mandados quando a partida começa. */
export interface DevCommandOptions {
  readonly teleport: Vec2 | null;
  readonly god: boolean;
  readonly noSpread: boolean;
}

export interface HeadlessOptions {
  /** Nickname de uma conta de teste (dev1 a dev4). */
  readonly user: string;
  readonly room: RoomMode;
  readonly script: ScriptName;
  readonly durationSeconds: number;
  readonly seed: number;
  /** Arma que os roteiros seguram. */
  readonly weapon: WeaponSlot;
  /** strafe: eixo do vaivém. */
  readonly axis: StrafeAxis;
  /** aim-test: intervalo mínimo entre disparos. */
  readonly fireIntervalMs: number;
  readonly dev: DevCommandOptions;
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
    --humans <1..4>               inicia quando houver n humanos prontos (padrão 1)
  --script <${SCRIPT_NAMES.join('|')}>  roteiro de input (padrão idle)
  --duration <segundos>           duração do roteiro (padrão 60)
  --seed <n>                      semente do random-walk (padrão 1)
  --weapon <primary|secondary>    arma dos roteiros (padrão primary)
  --axis <x|y>                    eixo do strafe (padrão x)
  --fire-interval-ms <ms>         aim-test: intervalo entre disparos (padrão 300)
  --teleport <x,y>                comando de debug: teleporta ao começar a partida
  --god                           comando de debug: vida infinita
  --no-spread                     comando de debug: dispersão zero nos próprios tiros
  --latency <ms> --jitter <ms> --loss <%>   simulador de lag deste cliente
  --max-corrections-per-min <n>   falha se passar de n correções acima de 4 px por minuto
  --max-other-jump-px <px>        falha se outro jogador saltar mais que isso entre quadros
  --min-hit-ratio <0..1>          falha se acertos confirmados / previstos ficar abaixo disso`;

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
        humans: { type: 'string' },
        weapon: { type: 'string', default: 'primary' },
        axis: { type: 'string', default: 'x' },
        'fire-interval-ms': { type: 'string' },
        teleport: { type: 'string' },
        god: { type: 'boolean', default: false },
        'no-spread': { type: 'boolean', default: false },
        'min-hit-ratio': { type: 'string' },
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

  if (!isWeaponSlot(values.weapon)) {
    throw new ArgsError(`--weapon precisa ser ${WEAPON_SLOTS.join(' ou ')}.`);
  }
  const axis = values.axis;
  if (axis !== 'x' && axis !== 'y') {
    throw new ArgsError('--axis precisa ser x ou y.');
  }

  let room: RoomMode;
  if (values.code !== undefined) {
    if (values.create || values.bots !== undefined || values.wait || values.humans !== undefined) {
      throw new ArgsError('Use --code ou --create (com --bots, --wait e --humans), não os dois.');
    }
    const code = normalizeRoomCode(values.code);
    if (!isValidRoomCode(code)) {
      throw new ArgsError(`Código de sala inválido: "${values.code}".`);
    }
    room = { kind: 'join', code };
  } else {
    const bots =
      number('bots', values.bots, { min: 0, max: LOBBY_CONFIG.maxBots, integer: true }) ?? 0;
    const humans =
      number('humans', values.humans, { min: 1, max: MATCH_CONFIG.maxPlayers, integer: true }) ?? 1;
    room = { kind: 'create', bots, wait: values.wait, humans };
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
    weapon: values.weapon,
    axis,
    fireIntervalMs:
      number('fire-interval-ms', values['fire-interval-ms'], { min: 1 }) ??
      DEV_HEADLESS_CONFIG.defaultFireIntervalMs,
    dev: {
      teleport: parsePoint(values.teleport),
      god: values.god,
      noSpread: values['no-spread'],
    },
    net,
    limits: {
      maxCorrectionsPerMinute: number(
        'max-corrections-per-min',
        values['max-corrections-per-min'],
        { min: 0 },
      ),
      maxOtherJumpPx: number('max-other-jump-px', values['max-other-jump-px'], { min: 0 }),
      minHitRatio: number('min-hit-ratio', values['min-hit-ratio'], { min: 0, max: 1 }),
    },
  };
}

/** `--teleport x,y` em px. */
function parsePoint(value: string | undefined): Vec2 | null {
  if (value === undefined) {
    return null;
  }
  const parts = value.split(',').map((part) => part.trim());
  const [x, y] = parts.map(Number);
  if (
    parts.length !== 2 ||
    parts.some((part) => part === '') ||
    x === undefined ||
    y === undefined ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new ArgsError(`--teleport precisa ser x,y em px (recebido "${value}").`);
  }
  return { x, y };
}
