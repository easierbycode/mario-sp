import Phaser from 'phaser'
import Constants from '../constants'
import { gamepad } from '../../lib/gamepad.svelte'
import { Box } from '../objects/box'
import { Brick } from '../objects/brick'
import { Collectible } from '../objects/collectible'
import { Goomba } from '../objects/goomba'
import { Mario } from '../objects/mario'
import { Platform } from '../objects/platform'
import { Portal } from '../objects/portal'

export class GameScene extends Phaser.Scene {
  // tilemap
  private map: Phaser.Tilemaps.Tilemap
  private tileset: Phaser.Tilemaps.Tileset
  private backgroundLayer: Phaser.Tilemaps.TilemapLayer
  private foregroundLayer: Phaser.Tilemaps.TilemapLayer

  // game objects
  private boxes: Phaser.GameObjects.Group
  private bricks: Phaser.GameObjects.Group
  private collectibles: Phaser.GameObjects.Group
  private enemies: Phaser.GameObjects.Group
  private platforms: Phaser.GameObjects.Group
  private player: Mario
  private portals: Phaser.GameObjects.Group
  private currentLevel: string

  constructor() {
    super({
      key: 'GameScene',
    })
  }

  init(): void {
    if (this.registry.get("level") === undefined) {
      Mario.initGlobalDataManager(this);
      this.currentLevel = this.registry.get("level");
    } else {
      this.currentLevel = this.registry.get("level");
    }
  }

  create(): void {
    // scale gravity with the tile size, like levele1-scene does — mario
    // multiplies his velocities by physicsScale, and trajectories only keep
    // their tile-height if gravity scales by the same factor
    this.physics.world.gravity.y =
      475 * (this.registry.get('physicsScale') ?? 1)

    // *****************************************************************
    // SETUP TILEMAP
    // *****************************************************************

    const key = this.registry.get('level')
    // the Vegas maps (levelVegas, levelVegasRoom1) share the castle tileset
    // and bg/ground layer names; the GB maps use tiles.png and
    // backgroundLayer/foregroundLayer
    const isVegas = key.startsWith('levelVegas')

    // create our tilemap from Tiled JSON
    this.map = this.make.tilemap({ key })
    // add our tileset and layers to our tilemap
    // Vegas uses a 16px extruded tileset (1px margin, 2px spacing); the GB
    // levels' 8px tileset uses the sizes embedded in the map itself
    this.tileset = isVegas
      ? this.map.addTilesetImage('tiles', 'tileset', 16, 16, 1, 2)
      : this.map.addTilesetImage('tiles')
    this.backgroundLayer = this.map.createLayer(
      isVegas ? 'bg' : 'backgroundLayer',
      this.tileset,
      0,
      0
    )

    this.foregroundLayer = this.map.createLayer(
      isVegas ? 'ground' : 'foregroundLayer',
      this.tileset,
      0,
      0
    )
    this.foregroundLayer.setName('foregroundLayer')

    // pin the tile layers' depths so decoration sprites can slot between
    // them (bg wall < decorations < ground/objects)
    this.backgroundLayer.setDepth(Constants.DEPTH.background)
    this.foregroundLayer.setDepth(Constants.DEPTH.foregroundMain)

    // set collision for solid tiles — the GB maps mark them with 'collide'
    // (old tileproperties format), Vegas with 'collision' (new tiles array);
    // setCollisionByProperty matches a tile on any listed property
    this.foregroundLayer.setCollisionByProperty({ collide: true, collision: true })

    // *****************************************************************
    // GAME OBJECTS
    // *****************************************************************
    this.portals = this.add.group({ runChildUpdate: true })
    this.boxes = this.add.group({ runChildUpdate: true })
    this.bricks = this.add.group({ runChildUpdate: true })
    this.collectibles = this.add.group({ runChildUpdate: true })
    this.enemies = this.add.group({ runChildUpdate: true })
    this.platforms = this.add.group({ runChildUpdate: true })

    this.loadObjectsFromTilemap()

    // *****************************************************************
    // COLLIDERS
    // *****************************************************************
    this.physics.add.collider(this.player, this.foregroundLayer)
    this.physics.add.collider(this.enemies, this.foregroundLayer)
    this.physics.add.collider(this.enemies, this.boxes)
    this.physics.add.collider(this.enemies, this.bricks)
    this.physics.add.collider(this.player, this.bricks)

    this.physics.add.collider(
      this.player,
      this.boxes,
      this.playerHitBox,
      null,
      this
    )

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handlePlayerEnemyOverlap,
      null,
      this
    )

    this.physics.add.overlap(
      this.player,
      this.portals,
      this.handlePlayerPortalOverlap,
      null,
      this
    )

    this.physics.add.collider(
      this.player,
      this.platforms,
      this.handlePlayerOnPlatform,
      null,
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
    this.cameras.main.startFollow(this.player)
    this.cameras.main.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels
    )

