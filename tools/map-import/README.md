# tools/map-import

Importador de mapas do Tiled para o formato `MapDefinition` de `packages/maps` (seção 7 do escopo da 1.0).

```bash
pnpm maps:import   # valida packages/maps/tiled/*.tmj e grava packages/maps/generated/*.json
pnpm maps:check    # valida sem gravar e falha se algum gerado estiver desatualizado (CI)
```

Opções: `--tiled-dir <pasta>` e `--out-dir <pasta>` trocam as pastas padrão.

Cada problema aponta o arquivo, a camada, o id do objeto e a regra violada, por exemplo:

```text
gym_01.tmj: camada "bot_hints", objeto "waypoint_2": waypoint em célula sólida (wall_hard) [regra waypoint_walkable]
```

## Regras

Todo mapa: `cell_size` (tile de 8 px), `unique_ids`, `inside_map`, `object_floor`, `floor_cells`, `spawn_per_team` (pelo menos 1 spawn por time) e `waypoint_walkable` (waypoint em célula não sólida).

Mapa `competitive` (seção 7.3 do escopo): `attack_spawn_count` (pelo menos 3 `spawn_attack`), `objective_pair` (alvos A e B com o mesmo `pairId`), `anchor_in_wall_gap` (porta ou janela sobre um vão de parede) e `camera_in_building` (câmera dentro de `building_interior`).

A conversão também aponta problemas de formato: camada ou propriedade faltando, material ou tipo de objeto desconhecido, forma errada (ponto onde se espera retângulo) e propriedade com tipo errado.
