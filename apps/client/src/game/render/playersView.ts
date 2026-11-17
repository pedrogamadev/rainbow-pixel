import { SIM_CONFIG } from '@rainbow-pixel/shared';
import type { TeamIndex } from '@rainbow-pixel/shared';
import { Container, Graphics, Text } from 'pixi.js';
import { screenUpOffset } from '../camera';
import {
  AIM_LINE_COLOR,
  DEAD_ALPHA,
  GHOST_COLOR,
  NICKNAME_COLOR,
  SELF_OUTLINE_COLOR,
  TEAM_COLORS,
} from './palette';

/** Um jogador pronto para desenhar. */
export interface DrawnPlayer {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly team: TeamIndex;
  readonly nickname: string;
  readonly connected: boolean;
  readonly alive: boolean;
  readonly isSelf: boolean;
}

const RADIUS = SIM_CONFIG.playerRadius;
const AIM_LINE_LENGTH = RADIUS + 10;
/** Distância, na tela, do centro do jogador até a base do nickname. */
const NICKNAME_OFFSET = RADIUS + 2;
const DISCONNECTED_ALPHA = 0.4;

interface PlayerSprite {
  readonly root: Container;
  readonly body: Graphics;
  readonly aim: Graphics;
  readonly name: Text;
  team: TeamIndex | null;
  isSelf: boolean | null;
}

function createSprite(): PlayerSprite {
  const root = new Container();
  const body = new Graphics();
  const aim = new Graphics();
  aim.moveTo(0, 0).lineTo(AIM_LINE_LENGTH, 0).stroke({ width: 2, color: AIM_LINE_COLOR });
  const name = new Text({
    text: '',
    style: { fill: NICKNAME_COLOR, fontSize: 11, fontFamily: 'system-ui, sans-serif' },
  });
  name.anchor.set(0.5, 1);
  name.y = -NICKNAME_OFFSET;
  root.addChild(body, aim, name);
  return { root, body, aim, name, team: null, isSelf: null };
}

/**
 * Círculo por jogador, com a linha da mira, cor do time e nickname acima. Quem morreu fica no
 * lugar como um círculo apagado, sem a linha da mira.
 */
export class PlayersView {
  readonly container = new Container();
  private readonly sprites = new Map<string, PlayerSprite>();

  /**
   * @param viewRotation giro do mundo na tela (a câmera gira com a mira). O nickname gira ao
   *   contrário para ficar em pé e acima do jogador na tela.
   */
  update(players: readonly DrawnPlayer[], viewRotation: number): void {
    const nameOffset = screenUpOffset(viewRotation, NICKNAME_OFFSET);
    const seen = new Set<string>();
    for (const player of players) {
      seen.add(player.playerId);
      let sprite = this.sprites.get(player.playerId);
      if (sprite === undefined) {
        sprite = createSprite();
        this.sprites.set(player.playerId, sprite);
        this.container.addChild(sprite.root);
      }
      if (sprite.team !== player.team || sprite.isSelf !== player.isSelf) {
        sprite.body.clear().circle(0, 0, RADIUS).fill(TEAM_COLORS[player.team]);
        if (player.isSelf) {
          sprite.body.circle(0, 0, RADIUS).stroke({ width: 2, color: SELF_OUTLINE_COLOR });
        }
        sprite.team = player.team;
        sprite.isSelf = player.isSelf;
      }
      if (sprite.name.text !== player.nickname) {
        sprite.name.text = player.nickname;
      }
      sprite.root.position.set(player.x, player.y);
      sprite.name.position.set(nameOffset.x, nameOffset.y);
      sprite.name.rotation = -viewRotation;
      sprite.aim.rotation = player.aimAngle;
      sprite.aim.visible = player.alive;
      sprite.root.alpha = !player.alive ? DEAD_ALPHA : player.connected ? 1 : DISCONNECTED_ALPHA;
    }
    for (const [playerId, sprite] of this.sprites) {
      if (!seen.has(playerId)) {
        sprite.root.destroy({ children: true });
        this.sprites.delete(playerId);
      }
    }
  }
}

/** Fantasma da posição confirmada pelo servidor (overlay de debug). */
export function createGhost(): Graphics {
  const ghost = new Graphics();
  ghost.circle(0, 0, RADIUS).stroke({ width: 2, color: GHOST_COLOR, alpha: 0.9 });
  ghost.visible = false;
  return ghost;
}
