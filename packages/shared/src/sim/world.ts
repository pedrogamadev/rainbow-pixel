// Um tick do mundo inteiro, na ordem do marco 0.3:
// 1. inputs de cada jogador (o servidor entrega a fila; bots já enfileiraram);
// 2. movimento dos vivos (stepPlayer);
// 3. arma dos vivos (stepWeapon), gerando os disparos a partir da posição nova;
// 4. resolução dos disparos contra os alvos de `targetsForShot` (padrão: posições atuais; o
//    servidor fornece as posições compensadas);
// 5. dano e mortes aplicados juntos;
// 6. renascimentos devidos;
// 7. devolve os disparos e acertos do tick, para o servidor montar os eventos.
// Jogadores não colidem entre si neste marco.

import { getWeapon } from '../catalog/index.js';
import { COMBAT_CONFIG } from '../config/index.js';
import { hashRandom } from '../random/index.js';
import type { CollisionMap } from './collision.js';
import { shotDamage } from './damage.js';
import { hitscan } from './hitscan.js';
import type { ShotTarget } from './hitscan.js';
import { TICK_MS, TICK_SECONDS } from './movement.js';
import { stepSelf } from './self.js';
import type { PlayerInput, PlayerSimState, ShotFired, Vec2 } from './types.js';
import { respawnWeaponState } from './weapon.js';

export interface SimWorld {
  readonly map: CollisionMap;
  /** Ticks já simulados. */
  readonly tick: number;
  readonly players: readonly PlayerSimState[];
  /** Ponto de renascimento de cada jogador, pelo playerId. */
  readonly spawns: ReadonlyMap<string, Vec2>;
}

/** Ticks entre a morte e o renascimento (renascimento temporário do marco 0.3). */
export const RESPAWN_TICKS = Math.round(COMBAT_CONFIG.respawnDelayMs / TICK_MS);

/** Sem `spawns`, cada jogador renasce onde começou. */
export function createWorld(
  map: CollisionMap,
  players: readonly PlayerSimState[],
  spawns?: ReadonlyMap<string, Vec2>,
): SimWorld {
  return {
    map,
    tick: 0,
    players,
    spawns:
      spawns ?? new Map(players.map((player) => [player.playerId, { x: player.x, y: player.y }])),
  };
}

/** Input de um jogador no tick. */
export interface WorldInput {
  readonly input: PlayerInput;
  /** Repetição do último input pelo servidor, com a fila vazia: não vale como ação. */
  readonly repeated?: boolean;
}

export interface WorldStepOptions {
  /** Duração do tick, em segundos. Padrão: um tick da simulação. */
  readonly dt?: number;
  /** Semente da partida, para o desvio dos tiros. `null`: desvio 0. */
  readonly seed?: number | null;
  /**
   * Onde cada alvo estava para este disparo. `current` são os vivos (menos o atirador) nas
   * posições depois do movimento do tick. Padrão: `current`. O servidor devolve as posições
   * compensadas pelo lag; quem não está na lista não é atingido.
   */
  readonly targetsForShot?: (
    shot: ShotFired,
    current: readonly ShotTarget[],
  ) => readonly ShotTarget[];
  /** Vida infinita (comando de debug): o dano é calculado, mas não desconta vida. */
  readonly isInvulnerable?: (playerId: string) => boolean;
  /** Dispersão zerada (comando de debug): o desvio sorteado dos tiros dele é 0. */
  readonly hasNoSpread?: (playerId: string) => boolean;
}

export interface ShotHit {
  readonly targetId: string;
  readonly damage: number;
  /** Este acerto matou o alvo. */
  readonly killed: boolean;
  /** Alvo do mesmo time do atirador. */
  readonly friendly: boolean;
}

/** Um disparo do tick, já resolvido. */
export interface ResolvedShot extends ShotFired {
  /** Onde o raio parou. */
  readonly end: Vec2;
  /** `null`: o raio parou na parede. */
  readonly hit: ShotHit | null;
}

export interface WorldStepResult {
  readonly world: SimWorld;
  /** Disparos do tick, em ordem de playerId do atirador. */
  readonly shots: readonly ResolvedShot[];
  /** Jogadores que renasceram neste tick. */
  readonly respawned: readonly string[];
}

