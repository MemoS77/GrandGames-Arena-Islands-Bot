import { utils } from '@ai/utils/islands_utils.js'
import type { CityEntity, TileState } from '@ai/utils/IUtils.js'

/**
 * Resolve the list of player indices that own the majority of meeples on
 * a structure. A tie awards full points to every tied owner — this is the
 * standard Carcassonne rule.
 */
function ownersOf(meeples: Map<number, number>): number[] {
  if (meeples.size === 0) return []
  let max = 0
  for (const c of meeples.values()) if (c > max) max = c
  const out: number[] = []
  for (const [p, c] of meeples) if (c === max) out.push(p)
  return out
}

/**
 * Compute an exact end-of-game Carcassonne score differential from the
 * bot's point of view (my total minus the average opponent total). Uses
 * the real rules with no probabilistic discounting, including field
 * scoring which only counts *completed* adjacent cities.
 *
 * Used as the terminal value of a Monte-Carlo playout: after simulating
 * N plies forward the board is not yet finished, but this function gives
 * a self-consistent, rule-accurate estimate of what the scores would be
 * if the game ended right now.
 */
export function scoreTerminal(
  tiles: TileState[],
  myIdx: number,
  nPlayers: number,
): number {
  const entities = utils.analyzeGameEntities(tiles)
  const scores: number[] = new Array(nPlayers).fill(0)

  // Roads: 1 point per tile whether complete or not.
  for (const r of entities.roads) {
    const owners = ownersOf(r.meeples)
    if (owners.length === 0) continue
    const pts = r.tiles.length
    for (const o of owners) scores[o] = (scores[o] ?? 0) + pts
  }

  // Cities: 2 per tile + 2 per shield if completed, else 1 per tile +
  // 1 per shield (incomplete endgame scoring).
  for (const c of entities.cities) {
    const owners = ownersOf(c.meeples)
    if (owners.length === 0) continue
    const pts = c.completed
      ? c.tiles.length * 2 + c.shields * 2
      : c.tiles.length + c.shields
    for (const o of owners) scores[o] = (scores[o] ?? 0) + pts
  }

  // Monasteries: 1 + surrounding tiles; whether completed or not the
  // formula is identical because completed means surrounding=8.
  for (const m of entities.monasteries) {
    if (m.meeple === null || m.meeple === undefined) continue
    const pts = 1 + m.surroundingTiles
    scores[m.meeple] = (scores[m.meeple] ?? 0) + pts
  }

  // Fields: 3 per *completed* adjacent city.
  const byName = new Map<string, CityEntity>()
  for (const c of entities.cities) byName.set(c.name, c)
  for (const f of entities.fields) {
    const owners = ownersOf(f.meeples)
    if (owners.length === 0) continue
    let pts = 0
    for (const cn of f.adjacentCities) {
      const city = byName.get(cn)
      if (city?.completed) pts += 3
    }
    if (pts === 0) continue
    for (const o of owners) scores[o] = (scores[o] ?? 0) + pts
  }

  const myScore = scores[myIdx] ?? 0
  let oppSum = 0
  let oppCount = 0
  for (let p = 0; p < nPlayers; p++) {
    if (p === myIdx) continue
    oppSum += scores[p] ?? 0
    oppCount++
  }
  return myScore - (oppCount > 0 ? oppSum / oppCount : 0)
}
