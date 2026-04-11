import type { PositionInfo } from 'gga-bots'
import { GameAI } from '../GameAI.js'

import type { GamePosition } from '../types.js'
import log from '../../log.js'
import { utils } from '@ai/utils/islands_utils.js'

export default class RandomMoveAI extends GameAI {
  async getBestMove(pos: PositionInfo<GamePosition>): Promise<string> {
    log(
      'Getting best for:',
      pos.position.tiles
        .filter((t) => typeof t.place === 'object')
        .map((t) => `${t.index}:${JSON.stringify(t.place)}`),
    )
    const moves = utils.getAllMoves(pos.position)

    //const entities = utils.analyzeGameEntities(pos.position.tiles)
    //console.log('Entities:', JSON.stringify(entities, null, 2))

    log(
      'Available moves',
      moves.map((m) => utils.moveToString(m)),
    )

    if (moves.length === 0) return ''

    moves.sort(() => Math.random() - 0.5)

    // TODO: in real AI add score to all moves, and select the best.
    return utils.moveToString(moves[0]!)
  }

  onGameEnd(tableId: number): void {
    log(`Game ${tableId} finished`)
  }
}