/** Sem input, o jogador fica parado com a mesma mira, sem ações e com o mesmo gatilho. */
function idleInput(player: PlayerSimState): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimAngle: player.aimAngle,
    moveMode: player.moveMode,
    fire: false,
    reload: false,
    weaponSlot: player.weapon.activeSlot,
  };
}

function byPlayerId(a: { readonly shooterId: string }, b: { readonly shooterId: string }): number {
  return a.shooterId < b.shooterId ? -1 : a.shooterId > b.shooterId ? 1 : 0;
}

/** Avança o mundo um tick. Função pura: o mesmo mundo, inputs e seed dão o mesmo resultado. */
export function stepWorld(
  world: SimWorld,
  inputsByPlayer: ReadonlyMap<string, WorldInput>,
  options: WorldStepOptions = {},
): WorldStepResult {
  const tick = world.tick + 1;
  const seed = options.seed ?? null;

  // 1 a 3: movimento e arma dos vivos.
  const fired: ShotFired[] = [];
  const moved = world.players.map((player, index) => {
    const given = inputsByPlayer.get(player.playerId);
    const deviation =
      seed === null || options.hasNoSpread?.(player.playerId) === true
        ? null
        : (shotIndex: number) => hashRandom(seed, index, shotIndex) * 2 - 1;
    const { state, shot } = stepSelf(world.map, player, given?.input ?? idleInput(player), {
      dt: options.dt ?? TICK_SECONDS,
      repeated: given === undefined || given.repeated === true,
      deviation,
    });
    if (shot !== null) {
      fired.push(shot);
    }
    return state;
  });
  fired.sort(byPlayerId);

  // 4: cada disparo contra os alvos vivos, sem o atirador.
  const byId = new Map(moved.map((player) => [player.playerId, player]));
  const resolved = fired.map((shot) => {
    const current: ShotTarget[] = moved
      .filter((player) => player.alive && player.playerId !== shot.shooterId)
      .map((player) => ({ playerId: player.playerId, x: player.x, y: player.y }));
    const candidates = (options.targetsForShot?.(shot, current) ?? current).filter(
      (target) => target.playerId !== shot.shooterId && byId.get(target.playerId)?.alive === true,
    );
    return { shot, result: hitscan(world.map, shot.origin, shot.angle, candidates) };
  });

  // 5: dano e mortes, todos juntos, na ordem dos atiradores.
  const health = new Map(moved.map((player) => [player.playerId, player.health]));
  const killedNow = new Set<string>();
  const shots: ResolvedShot[] = resolved.map(({ shot, result }) => {
    const target = result.target;
    const shooter = byId.get(shot.shooterId);
    const victim = target === null ? undefined : byId.get(target.playerId);
    if (target === null || shooter === undefined || victim === undefined) {
      return { ...shot, end: result.end, hit: null };
    }
    const friendly = victim.team === shooter.team;
    const distance = Math.hypot(target.x - shot.origin.x, target.y - shot.origin.y);
    const damage = shotDamage(getWeapon(shot.weaponId), distance, friendly);
    let killed = false;
    if (options.isInvulnerable?.(victim.playerId) !== true && !killedNow.has(victim.playerId)) {
      const left = (health.get(victim.playerId) ?? 0) - damage;
      health.set(victim.playerId, Math.max(0, left));
      if (left <= 0) {
        killed = true;
        killedNow.add(victim.playerId);
      }
    }
    return {
      ...shot,
      end: result.end,
      hit: { targetId: victim.playerId, damage, killed, friendly },
    };
  });

  // 5 e 6: aplica a vida, as mortes e os renascimentos devidos.
  const respawned: string[] = [];
  const players = moved.map((player): PlayerSimState => {
    if (killedNow.has(player.playerId)) {
      return { ...player, health: 0, alive: false, respawnAtTick: tick + RESPAWN_TICKS };
    }
    if (!player.alive && player.respawnAtTick !== null && tick >= player.respawnAtTick) {
      respawned.push(player.playerId);
      const spawn = world.spawns.get(player.playerId) ?? player;
      return {
        ...player,
        x: spawn.x,
        y: spawn.y,
        moveMode: 'walk',
        health: COMBAT_CONFIG.maxHealth,
        alive: true,
        respawnAtTick: null,
        weapon: respawnWeaponState(player.weapon),
      };
    }
    const left = health.get(player.playerId) ?? player.health;
    return left === player.health ? player : { ...player, health: left };
  });

  return { world: { ...world, tick, players }, shots, respawned };
}
