import type { GameAI } from './ai/GameAI.js'
import RandomMoveAI from './ai/RandomMove/RandomMoveAI.js'
import type { GamePosition } from './ai/types.js'
import { TOKEN, SERVER } from './conf.js'
import log from './log.js'
import { BotSDK, GameId } from 'gga-bots'
import { PositionQueue } from './queue.js'

console.clear()

const sdk = new BotSDK()
const queue = new PositionQueue(sdk)

sdk.onPosition<GamePosition>((p) => {
  queue.handlePosition(p)
})

const connect = () => {
  sdk
    .connect(TOKEN!, [GameId.Islands], { serverUrl: SERVER })
    .then((v) => {
      log('Connected! User info: ', v)
      const ai: GameAI = new RandomMoveAI(sdk)
      ai.init(v.login)
      queue.setAI(ai)
    })
    .catch((err) => {
      log(`Can't connect`, err)
    })
}

sdk.onDisconnect((code) => {
  log(`Disconnected with code: ${code}`)
  setTimeout(() => {
    connect()
  }, 3000)
})

connect()
