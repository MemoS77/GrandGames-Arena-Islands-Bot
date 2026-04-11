import type { GameAI } from './ai/GameAI.js'
import { StateStage, type GamePosition } from './ai/types.js'
import log from './log.js'
import { BotSDK, TableState, type PositionInfo } from 'gga-bots'
import { getPositionKey } from './utils.js'

export class PositionQueue {
  private positionQueue: PositionInfo<GamePosition>[] = []
  private processingKey: string | null = null
  private ai: GameAI | null = null
  private sdk: BotSDK

  constructor(sdk: BotSDK) {
    this.sdk = sdk
  }

  setAI(ai: GameAI) {
    this.ai = ai
  }

  private async processQueue() {
    if (this.processingKey !== null || this.positionQueue.length === 0) return
    if (!this.ai) {
      // Wait for AI initialization
      setTimeout(() => this.processQueue(), 500)
      return
    }

    const p = this.positionQueue.shift()!
    this.processingKey = getPositionKey(p)

    try {
      if (p.botIndex === null) return
      const move = await this.ai.getBestMove(p)

      try {
        log('AI made move', move)
        /*const newPos = */ await this.sdk.move(p.tableId!, move)
        //log('Move made successfully. New position: ', newPos)
      } catch (err) {
        console.error('Error making move:', err)
      }
    } catch (err) {
      console.error('Error processing position:', err)
    } finally {
      this.processingKey = null
      this.processQueue()
    }
  }

  handlePosition(p: PositionInfo<GamePosition>) {
    //log('Position received in onPosition:', p)
    if (p.state === TableState.Finished || p.state === TableState.Canceled) {
      if (this.ai) this.ai.onGameEnd(p.tableId)
      return
    }

    if (!p.needMove) return

    const key = getPositionKey(p)
    if (key === this.processingKey) return

    const existingIndex = this.positionQueue.findIndex(
      (q) => getPositionKey(q) === key,
    )
    if (existingIndex !== -1) return

    const sameTableIndex = this.positionQueue.findIndex(
      (q) => q.tableId === p.tableId,
    )
    if (sameTableIndex !== -1) {
      this.positionQueue[sameTableIndex] = p
      //log('Position updated in queue', p.tableId)
    } else {
      this.positionQueue.push(p)
      //log('Position added to queue', p.tableId)
    }

    this.processQueue()
  }
}
