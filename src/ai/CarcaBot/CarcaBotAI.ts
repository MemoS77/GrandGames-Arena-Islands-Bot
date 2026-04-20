import type { PositionInfo } from 'gga-bots'
import { GameAI } from '../GameAI.js'
import type { GamePosition } from '../types.js'
import { utils } from '@ai/utils/islands_utils.js'
import type { AIMove } from '@ai/utils/IUtils.js'
import log from '../../log.js'
import { MAX_THINK_TIME } from '../../conf.js'
import { applyMove, findHandTile } from './simulate.js'
import { computeDeck } from './deck.js'
import { evaluatePosition, type EvalContext } from './evaluate.js'

// ---------------------------------------------------------------------------
// Tunable search parameters
// ---------------------------------------------------------------------------

/** Reserve this many ms before the deadline to encode the move and reply. */
const SAFETY_MARGIN_MS = 250

/** Minimum budget regardless of MAX_THINK_TIME (avoids racing on fast moves). */
const MIN_BUDGET_MS = 400

/** Upper bound on opponent responses sampled per top candidate. */
const OPP_SAMPLE_SIZE = 18

/** Blend factor for 2-ply refinement: how much we trust the worst-case. */
const WORST_CASE_BLEND = 0.55

// ---------------------------------------------------------------------------

type Scored = { move: AIMove; score: number }

/**
 * Iterative evaluator for Carcassonne. Strategy:
 *
 *   1. Enumerate all legal moves via utils.getAllMoves.
 *   2. Score every move with a strong 1-ply evaluation function that is
 *      aware of the remaining deck — see evaluate.ts.
 *   3. If time allows, refine the top-K candidates with a 1-ply opponent
 *      response search (expecti-min over a sample of replies) and re-sort.
 *   4. Always fall back to the best move evaluated so far if we hit the
 *      time limit mid-computation.
 */
export default class CarcaBotAI extends GameAI {
  async getBestMove(pos: PositionInfo<GamePosition>): Promise<string> {
    const start = Date.now()
    const budget = Math.max(MIN_BUDGET_MS, MAX_THINK_TIME - SAFETY_MARGIN_MS)
    const deadline = start + budget

    const position = pos.position
    const myIdx = pos.botIndex ?? position.currentPlayer ?? 0

    const moves = utils.getAllMoves(position)
    if (moves.length === 0) return ''

    const deck = computeDeck(position.tiles)
    const endgame = deck.total <= 2

    // ---------------------------------------------------------------------
    // Phase 1: score every move with a single-ply lookahead. Each candidate
    // gets its own EvalContext because the mipples reserve (a core input
    // of the evaluator) depends on whether this move deployed a meeple.
    // ---------------------------------------------------------------------
    const scored: Scored[] = []
    for (const move of moves) {
      if (Date.now() > deadline) break
      try {
        const sim = applyMove(position.tiles, position.mipples, move, myIdx)
        const ctx: EvalContext = {
          myIdx,
          points: position.points,
          mipples: sim.mipples,
          deck,
          endgame,
        }
        const score = evaluatePosition(sim.tiles, ctx)
        scored.push({ move, score })
      } catch (err) {
        log('CarcaBot eval error', err)
      }
    }

    if (scored.length === 0) {
      // Out of time before even the first eval — play something legal.
      return utils.moveToString(moves[0]!)
    }

    scored.sort((a, b) => b.score - a.score)

    // ---------------------------------------------------------------------
    // Phase 2: refine top candidates with opponent response search.
    // Only runs if the opponent's hand tile is visible (otherwise the
    // reply would have to enumerate every possible tile draw, which is
    // too expensive for the time we have left).
    // ---------------------------------------------------------------------
    const refined = this.refineTop(
      position,
      scored,
      myIdx,
      deck,
      endgame,
      deadline,
    )

    refined.sort((a, b) => b.score - a.score)

    const best = refined[0]!
    log(
      `CarcaBot chose ${utils.moveToString(best.move)} ` +
        `score=${best.score.toFixed(2)} ` +
        `moves=${moves.length} evaluated=${scored.length} ` +
        `deck=${deck.total} took=${Date.now() - start}ms`,
    )

    return utils.moveToString(best.move)
  }

