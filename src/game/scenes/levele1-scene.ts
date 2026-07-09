import Phaser from 'phaser'
import Constants from '../constants'
import { AnimationHelper } from '../helpers/animation-helper'
import { Collectible } from '../objects/collectible'
import { Mario } from '../objects/mario'
import { Portal } from '../objects/portal'
import { Turtle } from '../objects/turtle'

// ported from the mario repo's HelloWorldScene (levele1 + rooms);
// all assets are preloaded from public/assets/pack.json in the BootScene
const defaultAnimationFrames: Record<string, any> = {
  waterfall: {
    key: 'waterfall',
    frames: {
      key: 'sma4',
      start: 526,
      end: 529,
      typeOfGeneration: 'generateFrameNumbers',
    },
    frameRate: 8,
    repeat: -1,
  },
}

export class LevelE1Scene extends Phaser.Scene {
  // tilemap
  private map: Phaser.Tilemaps.Tilemap

  // game objects
  private collectibles: Phaser.GameObjects.Group
  private enemies: Phaser.GameObjects.Group
  private groundGroup: Phaser.Physics.Arcade.StaticGroup
  private player: Mario
  private portals: Phaser.GameObjects.Group
  private currentLevel: string

  constructor() {
    super({
      key: 'LevelE1Scene',
    })
  }

  init(): void {
    if (this.registry.get('level') === undefined) {
      this.initGlobalDataManager()
    }
    this.currentLevel = this.registry.get('level')

    // this level was designed around the mario repo's GBA SMB3 physics
    this.registry.set('physics', 'sma4')
  }

