// Uma execução do cliente headless: entra na sala, espera a partida, roda o roteiro de input
// com a mesma conexão de jogo do cliente web (GameClient) e devolve as métricas.

import { Client } from '@colyseus/sdk';
import { createCollisionGrid, getMap } from '@rainbow-pixel/maps';
import {
  ClientMessageType,
  DEV_HEADLESS_CONFIG,
  QUICK_MATCH_ROOM_NAME,
  ServerMessageType,
  TICK_MS,
} from '@rainbow-pixel/shared';
import type {
  AddBotPayload,
  DevCommand,
  DevNetSettings,
  LobbyErrorPayload,
  MatchCountdownMessage,
  PongMessage,
  QuickMatchJoinOptions,
  QuickMatchState,
  SnapshotMessage,
  TeamIndex,
  WeaponSlot,
} from '@rainbow-pixel/shared';
import { GameClient } from '../../../apps/client/src/game/GameClient.js';
import type { GameTransport } from '../../../apps/client/src/game/GameClient.js';
import type { DevCommandOptions, RoomMode } from './args.js';
import { MetricsCollector } from './metrics.js';
import type { MetricsLimits, MetricsSummary } from './metrics.js';
import type { InputScript, StrafeAxis } from './scripts/index.js';

export interface SessionOptions {
  readonly serverUrl: string;
  readonly accessToken: string;
  readonly room: RoomMode;
  readonly script: InputScript;
  readonly durationSeconds: number;
  readonly weapon: WeaponSlot;
  readonly axis: StrafeAxis;
  readonly fireIntervalMs: number;
  /** Comandos de debug mandados quando a partida começa. */
  readonly dev: DevCommandOptions;
  readonly net: DevNetSettings | null;
  readonly limits: MetricsLimits;
  /** Mensagens de andamento (stderr): o resumo em JSON fica sozinho no stdout. */
  readonly log: (message: string) => void;
}

export interface SessionResult {
  readonly code: string;
  readonly playerId: string;
  /** A partida acabou (ou a conexão caiu) antes do fim do roteiro. */
  readonly endedEarly: boolean;
  readonly summary: MetricsSummary;
}

/** Mensagens que o servidor manda; todas são ouvidas desde a entrada para nenhuma se perder. */
const SERVER_MESSAGES = Object.values(ServerMessageType);

/** Repassa as mensagens da sala para quem estiver ouvindo (GameClient, métricas, log). */
class MessageHub implements GameTransport {
  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();

  constructor(private readonly room: { send(type: string, payload: unknown): void }) {}

  dispatch(type: string, payload: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
  }

  send(type: string, payload: unknown): void {
    this.room.send(type, payload);
  }

  onMessage(type: string, handler: (payload: unknown) => void): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }
}

/** Time de cada bot criado pelo headless (o host fica no time 0): fecha o 2v2. */
const BOT_TEAMS: readonly TeamIndex[] = [1, 0, 1];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Comandos de debug na ordem em que vão ao servidor. */
export function devCommands(options: DevCommandOptions): DevCommand[] {
  const commands: DevCommand[] = [];
  if (options.teleport !== null) {
    commands.push({ kind: 'teleport', ...options.teleport });
  }
  if (options.god) {
    commands.push({ kind: 'god', enabled: true });
  }
  if (options.noSpread) {
    commands.push({ kind: 'no_spread', enabled: true });
  }
  return commands;
}

/** Humanos prontos na sala. */
function readyHumans(state: QuickMatchState | undefined): number {
  let count = 0;
  state?.players.forEach((player) => {
    if (player.kind === 'human' && player.ready && player.connected) count += 1;
  });
  return count;
}

