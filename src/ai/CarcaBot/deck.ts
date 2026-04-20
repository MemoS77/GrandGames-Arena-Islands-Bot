import { utils } from '@ai/utils/islands_utils.js'
import type { TileState, Tile } from '@ai/utils/IUtils.js'

/**
 * Information about the remaining tiles that can still be drawn from the
 * deck (i.e. tiles whose index we do NOT yet know).
 *
 * The game only tells us the `index` of tiles that are visible: placed on
 * the board, in our own hand, and sometimes the opponent's hand. Every
 * other tile has `index: null`. Those unknown tiles, by elimination,
 * belong to the remaining multiset `full_tile_set - known_tiles`.
 */
export type DeckInfo = {
  /** index -> how many copies of that tile definition are still unknown */
  distribution: Map<number, number>
  /** total amount of unknown tiles (sum of distribution values) */
  total: number
  /** tile definitions indexed by their position in the tileset */
  tileSet: Tile[]
}

/**
 * Build the distribution of tiles that might still be drawn.
 *
 * We start from the full 72-tile standard Carcassonne set and subtract
 * every tile whose index we already know (on the board, in a visible hand
 * or explicitly removed from the game).
 */
export function computeDeck(tiles: TileState[]): DeckInfo {
  const tileSet = utils.getTileSet()
  const distribution = new Map<number, number>()

  // Each position in the tileset is exactly one physical tile of the game.
  for (let i = 0; i < tileSet.length; i++) {
    distribution.set(i, 1)
  }

  for (const t of tiles) {
    if (t.index === null) continue
    const cur = distribution.get(t.index)
    if (cur === undefined) continue
    if (cur <= 1) distribution.delete(t.index)
    else distribution.set(t.index, cur - 1)
  }

  let total = 0
  for (const c of distribution.values()) total += c

  return { distribution, total, tileSet }
}

/**
 * Rough scalar in [0..1] capturing how much the deck still has to offer.
 * Near 1 when many tiles remain, near 0 at the end of the game.
 */
export function deckStrength(deck: DeckInfo): number {
  return Math.min(1, deck.total / 30)
}
