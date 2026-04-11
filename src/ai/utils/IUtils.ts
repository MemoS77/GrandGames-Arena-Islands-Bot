/**
 * Interface for the Utils class that provides game logic utilities for Carcassonne game.
 * This interface contains all necessary types and method signatures to make it portable
 * and usable in other projects without dependencies.
 */

// ============================================================================
// BASIC TYPES
// ============================================================================

/**
 * Represents a 2D point with x and y coordinates
 */
export type Point = {
  x: number
  y: number
}

/**
 * Enum representing the four sides of a tile
 */
export enum Side {
  N = 0, // North
  E = 1, // East
  S = 2, // South
  W = 3, // West
}

/**
 * Enum representing field slots around a tile perimeter
 * Each side has 2 slots: N: 0(left), 1(right), E: 2(top), 3(bottom), etc.
 */
export enum FieldSlot {
  N_L = 0, // North Left
  N_R = 1, // North Right
  E_T = 2, // East Top
  E_B = 3, // East Bottom
  S_R = 4, // South Right
  S_L = 5, // South Left
  W_B = 6, // West Bottom
  W_T = 7, // West Top
}

// ============================================================================
// GAME STAGES
// ============================================================================

/**
 * Game state stages representing different phases of the game
 */
export const StateStage = {
  /** Player must make a move */
  PlayerMove: 0,
  /** Move made, need to calculate turn points */
  CalcPoints: 1,
  /** Tiles ended, need to calculate all final points */
  FinishCalc: 3,
  /** Game is finished */
  GameNotActive: 4,
} as const

export type StateStage = (typeof StateStage)[keyof typeof StateStage]

// ============================================================================
// TILE STRUCTURES
// ============================================================================

/**
 * Represents a segment on a tile (road, city, etc.)
 * A single tile can have multiple disconnected segments
 */
export type TileSegment = {
  /** Which sides of the tile this segment occupies */
  sides: Side[]
  /** Shield on city in standard rules (double points) */
  double?: boolean
  /** Relative coordinates for meeple placement (0-100, where 50,50 is tile center) */
  meeplePoint?: { x: number; y: number }
}

/**
 * Represents a field segment on a tile
 */
export type FieldSegment = {
  /** Which field slots this segment occupies */
  slots: FieldSlot[]
  /** Relative coordinates for meeple placement */
  meeplePoint: { x: number; y: number }
  /** Indices of cities that touch this field segment */
  city?: number[]
}

/**
 * Complete tile definition with all its segments
 */
export type Tile = {
  /** Index in the raster tile map */
  mapIndex?: number
  /** Road segments on this tile */
  roads?: TileSegment[]
  /** City segments on this tile */
  cities?: TileSegment[]
  /** Field segments on this tile */
  fields?: FieldSegment[]
  /** Monastery (always at tile center 50,50) */
  monastery?: boolean
}

/**
 * Represents tile placement on the game board
 */
export type TilePlace = {
  point: Point
  rotation: number
}

/**
 * Represents the state of a tile in the game
 */
export type TileState = {
  /** Tile index in tileset, null means tile is hidden from player */
  index: number | null
  /** Tile placement: on board (TilePlace), in hand (number), removed from game (null) */
  place: TilePlace | null | number
  /** Meeples on each segment of the tile, null means no meeple */
  mipples?: (number | null)[]
}

// ============================================================================
// GAME STRUCTURES
// ============================================================================

/**
 * Information about points awarded to a player
 */
export type PlayerLastPointsInfo = {
  /** Player index */
  id: number
  /** Entity type for which points were awarded: r=road, c=city, f=field, m=monastery */
  kind: 'r' | 'c' | 'f' | 'm'
  /** Number of points awarded */
  count: number
}

/**
 * Complete game position containing all game state
 */
export type GamePosition = {
  /** Current game stage */
  stage: StateStage
  /** All tiles in the game (on board, in hands, removed) */
  tiles: TileState[]
  /** Current player index */
  currentPlayer: number | null
  /** Points for each player (-1 means surrendered) */
  points: number[]
  /** Remaining meeples for each player */
  mipples: number[]
  /** Last moves of players, null means no move yet */
  lastMoves: (Point | null)[]
  /** Last points awarded to players */
  lastPoints: PlayerLastPointsInfo[]
}

/**
 * Represents an AI move with all necessary information
 */
export type AIMove = {
  /** Where to place the tile */
  point: Point
  /** Tile rotation (0-3, 90-degree increments) */
  rotation: number
  /** Which segment to place meeple on, null means no meeple */
  meepleSegment: number | null
  /** Move score for AI evaluation */
  score: number
}

