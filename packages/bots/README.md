# packages/bots

Cérebro dos bots (seção 16 do escopo da 1.0).

- TypeScript puro: sem DOM, sem PixiJS, sem Colyseus, sem Node APIs.
- O bot recebe somente a `PlayerView` filtrada que um cliente humano receberia e devolve uma intenção (`BotIntent`, um input sem `seq`). O servidor numera a intenção e a transforma em `InputCommand`, que passa pelas mesmas validações dos humanos.
- O bot nunca lê o estado completo da partida e nunca grava no banco.
- Todo comportamento é testado por cenários (`src/scenarios`): situação montada, comando esperado.

| Arquivo                | Conteúdo                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| `src/BotBrain.ts`      | Interface `decide(view, memory, dtMs): BotIntent`                          |
| `src/PlayerView.ts`    | Visão entregue ao bot. No marco 0.2: tick, o próprio bot, mapa e waypoints |
| `src/memory.ts`        | `BotMemory`, alterada pelo cérebro a cada decisão                          |
| `src/levels/level0.ts` | Nível 0: patrulha os waypoints em circuito                                 |

## Nível 0 (marco 0.2)

Patrulha os waypoints de `bot_hints` em circuito, começando pelo mais perto, em linha reta e sem pathfinding. Para 1 s em cada waypoint e mira para onde anda. Se não chega mais perto do waypoint por 2 s, pula para o próximo. Sem waypoints, fica parado no spawn. A dificuldade não muda o nível 0.

No servidor, `apps/server/src/match/BotController.ts` roda os cérebros a 10 Hz e expande cada decisão em um input numerado por tick, enfileirado na mesma fila de inputs dos humanos. Os valores ficam em `BOT_LEVEL0_CONFIG` (`packages/shared/src/config`).