  /**
   * Perform a bounded worst-case opponent response check over the most
   * promising candidates. Mutates and returns `scored`.
   */
  private refineTop(
    position: GamePosition,
    scored: Scored[],
    myIdx: number,
    deck: ReturnType<typeof computeDeck>,
    endgame: boolean,
    deadline: number,
  ): Scored[] {
    const remaining = deadline - Date.now()
    if (remaining < 400 || scored.length < 2) return scored

    // Find an opponent whose hand tile is visible. If none, skip ply 2.
    const oppIdx = this.pickVisibleOpponent(position.tiles, myIdx)
    if (oppIdx === null) return scored

    // How many candidates can we afford? Roughly: remaining / cost-per-cand.
    // Each candidate simulates up to OPP_SAMPLE_SIZE replies; assume
    // ~20 ms per reply eval. This is an adaptive, conservative estimate.
    const perCandidate = OPP_SAMPLE_SIZE * 20 + 10
    const affordable = Math.max(1, Math.floor(remaining / perCandidate))
    const topK = Math.min(scored.length, Math.max(2, affordable))

    for (let i = 0; i < topK; i++) {
      if (Date.now() > deadline) break
      const cand = scored[i]!
      const mySim = applyMove(
        position.tiles,
        position.mipples,
        cand.move,
        myIdx,
      )
      const oppPos: GamePosition = {
        ...position,
        tiles: mySim.tiles,
        mipples: mySim.mipples,
        currentPlayer: oppIdx,
      }
      const oppMoves = utils.getAllMoves(oppPos)
      if (oppMoves.length === 0) continue

      const sample = sampleMoves(oppMoves, OPP_SAMPLE_SIZE)
      let worst = Infinity
      for (const om of sample) {
        if (Date.now() > deadline) break
        try {
          const oppSim = applyMove(mySim.tiles, mySim.mipples, om, oppIdx)
          // Evaluate from the BOT's perspective: meeple-scarcity is now
          // tracked via `oppSim.mipples` which reflects both deployments.
          const ctx2: EvalContext = {
            myIdx,
            points: position.points,
            mipples: oppSim.mipples,
            deck,
            endgame,
          }
          const s = evaluatePosition(oppSim.tiles, ctx2)
          if (s < worst) worst = s
        } catch {
          // ignore malformed opp move
        }
      }
      if (Number.isFinite(worst)) {
        cand.score =
          cand.score * (1 - WORST_CASE_BLEND) + worst * WORST_CASE_BLEND
      }
    }
    return scored
  }

  /**
   * Find any opponent whose hand tile is visible (index !== null).
   * Returns its player index, or null if none are visible.
   */
  private pickVisibleOpponent(
    tiles: GamePosition['tiles'],
    myIdx: number,
  ): number | null {
    const seen = new Set<number>()
    for (const t of tiles) {
      if (
        typeof t.place === 'number' &&
        t.place !== myIdx &&
        t.index !== null
      ) {
        seen.add(t.place)
      }
    }
    for (const p of seen) {
      if (findHandTile(tiles, p)) return p
    }
    return null
  }

  onGameEnd(tableId: number): void {
    log(`Game ${tableId} finished`)
  }
}

/**
 * Lightweight random sample without allocating a full shuffled copy when
 * the input is larger than the desired size.
 */
function sampleMoves(moves: AIMove[], size: number): AIMove[] {
  if (moves.length <= size) return moves
  const out: AIMove[] = new Array(size)
  // Reservoir-like: pick `size` random distinct indices.
  const picked = new Set<number>()
  let filled = 0
  while (filled < size) {
    const idx = (Math.random() * moves.length) | 0
    if (picked.has(idx)) continue
    picked.add(idx)
    out[filled++] = moves[idx]!
  }
  return out
}
