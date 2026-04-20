import { utils } from '@ai/utils/islands_utils.js'
import type { AIMove } from '@ai/utils/IUtils.js'
import type { GamePosition } from '../types.js'
import { applyMove } from './simulate.js'
import { computeDeck, type DeckInfo } from './deck.js'
import { evaluatePosition, type EvalContext } from './evaluate.js'

/**
 * Helper function that performs a single-ply lookahead evaluation of every
 * legal move for `myIdx`. Kept as a pure function so tests can exercise
 * the core search logic without instantiating the full AI / SDK.
 */
export type ScoredMove = {
  move: AIMove
  score: number
  /** Whether this move actually deployed a meeple (some `meepleSegment`
   *  values can be unusable — e.g. when the reserve is empty). */
  deployed: boolean
}

export function scoreAllMoves(
  position: GamePosition,
  myIdx: number,
  deck?: DeckInfo,
): ScoredMove[] {
  const moves = utils.getAllMoves(position)
  const d = deck ?? computeDeck(position.tiles)
  const endgame = d.total <= 2
  const out: ScoredMove[] = []
  for (const move of moves) {
    const sim = applyMove(position.tiles, position.mipples, move, myIdx)
    const ctx: EvalContext = {
      myIdx,
      points: position.points,
      mipples: sim.mipples,
      deck: d,
      endgame,
    }
    const score = evaluatePosition(sim.tiles, ctx)
    out.push({ move, score, deployed: sim.deployed })
  }
  return out
}
