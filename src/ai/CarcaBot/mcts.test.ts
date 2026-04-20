import { describe, it, expect } from 'vitest'

import { computeDeck } from './deck.js'
import { scoreTerminal } from './terminal.js'
import { runPlayout } from './playout.js'
import { scoreAllMoves } from './search.js'
import { testPos } from '../../test/testPos.js'
import type { GamePosition } from '../types.js'
import type { TileState } from '@ai/utils/IUtils.js'

function startPosition(handIdx: number): GamePosition {
  const tiles: TileState[] = [
    { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
    { index: handIdx, place: 0 },
    { index: (handIdx + 1) % 72, place: 1 },
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

// ---------------------------------------------------------------------------
// scoreTerminal
// ---------------------------------------------------------------------------

describe('scoreTerminal', () => {
  it('returns 0 on a board with no meeples anywhere', () => {
    const tiles: TileState[] = [
      { index: 0, place: { point: { x: 0, y: 0 }, rotation: 0 }, mipples: [] },
    ]
    expect(scoreTerminal(tiles, 0, 2)).toBe(0)
  })

  it('scoreTerminal finite on testPos', () => {
    // testPos has no meeples either, but lots of structures — score should
    // still be a finite number (zero here since nobody owns anything).
    const s = scoreTerminal(testPos.tiles, 0, 2)
    expect(Number.isFinite(s)).toBe(true)
    expect(s).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// runPlayout
// ---------------------------------------------------------------------------

describe('runPlayout', () => {
  it('returns a finite numeric score for a random playout from startPos', () => {
    const pos = startPosition(5)
    const deck = computeDeck(pos.tiles)
    const scored = scoreAllMoves(pos, 0)
    const anyMove = scored[0]!.move
    const result = runPlayout(pos, anyMove, 0, deck, 10)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('handles testPos playouts without throwing', () => {
    const deck = computeDeck(testPos.tiles)
    const scored = scoreAllMoves(testPos, 0)
    expect(scored.length).toBeGreaterThan(0)
    const anyMove = scored[0]!.move
    // Multiple playouts to exercise the distribution sampling and hand
    // drawing logic.
    for (let i = 0; i < 10; i++) {
      const result = runPlayout(testPos, anyMove, 0, deck, 10)
      expect(Number.isFinite(result)).toBe(true)
    }
  })

  it('deeper horizon produces more structure activity (sanity)', () => {
    // Rough sanity: absolute score of a deeper playout is usually non-zero
    // on testPos because random play tends to place meeples.
    const deck = computeDeck(testPos.tiles)
    const scored = scoreAllMoves(testPos, 0)
    const m = scored[0]!.move

    let anyNonZero = false
    for (let i = 0; i < 25; i++) {
      const result = runPlayout(testPos, m, 0, deck, 10)
      if (result !== 0) {
        anyNonZero = true
        break
      }
    }
    expect(anyNonZero).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Monte-Carlo integration: does the bot actually spend its budget?
//
// We don't instantiate CarcaBotAI here (it needs the SDK scaffolding);
// instead we replicate the MC loop from runMonteCarlo and measure that
// rollout count scales with budget.
// ---------------------------------------------------------------------------

describe('MCTS budget utilisation', () => {
  it('can complete at least a few rollouts in 1 second on testPos', () => {
    const deck = computeDeck(testPos.tiles)
    const scored = scoreAllMoves(testPos, 0)
    scored.sort((a, b) => b.score - a.score)
    const shortlist = scored.slice(0, 8)

    const start = Date.now()
    const deadline = start + 1000
    let total = 0
    while (Date.now() < deadline) {
      let did = false
      for (const s of shortlist) {
        if (Date.now() >= deadline) break
        runPlayout(testPos, s.move, 0, deck, 10)
        total++
        did = true
      }
      if (!did) break
    }
    // Should complete a reasonable number of rollouts in 1s. Exact count
    // depends on the host, but MUST exceed the shortlist size — otherwise
    // the bot would effectively only sample every candidate at most once
    // and MC would be pure noise.
    expect(total).toBeGreaterThan(shortlist.length)
  })
})
