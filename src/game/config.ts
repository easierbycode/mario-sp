import Phaser from 'phaser'
import { BootScene } from './scenes/boot-scene'
import { GameScene } from './scenes/game-scene'
import { HUDScene } from './scenes/hud-scene'
import { LevelE1Scene } from './scenes/levele1-scene'
import { MenuScene } from './scenes/menu-scene'

export const GAME_WIDTH = 160
export const GAME_HEIGHT = 144

export const scenes = [BootScene, MenuScene, HUDScene, GameScene, LevelE1Scene]

export const physics: Phaser.Types.Core.PhysicsConfig = {
  default: 'arcade',
  arcade: {
    gravity: { x: 0, y: 475 },
    debug: false,
  },
}
