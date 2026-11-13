import { describe, expect, it } from 'vitest';
import {
  BOT_DIFFICULTIES,
  GADGETS,
  MODES,
  OPERATORS,
  SIDES,
  WEAPONS,
  getBotDifficulty,
  isBotDifficultyId,
  isGadgetId,
  isModeId,
  isOperatorId,
  isWeaponId,
} from './index.js';

const catalogs: Record<string, readonly { readonly id: string; readonly name: string }[]> = {
  modes: MODES,
  operators: OPERATORS,
  weapons: WEAPONS,
  gadgets: GADGETS,
  botDifficulties: BOT_DIFFICULTIES,
};

describe('catálogos', () => {
  it.each(Object.entries(catalogs))('%s tem ids únicos e nomes preenchidos', (_name, catalog) => {
    const ids = catalog.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of catalog) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
    }
  });
});

describe('modos', () => {
  it('lista quick, unranked e ranked', () => {
    expect(MODES.map((mode) => mode.id)).toEqual(['quick', 'unranked', 'ranked']);
  });

  it('só quick está habilitado', () => {
    const enabled = MODES.filter((mode) => mode.enabled).map((mode) => mode.id);
    expect(enabled).toEqual(['quick']);
  });
});

describe('operadores', () => {
  it('só existe o recruit', () => {
    expect(OPERATORS.map((operator) => operator.id)).toEqual(['recruit']);
  });

  it('recruit tem todas as armas', () => {
    const [recruit] = OPERATORS;
    expect([...recruit.weaponIds].sort()).toEqual(WEAPONS.map((weapon) => weapon.id).sort());
  });

  it('todo weaponId e gadgetId de operador existe', () => {
    for (const operator of OPERATORS) {
      for (const weaponId of operator.weaponIds) {
        expect(isWeaponId(weaponId)).toBe(true);
      }
      for (const side of SIDES) {
        for (const gadgetId of operator.gadgetIds[side]) {
          expect(isGadgetId(gadgetId)).toBe(true);
        }
      }
    }
  });

  it('gadgets do operador pertencem ao lado certo', () => {
    for (const operator of OPERATORS) {
      for (const side of SIDES) {
        for (const gadgetId of operator.gadgetIds[side]) {
          const gadget = GADGETS.find((item) => item.id === gadgetId);
          expect(gadget?.side).toBe(side);
        }
      }
    }
  });
});

describe('armas', () => {
  it('tem 5 primárias e 3 secundárias', () => {
    expect(WEAPONS.filter((weapon) => weapon.slot === 'primary')).toHaveLength(5);
    expect(WEAPONS.filter((weapon) => weapon.slot === 'secondary')).toHaveLength(3);
  });

  it('usa os ids do marco', () => {
    expect(WEAPONS.map((weapon) => weapon.id)).toEqual([
      'm4a1',
      'mp5',
      'm870',
      'm249',
      'sr-25',
      'm9',
      'magnum-357',
      'skorpion-vz61',
    ]);
  });

  it('só a M870 dispara mais de um projétil', () => {
    for (const weapon of WEAPONS) {
      expect(weapon.pellets).toBe(weapon.id === 'm870' ? 8 : 1);
    }
  });

  it('tem valores numéricos coerentes', () => {
    for (const weapon of WEAPONS) {
      expect(weapon.damage).toBeGreaterThan(0);
      expect(weapon.rpm).toBeGreaterThan(0);
      expect(weapon.magazine).toBeGreaterThan(0);
      expect(weapon.reloadMs).toBeGreaterThan(0);
      expect(weapon.rangePx).toBeGreaterThan(0);
      expect(weapon.penetrationCells).toBeGreaterThanOrEqual(0);
      expect(weapon.mobility).toBeGreaterThan(0);
    }
  });
});

describe('gadgets', () => {
  it('tem os gadgets de ataque e defesa do escopo', () => {
    const bySide = (side: string) =>
      GADGETS.filter((gadget) => gadget.side === side).map((gadget) => gadget.id);
    expect(bySide('attack')).toEqual(['breach_charge', 'drone']);
    expect(bySide('defense')).toEqual(['reinforcement', 'barricade']);
  });

  it('tem quantidade positiva', () => {
    for (const gadget of GADGETS) {
      expect(gadget.quantity).toBeGreaterThan(0);
    }
  });
});

describe('dificuldades de bot', () => {
  it('lista easy, medium e hard com nomes em PT-BR', () => {
    expect(BOT_DIFFICULTIES.map((difficulty) => [difficulty.id, difficulty.name])).toEqual([
      ['easy', 'Fácil'],
      ['medium', 'Médio'],
      ['hard', 'Difícil'],
    ]);
  });

  it('getBotDifficulty devolve a definição', () => {
    expect(getBotDifficulty('medium').name).toBe('Médio');
  });
});

describe('guards de id', () => {
  it('reconhecem ids existentes e recusam os demais', () => {
    expect(isModeId('quick')).toBe(true);
    expect(isModeId('casual')).toBe(false);
    expect(isOperatorId('recruit')).toBe(true);
    expect(isOperatorId('ash')).toBe(false);
    expect(isWeaponId('sr-25')).toBe(true);
    expect(isWeaponId('ak47')).toBe(false);
    expect(isGadgetId('drone')).toBe(true);
    expect(isGadgetId('claymore')).toBe(false);
    expect(isBotDifficultyId('hard')).toBe(true);
    expect(isBotDifficultyId('insane')).toBe(false);
  });
});
