import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { InputCommand } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import {
  createInputQueue,
  enqueueInputs,
  parseInputCommand,
  stopInputs,
  takeTickInput,
} from './inputQueue.js';
import type { InputQueueState } from './inputQueue.js';

function input(seq: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return { seq, moveX: 1, moveY: 0, aimAngle: 0, moveMode: 'walk', ...overrides };
}

function enqueue(state: InputQueueState, inputs: readonly unknown[], nowMs = 0): InputQueueState {
  return enqueueInputs(state, inputs, nowMs).state;
}

function seqs(state: InputQueueState): number[] {
  return state.queue.map((item) => item.seq);
}

describe('parseInputCommand', () => {
  it('aceita um input válido', () => {
    expect(parseInputCommand(input(1))).toEqual(input(1));
  });

  it('normaliza moveX e moveY para -1, 0 ou 1', () => {
    expect(parseInputCommand({ ...input(1), moveX: 5, moveY: -0.2 })).toMatchObject({
      moveX: 1,
      moveY: -1,
    });
    expect(parseInputCommand({ ...input(1), moveX: Number.NaN, moveY: 'x' })).toMatchObject({
      moveX: 0,
      moveY: 0,
    });
    expect(parseInputCommand({ ...input(1), moveX: -Infinity, moveY: 0 })).toMatchObject({
      moveX: -1,
      moveY: 0,
    });
  });

  it('recusa aimAngle não finito, moveMode desconhecido e seq inválido', () => {
    expect(parseInputCommand({ ...input(1), aimAngle: Number.NaN })).toBeNull();
    expect(parseInputCommand({ ...input(1), aimAngle: Infinity })).toBeNull();
    expect(parseInputCommand({ ...input(1), aimAngle: '1' })).toBeNull();
    expect(parseInputCommand({ ...input(1), moveMode: 'fly' })).toBeNull();
    expect(parseInputCommand({ ...input(1), seq: 0 })).toBeNull();
    expect(parseInputCommand({ ...input(1), seq: 1.5 })).toBeNull();
    expect(parseInputCommand(null)).toBeNull();
    expect(parseInputCommand('input')).toBeNull();
  });
});

describe('enqueueInputs', () => {
  it('descarta seq repetido ou antigo (cópias redundantes)', () => {
    let state = enqueue(createInputQueue(), [input(1), input(2), input(3)]);
    const result = enqueueInputs(state, [input(2), input(3), input(4)], 33);
    state = result.state;
    expect(seqs(state)).toEqual([1, 2, 3, 4]);
    expect(result).toMatchObject({ accepted: 1, dropped: 2 });
    expect(seqs(enqueue(state, [input(1)]))).toEqual([1, 2, 3, 4]);
  });

  it('descarta seq já processado', () => {
    let state = enqueue(createInputQueue(), [input(1), input(2)]);
    state = takeTickInput(takeTickInput(state).state).state;
    expect(state.lastProcessedSeq).toBe(2);
    expect(seqs(enqueue(state, [input(2), input(1)]))).toEqual([]);
  });

  it('aceita inputs fora de ordem dentro da mesma mensagem', () => {
    expect(seqs(enqueue(createInputQueue(), [input(3), input(1), input(2)]))).toEqual([1, 2, 3]);
  });

  it('guarda no máximo 8 inputs; os mais antigos saem', () => {
    const many = Array.from({ length: 12 }, (_value, index) => input(index + 1));
    const state = enqueue(createInputQueue(), many);
    expect(seqs(state)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(state.queue).toHaveLength(NET_CONFIG.inputQueueMax);
  });

  it('descarta o que passar de 60 inputs novos por segundo', () => {
    let state = createInputQueue();
    // 120 inputs em menos de 1 s, um a cada 8,33 ms.
    for (let index = 0; index < 120; index += 1) {
      state = enqueue(state, [input(index + 1)], index * (1000 / 120));
    }
    expect(state.rateWindowCount).toBe(NET_CONFIG.maxInputsPerSecond);
    // Os inputs 61 a 120 não entraram: na fila ficam os 8 últimos aceitos.
    expect(seqs(state)).toEqual([53, 54, 55, 56, 57, 58, 59, 60]);
    // Na janela seguinte, volta a aceitar.
    expect(enqueueInputs(state, [input(500)], 1000).accepted).toBe(1);
  });

  it('não conta cópias repetidas no limite de taxa', () => {
    let state = createInputQueue();
    for (let seq = 1; seq <= 30; seq += 1) {
      // Como o cliente: cada mensagem leva os 3 últimos inputs.
      state = enqueue(
        state,
        [input(seq - 2), input(seq - 1), input(seq)].filter((item) => item.seq > 0),
        seq * 33,
      );
      state = takeTickInput(state).state;
    }
    expect(state.lastProcessedSeq).toBe(30);
    expect(state.rateWindowCount).toBe(30);
  });

  it('ignora entradas inválidas sem perder as válidas', () => {
    const result = enqueueInputs(createInputQueue(), [input(1), { seq: 2 }, 'x', input(3)], 0);
    expect(seqs(result.state)).toEqual([1, 3]);
    expect(result.dropped).toBe(2);
  });
});

describe('takeTickInput', () => {
  it('consome 1 input por tick e registra o ackSeq', () => {
    let state = enqueue(createInputQueue(), [input(1), input(2)]);
    const first = takeTickInput(state);
    expect(first.input?.seq).toBe(1);
    expect(first.state.lastProcessedSeq).toBe(1);
    state = first.state;
    expect(takeTickInput(state).input?.seq).toBe(2);
  });

  it('sem input na fila, repete o último por até 3 ticks e depois para', () => {
    let state = takeTickInput(enqueue(createInputQueue(), [input(1, { moveY: 1 })])).state;
    const applied: (InputCommand | null)[] = [];
    for (let tick = 0; tick < 5; tick += 1) {
      const result = takeTickInput(state);
      applied.push(result.input);
      state = result.state;
    }
    expect(applied.slice(0, NET_CONFIG.inputRepeatTicks).every((item) => item?.seq === 1)).toBe(
      true,
    );
    expect(applied.slice(NET_CONFIG.inputRepeatTicks)).toEqual([null, null]);
    // A repetição não confirma seq novo.
    expect(state.lastProcessedSeq).toBe(1);
  });

  it('marca o input repetido, que não vale como ação', () => {
    let state = enqueue(createInputQueue(), [input(1)]);
    const real = takeTickInput(state);
    expect(real.repeated).toBe(false);
    state = real.state;
    const repeated = takeTickInput(state);
    expect(repeated.repeated).toBe(true);
    expect(repeated.input?.seq).toBe(1);
    state = enqueue(repeated.state, [input(2)]);
    expect(takeTickInput(state).repeated).toBe(false);
  });

  it('um input novo depois da repetição volta a valer', () => {
    let state = takeTickInput(enqueue(createInputQueue(), [input(1)])).state;
    state = takeTickInput(state).state;
    state = enqueue(state, [input(2, { moveX: -1 })]);
    expect(takeTickInput(state).input).toMatchObject({ seq: 2, moveX: -1 });
  });

  it('sem nenhum input ainda, fica parado', () => {
    expect(takeTickInput(createInputQueue()).input).toBeNull();
  });
});

describe('stopInputs', () => {
  it('esvazia a fila e para na hora, mantendo o ackSeq', () => {
    let state = enqueue(createInputQueue(), [input(1), input(2), input(3)]);
    state = stopInputs(takeTickInput(state).state);
    expect(state.queue).toEqual([]);
    expect(state.lastProcessedSeq).toBe(1);
    expect(takeTickInput(state).input).toBeNull();
  });
});
