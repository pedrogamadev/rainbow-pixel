// Colisão do círculo do jogador contra as células sólidas do mapa.
// Move em X e resolve; move em Y e resolve. O contato é calculado de forma exata
// (círculo contra retângulo), então o jogador encosta na parede sem atravessá-la.

import type { Vec2 } from './types.js';

/** Grade de colisão de um andar do mapa. */
export interface CollisionMap {
  /** Lado da célula, em px. */
  readonly cellSize: number;
  /** Largura do mapa, em células. */
  readonly width: number;
  /** Altura do mapa, em células. */
  readonly height: number;
  /** Célula fora do mapa conta como sólida. */
  isSolid(cx: number, cy: number): boolean;
}

/**
 * Folga numérica: encostar exatamente na parede não é sobreposição. Sem ela, o arredondamento
 * de ponto flutuante faz a parede ao lado parecer à frente, e o jogador trava nas emendas.
 */
const SKIN = 1e-6;

type Axis = 'x' | 'y';

/** Lado, no outro eixo, de uma célula que bloqueia o movimento. */
type BlockSide = 'before' | 'after' | 'face';

interface AxisSweep {
  /** Deslocamento permitido no eixo, com o sinal do pedido. */
  readonly moved: number;
  /**
   * Quando só quinas de um mesmo lado bloqueiam, para onde deslizar no outro eixo (-1 ou 1)
   * para contorná-las. 0 quando não há quina para contornar.
   */
  readonly slide: -1 | 0 | 1;
  /** Quanto deslizar no outro eixo para passar pelas quinas. */
  readonly clearance: number;
}

const FREE: AxisSweep = { moved: 0, slide: 0, clearance: 0 };

function isSolidOnAxis(map: CollisionMap, axis: Axis, along: number, across: number): boolean {
  return axis === 'x' ? map.isSolid(along, across) : map.isSolid(across, along);
}

/**
 * Até onde o círculo anda em um eixo antes de encostar numa célula sólida.
 * Só bloqueiam as células com a face à frente do centro no sentido do movimento: uma célula
 * ao lado não fica mais perto quando o círculo anda paralelo a ela.
 *
 * Para decidir se dá para contornar uma quina, as quinas são procuradas até um raio além do
 * ponto de contato: num vão mais estreito que o jogador, a quina do outro lado aparece logo
 * depois da primeira, e o círculo fica parado em vez de deslizar de um lado para o outro.
 */
function sweepAxis(
  map: CollisionMap,
  x: number,
  y: number,
  radius: number,
  delta: number,
  axis: Axis,
): AxisSweep {
  if (delta === 0) {
    return FREE;
  }
  const size = map.cellSize;
  const along = axis === 'x' ? x : y;
  const across = axis === 'x' ? y : x;
  const forward = delta > 0;
  const wanted = Math.abs(delta);
  const target = along + delta;
  const lookahead = radius;

  const alongFirst = Math.floor((Math.min(along, target) - radius - lookahead) / size);
  const alongLast = Math.floor((Math.max(along, target) + radius + lookahead) / size);
  const acrossFirst = Math.floor((across - radius) / size);
  const acrossLast = Math.floor((across + radius) / size);

  let allowed = wanted;
  let blockedByFace = false;
  const corners: { distance: number; side: BlockSide; gap: number }[] = [];

  for (let cellAlong = alongFirst; cellAlong <= alongLast; cellAlong += 1) {
    const cellStart = cellAlong * size;
    const face = forward ? cellStart : cellStart + size;
    if (forward ? face < along : face > along) {
      continue;
    }
    for (let cellAcross = acrossFirst; cellAcross <= acrossLast; cellAcross += 1) {
      if (!isSolidOnAxis(map, axis, cellAlong, cellAcross)) {
        continue;
      }
      const crossStart = cellAcross * size;
      const crossEnd = crossStart + size;
      let side: BlockSide = 'face';
      let gap = 0;
      if (across < crossStart) {
        side = 'after';
        gap = crossStart - across;
      } else if (across > crossEnd) {
        side = 'before';
        gap = across - crossEnd;
      }
      if (gap >= radius - SKIN) {
        continue;
      }
      // Meia corda do círculo na altura da célula: o quanto ele avança antes de tocá-la.
      const halfChord = Math.sqrt(radius * radius - gap * gap);
      const distance = Math.max(0, forward ? face - halfChord - along : along - face - halfChord);
      if (distance < wanted) {
        allowed = Math.min(allowed, distance);
        blockedByFace ||= side === 'face';
      }
      if (side !== 'face') {
        corners.push({ distance, side, gap });
      }
    }
  }

  const moved = forward ? allowed : -allowed;
  if (allowed >= wanted || blockedByFace) {
    return { moved, slide: 0, clearance: 0 };
  }
  // Bloqueado só por quinas. Se as quinas logo à frente estão todas do mesmo lado, desliza
  // para longe delas; com quinas dos dois lados, o vão é estreito demais e o círculo para.
  const near = corners.filter((corner) => corner.distance < allowed + lookahead);
  const side = near[0]?.side;
  if (side === undefined || near.some((corner) => corner.side !== side)) {
    return { moved, slide: 0, clearance: 0 };
  }
  const clearance = Math.max(...near.map((corner) => radius - corner.gap)) + SKIN;
  return { moved, slide: side === 'after' ? -1 : 1, clearance };
}

