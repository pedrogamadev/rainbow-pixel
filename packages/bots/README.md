# packages/bots

Cérebro dos bots (seção 16 do escopo da 1.0).

- TypeScript puro: sem DOM, sem PixiJS, sem Colyseus, sem Node APIs.
- O bot recebe somente a `PlayerView` filtrada que um cliente humano receberia e devolve uma intenção (`BotIntent`, um input sem `seq`). O servidor numera a intenção e a transforma em `InputCommand`, que passa pelas mesmas validações dos humanos.
- O bot nunca lê o estado completo da partida e nunca grava no banco.
- Todo comportamento é testado por cenários (`src/scenarios`): situação montada, comando esperado.

| Arquivo                | Conteúdo                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| `src/BotBrain.ts`      | Interface `decide(view, memory, dtMs): BotIntent` (input sem `seq`)          |
| `src/PlayerView.ts`    | Visão entregue ao bot, montada pelo servidor a partir do snapshot do cliente |
| `src/memory.ts`        | `BotMemory`, alterada pelo cérebro a cada decisão                            |
| `src/perception.ts`    | Inimigos visíveis: cone, alcance, periferia e linha de visada                |
| `src/aim.ts`           | Reação, giro limitado, erro de mira e sorteios do bot                        |
| `src/levels/level0.ts` | Nível 0: patrulha os waypoints em circuito                                   |
| `src/levels/level1.ts` | Nível 1: atirador; sem alvo, usa o nível 0                                   |

## Nível 0 (marco 0.2)

Patrulha os waypoints de `bot_hints` em circuito, começando pelo mais perto, em linha reta e sem pathfinding. Para 1 s em cada waypoint e mira para onde anda. Se não chega mais perto do waypoint por 2 s, pula para o próximo. Sem waypoints, fica parado no spawn. A dificuldade não muda o nível 0.

## Nível 1 (marco 0.3)

- **Visão (`PlayerView`)**: o servidor monta a partir do mesmo `buildSnapshot` usado para os clientes, mais a informação pública do mapa (grade de colisão e waypoints). Tem o próprio bot (posição, mira, time, vida, `alive`, arma na mão, munição no pente, recarregando) e os outros jogadores com posição, mira, time e `alive`. Sem vida de ninguém além do próprio bot.
- **Percepção**: como o fog of war só entra no marco 0.5, o bot aplica sozinho o cone de 100° até 900 px, a periferia de 48 px e a linha de visada (`VISION_CONFIG`).
- **Com inimigo visível**: para de andar, escolhe o mais perto, gira a mira na velocidade da dificuldade e só dispara depois do tempo de reação, contado desde que aquele alvo ficou visível. A cada rajada sorteia um erro de mira em `±aimErrorDeg` e dispara com a mira a até 2° desse ponto. Depois de `maxBurst` tiros (contados pela munição), solta o gatilho por 250 ms e sorteia outro erro; no difícil (`maxBurst = null`) não pausa. Não dispara com aliado vivo na linha antes do alvo. Recarrega com o pente vazio. Usa sempre a primária.
- **Sem inimigo visível**: patrulha como o nível 0. Lembrar a última posição vista é do nível 2.
- **Aleatoriedade**: `hashRandom(seed do bot, contador)`, com o contador na `BotMemory`. O servidor deriva a seed de cada bot da seed da partida; os cenários usam seed fixa.
- **Dificuldade**: tempo de reação, erro de mira, velocidade de giro e rajada vêm de `BOT_DIFFICULTY_PARAMS`. Atenção a som e memória ficam para o nível 2.

No servidor, `apps/server/src/match/BotController.ts` roda os cérebros a 10 Hz e expande cada decisão em um input numerado por tick (com `viewTimeMs` igual ao tempo do servidor), enfileirado na mesma fila de inputs dos humanos. Os valores ficam em `BOT_LEVEL0_CONFIG`, `BOT_LEVEL1_CONFIG`, `VISION_CONFIG` e `BOT_DIFFICULTY_PARAMS` (`packages/shared/src/config`).