    // mario's fell-into-a-hole check compares against world.bounds.bottom,
    // which defaults to the 160x144 canvas — too short for Vegas' 224px-tall
    // map (he'd "die" mid-air while still above the ground)
    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels
    )
  }

  update(): void {
    this.player.update()
  }

  private loadObjectsFromTilemap(): void {
    // get the object layer in the tilemap named 'objects'
    const objects = this.map.getObjectLayer('objects').objects as any[]

    objects.forEach((object) => {
      if (object.type === Constants.OBJECT_TYPES.image) {
        // decoration sprite — Tiled image objects anchor at bottom-left, and
        // the object name doubles as the texture key (and animation key for
        // the multi-frame aseprite exports)
        const decoration = this.add
          .sprite(object.x, object.y, object.name)
          .setOrigin(0, 1)
          .setDepth(Constants.DEPTH.foregroundSecondary)
          .setFlipX(!!object.flippedHorizontal)

        if (this.anims.exists(object.name)) {
          decoration.play(object.name)
        }
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
        })
      }

      if (object.type === 'goomba') {
        this.enemies.add(
          new Goomba({
            scene: this,
            x: object.x,
            y: object.y,
            texture: 'goomba',
          })
        )
      }

      if (object.type === 'brick') {
        this.bricks.add(
          new Brick({
            scene: this,
            x: object.x,
            y: object.y,
            texture: 'brick',
            value: 50,
          })
        )
      }

      if (object.type === 'box') {
        this.boxes.add(
          new Box({
            scene: this,
            content: object.properties.content,
            x: object.x,
            y: object.y,
            texture: 'box',
          })
        )
      }

      if (object.type === 'collectible') {
        this.collectibles.add(
          new Collectible({
            scene: this,
            x: object.x,
            y: object.y,
            texture: object.properties.kindOfCollectible,
            points: 100,
          })
        )
      }

      if (object.type === 'platformMovingUpAndDown') {
        this.platforms.add(
          new Platform({
            scene: this,
            x: object.x,
            y: object.y,
            texture: 'platform',
            tweenProps: {
              y: {
                value: 50,
                duration: 1500,
                ease: 'Power0',
              },
            },
          })
        )
      }

      if (object.type === 'platformMovingLeftAndRight') {
        this.platforms.add(
          new Platform({
            scene: this,
            x: object.x,
            y: object.y,
            texture: 'platform',
            tweenProps: {
              x: {
                value: object.x + 50,
                duration: 1200,
                ease: 'Power0',
              },
            },
          })
        )
      }
    })
  }

  /**
   * Player <-> Enemy Overlap
   */
  private handlePlayerEnemyOverlap(_player: Mario, _enemy: Goomba): void {
    if (_player.body.touching.down && _enemy.body.touching.up) {
      // player hit enemy on top
      _player.bounceUpAfterHitEnemyOnHead()
      _enemy.gotHitOnHead()
      this.add.tween({
        targets: _enemy,
        props: { alpha: 0 },
        duration: 1000,
        ease: 'Power0',
        yoyo: false,
        onComplete: function () {
          _enemy.isDead()
        },
      })
    } else {
      // player got hit from the side or on the head
      if (_player.getVulnerable()) {
        _player.gotHit()
      }
    }
  }

  /**
   * Player <-> Box Collision
   */
  private playerHitBox(_player: Mario, _box: Box): void {
    if (_box.body.touching.down && _box.active) {
      // ok, mario has really hit a box on the downside
      _box.yoyoTheBoxUpAndDown()
      this.collectibles.add(_box.spawnBoxContent())

      switch (_box.getBoxContentString()) {
        // have a look what is inside the box! Christmas time!
        case 'coin':
        case 'rotatingCoin': {
          _box.tweenBoxContent({ y: _box.y - 40, alpha: 0 }, 700, function () {
            _box.getContent().destroy()
          })

          _box.addCoinAndScore(1, 100)
          break
        }
        case 'flower': {
          _box.tweenBoxContent({ y: _box.y - 8 }, 200, function () {
            _box.getContent().anims.play('flower')
          })

          break
        }
        case 'mushroom':
        case 'star': {
          _box.popUpCollectible()
          break
        }
        default: {
          break
        }
      }
      _box.startHitTimeline()
    }
  }

  private handlePlayerPortalOverlap(_player: Mario, _portal: Portal): void {
    if (
      (_player.actionIsDown('down') &&
        _portal.getPortalDestination().dir === 'down') ||
      (_player.actionIsDown('right') &&
        _portal.getPortalDestination().dir === 'right')
    ) {
      // set new level and new destination for mario
      this.registry.set('level', _portal.name)
      this.registry.set('spawn', {
        x: _portal.getPortalDestination().x,
        y: _portal.getPortalDestination().y,
        dir: _portal.getPortalDestination().dir,
      })

      // restart the game scene
      this.scene.restart()
    } else if (_portal.name === 'exit') {
      if (this.currentLevel === 'levelVegasRoom1') {
        // stage 3 (airship) complete — drop down into levele1 from above
        this.registry.set('level', 'levele1')
        this.registry.set('spawn', { x: 16, y: 832, dir: 'down' })
        this.scene.stop('GameScene')
        this.scene.stop('HUDScene')
        this.scene.start('LevelE1Scene')
      } else if (this.currentLevel === 'levelVegas') {
        // stage 2 complete — board the airship (levelVegasRoom1)
        this.registry.set('level', 'levelVegasRoom1')
        this.registry.set('physics', Constants.VEGAS.physics)
        this.registry.set('physicsScale', Constants.VEGAS.physicsScale)
        this.registry.set('spawn', { x: 16, y: 128, dir: 'down' })
        this.scene.restart()
      } else {
        // level1 complete — continue into levelVegas (16px tiles, GB feel)
        this.registry.set('level', 'levelVegas')
        this.registry.set('physics', Constants.VEGAS.physics)
        this.registry.set('physicsScale', Constants.VEGAS.physicsScale)
        this.registry.set('spawn', Constants.VEGAS.spawn)
        this.scene.restart()
      }
    }
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

  // TODO!!!
  private handlePlayerOnPlatform(player: Mario, platform: Platform): void {
    if (
      platform.body.moves &&
      platform.body.touching.up &&
      player.body.touching.down
    ) {
    }
  }
}
