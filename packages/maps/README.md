# packages/maps

Mapas do jogo (seção 7 do escopo da 1.0): o formato `MapDefinition`, o schema zod, a grade de colisão e o catálogo de mapas gerados.

| Pasta ou arquivo          | Conteúdo                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `src/schema.ts`           | Tipo `MapDefinition` e schema zod                                                  |
| `src/collisionGrid.ts`    | Decodifica as células de um andar e expõe `materialAt(cx, cy)` e `isSolid(cx, cy)` |
| `src/index.ts`            | `getMap(id)`, `listMaps()` e `patrolWaypoints(map)`                                |
| `tiled/`                  | Fontes no formato do Tiled (`.tmj`) e o tileset de materiais                       |
| `generated/`              | Saída do importador, versionada. Não edite à mão                                   |
| `scripts/generate-gym.ts` | Gera `tiled/gym_01.tmj`, o mapa de teste                                           |

O código de `src` roda no servidor e no navegador: sem APIs do Node. O importador fica em `tools/map-import` e usa só a entrada `@rainbow-pixel/maps/format` (schema e grade, sem o catálogo).

## Fluxo

1. Edite (ou crie) `tiled/<id>.tmj` no Tiled. O nome do arquivo é o id do mapa.
2. `pnpm maps:import` valida e grava `generated/<id>.json`.
3. Mapa novo: importe o JSON em `src/index.ts` (objeto `SOURCES`).
4. `pnpm maps:check` (também no CI) valida sem gravar e falha se algum gerado estiver desatualizado.

O `gym_01` é gerado por script: `pnpm --filter @rainbow-pixel/maps generate:gym` e depois `pnpm maps:import`.

## Convenção do Tiled (seção 7.2 do escopo)

- Mapa ortogonal, finito, tile de 8x8 px. Propriedades do mapa: `name` (texto) e `kind` (`gym` ou `competitive`).
- Tileset: cada tile tem a propriedade `material` (`floor`, `wall_soft`, `wall_hard`, `void`, `barricade`). Tileset externo precisa estar em JSON (`.tsj`). Célula sem tile vira `void`.
- O nome de cada objeto é o id dele, único no mapa. O andar vem da propriedade `floorId` do objeto, depois da camada, e por fim 0.

| Camada            | Tipo    | Objetos                                                                                                                                                                                                                                                                     |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`       | Tiles   | Materiais das células                                                                                                                                                                                                                                                       |
| `anchors`         | Objetos | Retângulo com classe (ou propriedade `kind`) `door`, `window` ou `hatch`; propriedades `facing` (`N`, `S`, `E`, `W`) e `supports` (lista separada por vírgula: `barricade`, `entry_denial`, `deployable_shield`)                                                            |
| `reinforce_slots` | Objetos | Retângulos                                                                                                                                                                                                                                                                  |
| `gameplay`        | Objetos | Classe `spawn_attack` (ponto), `spawn_defense` (retângulo), `objective` (retângulo com `label` A ou B e `pairId`), `building_interior` (polígono ou retângulo), `camera` (ponto com `fov` e rotação do objeto ou propriedade `rotation`, em graus), `no_deploy` (retângulo) |
| `bot_hints`       | Objetos | Ponto com classe `waypoint`, `hold_point`, `cover`, `reinforce_priority`, `barricade_priority` ou `plant_spot`; propriedades opcionais `order` (inteiro) e `targetId`                                                                                                       |

Os waypoints formam o circuito de patrulha dos bots na ordem da propriedade `order`. Um retângulo onde se espera um ponto vale pelo centro.
