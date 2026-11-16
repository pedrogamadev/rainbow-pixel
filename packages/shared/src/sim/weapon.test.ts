import { describe, expect, it } from 'vitest';
import { getWeapon } from '../catalog/index.js';
import { COMBAT_CONFIG, SIM_CONFIG, WEAPON_HANDLING } from '../config/index.js';
import { hashRandom } from '../random/index.js';
import { TICK_MS } from './movement.js';
import { stepSelf } from './self.js';
import type { SelfStepOptions } from './self.js';
import { openMap } from './testing/asciiMap.js';
import { testInput, testPlayer } from './testing/fixtures.js';
import type { PlayerInput, PlayerSimState, WeaponState } from './types.js';
import { createWeaponState, spreadDeg, stepWeapon } from './weapon.js';

const map = openMap(200, 200);
const M4A1 = getWeapon('m4a1');
const M9 = getWeapon('m9');

function withWeapon(weapon: Partial<WeaponState>): PlayerSimState {
  const player = testPlayer('p', 800, 800);
  return { ...player, weapon: { ...player.weapon, ...weapon } };
}

/** Roda `inputs` em sequência e devolve o estado final e os ticks em que houve disparo. */
function play(
  start: PlayerSimState,
  inputs: readonly PlayerInput[],
  options: (tick: number) => SelfStepOptions = () => ({}),
  everyTick: (state: PlayerSimState) => PlayerSimState = (state) => state,
) {
  let state = start;
  const shotTicks: number[] = [];
  const angles: number[] = [];
  inputs.forEach((input, tick) => {
    const result = stepSelf(map, everyTick(state), input, options(tick));
    state = result.state;
    if (result.shot !== null) {
      shotTicks.push(tick);
      angles.push(result.shot.angle);
    }
  });
  return { state, shotTicks, angles };
}

function repeat(input: PlayerInput, ticks: number): PlayerInput[] {
  return Array.from({ length: ticks }, () => input);
}

const FIRE = testInput({ fire: true });
const FIRE_M9 = testInput({ fire: true, weaponSlot: 'secondary' });
const IDLE = testInput();

describe('cadência', () => {
  it('M4A1 automática: média igual ao RPM em 10 s de gatilho pressionado', () => {
    const ticks = SIM_CONFIG.tickRate * 10;
    // Munição sempre cheia, para medir só a cadência.
    const refill = (state: PlayerSimState) => ({
      ...state,
      weapon: { ...state.weapon, ammo: { ...state.weapon.ammo, primary: M4A1.magazine } },
    });
    const { shotTicks } = play(testPlayer('p', 800, 800), repeat(FIRE, ticks), undefined, refill);
    const expected = (M4A1.rpm / 60) * 10;
    expect(Math.abs(shotTicks.length - expected)).toBeLessThanOrEqual(1);
    // No máximo 1 disparo por tick.
    expect(new Set(shotTicks).size).toBe(shotTicks.length);
  });

  it('o primeiro disparo sai no primeiro tick com o gatilho pressionado', () => {
    expect(play(testPlayer('p', 800, 800), [FIRE]).shotTicks).toEqual([0]);
  });

  it('soltar o gatilho não acumula disparos para depois', () => {
    const inputs = [...repeat(IDLE, 90), ...repeat(FIRE, 3)];
    // Depois de 3 s parado, segura por 3 ticks: 2 disparos (80 ms entre eles), não 3.
    expect(play(testPlayer('p', 800, 800), inputs).shotTicks).toEqual([90, 92]);
  });

  it.each([
    ['M9', FIRE_M9, M9.rpm],
    ['M4A1', FIRE, M4A1.rpm],
  ] as const)('%s com o gatilho alternando a cada tick não passa do RPM', (_name, fire, rpm) => {
    const seconds = 10;
    const inputs = Array.from({ length: SIM_CONFIG.tickRate * seconds }, (_v, tick) =>
      tick % 2 === 0 ? fire : { ...fire, fire: false },
    );
    const refill = (state: PlayerSimState) => ({
      ...state,
      weapon: { ...state.weapon, ammo: { primary: 30, secondary: 15 } },
    });
    const start = withWeapon({ activeSlot: fire.weaponSlot });
    const { shotTicks } = play(start, inputs, undefined, refill);
    expect(shotTicks.length).toBeLessThanOrEqual((rpm / 60) * seconds + 1);
    expect(shotTicks.length).toBeGreaterThan(0);
  });
});

