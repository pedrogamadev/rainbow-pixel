// Eventos da partida (tiros, acertos, dano e abates), com eventId crescente e redundância por
// cliente: cada snapshot leva os eventos novos daquele cliente e repete os dos últimos
// NET_CONFIG.eventRedundancySnapshots snapshots dele. O cliente descarta o eventId já visto.
// Cada evento tem destinatário: hit_confirm só para o atirador e damage_taken só para a vítima.

import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { MatchEvent, ResolvedShot } from '@rainbow-pixel/shared';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Evento ainda sem número. */
export type EventBody = DistributiveOmit<MatchEvent, 'eventId'>;

/** Um evento ainda sem número e para quem ele vai: todos ou um jogador só. */
export interface PendingEvent {
  readonly body: EventBody;
  readonly to: 'all' | string;
}

/** Eventos de um tick, montados a partir dos disparos resolvidos pelo mundo. */
export function eventsFromShots(
  tick: number,
  shots: readonly ResolvedShot[],
  seqOf: (shooterId: string) => number,
): PendingEvent[] {
  const events: PendingEvent[] = [];
  for (const shot of shots) {
    events.push({
      to: 'all',
      body: {
        kind: 'shot',
        tick,
        shooterId: shot.shooterId,
        weaponId: shot.weaponId,
        origin: shot.origin,
        end: shot.end,
      },
    });
    const hit = shot.hit;
    if (hit === null) {
      continue;
    }
    events.push({
      to: shot.shooterId,
      body: {
        kind: 'hit_confirm',
        tick,
        seq: seqOf(shot.shooterId),
        targetId: hit.targetId,
        damage: hit.damage,
        killed: hit.killed,
      },
    });
    events.push({
      to: hit.targetId,
      body: { kind: 'damage_taken', tick, damage: hit.damage, origin: shot.origin },
    });
    if (hit.killed) {
      events.push({
        to: 'all',
        body: {
          kind: 'kill',
          tick,
          killerId: shot.shooterId,
          victimId: hit.targetId,
          weaponId: shot.weaponId,
        },
      });
    }
  }
  return events;
}

interface Mailbox {
  /** Eventos ainda não enviados a este cliente. */
  pending: MatchEvent[];
  /** Eventos novos de cada um dos últimos snapshots, do mais antigo ao mais novo. */
  recent: (readonly MatchEvent[])[];
}

/** Numera os eventos e guarda, por cliente, o que ainda vai e o que se repete. */
export class EventLog {
  private nextEventId = 1;
  private readonly mailboxes = new Map<string, Mailbox>();

  constructor(private readonly redundancy: number = NET_CONFIG.eventRedundancySnapshots) {}

  /** Passa a guardar eventos para `viewerId` (cliente conectado). */
  open(viewerId: string): void {
    if (!this.mailboxes.has(viewerId)) {
      this.mailboxes.set(viewerId, { pending: [], recent: [] });
    }
  }

  /** Deixa de guardar eventos para `viewerId` (desconectou, saiu ou é bot). */
  close(viewerId: string): void {
    this.mailboxes.delete(viewerId);
  }

  /** Numera os eventos e entrega a cada cliente aberto os que são para ele. */
  publish(events: readonly PendingEvent[]): void {
    for (const { body, to } of events) {
      const event = { ...body, eventId: this.nextEventId } as MatchEvent;
      this.nextEventId += 1;
      for (const [viewerId, mailbox] of this.mailboxes) {
        if (to === 'all' || to === viewerId) {
          mailbox.pending.push(event);
        }
      }
    }
  }

  /**
   * Eventos do snapshot de `viewerId`: os dos últimos snapshots dele, repetidos, e os novos,
   * em ordem de eventId.
   */
  takeForSnapshot(viewerId: string): MatchEvent[] {
    const mailbox = this.mailboxes.get(viewerId);
    if (mailbox === undefined) {
      return [];
    }
    const fresh = mailbox.pending;
    mailbox.pending = [];
    const events = [...mailbox.recent.flat(), ...fresh];
    mailbox.recent.push(fresh);
    while (mailbox.recent.length > this.redundancy) {
      mailbox.recent.shift();
    }
    return events;
  }
}
