// Comandos de debug da partida (ferramenta de teste, escopo, seção 17), sempre aplicados a quem
// envia: teleporte, vida infinita e dispersão zero. Só existem com DEV_TOOLS=true.

import type { DevCommand, LobbyErrorCode } from '@rainbow-pixel/shared';
import { z } from 'zod';

const devCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('teleport'), x: z.number().finite(), y: z.number().finite() }),
  z.object({ kind: z.literal('god'), enabled: z.boolean() }),
  z.object({ kind: z.literal('no_spread'), enabled: z.boolean() }),
]);

/** Valida a mensagem. `null`: forma inválida. */
export function parseDevCommand(payload: unknown): DevCommand | null {
  const parsed = devCommandSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** O que os comandos de debug mexem na partida. */
export interface DevCommandTarget {
  /** Move o jogador se a posição não colide com parede. Devolve se moveu. */
  teleport(playerId: string, x: number, y: number): boolean;
  setGod(playerId: string, enabled: boolean): void;
  setNoSpread(playerId: string, enabled: boolean): void;
}

export type DevCommandResult =
  { readonly ok: true } | { readonly ok: false; readonly error: LobbyErrorCode };

export interface DevCommandRequest {
  /** DEV_TOOLS=true no servidor. */
  readonly devTools: boolean;
  /** Partida em andamento. `null` no lobby. */
  readonly match: DevCommandTarget | null;
  /** Quem enviou: o comando vale sempre para ele. */
  readonly playerId: string;
  readonly payload: unknown;
}

export function handleDevCommand(request: DevCommandRequest): DevCommandResult {
  if (!request.devTools) {
    return { ok: false, error: 'dev_tools_disabled' };
  }
  const command = parseDevCommand(request.payload);
  if (command === null) {
    return { ok: false, error: 'invalid_payload' };
  }
  const { match, playerId } = request;
  if (match === null) {
    return { ok: false, error: 'match_not_started' };
  }
  switch (command.kind) {
    case 'teleport':
      return match.teleport(playerId, command.x, command.y)
        ? { ok: true }
        : { ok: false, error: 'teleport_blocked' };
    case 'god':
      match.setGod(playerId, command.enabled);
      return { ok: true };
    case 'no_spread':
      match.setNoSpread(playerId, command.enabled);
      return { ok: true };
  }
}
