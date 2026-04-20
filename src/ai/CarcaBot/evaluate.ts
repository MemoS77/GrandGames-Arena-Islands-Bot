import { utils } from '@ai/utils/islands_utils.js'
import type {
  CityEntity,
  FieldEntity,
  GameEntities,
  MonasteryEntity,
  Point,
  RoadEntity,
  TileState,
} from '@ai/utils/IUtils.js'
import { deckStrength, type DeckInfo } from './deck.js'

// ---------------------------------------------------------------------------
// Weights – chosen so a typical meeple over a whole game is worth a handful
// of future points. The convex scarcity below makes the *last* meeple much
// more expensive to commit than an abundant one.
// ---------------------------------------------------------------------------

/** Base per-meeple scoring weight. Scales with deck strength so meeples
 *  become worthless at the very end of the game (no time to deploy them). */
const W_MEEPLE = 7

/** Marginal value multipliers indexed by meeples-already-in-reserve.
 *  `MARGINALS[0]` is the value of owning the very first meeple (biggest
 *  jump), `MARGINALS[1]` the 2nd, and so on. Past the end of the array we
 *  fall back to a flat surplus rate. */
const MEEPLE_MARGINALS = [2.5, 1.6, 1.2, 1.0, 0.9, 0.9, 0.9, 0.9] as const
const MEEPLE_SURPLUS = 0.8

/** Small bonus added when an open structure is likely to close — locking
 *  in the points and returning the meeple is strictly better than staying
 *  open even if the raw point value is identical. */
const LOCKED_BONUS = 0.1

/**
 * When scoring a field, adjacent *incomplete* cities only pay out if they
 * actually complete before the deck runs out. Empirically our
 * `cityCloseProb` is calibrated for "will this city close eventually if
 * we keep playing" which overestimates completion by end-of-game.
 * Applied as a multiplier on the 3-points-per-adjacent-city term for
 * NON-completed cities. Completed cities always pay full 3 points.
 */
const FIELD_INCOMPLETE_CITY_DISCOUNT = 0.4

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
 * Neighbor offset for a world-facing tile side.
 * Side: N=0, E=1, S=2, W=3 (convention of the utils library).
 * The game uses screen coordinates: +y points south / down.
 */
function neighborPoint(side: number, p: Point): Point {
  switch (side) {
    case 0:
      return { x: p.x, y: p.y - 1 }
    case 1:
      return { x: p.x + 1, y: p.y }
    case 2:
      return { x: p.x, y: p.y + 1 }
    case 3:
      return { x: p.x - 1, y: p.y }
  }
  return p
}

/**
 * Index placed tiles by "x,y" key. Rebuilt per evaluation — it is cheap
 * and avoids threading mutable state through the evaluator.
 */
function buildTileMap(tiles: TileState[]): Map<string, TileState> {
  const m = new Map<string, TileState>()
  for (const t of tiles) {
    if (typeof t.place === 'object' && t.place !== null) {
      m.set(`${t.place.point.x},${t.place.point.y}`, t)
    }
  }
  return m
}

/**
 * Count the number of tile-edges this entity exposes to empty cells.
 * Each such edge is a distinct open end that must be filled by a
 * compatible tile for the entity to close. Based on segment-side
 * definitions rotated into world space.
 */
function countOpenEnds(
  segmentLocations: RoadEntity['segmentLocations'],
  kind: 'roads' | 'cities',
  tileMap: Map<string, TileState>,
): number {
  let open = 0
  for (const loc of segmentLocations) {
    const tileState = tileMap.get(`${loc.point.x},${loc.point.y}`)
    if (
      !tileState ||
      tileState.index === null ||
      typeof tileState.place !== 'object' ||
      tileState.place === null
    ) {
      continue
    }
    const def = utils.getTileDef(tileState.index)
    const segDef = def[kind]?.[loc.localSegmentIndex]
    if (!segDef) continue
    const rotation = tileState.place.rotation
    for (const side of segDef.sides) {
      const worldSide = (side + rotation) % 4
      const np = neighborPoint(worldSide, loc.point)
      if (!tileMap.has(`${np.x},${np.y}`)) open++
    }
  }
  return open
}

