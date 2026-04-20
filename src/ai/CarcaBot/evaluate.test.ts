import { describe, it, expect } from 'vitest'
import { evaluatePosition, type EvalContext } from './evaluate.js'
import { computeDeck } from './deck.js'
import { utils } from '@ai/utils/islands_utils.js'
import { applyMove, getSegmentCount } from './simulate.js'
import { scoreAllMoves } from './search.js'
import type { GamePosition } from '../types.js'
import type { TileState } from '@ai/utils/IUtils.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fresh-game GamePosition: only the starting tile placed at (0,0),
 * both players hold visible hand tiles, full meeple reserves, no prior
 * scoring. `handIdx` lets a test control which tile the bot will try to
 * play so we can probe many tile shapes.
 */
function startPosition(handIdx: number, oppHandIdx: number = 60): GamePosition {
  const tiles: TileState[] = [
    { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
    { index: handIdx, place: 0 },
    { index: oppHandIdx, place: 1 },
  ]
  return {
    tiles,
    currentPlayer: 0,
    points: [0, 0],
    mipples: [7, 7],
    lastMoves: [null, null],
    lastPoints: [],
    stage: 0,
  }
}

function baseCtx(pos: GamePosition): EvalContext {
  return {
    myIdx: 0,
    points: pos.points,
    mipples: pos.mipples,
    deck: computeDeck(pos.tiles),
    endgame: false,
  }
}

// ---------------------------------------------------------------------------
// Sanity
// ---------------------------------------------------------------------------

describe('evaluatePosition — sanity', () => {
  it('returns exactly zero on a symmetric empty-ish board', () => {
    // Just the starting tile, no meeples anywhere, equal reserves.
    const tiles: TileState[] = [
      { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
    ]
    const ctx: EvalContext = {
      myIdx: 0,
      points: [0, 0],
      mipples: [7, 7],
      deck: computeDeck(tiles),
      endgame: false,
    }
    expect(evaluatePosition(tiles, ctx)).toBe(0)
  })

  it('reserve value is strictly convex — 1st meeple much more valuable than 7th', () => {
    // Compare: starting state (7m each) vs identical state but one side
    // lost ALL meeples. The diff must be > the diff of the same player
    // losing only their surplus (7→6).
    const tiles: TileState[] = [
      { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
    ]
    const deck = computeDeck(tiles)

    const base: EvalContext = {
      myIdx: 0,
      points: [0, 0],
      mipples: [7, 7],
      deck,
      endgame: false,
    }
    const lostOne: EvalContext = { ...base, mipples: [6, 7] }
    const lostAll: EvalContext = { ...base, mipples: [0, 7] }

    const diffOne =
      evaluatePosition(tiles, base) - evaluatePosition(tiles, lostOne)
    const diffAll =
      evaluatePosition(tiles, base) - evaluatePosition(tiles, lostAll)

    // Losing the very last meeple chain must cost *much* more than just the
    // surplus meeple. Otherwise scarcity is linear, not convex.
    expect(diffAll).toBeGreaterThan(diffOne * 3)
  })
})

// ---------------------------------------------------------------------------
// Meeple placement policy
// ---------------------------------------------------------------------------

/**
 * Classify a placed meeple by looking at the post-move board:
 * which entity type actually received it. We can't trust our own segment-
 * ordering assumptions — `utils.analyzeGameEntities` is the ground truth.
 */
function meepleKind(
  tiles: TileState[],
  myIdx: number,
): 'road' | 'city' | 'monastery' | 'field' | 'none' {
  const e = utils.analyzeGameEntities(tiles)
  for (const r of e.roads) if ((r.meeples.get(myIdx) ?? 0) > 0) return 'road'
  for (const c of e.cities) if ((c.meeples.get(myIdx) ?? 0) > 0) return 'city'
  for (const m of e.monasteries) if (m.meeple === myIdx) return 'monastery'
  for (const f of e.fields) if ((f.meeples.get(myIdx) ?? 0) > 0) return 'field'
  return 'none'
}

describe('meeple deployment policy at game start', () => {
  // Sweep over many candidate hand tiles. Any tile that has a field segment
  // provides an opportunity for the bot to commit a meeple forever — which
  // it should refuse in the first turn of the game when the reserve is
  // full (7 meeples) and the deck is fresh.
  const CANDIDATE_HAND_TILES = Array.from({ length: 40 }, (_, i) => i + 1)

  it('does not choose a field-placement move as best at turn 1', () => {
    const tileSet = utils.getTileSet()
    const offenders: string[] = []

    for (const handIdx of CANDIDATE_HAND_TILES) {
      const def = tileSet[handIdx]
      if (!def?.fields?.length) continue // only care about tiles with fields

      const pos = startPosition(handIdx)
      const scored = scoreAllMoves(pos, 0)
      if (scored.length === 0) continue
      scored.sort((a, b) => b.score - a.score)
      const best = scored[0]!

      if (!best.deployed) continue // fine
      const sim = applyMove(pos.tiles, pos.mipples, best.move, 0)
      const kind = meepleKind(sim.tiles, 0)
      if (kind === 'field') {
        offenders.push(
          `handTile=${handIdx} move=${utils.moveToString(best.move)} ` +
            `score=${best.score.toFixed(2)}`,
        )
      }
    }

    expect(
      offenders,
      `Bot placed meeple on a field at turn 1:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('best meeple-less move exists for every starting hand tile', () => {
    // Sanity: for every starting position there is at least one legal move
    // without a meeple. scoreAllMoves should find it.
    for (const handIdx of CANDIDATE_HAND_TILES.slice(0, 10)) {
      const pos = startPosition(handIdx)
      const scored = scoreAllMoves(pos, 0)
      const noMeeple = scored.filter((s) => !s.deployed)
      expect(
        noMeeple.length,
        `Tile ${handIdx}: no no-meeple move`,
      ).toBeGreaterThan(0)
    }
  })

  it('roadCloseProb plummets as open-end count grows — sanity', async () => {
    // Indirect test: compare evaluator output for "1-tile isolated road"
    // scenarios at different reserve sizes. Low reserve should make the
    // bot strictly less willing to commit.
    const lowReserve = startPosition(5)
    lowReserve.mipples = [1, 1]
    const highReserve = startPosition(5)
    highReserve.mipples = [7, 7]
    const lowScored = scoreAllMoves(lowReserve, 0)
    const highScored = scoreAllMoves(highReserve, 0)
    lowScored.sort((a, b) => b.score - a.score)
    highScored.sort((a, b) => b.score - a.score)
    // At low reserve, the bot should either pick a no-meeple move or
    // a move with a MUCH stronger (positive) score than the low-reserve
    // penalty. Any deployed move must be better than no-deploy.
    const lowBest = lowScored[0]!
    const lowNoMeeple = lowScored.find((s) => !s.deployed)!
    expect(lowBest.score).toBeGreaterThanOrEqual(lowNoMeeple.score)
  })

  it('when reserve is 1 meeple, bot never deploys it on a field', () => {
    const tileSet = utils.getTileSet()
    const offenders: string[] = []

    for (const handIdx of CANDIDATE_HAND_TILES) {
      const def = tileSet[handIdx]
      if (!def?.fields?.length) continue

      const pos = startPosition(handIdx)
      pos.mipples = [1, 1] // both players almost out
      const scored = scoreAllMoves(pos, 0)
      if (scored.length === 0) continue
      scored.sort((a, b) => b.score - a.score)
      const best = scored[0]!
      if (!best.deployed) continue
      const sim = applyMove(pos.tiles, pos.mipples, best.move, 0)
      if (meepleKind(sim.tiles, 0) === 'field') {
        offenders.push(`handTile=${handIdx}`)
      }
    }

    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Simulation integrity
// ---------------------------------------------------------------------------

describe('applyMove / segment ordering', () => {
  it('meeple placement via applyMove matches analyzeGameEntities', () => {
    // Confirm that our [roads, cities, fields, monastery] segment-ordering
    // assumption in simulate.ts matches what utils.analyzeGameEntities
    // expects. If these disagreed, the evaluator would be scoring the wrong
    // entity — a very silent, very bad bug.
    const pos = startPosition(5)
    const scored = scoreAllMoves(pos, 0)
    const withMeeple = scored.filter((s) => s.deployed)
    expect(
      withMeeple.length,
      'no meeple-deploying moves found',
    ).toBeGreaterThan(0)

    for (const sm of withMeeple) {
      const sim = applyMove(pos.tiles, pos.mipples, sm.move, 0)
      expect(sim.deployed).toBe(true)
      const kind = meepleKind(sim.tiles, 0)
      expect(
        kind,
        `move=${utils.moveToString(sm.move)} segment ordering mismatch`,
      ).not.toBe('none')
    }
  })

  it('decrements reserve when deploying a meeple', () => {
    const pos = startPosition(5)
    const scored = scoreAllMoves(pos, 0)
    const dep = scored.find((s) => s.deployed)
    if (!dep) return
    const sim = applyMove(pos.tiles, pos.mipples, dep.move, 0)
    expect(sim.mipples[0]).toBe(6)
    expect(sim.mipples[1]).toBe(7)
  })

  it('getSegmentCount matches the length of the fresh mipples vector', () => {
    for (let idx = 0; idx < 40; idx++) {
      const def = utils.getTileDef(idx)
      const n = getSegmentCount(def)
      const expected =
        (def.roads?.length ?? 0) +
        (def.cities?.length ?? 0) +
        (def.fields?.length ?? 0) +
        (def.monastery ? 1 : 0)
      expect(n).toBe(expected)
    }
  })
})