describe('semiautomática', () => {
  it('só dispara na borda do gatilho', () => {
    const start = withWeapon({ activeSlot: 'secondary' });
    const held = play(start, repeat(FIRE_M9, 60));
    expect(held.shotTicks).toEqual([0]);

    const clicks = [
      FIRE_M9,
      ...repeat(testInput({ weaponSlot: 'secondary' }), 5),
      FIRE_M9,
      ...repeat(testInput({ weaponSlot: 'secondary' }), 5),
      FIRE_M9,
    ];
    expect(play(start, clicks).shotTicks).toEqual([0, 6, 12]);
  });

  it('clique durante a espera da cadência se perde', () => {
    const start = withWeapon({ activeSlot: 'secondary' });
    const release = testInput({ weaponSlot: 'secondary' });
    // 450 RPM: 133 ms (4 ticks) entre disparos. O clique no tick 2 cai na espera.
    const { shotTicks } = play(start, [FIRE_M9, release, FIRE_M9, release, release, release]);
    expect(shotTicks).toEqual([0]);
  });
});

describe('recarga', () => {
  it('enche o pente e bloqueia o disparo enquanto recarrega', () => {
    const start = withWeapon({ ammo: { primary: 10, secondary: 15 } });
    const reloadTicks = Math.round(M4A1.reloadMs / TICK_MS);
    const inputs = [testInput({ reload: true }), ...repeat(FIRE, reloadTicks + 1)];
    const { shotTicks, state } = play(start, inputs);
    // Recarrega do tick 0 ao tick 72 (2,4 s); o primeiro disparo sai logo depois.
    expect(shotTicks[0]).toBe(reloadTicks);
    expect(state.weapon.ammo.primary).toBe(M4A1.magazine - shotTicks.length);
  });

  it('não recarrega com o pente cheio', () => {
    const { state } = play(testPlayer('p', 800, 800), [testInput({ reload: true })]);
    expect(state.weapon.reloadLeftMs).toBe(0);
  });

  it('disparar com o pente vazio inicia a recarga', () => {
    const start = withWeapon({ ammo: { primary: 0, secondary: 15 } });
    const { state, shotTicks } = play(start, [FIRE]);
    expect(shotTicks).toEqual([]);
    expect(state.weapon.reloadLeftMs).toBe(M4A1.reloadMs);
  });

  it('a automática esvazia o pente e recarrega sozinha com o gatilho pressionado', () => {
    const start = testPlayer('p', 800, 800);
    const { state, shotTicks } = play(start, repeat(FIRE, 80));
    expect(shotTicks).toHaveLength(M4A1.magazine);
    expect(state.weapon.ammo.primary).toBe(0);
    expect(state.weapon.reloadLeftMs).toBeGreaterThan(0);
  });

  it('cada arma guarda a própria munição', () => {
    const start = withWeapon({ ammo: { primary: 3, secondary: 15 } });
    const { state } = play(start, [testInput({ weaponSlot: 'secondary' })]);
    expect(state.weapon.ammo).toEqual({ primary: 3, secondary: 15 });
  });
});

describe('troca de arma', () => {
  it('cancela a recarga e bloqueia o disparo por 400 ms', () => {
    const start = withWeapon({ activeSlot: 'secondary', ammo: { primary: 30, secondary: 10 } });
    const switchTicks = Math.round(COMBAT_CONFIG.weaponSwitchMs / TICK_MS);
    const inputs = [
      testInput({ reload: true, weaponSlot: 'secondary' }),
      ...repeat(FIRE, switchTicks + 2),
    ];
    const { shotTicks, state } = play(start, inputs);
    // A troca começa no tick 1 e acaba 12 ticks (400 ms) depois.
    expect(shotTicks[0]).toBe(1 + switchTicks);
    expect(state.weapon.activeSlot).toBe('primary');
    expect(state.weapon.reloadLeftMs).toBe(0);
    // A recarga da secundária foi cancelada: o pente continua com 10.
    expect(state.weapon.ammo.secondary).toBe(10);
  });

  it('semiautomática segurada durante a troca precisa de um clique novo', () => {
    const switchTicks = Math.round(COMBAT_CONFIG.weaponSwitchMs / TICK_MS);
    const inputs = [...repeat(FIRE_M9, switchTicks + 2)];
    expect(play(testPlayer('p', 800, 800), inputs).shotTicks).toEqual([]);
  });
});

