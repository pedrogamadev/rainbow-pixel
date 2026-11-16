import { describe, expect, it } from 'vitest';
import { BOT_DIFFICULTIES, WEAPON_SLOTS, getWeapon } from '../catalog/index.js';
import { isValidNickname, nicknameKey } from '../validation/index.js';
import {
  BOT_DIFFICULTY_PARAMS,
  BOT_LEVEL0_CONFIG,
  BOT_LEVEL1_CONFIG,
  COMBAT_CONFIG,
  LAG_COMP_CONFIG,
  VISION_CONFIG,
  WEAPON_HANDLING,
  getWeaponHandling,
  DEV_SEED_USERS,
  LOBBY_CONFIG,
  MATCH_CONFIG,
  NET_CONFIG,
  NICKNAME_CONFIG,
  SIM_CONFIG,
} from './index.js';

describe('MATCH_CONFIG', () => {
  it('descreve partidas 2v2', () => {
    expect(MATCH_CONFIG.teamCount).toBe(2);
    expect(MATCH_CONFIG.teamSize).toBe(2);
    expect(MATCH_CONFIG.maxPlayers).toBe(MATCH_CONFIG.teamCount * MATCH_CONFIG.teamSize);
  });

  it('conta 3 segundos antes de iniciar e usa o gym_01 neste marco', () => {
    expect(MATCH_CONFIG.startCountdownSeconds).toBe(3);
    expect(MATCH_CONFIG.mapId).toBe('gym_01');
  });
});

describe('SIM_CONFIG', () => {
  it('segue o escopo: tick de 30 Hz, célula de 8 px e jogador de raio 12 px', () => {
    expect(SIM_CONFIG.tickRate).toBe(30);
    expect(SIM_CONFIG.cellSize).toBe(8);
    expect(SIM_CONFIG.playerRadius).toBe(12);
  });

  it('correr é mais rápido que andar, que é mais rápido que andar lento', () => {
    const { walk, slow, run } = SIM_CONFIG.moveSpeedPxPerSec;
    expect(run).toBeGreaterThan(walk);
    expect(walk).toBeGreaterThan(slow);
  });
});

describe('NET_CONFIG', () => {
  it('amostra um input por tick e manda snapshots a 20 Hz', () => {
    expect(NET_CONFIG.inputRate).toBe(SIM_CONFIG.tickRate);
    expect(NET_CONFIG.snapshotRate).toBe(20);
    expect(NET_CONFIG.snapshotRate).toBeLessThanOrEqual(SIM_CONFIG.tickRate);
  });

  it('aceita o ritmo normal de input com folga, mas não o dobro dela', () => {
    expect(NET_CONFIG.maxInputsPerSecond).toBe(2 * NET_CONFIG.inputRate);
    expect(NET_CONFIG.inputQueueMax).toBeGreaterThanOrEqual(NET_CONFIG.inputRedundancy);
  });

  it('não extrapola além do atraso de interpolação', () => {
    expect(NET_CONFIG.maxExtrapolationMs).toBeLessThanOrEqual(NET_CONFIG.interpolationDelayMs);
    expect(NET_CONFIG.interpolationBufferMs).toBeGreaterThan(NET_CONFIG.interpolationDelayMs);
  });
});

describe('BOT_LEVEL0_CONFIG', () => {
  it('decide a 10 Hz, um número inteiro de ticks por decisão', () => {
    expect(BOT_LEVEL0_CONFIG.decisionRateHz).toBe(10);
    expect(SIM_CONFIG.tickRate % BOT_LEVEL0_CONFIG.decisionRateHz).toBe(0);
  });

});

describe('LOBBY_CONFIG', () => {
  it('sempre deixa vaga para pelo menos um humano', () => {
    expect(LOBBY_CONFIG.maxBots).toBe(MATCH_CONFIG.maxPlayers - 1);
  });

  it('reserva a vaga de quem caiu por 60 segundos', () => {
    expect(LOBBY_CONFIG.reconnectionWindowSeconds).toBe(60);
  });
});

describe('NICKNAME_CONFIG', () => {
  it('limita o nickname entre 3 e 16 caracteres', () => {
    expect(NICKNAME_CONFIG).toEqual({ minLength: 3, maxLength: 16 });
  });
});

describe('DEV_SEED_USERS', () => {
  it('tem uma conta de teste para cada vaga da partida', () => {
    expect(DEV_SEED_USERS).toHaveLength(MATCH_CONFIG.maxPlayers);
    expect(DEV_SEED_USERS.map((user) => user.nickname)).toEqual(['dev1', 'dev2', 'dev3', 'dev4']);
  });

  it('usa e-mails do domínio local, um por nickname', () => {
    for (const user of DEV_SEED_USERS) {
      expect(user.email).toBe(`${user.nickname}@rainbowpixel.local`);
    }
  });

  it('só usa nicknames válidos e distintos', () => {
    for (const user of DEV_SEED_USERS) {
      expect(isValidNickname(user.nickname)).toBe(true);
    }
    const keys = new Set(DEV_SEED_USERS.map((user) => nicknameKey(user.nickname)));
    expect(keys.size).toBe(DEV_SEED_USERS.length);
  });
});

