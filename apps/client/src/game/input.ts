// Teclado e mouse -> input do próximo tick: WASD move, Shift anda lento, Ctrl corre, o mouse
// define a mira em relação ao jogador, o botão esquerdo atira (segurar para a automática),
// R recarrega e 1 e 2 trocam entre a primária e a secundária.

import type { MoveAxis, MoveMode, PlayerInput, WeaponSlot } from '@rainbow-pixel/shared';

/** Teclas com Ctrl que o navegador usaria para outra coisa (salvar, favoritos, selecionar). */
const BLOCKED_WITH_CTRL = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

/** Tecla -> arma. */
const SLOT_KEYS: Readonly<Record<string, WeaponSlot>> = {
  Digit1: 'primary',
  Numpad1: 'primary',
  Digit2: 'secondary',
  Numpad2: 'secondary',
};

const PRIMARY_BUTTON = 0;

function axis(negative: boolean, positive: boolean): MoveAxis {
  return positive === negative ? 0 : positive ? 1 : -1;
}

export class KeyboardMouseInput {
  private readonly pressed = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private aimAngle = 0;
  private firing = false;
  private weaponSlot: WeaponSlot = 'primary';

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.pressed.add(event.code);
    const slot = SLOT_KEYS[event.code];
    if (slot !== undefined) {
      this.weaponSlot = slot;
    }
    // Ctrl+W fecha a aba e não dá para impedir; Ctrl+S, Ctrl+D e Ctrl+A dá.
    if (event.ctrlKey && BLOCKED_WITH_CTRL.has(event.code)) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.pressed.delete(event.code);
  };

  /** Sem foco, as teclas e o botão soltos não chegam: tudo conta como solto. */
  private readonly onBlur = () => {
    this.pressed.clear();
    this.firing = false;
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const bounds = this.surface.getBoundingClientRect();
    this.pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button === PRIMARY_BUTTON) {
      this.firing = true;
      // Mantém o botão com o canvas mesmo se o mouse sair dele segurando o tiro.
      this.surface.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.button === PRIMARY_BUTTON) {
      this.firing = false;
    }
  };

  /** O menu do botão direito atrapalha o jogo. */
  private readonly onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('contextmenu', this.onContextMenu);
  }

  private isDown(...codes: string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Posição do mouse na tela (relativa ao canvas). `null` antes de o mouse passar por ele. */
  pointerPosition(): { readonly x: number; readonly y: number } | null {
    return this.pointer;
  }

  /**
   * Input do tick. `selfOnScreen` é onde o próprio jogador está na tela; a mira aponta dele
   * para o mouse. Sem mouse na tela, a mira fica como estava.
   */
  sample(selfOnScreen: { x: number; y: number } | null): PlayerInput {
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
      fire: this.firing,
      reload: this.isDown('KeyR'),
      weaponSlot: this.weaponSlot,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
    this.pressed.clear();
    this.firing = false;
  }
}
