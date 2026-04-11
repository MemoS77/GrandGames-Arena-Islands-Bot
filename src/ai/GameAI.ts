import type { BotSDK, PositionInfo } from 'gga-bots'
import { type GamePosition } from './types.js'

export abstract class GameAI {
  protected botLogin?: string

  constructor(protected sdk: BotSDK) {}
  // Init databese, bind hadlers, etc
  async init(botLogin: string): Promise<void> {
    console.log('Initializing AI with bot login:', botLogin)
    this.botLogin = botLogin
  }

  // Get best move for current position
  abstract getBestMove(pos: PositionInfo<GamePosition>): Promise<string>
  abstract onGameEnd(tableId: number): void
}
