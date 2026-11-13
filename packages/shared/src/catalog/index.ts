import { BOT_DIFFICULTIES, type BotDifficultyId } from './botDifficulties.js';
import { GADGETS, type GadgetId } from './gadgets.js';
import { MODES, type ModeId } from './modes.js';
import { OPERATORS, type OperatorId } from './operators.js';
import { WEAPONS, type WeaponId } from './weapons.js';

export * from './botDifficulties.js';
export * from './gadgets.js';
export * from './modes.js';
export * from './operators.js';
export * from './sides.js';
export * from './weapons.js';

function findById<T extends { readonly id: string }>(
  catalog: readonly T[],
  id: string,
): T | undefined {
  return catalog.find((item) => item.id === id);
}

export function isModeId(id: string): id is ModeId {
  return findById(MODES, id) !== undefined;
}

export function isOperatorId(id: string): id is OperatorId {
  return findById(OPERATORS, id) !== undefined;
}

export function isWeaponId(id: string): id is WeaponId {
  return findById(WEAPONS, id) !== undefined;
}

export function isGadgetId(id: string): id is GadgetId {
  return findById(GADGETS, id) !== undefined;
}

export function isBotDifficultyId(id: string): id is BotDifficultyId {
  return findById(BOT_DIFFICULTIES, id) !== undefined;
}

export function getBotDifficulty(id: BotDifficultyId): (typeof BOT_DIFFICULTIES)[number] {
  const difficulty = findById(BOT_DIFFICULTIES, id);
  if (!difficulty) {
    throw new Error(`Dificuldade de bot desconhecida: ${id}`);
  }
  return difficulty;
}