  create(): void {
    // *****************************************************************
    // SETUP TILEMAP
    // *****************************************************************

    // create our tilemap from Tiled JSON
    const level = this.registry.get('level')
    this.map = this.make.tilemap({ key: level })
    const tileset = this.map.addTilesetImage('tiles-sma4')

    // backgrounds: metal bricks in the rooms, skyline in the main level
    if (
      [
        'levele1RoomAB',
        'levele1RoomC',
        'levele1RoomDEF',
        'levele1RoomGHIJK',
        'levele1RoomHM',
      ].includes(level)
    ) {
      this.add.tileSprite(
        0,
        0,
        this.map.widthInPixels * 2,
        this.map.heightInPixels * 2,
        'metal-brick'
      )
    } else if (level === 'levele1') {
      this.add.tileSprite(
        0,
        this.map.heightInPixels,
        this.map.widthInPixels * 2,
        160 * 2,
        'bg-level-e1'
      )

      this.add.tileSprite(
        0,
        this.map.heightInPixels - 272,
        this.map.widthInPixels * 2,
        214,
        'clouds'
      )

      this.add.tileSprite(
        0,
        this.map.heightInPixels - (272 + 480 + 16 + 8),
        this.map.widthInPixels * 2,
        214,
        'clouds'
      )
    }

    this.map.createLayer('background', tileset)

    const fgLayer = this.map.createLayer('foreground', tileset)
    fgLayer.setCollisionByProperty({ collides: true })

    fgLayer.forEachTile((tile: Phaser.Tilemaps.Tile) => {
      if (tile.properties.collidesTop) {
        tile.setCollision(false, false, true, false)
      }
    })

    // *****************************************************************
    // GAME OBJECTS
    // *****************************************************************
    this.groundGroup = this.physics.add.staticGroup()
    this.portals = this.add.group({ runChildUpdate: true })
    this.collectibles = this.add.group({ runChildUpdate: true })
    this.enemies = this.add.group({ runChildUpdate: true })

    this.loadObjectsFromTilemap()

    // *****************************************************************
    // COLLIDERS
    // *****************************************************************
    this.physics.add.collider(this.player, this.groundGroup)
    this.physics.add.collider(this.player, fgLayer)
    this.physics.add.collider(
      this.enemies,
      fgLayer,
      this.patrolPlatform,
      null,
      this
    )

    this.physics.add.overlap(
      this.player,
      this.portals,
      this.handlePlayerPortalOverlap,
      () => this.player.body.onFloor(),
      this
    )

    this.physics.add.overlap(
      this.player,
      this.collectibles,
      this.handlePlayerCollectiblesOverlap,
      null,
      this
    )

    // *****************************************************************
    // CAMERA
    // *****************************************************************
    this.cameras.main.startFollow(this.player, true, 1, 1, 0, -36)
    this.cameras.main.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels
    )

    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels
    )
  }

  update(): void {
    if (this.player) {
      this.player.update()

      // WORLD WRAP
      if (this.currentLevel === 'levele1RoomKL') {
        this.physics.world.wrap(this.player)
      }
    }
  }

  private addMapImage(
    image: any
  ): Phaser.Types.Physics.Arcade.ImageWithStaticBody | Phaser.GameObjects.Image {
    let newImage:
      | Phaser.Types.Physics.Arcade.ImageWithStaticBody
      | Phaser.GameObjects.Image
    // Check if collision
    if (image.type === Constants.OBJECT_TYPES.static) {
      // Create static image
      newImage = this.physics.add.staticImage(image.x, image.y, image.name)
      // Set origin and refresh body
      newImage.setOrigin(0, 1).refreshBody()
      // Add to the physics group
      this.groundGroup.add(newImage)
      // Set foreground main depth
      newImage.setDepth(Constants.DEPTH.foregroundMain)
    } else {
      newImage = this.add.image(image.x, image.y, image.name)
      // Set origin
      newImage.setOrigin(0, 1)
      // Set depth: background or main secondary
      if (image.type === Constants.OBJECT_TYPES.background) {
        newImage.setDepth(Constants.DEPTH.background)
      } else {
        newImage.setDepth(Constants.DEPTH.foregroundSecondary)
      }
    }
    // Set name
    newImage.setName(image.id)
    // Result
    return newImage
  }

  private loadObjectsFromTilemap(): void {
    this.map.getObjectLayer('objects').objects.forEach((object: any) => {
      if (Array.isArray(object.properties)) this.formatProperties(object)

      if (object.id >= 38 && object.id <= 55) {
        // Animated waterfall
        const newSprite = this.make.sprite({
          key: 'sma4',
          frame: 526,
          x: object.x,
          y: object.y,
          origin: { x: 0, y: 1 },
          depth: Constants.DEPTH.foregroundMain,
        })

        if (!this.anims.exists('waterfall')) {
          new AnimationHelper(this, {
            anims: [defaultAnimationFrames['waterfall']],
          })
        }

        newSprite.play('waterfall')
      }

      if (object.name === 'turtle-red') {
        this.enemies.add(
          new Turtle({
            x: object.x,
            y: object.y,
            scene: this,
            texture: 'turtle-red',
          })
        )
      }

      if (object.type === 'portal') {
        this.portals.add(
          new Portal({
            scene: this,
            x: object.x,
            y: object.y,
            height: object.width,
            width: object.height,
            spawn: {
              x: object.properties.marioSpawnX,
              y: object.properties.marioSpawnY,
              dir: object.properties.direction,
            },
          }).setName(object.name)
        )
      }

      if (object.type === 'player') {
        this.player = new Mario({
          scene: this,
          x: this.registry.get('spawn').x,
          y: this.registry.get('spawn').y,
          texture: 'mario',
        }).setDepth(Constants.DEPTH.important) as Mario
      }

      if (object.type === 'collectible') {
        this.collectibles.add(
          new Collectible({
            animated: object.properties.animated,
            scene: this,
            x: object.x,
            y: object.y,
            texture: object.properties.kindOfCollectible,
            points: 100,
          })
        )
      }

      if (
        object.type === Constants.OBJECT_TYPES.image ||
        object.type === Constants.OBJECT_TYPES.static ||
        object.type === Constants.OBJECT_TYPES.background
      ) {
        this.addMapImage(object)
      }
    }, this)
  }

  private formatProperties(object: any): void {
    const propertiesFormatted: Record<string, any> = {}
    object.properties.forEach(
      (p: any) => (propertiesFormatted[p.name] = p.value)
    )
    object.properties = propertiesFormatted
  }

  private handlePlayerCollectiblesOverlap(
    _player: Mario,
    _collectible: Collectible
  ): void {
    switch (_collectible.texture.key) {
      case 'flower': {
        break
      }
      case 'mushroom': {
        _player.growMario()
        break
      }
      case 'star': {
        break
      }
      default: {
        break
      }
    }
    _collectible.collected()
  }

  private handlePlayerPortalOverlap(_player: Mario, _portal: Portal): void {
    if (
      (_player.actionIsDown('down') &&
        _portal.getPortalDestination().dir === 'down') ||
      (_player.actionIsDown('right') &&
        _portal.getPortalDestination().dir === 'right') ||
      (_player.actionIsDown('up') &&
        _portal.getPortalDestination().dir === 'up')
    ) {
      // set new level and new destination for mario
      this.registry.set('level', _portal.name)
      this.registry.set('spawn', {
        x: _portal.getPortalDestination().x,
        y: _portal.getPortalDestination().y,
        dir: _portal.getPortalDestination().dir,
      })

      // restart the scene to load the new room
      this.scene.restart()
    }
  }

  private initGlobalDataManager(): void {
    this.registry.set('level', 'levele1')
    this.registry.set('spawn', { x: 16, y: 994, dir: 'down' })
    this.registry.set('marioSize', 'small')
  }

  private patrolPlatform(enemy: any, platform: any): void {
    // if enemy moving to right and has started to move over right edge of platform
    if (enemy.body.velocity.x > 0 && enemy.body.center.x > platform.right) {
      // check to see if next tile to the right collides
      const nextTileCollides = this.map.findTile(
        (t: Phaser.Tilemaps.Tile) => t.collides,
        this,
        platform.x + 1,
        platform.y,
        1,
        1
      )
      // if tile does not collide, reverse direction (because if we keep going we will fall)
      if (!nextTileCollides) {
        enemy.speed *= -1
      }
    }

    // else if enemy moving to left and has started to move over left edge of platform
    else if (
      enemy.body.velocity.x < 0 &&
      enemy.body.center.x < platform.pixelX
    ) {
      // check to see if next tile to the left collides
      const nextTileCollides = this.map.findTile(
        (t: Phaser.Tilemaps.Tile) => t.collides,
        this,
        platform.x - 1,
        platform.y,
        1,
        1
      )
      // if tile does not collide, reverse direction (because if we keep going we will fall)
      if (!nextTileCollides) {
        enemy.speed *= -1
      }
    }
  }
}