/**
 * Probability of closing an open road given how many of its edges still
 * face empty cells and how much deck is left. Heavily penalises
 * structures with many open ends because EACH must be closed.
 */
function roadCloseProb(openEnds: number, deck: DeckInfo): number {
  if (openEnds <= 0) return 1
  // Independent-edge assumption: each open end needs its own matching
  // tile. Road-ended tiles are common so ~0.8 per edge is plausible
  // while the deck is big.
  const perEnd = 0.8
  const base = Math.pow(perEnd, openEnds)
  return Math.max(0.03, base) * deckStrength(deck)
}

/**
 * Probability of closing an open city given open-edge count. Cities
 * require matching city-walled edges which are rarer than road edges.
 */
function cityCloseProb(openEnds: number, deck: DeckInfo): number {
  if (openEnds <= 0) return 1
  const perEnd = 0.55
  const base = Math.pow(perEnd, openEnds)
  return Math.max(0.02, base) * deckStrength(deck)
}

/**
 * Probability that a monastery gets its 8 surrounding tiles. Each missing
 * neighbor is its own little race against the deck.
 */
function monasteryCloseProb(surrounding: number, deck: DeckInfo): number {
  const needed = 8 - surrounding
  if (needed <= 0) return 1
  const supply = Math.min(1, deck.total / Math.max(1, needed * 5))
  return Math.max(0.03, 0.75 - 0.08 * needed) * supply
}

/**
 * Marginal value of having `n` meeples in reserve — strictly concave so
 * that the first meeple is much more valuable than the 7th. Used both for
 * the reserve bonus and for pricing the "meeple returning home" event.
 */
function marginalMeeple(n: number): number {
  if (n < 0) return 0
  return MEEPLE_MARGINALS[n] ?? MEEPLE_SURPLUS
}

/**
 * Total value of owning `n` meeples in reserve. Sum of marginals; convex
 * scarcity means losing the last meeple costs far more than losing one
 * of seven.
 */
function reserveValue(n: number, deck: DeckInfo): number {
  const w = W_MEEPLE * deckStrength(deck)
  let v = 0
  for (let i = 0; i < n; i++) v += marginalMeeple(i) * w
  return v
}

/**
 * Value awarded when a meeple on a structure is expected to come back to
 * the owner's reserve. Uses the marginal meeple value at the owner's
 * *current* reserve level so the bonus tracks scarcity correctly.
 */
function meepleReturnValue(
  reserveCount: number,
  deck: DeckInfo,
  p_return: number,
): number {
  if (p_return <= 0) return 0
  const w = W_MEEPLE * deckStrength(deck)
  return p_return * marginalMeeple(reserveCount) * w
}

// ---------------------------------------------------------------------------
// Entity valuations
// ---------------------------------------------------------------------------

function roadValue(
  r: RoadEntity,
  tileMap: Map<string, TileState>,
  deck: DeckInfo,
  ctx: EvalContext,
): number {
  const owners = getOwners(r.meeples)
  if (owners.length === 0) return 0

  const pts = r.tiles.length // 1 point per unique tile
  let expected: number
  let p_return: number
  if (r.completed) {
    expected = pts
    p_return = 1
  } else if (ctx.endgame) {
    expected = pts // endgame incomplete road scores 1/tile anyway
    p_return = 0 // game ended, meeples don't come back before scoring
  } else {
    const openEnds = countOpenEnds(r.segmentLocations, 'roads', tileMap)
    const p = roadCloseProb(openEnds, deck)
    expected = pts * (1 + LOCKED_BONUS * p)
    p_return = p
  }
  const ret = meepleReturnValue(ctx.mipples[ctx.myIdx] ?? 0, deck, p_return)
  return delta(owners, expected + ret, ctx.myIdx)
}

