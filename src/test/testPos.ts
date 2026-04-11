import type { GamePosition } from '../ai/types.js'

export const testPos: GamePosition = {
  tiles: [
    {
      index: 0,
      place: {
        point: {
          x: 0,
          y: 0,
        },
        rotation: 0,
      },
    },
    {
      index: 61,
      place: {
        point: {
          x: 0,
          y: 1,
        },
        rotation: 1,
      },
    },
    {
      index: 9,
      place: {
        point: {
          x: 0,
          y: -1,
        },
        rotation: 1,
      },
    },
    {
      index: 55,
      place: {
        point: {
          x: 1,
          y: 0,
        },
        rotation: 0,
      },
    },
    {
      index: 47,
      place: {
        point: {
          x: 1,
          y: -1,
        },
        rotation: 0,
      },
    },
    {
      index: 18,
      place: {
        point: {
          x: 1,
          y: -2,
        },
        rotation: 0,
      },
    },
    {
      index: 56,
      place: {
        point: {
          x: 0,
          y: -2,
        },
        rotation: 3,
      },
    },
    {
      index: 21,
      place: {
        point: {
          x: 2,
          y: -1,
        },
        rotation: 2,
      },
    },
    {
      index: 22,
      place: {
        point: {
          x: 1,
          y: 1,
        },
        rotation: 2,
      },
    },
    {
      index: 65,
      place: {
        point: {
          x: -1,
          y: -2,
        },
        rotation: 3,
      },
    },
    {
      index: 38,
      place: {
        point: {
          x: 2,
          y: 0,
        },
        rotation: 0,
      },
    },
    {
      index: 48,
      place: {
        point: {
          x: -1,
          y: -3,
        },
        rotation: 0,
      },
    },
    {
      index: 60,
      place: {
        point: {
          x: -1,
          y: 0,
        },
        rotation: 1,
      },
    },
    {
      index: 31,
      place: 0,
    },
    {
      index: 64,
      place: 1,
    },
  ],
  currentPlayer: 0,
  points: [0, 0],
  mipples: [7, 7],
  lastMoves: [
    {
      x: -1,
      y: -3,
    },
    {
      x: -1,
      y: 0,
    },
  ],
  lastPoints: [],
  stage: 0,
}
