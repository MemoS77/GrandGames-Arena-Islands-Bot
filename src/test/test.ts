import { testPos } from './testPos.js'
import RandomMoveAI from '../ai/RandomMove/RandomMoveAI.js'
import type { PositionInfo } from 'gga-bots'
import type { GamePosition } from '../ai/types.js'

const sdk = {
  botLogin: 'TestBot',
} as any
const ai = new RandomMoveAI(sdk)

const fullPos: PositionInfo<GamePosition> = {
  position: testPos,
  botIndex: 0,
  moveNumber: 0,
  fixedMoveTime: true,
  needMove: true,
  game: 0,
  tableId: 0,
  state: 0,
  players: [],
}
ai.getBestMove(fullPos)
  .then((move) => {
    console.log('AI made move', move)
  })
  .catch((err) => {
    console.error('Error making move:', err)
  })
