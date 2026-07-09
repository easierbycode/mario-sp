import type Phaser from 'phaser'

export interface ISpriteConstructor {
  scene: Phaser.Scene
  x: number
  y: number
  texture: string
  frame?: string | number
}

export interface IBoxConstructor extends ISpriteConstructor {
  content: any
}

export interface IBrickConstructor extends ISpriteConstructor {
  value: number
}

export interface ICollectibleConstructor extends ISpriteConstructor {
  points: number
}

export interface IPlatformConstructor extends ISpriteConstructor {
  tweenProps: any
}

export interface IPortalDestination {
  x: number
  y: number
  dir: string
}

export interface IPortalConstructor {
  scene: Phaser.Scene
  spawn: IPortalDestination
  x: number
  y: number
  width?: number
  height?: number
}