function cityValue(
  c: CityEntity,
  tileMap: Map<string, TileState>,
  deck: DeckInfo,
  ctx: EvalContext,
): number {
  const owners = getOwners(c.meeples)
  if (owners.length === 0) return 0

  const completedPts = c.tiles.length * 2 + c.shields * 2
  const incompletePts = c.tiles.length + c.shields

  let expected: number
  let p_return: number
  if (c.completed) {
    expected = completedPts
    p_return = 1
  } else if (ctx.endgame) {
    expected = incompletePts
    p_return = 0
  } else {
    const openEnds = countOpenEnds(c.segmentLocations, 'cities', tileMap)
    const p = cityCloseProb(openEnds, deck)
    expected = completedPts * p + incompletePts * (1 - p)
    p_return = p
  }
  const ret = meepleReturnValue(ctx.mipples[ctx.myIdx] ?? 0, deck, p_return)
  return delta(owners, expected + ret, ctx.myIdx)
}

function monasteryValue(
  m: MonasteryEntity,
  deck: DeckInfo,
  ctx: EvalContext,
): number {
  if (m.meeple === null) return 0

  const completedPts = 9 // 1 (monastery itself) + 8 surrounding tiles
  const currentPts = 1 + m.surroundingTiles

  let expected: number
  let p_return: number
  if (m.completed) {
    expected = completedPts
    p_return = 1
  } else if (ctx.endgame) {
    expected = currentPts
    p_return = 0
  } else {
    const p = monasteryCloseProb(m.surroundingTiles, deck)
    expected = completedPts * p + currentPts * (1 - p)
    p_return = p
  }
  const ret = meepleReturnValue(ctx.mipples[ctx.myIdx] ?? 0, deck, p_return)
  return m.meeple === ctx.myIdx ? expected + ret : -(expected + ret)
}

function fieldValue(
  f: FieldEntity,
  entities: GameEntities,
  tileMap: Map<string, TileState>,
  deck: DeckInfo,
  ctx: EvalContext,
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
      // A completed adjacent city is a guaranteed 3 points at endgame.
      pts += 3
    } else {
      // Only completed cities score for fields at endgame. Weight by the
      // probability that the adjacent city actually gets closed, and
      // further discount — field commitments are permanent, and a
      // meeple is too precious to bet on three "maybe" cities.
      const openEnds = countOpenEnds(city.segmentLocations, 'cities', tileMap)
      pts += 3 * cityCloseProb(openEnds, deck) * FIELD_INCOMPLETE_CITY_DISCOUNT
    }
  }
  // Fields NEVER return their meeple — it is committed for the rest of
  // the game. No return-value bonus here; the expensive meeple
  // deployment is what the caller pays for elsewhere.
  return delta(owners, pts, ctx.myIdx)
}

// ---------------------------------------------------------------------------
// Top-level position evaluator
// ---------------------------------------------------------------------------

export type EvalContext = {
  myIdx: number
  /** Board points already banked by each player. */
  points: number[]
  /** Per-player meeple reserve AFTER applying the candidate move. */
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
export function evaluatePosition(tiles: TileState[], ctx: EvalContext): number {
  const { myIdx, points, mipples, deck } = ctx
  const entities = utils.analyzeGameEntities(tiles)
  const tileMap = buildTileMap(tiles)

  let score = 0
  for (const r of entities.roads) score += roadValue(r, tileMap, deck, ctx)
  for (const c of entities.cities) score += cityValue(c, tileMap, deck, ctx)
  for (const m of entities.monasteries) score += monasteryValue(m, deck, ctx)
  for (const f of entities.fields)
    score += fieldValue(f, entities, tileMap, deck, ctx)

  // Convex meeple-reserve differential: spare meeples are future scoring
  // power, and the *last* meeple is worth far more than the 7th. Losing a
  // meeple forever (fields, dead structures) must clear a high bar to be
  // worth it.
  const myReserveV = reserveValue(mipples[myIdx] ?? 0, deck)
  let oppReserveTotal = 0
  for (let p = 0; p < mipples.length; p++) {
    if (p === myIdx) continue
    oppReserveTotal += reserveValue(mipples[p] ?? 0, deck)
  }
  const oppReserveAvg =
    mipples.length > 1 ? oppReserveTotal / (mipples.length - 1) : 0
  score += myReserveV - oppReserveAvg

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
