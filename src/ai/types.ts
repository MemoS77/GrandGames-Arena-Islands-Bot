import type { TileState, Point } from './logic/types.js'

export const StateStage = {
  // Player must make a move
  PlayerMove: 0,
  // Move made, need to calculate turn points
  CalcPoints: 1,
  // Tiles finished, need to calculate all points
  FinishCalc: 3,
  // Game ended
  GameNotActive: 4,
} as const

export type StateStage = (typeof StateStage)[keyof typeof StateStage]

export type PlayerLastPointsInfo = {
  // Player index
  id: number
  // Entity for which points were awarded
  kind: 'r' | 'c' | 'f' | 'm'
  // How many points awarded
  count: number
}

export type GamePosition = {
  stage: StateStage
  tiles: TileState[]
  currentPlayer: number | null
  points: number[]
  mipples: number[]
  lastMoves: (Point | null)[] // Last moves of players, null - if no move
  lastPoints: PlayerLastPointsInfo[] // Last points of players
}
