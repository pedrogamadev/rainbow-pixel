import { describe, expect, it } from 'vitest';
import { getWeapon } from '../catalog/index.js';
import { damageFalloff, shotDamage } from './damage.js';

const M4A1 = getWeapon('m4a1');

describe('damageFalloff', () => {
  it('dano cheio até o alcance efetivo', () => {
    expect(damageFalloff(480, 0)).toBe(1);
    expect(damageFalloff(480, 480)).toBe(1);
  });

  it('cai linearmente até 60% no dobro do alcance', () => {
    expect(damageFalloff(480, 600)).toBeCloseTo(0.9, 12);
    expect(damageFalloff(480, 720)).toBeCloseTo(0.8, 12);
    expect(damageFalloff(480, 960)).toBeCloseTo(0.6, 12);
  });

  it('piso de 60% depois do dobro do alcance', () => {
    expect(damageFalloff(480, 961)).toBe(0.6);
    expect(damageFalloff(480, 5000)).toBe(0.6);
  });
});

describe('shotDamage', () => {
  it('arredonda o dano final para inteiro', () => {
    expect(shotDamage(M4A1, 960, false)).toBe(19);
    expect(shotDamage(M4A1, 720, false)).toBe(26);
    expect(shotDamage({ damage: 10, rangePx: 100 }, 125, false)).toBe(9);
  });

  it('fogo amigo a 50%', () => {
    expect(shotDamage(M4A1, 100, true)).toBe(16);
    expect(shotDamage(M4A1, 960, true)).toBe(10);
  });

  it('M4A1 mata em 4 acertos dentro de 480 px e não em 3', () => {
    expect(shotDamage(M4A1, 480, false) * 3).toBeLessThan(100);
    expect(shotDamage(M4A1, 480, false) * 4).toBeGreaterThanOrEqual(100);
  });
});
