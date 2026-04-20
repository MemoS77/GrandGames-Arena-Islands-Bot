import { utils } from '@ai/utils/islands_utils.js'
import type { AIMove, TileState } from '@ai/utils/IUtils.js'
import type { GamePosition } from '../types.js'
import { applyMove } from './simulate.js'
import type { DeckInfo } from './deck.js'
import { scoreTerminal } from './terminal.js'

// ---------------------------------------------------------------------------
// Distribution helpers
// ---------------------------------------------------------------------------

/**
 * Sample a tile index from a multiset of remaining tiles with weight
 * proportional to how many copies remain. Decrements the sampled copy so
 * that successive calls reflect a deck being drawn down.
 *
 * Returns `null` if the distribution is empty (deck exhausted).
 */
function sampleFromDistribution(dist: Map<number, number>): number | null {
  let total = 0
  for (const c of dist.values()) total += c
  if (total === 0) return null
  let r = Math.random() * total
  for (const [idx, c] of dist) {
    r -= c
    if (r < 0) {
      if (c <= 1) dist.delete(idx)
      else dist.set(idx, c - 1)
      return idx
    }
  }
  // fallthrough – numerical edge
  const first = dist.keys().next().value
  if (first === undefined) return null
  const c = dist.get(first)!
  if (c <= 1) dist.delete(first)
  else dist.set(first, c - 1)
  return first
}

function cloneDistribution(dist: Map<number, number>): Map<number, number> {
  return new Map(dist)
}

// ---------------------------------------------------------------------------
// Hand-tile bookkeeping
// ---------------------------------------------------------------------------

/** Find a player's hand slot regardless of whether the index is visible. */
function findHandSlot(
  tiles: TileState[],
  playerIdx: number,
): TileState | null {
  for (const t of tiles) {
    if (typeof t.place === 'number' && t.place === playerIdx) return t
  }
  return null
}

/**
 * Make sure `playerIdx` has a hand tile with a revealed index. If the
 * slot exists but is hidden, reveal it by sampling from the unknown-tile
 * distribution. If the slot does not exist (previous turn already
 * played it), draw a fresh tile and add a new slot.
 *
 * Returns `false` only when the deck has been fully exhausted, which is
 * an end-of-game signal for the caller.
 */
function ensureHand(
  tiles: TileState[],
  playerIdx: number,
  dist: Map<number, number>,
): boolean {
  const slot = findHandSlot(tiles, playerIdx)
  if (slot) {
    if (slot.index !== null) return true
    const idx = sampleFromDistribution(dist)
    if (idx === null) return false
    slot.index = idx
    return true
  }
  const idx = sampleFromDistribution(dist)
  if (idx === null) return false
  tiles.push({ index: idx, place: playerIdx, mipples: [] })
  return true
}

// ---------------------------------------------------------------------------
// Playout
// ---------------------------------------------------------------------------

/**
 * Deterministic fast random: Math.random is fine here — playouts are
 * inherently noisy and we rely on averaging across many runs.
 */
function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null
  return arr[(Math.random() * arr.length) | 0] ?? null
}

/**
 * Simulate `horizonPlies` plies of random play following an initial
 * committed move from the bot. Returns the exact end-of-game score
 * differential of the resulting board state from `myIdx`'s perspective.
 *
 * The simulation:
 *   - starts from the state AFTER applying `myMove` for `myIdx`
 *   - advances turn order sequentially across all players
 *   - draws hand tiles for each upcoming player by sampling from the
 *     unknown-tile multiset
 *   - picks each player's move uniformly at random from the legal set
 *
 * Random playouts are known to be a strong baseline for MCTS provided
 * enough of them are averaged; the law of large numbers does the rest.
 */
export function runPlayout(
  position: GamePosition,
  myMove: AIMove,
  myIdx: number,
  deck: DeckInfo,
  horizonPlies: number,
): number {
  const nPlayers = position.mipples.length

  // Clone hand-independent state we are about to mutate.
  const dist = cloneDistribution(deck.distribution)

  // Apply the bot's committed move first (ply 0).
  const firstSim = applyMove(
    position.tiles,
    position.mipples,
    myMove,
    myIdx,
  )
  let tiles = firstSim.tiles
  let mipples = firstSim.mipples
  let turn = myIdx

  for (let ply = 1; ply <= horizonPlies; ply++) {
    turn = (turn + 1) % nPlayers

    if (!ensureHand(tiles, turn, dist)) break // deck exhausted

    const pos: GamePosition = {
      ...position,
      tiles,
      mipples,
      currentPlayer: turn,
    }
    const moves = utils.getAllMoves(pos)
    if (moves.length === 0) {
      // No legal placement — in real Carcassonne this rarely happens;
      // just skip the turn to continue the rollout.
      continue
    }
    const move = pickRandom(moves)
    if (!move) break
    try {
      const sim = applyMove(tiles, mipples, move, turn)
      tiles = sim.tiles
      mipples = sim.mipples
    } catch {
      // Malformed move — end rollout early; terminal score will use what
      // we have so far.
      break
    }
  }

  return scoreTerminal(tiles, myIdx, nPlayers)
}
