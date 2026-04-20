import { utils } from '@ai/utils/islands_utils.js'
import type {
  CityEntity,
  FieldEntity,
  GameEntities,
  MonasteryEntity,
  RoadEntity,
  TileState,
} from '@ai/utils/IUtils.js'
import { deckStrength, type DeckInfo } from './deck.js'

// ---------------------------------------------------------------------------
// Weights – tuned by hand, conservative defaults
// ---------------------------------------------------------------------------

/** Value of a single unused meeple in reserve. Meeples are a scarce resource
 *  because losing a meeple to a dead structure costs future earnings. */
const W_MEEPLE_RESERVE = 1.2

/** How much to trust an in-progress structure versus one already complete.
 *  Open structures score their "if completed" value discounted by
 *  completion probability blended with their endgame (partial) value. */
const LOCKED_BONUS = 0.1

// ---------------------------------------------------------------------------
// Ownership helpers
// ---------------------------------------------------------------------------

/**
 * Return the list of players that have the maximum number of meeples on a
 * structure. In Carcassonne a tie awards full points to every tied owner.
 */
function getOwners(meeples: Map<number, number>): number[] {
  if (meeples.size === 0) return []
  let max = 0
  for (const c of meeples.values()) if (c > max) max = c
  if (max === 0) return []
  const out: number[] = []
  for (const [p, c] of meeples) if (c === max) out.push(p)
  return out
}

/**
 * Differential scoring: +value if we own (or co-own) the structure,
 * -value if any opponent owns it. A shared tie evaluates to 0 in a
 * two-player game (both score, differential is zero).
 */
function delta(owners: number[], value: number, myIdx: number): number {
  if (owners.length === 0) return 0
  let d = 0
  if (owners.includes(myIdx)) d += value
  if (owners.some((o) => o !== myIdx)) d -= value
  return d
}

// ---------------------------------------------------------------------------
// Completion probability heuristics
// ---------------------------------------------------------------------------

/**
 * Rough probability that an open structure with `segments` parts will be
 * closed before the deck runs out. More segments → more open edges → harder
 * to close. When the deck is nearly empty the chance collapses to ~0.
 */
function closeProb(segments: number, deck: DeckInfo): number {
  const base = Math.max(0.08, 0.7 - 0.08 * segments)
  return base * deckStrength(deck)
}

/**
 * Probability that a monastery gets its 8 surrounding tiles. Each missing
 * neighbor is its own little race against the deck.
 */
function monasteryCloseProb(surrounding: number, deck: DeckInfo): number {
  const needed = 8 - surrounding
  if (needed <= 0) return 1
  const supply = Math.min(1, deck.total / Math.max(1, needed * 5))
  return Math.max(0.03, 0.65 - 0.09 * needed) * supply
}

// ---------------------------------------------------------------------------
// Entity valuations
// ---------------------------------------------------------------------------

function roadValue(
  r: RoadEntity,
  deck: DeckInfo,
  myIdx: number,
  endgame: boolean,
): number {
  const owners = getOwners(r.meeples)
  if (owners.length === 0) return 0

  // Road scoring: 1 point per unique tile, closed or at endgame.
  const pts = r.tiles.length
  let expected: number
  if (r.completed) expected = pts
  else if (endgame) expected = pts
  else {
    // Closed and open roads are worth the same raw points in Carcassonne
    // scoring, but a closed road is "locked in" and immune to being
    // extended by the opponent's meeples — prefer it slightly.
    const p = closeProb(r.segments, deck)
    expected = pts * (1 + LOCKED_BONUS * p)
  }
  return delta(owners, expected, myIdx)
}

function cityValue(
  c: CityEntity,
  deck: DeckInfo,
  myIdx: number,
  endgame: boolean,
): number {
  const owners = getOwners(c.meeples)
  if (owners.length === 0) return 0

  const completedPts = c.tiles.length * 2 + c.shields * 2
  const incompletePts = c.tiles.length + c.shields

  let expected: number
  if (c.completed) expected = completedPts
  else if (endgame) expected = incompletePts
  else {
    const p = closeProb(c.segments, deck)
    expected = completedPts * p + incompletePts * (1 - p)
  }
  return delta(owners, expected, myIdx)
}

