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
    if (typeof t.place === 'number' && t.place === playerIdx && t.index !== null) {
      return { tile: t, arrayIndex: i }
    }
  }
  return null
}

/**
 * Produce a shallow clone of the tile list where the given player's
 * hand tile has been placed on the board according to `move`. If the
 * move contains a meeple segment, the corresponding `mipples` slot is
 * set to the player index.
 *
 * The function is intentionally pure: the original `tiles` array is not
 * mutated, which lets us explore many variations without side effects.
 */
export function applyMove(
  tiles: TileState[],
  move: AIMove,
  playerIdx: number,
): TileState[] {
  const next: TileState[] = tiles.map((t) => ({ ...t }))
  const hand = findHandTile(next, playerIdx)
  if (!hand || hand.tile.index === null) return next

  const tileDef = utils.getTileDef(hand.tile.index)
  const segCount = getSegmentCount(tileDef)
  const mipples: (number | null)[] = new Array(segCount).fill(null)

  if (
    move.meepleSegment !== null &&
    move.meepleSegment >= 0 &&
    move.meepleSegment < segCount
  ) {
    mipples[move.meepleSegment] = playerIdx
  }

  next[hand.arrayIndex] = {
    index: hand.tile.index,
    place: { point: { ...move.point }, rotation: move.rotation },
    mipples,
  }
  return next
}
