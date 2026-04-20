import { utils } from '@ai/utils/islands_utils.js'
import type { AIMove, Tile, TileState } from '@ai/utils/IUtils.js'

/**
 * Number of segments on a tile. Segment ordering follows the standard
 * Carcassonne convention used by the utils library: roads first, then
 * cities, then fields, then monastery (if present).
 */
export function getSegmentCount(tileDef: Tile): number {
  return (
    (tileDef.roads?.length ?? 0) +
    (tileDef.cities?.length ?? 0) +
    (tileDef.fields?.length ?? 0) +
    (tileDef.monastery ? 1 : 0)
  )
}

/**
 * Locate the hand tile that belongs to a given player. A hand tile has
 * its `place` field set to the player index and a visible `index`.
 */
export function findHandTile(
  tiles: TileState[],
  playerIdx: number,
): { tile: TileState; arrayIndex: number } | null {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!
    if (
      typeof t.place === 'number' &&
      t.place === playerIdx &&
      t.index !== null
    ) {
      return { tile: t, arrayIndex: i }
    }
  }
  return null
}

/**
 * Result of simulating a move: the new tile list AND the new per-player
 * meeple-reserve vector (decremented for the acting player when a meeple
 * was deployed).
 */
export type SimResult = {
  tiles: TileState[]
  mipples: number[]
  deployed: boolean
}

/**
 * Produce a shallow clone of the tile list where the given player's
 * hand tile has been placed on the board according to `move`. If the
 * move contains a meeple segment, the corresponding `mipples` slot is
 * set to the player index AND the player's reserve count is decremented
 * in the returned `mipples` vector.
 *
 * The function is intentionally pure: the original `tiles` and
 * `reserveMipples` arrays are not mutated — this lets the search
 * explore many variations without side effects.
 */
export function applyMove(
  tiles: TileState[],
  reserveMipples: number[],
  move: AIMove,
  playerIdx: number,
): SimResult {
  const next: TileState[] = tiles.map((t) => ({ ...t }))
  const mipples = reserveMipples.slice()
  const hand = findHandTile(next, playerIdx)
  if (!hand || hand.tile.index === null) {
    return { tiles: next, mipples, deployed: false }
  }

  const tileDef = utils.getTileDef(hand.tile.index)
  const segCount = getSegmentCount(tileDef)
  const tileMipples: (number | null)[] = new Array(segCount).fill(null)

  let deployed = false
  if (
    move.meepleSegment !== null &&
    move.meepleSegment >= 0 &&
    move.meepleSegment < segCount &&
    (mipples[playerIdx] ?? 0) > 0
  ) {
    tileMipples[move.meepleSegment] = playerIdx
    mipples[playerIdx] = (mipples[playerIdx] ?? 0) - 1
    deployed = true
  }

  next[hand.arrayIndex] = {
    index: hand.tile.index,
    place: { point: { ...move.point }, rotation: move.rotation },
    mipples: tileMipples,
  }
  return { tiles: next, mipples, deployed }
}