export async function runSession(options: SessionOptions): Promise<SessionResult> {
  const { log, room: mode } = options;
  const client = new Client(options.serverUrl);
  const joinOptions: QuickMatchJoinOptions = { accessToken: options.accessToken };
  const room =
    mode.kind === 'create'
      ? await client.create<QuickMatchState>(QUICK_MATCH_ROOM_NAME, joinOptions)
      : await client.joinById<QuickMatchState>(mode.code, joinOptions);
  log(`na sala ${room.roomId} como ${room.sessionId}`);

  const hub = new MessageHub(room);
  for (const type of SERVER_MESSAGES) {
    room.onMessage(type, (payload: unknown) => hub.dispatch(type, payload));
  }
  hub.onMessage(ServerMessageType.LobbyError, (payload) => {
    log(`servidor recusou um pedido: ${(payload as LobbyErrorPayload).message}`);
  });
  hub.onMessage(ServerMessageType.MatchCountdown, (payload) => {
    const { secondsLeft } = payload as MatchCountdownMessage;
    log(secondsLeft === null ? 'contagem cancelada' : `partida em ${secondsLeft}...`);
  });
  let left = false;
  room.onLeave(() => {
    left = true;
  });

  try {
    if (options.net !== null) {
      room.send(ClientMessageType.DevSetNet, options.net);
    }
    if (mode.kind === 'create') {
      for (let index = 0; index < mode.bots; index += 1) {
        const bot: AddBotPayload = { team: BOT_TEAMS[index] ?? 1, difficulty: 'easy' };
        room.send(ClientMessageType.AddBot, bot);
      }
    }
    room.send(ClientMessageType.ToggleReady);

    const deadline = performance.now() + DEV_HEADLESS_CONFIG.matchWaitTimeoutSeconds * 1000;
    let forced = false;
    if (mode.kind === 'create' && !mode.wait && mode.humans > 1) {
      log(`esperando ${mode.humans} humanos prontos (código ${room.roomId})`);
    }
    while ((room.state as QuickMatchState | undefined)?.phase !== 'match') {
      if (left || performance.now() > deadline) {
        throw new Error('A partida não começou a tempo.');
      }
      // Host sem --wait: inicia assim que houver os humanos pedidos (--humans), prontos.
      const humansReady = readyHumans(room.state as QuickMatchState | undefined);
      if (mode.kind === 'create' && !mode.wait && !forced && humansReady >= mode.humans) {
        forced = true;
        room.send(ClientMessageType.DevForceStart);
      }
      await sleep(50);
    }
    const state = room.state as QuickMatchState;
    log(`partida no ${state.mapId}; roteiro por ${options.durationSeconds} s`);
    for (const command of devCommands(options.dev)) {
      room.send(ClientMessageType.DevCommand, command);
    }

    const now = () => performance.now();
    const game = new GameClient({
      transport: hub,
      map: createCollisionGrid(getMap(state.mapId)),
      selfId: room.sessionId,
      now,
    });
    const durationMs = options.durationSeconds * 1000;
    const metrics = new MetricsCollector();
    const map = createCollisionGrid(getMap(state.mapId));
    game.onCorrection((correction) => metrics.correction(correction.errorPx));
    hub.onMessage(ServerMessageType.Snapshot, (payload) =>
      metrics.snapshot(now(), payload as SnapshotMessage, room.sessionId),
    );
    hub.onMessage(ServerMessageType.Pong, (payload) => {
      metrics.rtt(now() - (payload as PongMessage).clientTimeMs);
    });

    const startedAt = now();
    let tick = 0;
    const endedEarly = await new Promise<boolean>((resolve) => {
      const timer = setInterval(() => {
        game.update((self) => {
          const current = tick;
          tick += 1;
          return options.script(current, {
            elapsedMs: current * TICK_MS,
            durationMs,
            weaponSlot: options.weapon,
            fireIntervalMs: options.fireIntervalMs,
            axis: options.axis,
            self,
            others: () => game.renderOthers(),
            map,
          });
        });
        metrics.frame(game.renderOthers());
        const finished = now() - startedAt >= options.durationSeconds * 1000;
        const interrupted = left || (room.state as QuickMatchState).phase !== 'match';
        if (finished || interrupted) {
          clearInterval(timer);
          resolve(!finished);
        }
      }, 1000 / DEV_HEADLESS_CONFIG.frameRate);
    });
    game.dispose();

    const summary = metrics.summary((now() - startedAt) / 1000, options.limits, game.shotStats());
    return { code: room.roomId, playerId: room.sessionId, endedEarly, summary };
  } finally {
    if (!left) {
      await room.leave().catch(() => {});
    }
  }
}
