// Teclado e mouse -> input do próximo tick. A câmera gira com a mira, que fica sempre para cima
// na tela: o clique no jogo trava o mouse (pointer lock) e o movimento horizontal gira a mira.
// WASD anda relativo à mira (W para frente, S para trás, A e D de lado), Shift anda lento, Ctrl
// corre, o botão esquerdo atira (segurar para a automática), R recarrega e 1 e 2 trocam entre a
// primária e a secundária. Esc solta o mouse (o navegador faz isso sozinho).

import { AIM_NORTH } from '@rainbow-pixel/shared';
import type { MoveAxis, MoveMode, PlayerInput, Vec2, WeaponSlot } from '@rainbow-pixel/shared';
import { turnAim } from './camera';

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

export type AimLockListener = (locked: boolean) => void;

export class KeyboardMouseInput {
  private readonly pressed = new Set<string>();
  private readonly lockListeners = new Set<AimLockListener>();
  /** Posição do mouse solto, relativa ao canvas. `null` com o mouse travado. */
  private pointer: Vec2 | null = null;
  /** Começa para o norte: no início da partida o mapa aparece como foi desenhado. */
  private aimAngle = AIM_NORTH;
  private locked = false;
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

  private readonly onMouseMove = (event: MouseEvent) => {
    if (this.locked) {
      this.aimAngle = turnAim(this.aimAngle, event.movementX);
      return;
    }
    const bounds = this.surface.getBoundingClientRect();
    this.pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button !== PRIMARY_BUTTON) {
      return;
    }
    event.preventDefault();
    if (this.locked) {
      this.firing = true;
    } else {
      // O clique que trava o mouse não atira.
      this.requestLock();
    }
  };

  private readonly onMouseUp = (event: MouseEvent) => {
    if (event.button === PRIMARY_BUTTON) {
      this.firing = false;
    }
  };

  private readonly onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.surface;
    if (locked === this.locked) {
      return;
    }
    this.locked = locked;
    this.firing = false;
    if (locked) {
      this.pointer = null;
    }
    for (const listener of this.lockListeners) {
      listener(locked);
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
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    // Com o mouse travado, os eventos de mouse vão todos para o elemento travado.
    surface.addEventListener('mousemove', this.onMouseMove);
    surface.addEventListener('mousedown', this.onMouseDown);
    surface.addEventListener('mouseup', this.onMouseUp);
    surface.addEventListener('contextmenu', this.onContextMenu);
  }

  private requestLock(): void {
    try {
      // Navegadores antigos devolvem undefined em vez da Promise.
      const pending = this.surface.requestPointerLock() as Promise<void> | undefined;
      pending?.catch(() => {
        // Recusado (por exemplo, logo depois do Esc): o próximo clique tenta de novo.
      });
    } catch {
      // Idem, nos navegadores que lançam em vez de rejeitar.
    }
  }

  private isDown(...codes: string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }

  /** O mouse está travado no jogo, girando a mira. */
  isAimLocked(): boolean {
    return this.locked;
  }

  /** Avisa quando o mouse trava ou solta. Devolve a função que cancela. */
  onAimLockChange(listener: AimLockListener): () => void {
    this.lockListeners.add(listener);
    return () => {
      this.lockListeners.delete(listener);
    };
  }

  /** Posição do mouse solto na tela (relativa ao canvas). `null` com o mouse travado. */
  pointerPosition(): Vec2 | null {
    return this.pointer;
  }

  /** Mira atual do mouse, a cada quadro (a câmera gira com ela sem esperar o tick). */
  currentAim(): number {
    return this.aimAngle;
  }

  /** Input do tick. Com o mouse solto, a mira fica como estava. */
  sample(): PlayerInput {
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
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.surface.removeEventListener('mousemove', this.onMouseMove);
    this.surface.removeEventListener('mousedown', this.onMouseDown);
    this.surface.removeEventListener('mouseup', this.onMouseUp);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
    if (this.locked) {
      document.exitPointerLock();
    }
    this.lockListeners.clear();
    this.pressed.clear();
    this.firing = false;
  }
}