describe('BOT_DIFFICULTY_PARAMS', () => {
  it('tem parâmetros para cada dificuldade do catálogo', () => {
    expect(Object.keys(BOT_DIFFICULTY_PARAMS).sort()).toEqual(
      BOT_DIFFICULTIES.map((difficulty) => difficulty.id).sort(),
    );
  });

  it('fica mais difícil de easy para hard', () => {
    const { easy, medium, hard } = BOT_DIFFICULTY_PARAMS;
    expect(easy.reactionMs).toBeGreaterThan(medium.reactionMs);
    expect(medium.reactionMs).toBeGreaterThan(hard.reactionMs);
    expect(easy.aimErrorDeg).toBeGreaterThan(medium.aimErrorDeg);
    expect(medium.aimErrorDeg).toBeGreaterThan(hard.aimErrorDeg);
    expect(easy.turnSpeedDegPerSec).toBeLessThan(medium.turnSpeedDegPerSec);
    expect(medium.turnSpeedDegPerSec).toBeLessThan(hard.turnSpeedDegPerSec);
    expect(easy.memoryMs).toBeLessThan(medium.memoryMs);
    expect(medium.memoryMs).toBeLessThan(hard.memoryMs);
  });
});

describe('COMBAT_CONFIG', () => {
  it('segue o escopo: vida 100, fogo amigo a 50% e queda até 60% no dobro do alcance', () => {
    expect(COMBAT_CONFIG.maxHealth).toBe(100);
    expect(COMBAT_CONFIG.friendlyFireMultiplier).toBe(0.5);
    expect(COMBAT_CONFIG.damageFalloffMinMultiplier).toBe(0.6);
    expect(COMBAT_CONFIG.damageFalloffEndRangeMultiplier).toBe(2);
  });

  it('usa o loadout fixo do marco: M4A1 na primária e M9 na secundária', () => {
    expect(COMBAT_CONFIG.matchLoadout).toEqual({ primary: 'm4a1', secondary: 'm9' });
    for (const slot of WEAPON_SLOTS) {
      const weapon = getWeapon(COMBAT_CONFIG.matchLoadout[slot]);
      expect(weapon.slot).toBe(slot);
      expect(weapon.enabled).toBe(true);
      expect(weapon.pellets).toBe(1);
    }
  });

  it('troca de arma em 400 ms e renasce em 3 s', () => {
    expect(COMBAT_CONFIG.weaponSwitchMs).toBe(400);
    expect(COMBAT_CONFIG.respawnDelayMs).toBe(3000);
  });
});

describe('WEAPON_HANDLING', () => {
  it('toda arma do loadout da partida tem manuseio', () => {
    for (const slot of WEAPON_SLOTS) {
      const weaponId = COMBAT_CONFIG.matchLoadout[slot];
      expect(() => getWeaponHandling(weaponId)).not.toThrow();
    }
  });

  it('falha para arma sem manuseio', () => {
    expect(() => getWeaponHandling('m249')).toThrow(/m249/);
  });

  it('tem valores coerentes: tetos positivos e padrão de recuo não vazio', () => {
    for (const handling of Object.values(WEAPON_HANDLING)) {
      expect(handling.baseSpreadDeg).toBeGreaterThan(0);
      expect(handling.walkSpreadDeg).toBeGreaterThan(handling.slowSpreadDeg);
      expect(handling.maxShotSpreadDeg).toBeGreaterThanOrEqual(handling.shotSpreadDeg);
      expect(handling.recoilPatternDeg.length).toBeGreaterThan(0);
      expect(handling.maxRecoilDeg).toBeGreaterThan(0);
      expect(handling.spreadRecoveryDegPerSec).toBeGreaterThan(0);
      expect(handling.recoilRecoveryDegPerSec).toBeGreaterThan(0);
    }
  });
});

describe('LAG_COMP_CONFIG', () => {
  it('guarda 300 ms de histórico e volta no máximo 200 ms (escopo, seção 10.1)', () => {
    expect(LAG_COMP_CONFIG).toEqual({ historyMs: 300, maxRewindMs: 200 });
    expect(LAG_COMP_CONFIG.historyMs).toBeGreaterThan(LAG_COMP_CONFIG.maxRewindMs);
  });
});

describe('VISION_CONFIG', () => {
  it('segue a seção 8.1 do escopo', () => {
    expect(VISION_CONFIG).toEqual({ coneDeg: 100, rangePx: 900, peripheralPx: 48 });
  });
});

describe('BOT_LEVEL1_CONFIG', () => {
  it('dispara a até 2° do ponto escolhido, pausa 250 ms entre rajadas e usa a primária', () => {
    expect(BOT_LEVEL1_CONFIG).toEqual({
      fireToleranceDeg: 2,
      burstPauseMs: 250,
      weaponSlot: 'primary',
    });
  });
});

describe('NET_CONFIG: eventos', () => {
  it('repete os eventos dos últimos 3 snapshots', () => {
    expect(NET_CONFIG.eventRedundancySnapshots).toBe(3);
  });
});