describe('correr', () => {
  it('bloqueia o tiro e prende a mira na direção do movimento', () => {
    const running = testInput({ fire: true, moveMode: 'run', moveX: 1, moveY: 1, aimAngle: 2 });
    const { shotTicks, state } = play(testPlayer('p', 800, 800), repeat(running, 10));
    expect(shotTicks).toEqual([]);
    expect(state.aimAngle).toBeCloseTo(Math.PI / 4, 9);
    expect(state.weapon.triggerHeld).toBe(false);
  });

  it('correr parado conta como andar: atira e mira livre', () => {
    const still = testInput({ fire: true, moveMode: 'run', aimAngle: 2 });
    const { shotTicks, state } = play(testPlayer('p', 800, 800), [still]);
    expect(shotTicks).toEqual([0]);
    expect(state).toMatchObject({ aimAngle: 2, moveMode: 'walk' });
  });
});

describe('input repetido pelo servidor', () => {
  it('não dispara, não recarrega e não troca de arma, mas move e mira', () => {
    const start = withWeapon({ ammo: { primary: 10, secondary: 15 } });
    const input = testInput({ fire: true, reload: true, moveX: 1, aimAngle: 1 });
    const result = stepSelf(map, start, input, { repeated: true });
    expect(result.shot).toBeNull();
    expect(result.state.weapon.reloadLeftMs).toBe(0);
    expect(result.state.x).toBeGreaterThan(start.x);
    expect(result.state.aimAngle).toBe(1);
    const switched = stepSelf(map, start, testInput({ weaponSlot: 'secondary' }), {
      repeated: true,
    });
    expect(switched.state.weapon).toMatchObject({ activeSlot: 'primary', switchLeftMs: 0 });
  });

  it('não cria borda falsa na semiautomática quando o input real volta', () => {
    const start = withWeapon({ activeSlot: 'secondary' });
    // Real (dispara), repetido, repetido, real ainda pressionado: só 1 disparo.
    const options = (tick: number): SelfStepOptions => ({ repeated: tick === 1 || tick === 2 });
    const { shotTicks, state } = play(start, repeat(FIRE_M9, 8), options);
    expect(shotTicks).toEqual([0]);
    expect(state.weapon.triggerHeld).toBe(true);
  });

  it('mantém o gatilho solto do último input real', () => {
    const weapon = createWeaponState('secondary');
    const repeated = stepWeapon(weapon, {
      input: testInput({ fire: true, weaponSlot: 'secondary' }),
      repeated: true,
      running: false,
      moving: false,
      moveMode: 'walk',
      dtMs: TICK_MS,
      deviation: null,
    });
    expect(repeated.weapon.triggerHeld).toBe(false);
  });
});