function monasteryValue(
  m: MonasteryEntity,
  deck: DeckInfo,
  myIdx: number,
  endgame: boolean,
): number {
  if (m.meeple === null) return 0

  const completedPts = 9 // 1 (monastery itself) + 8 surrounding tiles
  const currentPts = 1 + m.surroundingTiles

  let expected: number
  if (m.completed) expected = completedPts
  else if (endgame) expected = currentPts
  else {
    const p = monasteryCloseProb(m.surroundingTiles, deck)
    expected = completedPts * p + currentPts * (1 - p)
  }
  return m.meeple === myIdx ? expected : -expected
}

function fieldValue(
  f: FieldEntity,
  entities: GameEntities,
  deck: DeckInfo,
  myIdx: number,
): number {
  const owners = getOwners(f.meeples)
  if (owners.length === 0) return 0

  const byName = new Map<string, CityEntity>()
  for (const c of entities.cities) byName.set(c.name, c)

  let pts = 0
  for (const cn of f.adjacentCities) {
    const city = byName.get(cn)
    if (!city) continue
    if (city.completed) {
      pts += 3
    } else {
      // Only completed cities score for fields at endgame. Weight by the
      // probability that the adjacent city actually gets closed.
      pts += 3 * closeProb(city.segments, deck)
    }
  }
  return delta(owners, pts, myIdx)
}

// ---------------------------------------------------------------------------
// Top-level position evaluator
// ---------------------------------------------------------------------------

export type EvalContext = {
  myIdx: number
  points: number[]
  mipples: number[]
  deck: DeckInfo
  endgame: boolean
}

/**
 * Estimate the value of a position from `myIdx`'s point of view.
 *
 * The score is a differential: positive means the bot is ahead, negative
 * means the opponent is. It is the sum of:
 *   - the current board points differential (hard, already awarded)
 *   - the expected value of every on-board structure that carries a meeple
 *   - a small bonus for each meeple still in the reserve
 */
export function evaluatePosition(
  tiles: TileState[],
  ctx: EvalContext,
): number {
  const { myIdx, points, mipples, deck, endgame } = ctx
  const entities = utils.analyzeGameEntities(tiles)

  let score = 0
  for (const r of entities.roads) score += roadValue(r, deck, myIdx, endgame)
  for (const c of entities.cities) score += cityValue(c, deck, myIdx, endgame)
  for (const m of entities.monasteries)
    score += monasteryValue(m, deck, myIdx, endgame)
  for (const f of entities.fields)
    score += fieldValue(f, entities, deck, myIdx)

  // Meeple reserve differential: spare meeples are future scoring power.
  // Worth less when the deck is running out because there will not be
  // many more opportunities to deploy them.
  const reserveWeight = W_MEEPLE_RESERVE * deckStrength(deck)
  const myReserve = mipples[myIdx] ?? 0
  let oppReserve = 0
  for (let p = 0; p < mipples.length; p++) {
    if (p === myIdx) continue
    oppReserve += mipples[p] ?? 0
  }
  // Normalize opponent reserve so 3-player games don't dominate.
  const oppAverage = mipples.length > 1 ? oppReserve / (mipples.length - 1) : 0
  score += (myReserve - oppAverage) * reserveWeight

  // Actual board points — these are already banked, full weight.
  const myPts = points[myIdx] ?? 0
  let oppPts = 0
  for (let p = 0; p < points.length; p++) {
    if (p === myIdx) continue
    oppPts += points[p] ?? 0
  }
  const oppAveragePts = points.length > 1 ? oppPts / (points.length - 1) : 0
  score += myPts - oppAveragePts

  return score
}
