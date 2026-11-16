// Cérebro dos bots (escopo, seção 16). TypeScript puro: sem DOM, PixiJS, Colyseus nem APIs do
// Node. O bot recebe só a PlayerView e devolve uma intenção (BotIntent), que o servidor numera e
// transforma em InputCommand; nunca lê o estado completo da partida e nunca grava no banco.
export type { BotBrain, BotIntent } from './BotBrain.js';
export type { PlayerView } from './PlayerView.js';
export { createBotMemory } from './memory.js';
export type { BotMemory } from './memory.js';
export { directionTowards, level0Brain } from './levels/level0.js';
