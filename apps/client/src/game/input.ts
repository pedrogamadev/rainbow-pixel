// Teclado e mouse -> input do próximo tick: WASD move, Shift anda lento, Ctrl corre e o mouse
// define a mira em relação ao jogador.

import type { MoveAxis, MoveInput, MoveMode } from '@rainbow-pixel/shared';

/** Teclas com Ctrl que o navegador usaria para outra coisa (salvar, favoritos, selecionar). */
const BLOCKED_WITH_CTRL = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

function axis(negative: boolean, positive: boolean): MoveAxis {
  return positive === negative ? 0 : positive ? 1 : -1;
}

export class KeyboardMouseInput {
  private readonly pressed = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private aimAngle = 0;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.pressed.add(event.code);
    // Ctrl+W fecha a aba e não dá para impedir; Ctrl+S, Ctrl+D e Ctrl+A dá.
    if (event.ctrlKey && BLOCKED_WITH_CTRL.has(event.code)) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
  };

  /** Sem foco, as teclas soltas não chegam: tudo conta como solto. */
  private readonly onBlur = () => {
    this.pressed.clear();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const bounds = this.surface.getBoundingClientRect();
    this.pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    surface.addEventListener('pointermove', this.onPointerMove);
  }

  private isDown(...codes: string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }

  /**
   * Input do tick. `selfOnScreen` é onde o próprio jogador está na tela; a mira aponta dele
   * para o mouse. Sem mouse na tela, a mira fica como estava.
   */
  sample(selfOnScreen: { x: number; y: number } | null): MoveInput {
    if (this.pointer !== null && selfOnScreen !== null) {
      const dx = this.pointer.x - selfOnScreen.x;
      const dy = this.pointer.y - selfOnScreen.y;
      if (dx !== 0 || dy !== 0) {
        this.aimAngle = Math.atan2(dy, dx);
      }
    }
    // Com Shift e Ctrl juntos, vale o andar lento.
    let moveMode: MoveMode = 'walk';
    if (this.isDown('ShiftLeft', 'ShiftRight')) moveMode = 'slow';
    else if (this.isDown('ControlLeft', 'ControlRight')) moveMode = 'run';
    return {
      moveX: axis(this.isDown('KeyA'), this.isDown('KeyD')),
      moveY: axis(this.isDown('KeyW'), this.isDown('KeyS')),
      aimAngle: this.aimAngle,
      moveMode,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.pressed.clear();
  }
}