/** Quanto deslizar no outro eixo, quando o movimento puro em um eixo bateu numa quina. */
function cornerNudge(sweep: AxisSweep, requested: number): number {
  const blocked = Math.abs(requested) - Math.abs(sweep.moved);
  return Math.min(blocked, sweep.clearance) * sweep.slide;
}

/**
 * Move um círculo pelo mapa: X primeiro, depois Y, deslizando ao longo das paredes.
 * Se o deslocamento passa de meia célula, o passo é subdividido.
 * Movendo em um eixo só contra uma quina, o círculo desliza no outro eixo para contorná-la,
 * para não travar na beirada de um vão de porta.
 */
export function moveCircle(
  map: CollisionMap,
  x: number,
  y: number,
  radius: number,
  dx: number,
  dy: number,
): Vec2 {
  const maxStep = map.cellSize / 2;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const stepX = dx / steps;
  const stepY = dy / steps;

  let px = x;
  let py = y;
  for (let step = 0; step < steps; step += 1) {
    const sweepX = sweepAxis(map, px, py, radius, stepX, 'x');
    px += sweepX.moved;
    if (stepY === 0 && sweepX.slide !== 0) {
      py += sweepAxis(map, px, py, radius, cornerNudge(sweepX, stepX), 'y').moved;
    }

    const sweepY = sweepAxis(map, px, py, radius, stepY, 'y');
    py += sweepY.moved;
    if (stepX === 0 && sweepY.slide !== 0) {
      px += sweepAxis(map, px, py, radius, cornerNudge(sweepY, stepY), 'x').moved;
    }
  }
  return { x: px, y: py };
}

/** Diz se o círculo invade alguma célula sólida (encostar não conta). */
export function circleOverlapsSolid(
  map: CollisionMap,
  x: number,
  y: number,
  radius: number,
): boolean {
  const size = map.cellSize;
  const limit = (radius - SKIN) * (radius - SKIN);
  for (let cy = Math.floor((y - radius) / size); cy <= Math.floor((y + radius) / size); cy += 1) {
    for (let cx = Math.floor((x - radius) / size); cx <= Math.floor((x + radius) / size); cx += 1) {
      if (!map.isSolid(cx, cy)) {
        continue;
      }
      const nearestX = Math.min(Math.max(x, cx * size), cx * size + size);
      const nearestY = Math.min(Math.max(y, cy * size), cy * size + size);
      const distX = x - nearestX;
      const distY = y - nearestY;
      if (distX * distX + distY * distY < limit) {
        return true;
      }
    }
  }
  return false;
}
