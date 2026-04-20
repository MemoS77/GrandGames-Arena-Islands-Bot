import { describe, it, expect } from 'vitest'
import { utils } from '@ai/utils/islands_utils.js'
import { applyMove } from './simulate.js'
import { scoreAllMoves } from './search.js'
import { testPos } from '../../test/testPos.js'
import type { GamePosition } from '../types.js'
import type { TileState } from '@ai/utils/IUtils.js'

// ---------------------------------------------------------------------------
// Ground-truth classifier: which entity actually owns the newly placed meeple?
// ---------------------------------------------------------------------------

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

function pickBest(pos: GamePosition, myIdx: number) {
  const scored = scoreAllMoves(pos, myIdx)
  scored.sort((a, b) => b.score - a.score)
  return { scored, best: scored[0]! }
}

// ---------------------------------------------------------------------------
// Full sweep over the whole 72-tile set as the bot's hand tile
// ---------------------------------------------------------------------------

describe('turn 1 — full hand tile sweep', () => {
  it('for every hand tile with fields, the best move never puts a meeple there', () => {
    const tileSet = utils.getTileSet()
    const bad: string[] = []
    for (let handIdx = 1; handIdx < tileSet.length; handIdx++) {
      const def = tileSet[handIdx]
      if (!def?.fields?.length) continue
      const tiles: TileState[] = [
        { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
        { index: handIdx, place: 0 },
        { index: (handIdx + 1) % tileSet.length, place: 1 },
      ]
      const pos: GamePosition = {
        tiles,
        currentPlayer: 0,
        points: [0, 0],
        mipples: [7, 7],
        lastMoves: [null, null],
        lastPoints: [],
        stage: 0,
      }
      const { best } = pickBest(pos, 0)
      if (!best.deployed) continue
      const sim = applyMove(tiles, pos.mipples, best.move, 0)
      if (meepleKind(sim.tiles, 0) === 'field') {
        bad.push(`handIdx=${handIdx} move=${utils.moveToString(best.move)} score=${best.score.toFixed(2)}`)
      }
    }
    expect(bad, `Bot picks field placements on turn 1:\n${bad.join('\n')}`).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// testPos replay — the real 13-tile position used for the smoke test
// ---------------------------------------------------------------------------

describe('testPos replay', () => {
  it('never chooses a field-placement as best move', () => {
    const { best, scored } = pickBest(testPos, 0)
    if (best.deployed) {
      const sim = applyMove(testPos.tiles, testPos.mipples, best.move, 0)
      const kind = meepleKind(sim.tiles, 0)
      if (kind === 'field') {
        const top = scored
          .slice(0, 5)
          .map((s) => `  score=${s.score.toFixed(2)} meeple=${s.deployed} move=${utils.moveToString(s.move)}`)
          .join('\n')
        expect(kind, `Field picked as best. Top 5:\n${top}`).not.toBe('field')
      }
    }
  })

  it('DIAG: log the 10 best / 3 worst moves on testPos', () => {
    const { scored } = pickBest(testPos, 0)
    for (const s of scored.slice(0, 10)) {
      const sim = applyMove(testPos.tiles, testPos.mipples, s.move, 0)
      const kind = s.deployed ? meepleKind(sim.tiles, 0) : '-'
      // eslint-disable-next-line no-console
      console.log(
        `  score=${s.score.toFixed(2).padStart(7)} meeple=${s.deployed ? 'Y' : 'N'} kind=${kind.padEnd(9)} move=${utils.moveToString(s.move)}`,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Scenario: opponent has a huge potential city with their meeple
// ---------------------------------------------------------------------------

/**
 * Reproduce the pattern reported by the user: after a few turns the bot is
 * staring at a board where the opponent owns a promising structure, which
 * makes the "do nothing" score negative. A faulty evaluator may then pick
 * an otherwise-bad field deployment because it slightly offsets the opp
 * contribution, even though the meeple is effectively being thrown away.
 *
 * This synthesises that scenario and asserts the bot does NOT rescue its
 * score by committing to a field.
 */
describe('opp has an advantage — bot must not panic-commit to a field', () => {
  it('keeps meeples in reserve when all candidate field placements are weak', () => {
    // Manually build a mini-board:
    //   - starting tile at (0,0)
    //   - opponent's tile adjacent at (1,0) holding an opp meeple on a
    //     potentially-good city
    //   - my hand tile still available
    //
    // We don't care about exact geometry — we just want analyzeGameEntities
    // to detect an opp-owned city / road so that score baselines go
    // negative. Using testPos and forcefully injecting opp meeples on a
    // placed tile is a cheap, robust way to get there.
    const tiles: TileState[] = testPos.tiles.map((t) => ({ ...t }))
    // Find any placed non-starting tile and stick an opponent meeple on it.
    const target = tiles.find(
      (t) =>
        typeof t.place === 'object' &&
        t.place !== null &&
        t.index !== null &&
        t.index !== 0,
    )
    expect(target).toBeDefined()
    if (!target || target.index === null) return
    const def = utils.getTileDef(target.index)
    const nSegs =
      (def.roads?.length ?? 0) +
      (def.cities?.length ?? 0) +
      (def.fields?.length ?? 0) +
      (def.monastery ? 1 : 0)
    // Place an opp meeple on the very first segment (whatever it is).
    target.mipples = new Array(nSegs).fill(null)
    if (nSegs > 0) target.mipples[0] = 1

    const pos: GamePosition = {
      ...testPos,
      tiles,
    }
    const { best, scored } = pickBest(pos, 0)

    if (best.deployed) {
      const sim = applyMove(tiles, pos.mipples, best.move, 0)
      const kind = meepleKind(sim.tiles, 0)
      if (kind === 'field') {
        const top = scored
          .slice(0, 5)
          .map((s) => `  score=${s.score.toFixed(2)} deployed=${s.deployed} move=${utils.moveToString(s.move)}`)
          .join('\n')
        expect(kind, `Panic-commit to field detected when opp has advantage. Top 5:\n${top}`).not.toBe('field')
      }
    }
  })
})