describe('dispersão', () => {
  const still = { moving: false, moveMode: 'walk' } as const;
  const m4 = WEAPON_HANDLING.m4a1;

  it('parado, é a dispersão base da arma', () => {
    expect(spreadDeg(createWeaponState(), still)).toBe(m4.baseSpreadDeg);
    expect(spreadDeg(createWeaponState('secondary'), still)).toBe(WEAPON_HANDLING.m9.baseSpreadDeg);
  });

  it('cresce ao andar, menos andando lento', () => {
    const weapon = createWeaponState();
    expect(spreadDeg(weapon, { moving: true, moveMode: 'walk' })).toBe(
      m4.baseSpreadDeg + m4.walkSpreadDeg,
    );
    expect(spreadDeg(weapon, { moving: true, moveMode: 'slow' })).toBe(
      m4.baseSpreadDeg + m4.slowSpreadDeg,
    );
  });

  it('cresce a cada tiro seguido e respeita o máximo', () => {
    const { state } = play(testPlayer('p', 800, 800), repeat(FIRE, 30));
    expect(state.weapon.bloomDeg).toBeCloseTo(m4.maxShotSpreadDeg, 9);
    const afterTwo = play(testPlayer('p', 800, 800), repeat(FIRE, 3));
    expect(afterTwo.state.weapon.bloomDeg).toBeCloseTo(2 * m4.shotSpreadDeg, 9);
  });

  it('o recuo segue o padrão da arma e respeita o máximo', () => {
    const two = play(testPlayer('p', 800, 800), repeat(FIRE, 3));
    expect(two.state.weapon.recoilDeg).toBeCloseTo(1.2 + 1, 9);
    let maxRecoil = 0;
    const track = (state: PlayerSimState) => {
      maxRecoil = Math.max(maxRecoil, Math.abs(state.weapon.recoilDeg));
      return {
        ...state,
        weapon: { ...state.weapon, ammo: { ...state.weapon.ammo, primary: M4A1.magazine } },
      };
    };
    play(testPlayer('p', 800, 800), repeat(FIRE, 90), undefined, track);
    expect(maxRecoil).toBeCloseTo(m4.maxRecoilDeg, 9);
  });

  it('o recuo entra na direção do tiro', () => {
    const { angles } = play(testPlayer('p', 800, 800), repeat(FIRE, 3));
    expect(angles[0]).toBe(0);
    expect(angles[1]).toBeCloseTo((1.2 * Math.PI) / 180, 9);
  });

  it('se recupera depois de parar de atirar, a partir do primeiro tick sem disparo', () => {
    const fired = play(testPlayer('p', 800, 800), repeat(FIRE, 20)).state;
    expect(fired.weapon.bloomDeg).toBeGreaterThan(0);
    // Na espera da cadência logo depois do último disparo, ainda não recupera.
    const waiting = stepSelf(map, fired, IDLE).state;
    if (fired.weapon.cooldownMs > TICK_MS) {
      expect(waiting.weapon.bloomDeg).toBe(fired.weapon.bloomDeg);
    }
    const recovered = play(fired, repeat(IDLE, SIM_CONFIG.tickRate)).state;
    expect(recovered.weapon.bloomDeg).toBe(0);
    expect(recovered.weapon.recoilDeg).toBe(0);
    expect(recovered.weapon.consecutiveShots).toBe(0);
    // Recupera a 10°/s: em 6 ticks (200 ms), 2°.
    const partial = play(withWeapon({ bloomDeg: 4 }), repeat(IDLE, 6)).state;
    expect(partial.weapon.bloomDeg).toBeCloseTo(2, 6);
  });

  it('com a mesma seed, o mesmo desvio; o desvio fica dentro da dispersão', () => {
    const deviation = (seed: number) => (shotIndex: number) =>
      hashRandom(seed, 0, shotIndex) * 2 - 1;
    const first = play(testPlayer('p', 800, 800), repeat(FIRE, 30), () => ({
      deviation: deviation(9),
    }));
    const second = play(testPlayer('p', 800, 800), repeat(FIRE, 30), () => ({
      deviation: deviation(9),
    }));
    const other = play(testPlayer('p', 800, 800), repeat(FIRE, 30), () => ({
      deviation: deviation(10),
    }));
    const noDeviation = play(testPlayer('p', 800, 800), repeat(FIRE, 30));
    expect(second.angles).toEqual(first.angles);
    expect(other.angles).not.toEqual(first.angles);
    first.angles.forEach((angle, index) => {
      const offsetDeg = ((angle - (noDeviation.angles[index] ?? 0)) * 180) / Math.PI;
      expect(Math.abs(offsetDeg)).toBeLessThanOrEqual(
        m4.baseSpreadDeg + m4.maxShotSpreadDeg + 1e-9,
      );
    });
    // O primeiro disparo usa o desvio do shotCount 0.
    expect(((first.angles[0] ?? 0) * 180) / Math.PI).toBeCloseTo(
      (hashRandom(9, 0, 0) * 2 - 1) * m4.baseSpreadDeg,
      9,
    );
  });
});