// ============================================================================
// TILE PLACEMENT STRUCTURES
// ============================================================================

/**
 * Represents a valid tile placement on the board
 */
export type TilePlacement = {
  /** Position where tile can be placed */
  point: Point
  /** Tile rotation */
  rotation: number
}

/**
 * Represents a segment location on a tile
 */
export type SegmentLocation = {
  point: Point
  localSegmentIndex: number
}

/**
 * Represents a field segment location on a tile
 */
export type FieldSegmentLocation = {
  point: Point
  fieldIndex: number
}

/**
 * Road entity with all its properties
 */
export type RoadEntity = {
  /** All tiles that make up this road */
  tiles: Point[]
  /** Segment locations in this road */
  segmentLocations: SegmentLocation[]
  /** Number of segments in this road */
  segments: number
  /** Meeples on this road mapped by player index to count */
  meeples: Map<number, number>
  /** Whether this road is completed */
  completed: boolean
}

/**
 * City entity with all its properties
 */
export type CityEntity = {
  /** All tiles that make up this city */
  tiles: Point[]
  /** Segment locations in this city */
  segmentLocations: SegmentLocation[]
  /** Number of segments in this city */
  segments: number
  /** Number of shields in this city (for double points) */
  shields: number
  /** Meeples on this city mapped by player index to count */
  meeples: Map<number, number>
  /** Whether this city is completed */
  completed: boolean
  /** City name (for identification) */
  name: string
}

/**
 * Monastery entity with all its properties
 */
export type MonasteryEntity = {
  /** Center tile coordinates */
  center: Point
  /** Number of surrounding tiles (0-8) */
  surroundingTiles: number
  /** Player who owns the meeple, null if no meeple */
  meeple: number | null
  /** Whether monastery is completed (8 surrounding tiles) */
  completed: boolean
}

/**
 * Field entity with all its properties
 */
export type FieldEntity = {
  /** All tiles that make up this field */
  tiles: Point[]
  /** Segment tiles in this field */
  segmentTiles: FieldSegmentLocation[]
  /** Meeples on this field mapped by player index to count */
  meeples: Map<number, number>
  /** Adjacent cities (for final scoring) */
  adjacentCities: Set<string>
  /** Calculated points (filled during final scoring) */
  points?: number
}

/**
 * Complete game entities analysis result
 */
export type GameEntities = {
  /** All road entities on the board */
  roads: RoadEntity[]
  /** All city entities on the board */
  cities: CityEntity[]
  /** All monastery entities on the board */
  monasteries: MonasteryEntity[]
  /** All field entities on the board */
  fields: FieldEntity[]
}

// ============================================================================
// UTILS INTERFACE
// ============================================================================

/**
 * Interface for Utils class providing game logic utilities
 * This class serves as a facade for various game logic operations
 */
export interface IUtils {
  /**
   * Gets all valid placements for a tile on the current board
   * @param tiles - Current tile states on the board
   * @param tileDef - Tile definition to place
   * @returns Array of valid placements
   */
  getAllValidPlacements: (tiles: TileState[], tileDef: Tile) => TilePlacement[]

  /**
   * Gets tile definition by index from the standard tile set
   * @param index - Tile index in the tile set
   * @returns Tile definition (deep cloned)
   */
  getTileDef: (index: number) => Tile

  /**
   * Gets the complete standard tile set (72 tiles for Carcassonne)
   * @returns Array of all tile definitions (deep cloned)
   */
  getTileSet: () => Tile[]

  /**
   * Analyzes all game entities (roads, cities, fields, monasteries) on the board
   * @param tiles - Current tile states on the board
   * @returns Object containing all game entities grouped by type
   */
  analyzeGameEntities: (tiles: TileState[]) => GameEntities

  /**
   * Converts an AI move to engine format string
   * Format: "x,y,rotation,segment" or "x,y,rotation" if no meeple
   * @param move - AI move to convert
   * @returns String representation of the move
   */
  moveToString: (move: AIMove) => string

  /**
   * Gets all available moves for the current player
   * Includes both moves with and without meeple placement
   * @param position - Current game position
   * @returns Array of all possible moves
   */
  getAllMoves: (position: GamePosition) => AIMove[]

  /**
   * Checks if a meeple can be placed on a specific segment
   * @param tiles - Current tile states on the board
   * @param point - Where the tile is placed
   * @param rotation - Tile rotation
   * @param tileDef - Tile definition
   * @param segmentIndex - Which segment to place meeple on
   * @returns True if meeple can be placed
   */
  canPlaceMeeple: (
    tiles: TileState[],
    point: Point,
    rotation: number,
    tileDef: Tile,
    segmentIndex: number,
  ) => boolean
}
