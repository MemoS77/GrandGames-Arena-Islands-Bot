import type { PositionInfo } from 'gga-bots'
import { GameAI } from '../GameAI.js'
import type { GamePosition } from '../types.js'
import { utils } from '@ai/utils/islands_utils.js'
import type { AIMove } from '@ai/utils/IUtils.js'
import log from '../../log.js'
import { MAX_THINK_TIME } from '../../conf.js'
import { applyMove } from './simulate.js'
import { computeDeck } from './deck.js'
import { evaluatePosition, type EvalContext } from './evaluate.js'
import { runPlayout } from './playout.js'

// ---------------------------------------------------------------------------
// Tunable search parameters
// ---------------------------------------------------------------------------

/** Reserve this many ms before the deadline to encode the move and reply. */
const SAFETY_MARGIN_MS = 250

/** Minimum budget regardless of MAX_THINK_TIME (avoids racing on fast moves). */
const MIN_BUDGET_MS = 400

/**
 * Below this remaining budget after phase-1 scoring, skip Monte-Carlo and
 * just return the best 1-ply move. MCTS with <1 playout per candidate is
 * pure noise — faster to just trust the evaluator.
 */
const MC_MIN_BUDGET_MS = 600

/**
 * Maximum number of plies simulated forward inside a single playout
 * (shared across both players — so with 2 players this is 5 turns each).
 * Longer horizons capture more of the game but cost linearly more time;
 * 10 is a reasonable sweet spot for the end-of-game scoring to reflect
 * field value while still running many rollouts per candidate.
 */
const MC_HORIZON_PLIES = 10

/**
 * Top-K candidates that survive the 1-ply pre-filter and get full
 * Monte-Carlo treatment. The 1-ply evaluator is strong enough to rule
 * out the long tail of clearly bad moves, so we focus compute on the
 * handful that could realistically win.
 */
const MC_TOP_K = 8

/**
 * Candidates whose 1-ply score is more than this many points below the
 * best move are dropped before MCTS. They are highly unlikely to come
 * back in a rollout and wasting playouts on them reduces the signal.
 */
const MC_PREFILTER_GAP = 6

/**
 * Blend between the 1-ply heuristic score and the Monte-Carlo terminal
 * mean when re-ranking. 1.0 = ignore the 1-ply score entirely;
 * 0 = ignore MC. Somewhere in between is robust against single-sample
 * noise while letting the MC estimate lead when it is confident.
 */
const MC_SCORE_BLEND = 0.7

// ---------------------------------------------------------------------------

type Scored = { move: AIMove; score: number; mcMean?: number; mcRuns?: number }

/**
 * Carcassonne AI combining a strong 1-ply evaluator with flat Monte-Carlo
 * playouts on the shortlist.
 *
 *   1. Enumerate every legal move via utils.getAllMoves.
 *   2. Score each with the 1-ply deck-aware evaluator (evaluate.ts).
 *   3. Pre-filter: keep the MC_TOP_K best moves AND drop any candidate
 *      whose score is more than MC_PREFILTER_GAP below the leader.
 *   4. Run flat MCTS round-robin over the shortlist until the time
 *      deadline: each playout simulates MC_HORIZON_PLIES plies of random
 *      play and terminates with a rule-accurate end-of-game score.
 *   5. Re-rank by a blend of the 1-ply score and the Monte-Carlo mean.
 *   6. If we ran out of budget before any MCTS work, fall back cleanly
 *      to the best 1-ply move.
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

    // -----------------------------------------------------------------------
    // Phase 1: 1-ply heuristic scoring.
    // -----------------------------------------------------------------------
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
      return utils.moveToString(moves[0]!)
    }

    scored.sort((a, b) => b.score - a.score)

    // -----------------------------------------------------------------------
    // Phase 2: MCTS refinement on the pre-filtered shortlist.
    // -----------------------------------------------------------------------
    const mcStats = this.runMonteCarlo(position, scored, myIdx, deck, deadline)

    // -----------------------------------------------------------------------
    // Phase 3: re-rank using blended scores.
    // -----------------------------------------------------------------------
    for (const s of scored) {
      if (s.mcRuns && s.mcRuns > 0 && s.mcMean !== undefined) {
        s.score = s.score * (1 - MC_SCORE_BLEND) + s.mcMean * MC_SCORE_BLEND
      }
    }
    scored.sort((a, b) => b.score - a.score)

    const best = scored[0]!
    log(
      `CarcaBot chose ${utils.moveToString(best.move)} ` +
        `score=${best.score.toFixed(2)} ` +
        `mcRuns=${best.mcRuns ?? 0}` +
        (best.mcMean !== undefined ? ` mcMean=${best.mcMean.toFixed(2)}` : '') +
        ` candidates=${mcStats.considered}/${scored.length} ` +
        `rollouts=${mcStats.totalRollouts} ` +
        `deck=${deck.total} took=${Date.now() - start}ms`,
    )

    return utils.moveToString(best.move)
  }

  /**
   * Run round-robin flat Monte-Carlo over the top pre-filtered candidates
   * until `deadline` is hit. Mutates `scored[i].mcMean` / `mcRuns` for
   * every candidate that received at least one playout.
   */
  private runMonteCarlo(
    position: GamePosition,
    scored: Scored[],
    myIdx: number,
    deck: ReturnType<typeof computeDeck>,
    deadline: number,
  ): { considered: number; totalRollouts: number } {
    const remaining = deadline - Date.now()
    if (remaining < MC_MIN_BUDGET_MS || scored.length < 2) {
      return { considered: 0, totalRollouts: 0 }
    }

    // Pre-filter: top-K AND close-enough to the leader.
    const best = scored[0]!.score
    const shortlist: Scored[] = []
    for (let i = 0; i < scored.length && shortlist.length < MC_TOP_K; i++) {
      const s = scored[i]!
      if (s.score < best - MC_PREFILTER_GAP) break
      shortlist.push(s)
    }
    if (shortlist.length < 2) return { considered: shortlist.length, totalRollouts: 0 }

    // Initialise running means on the candidates.
    for (const s of shortlist) {
      s.mcMean = 0
      s.mcRuns = 0
    }

    // Round-robin playouts: each cycle advances one rollout per candidate.
    // This is simple and ensures every candidate receives equal attention
    // (vs UCB1 which would be more optimal but adds complexity).
    let total = 0
    while (Date.now() < deadline) {
      let didWork = false
      for (const s of shortlist) {
        if (Date.now() >= deadline) break
        try {
          const result = runPlayout(
            position,
            s.move,
            myIdx,
            deck,
            MC_HORIZON_PLIES,
          )
          const n = (s.mcRuns ?? 0) + 1
          s.mcMean = (s.mcMean ?? 0) + (result - (s.mcMean ?? 0)) / n
          s.mcRuns = n
          total++
          didWork = true
        } catch (err) {
          log('CarcaBot playout error', err)
        }
      }
      if (!didWork) break
    }
    return { considered: shortlist.length, totalRollouts: total }
  }

  onGameEnd(tableId: number): void {
    log(`Game ${tableId} finished`)
  }
}
