import Phaser from 'phaser'
import Constants from '../constants'
import { gamepad } from '../../lib/gamepad.svelte'
import { touch } from '../../lib/touch.svelte'
import { consumeEditorRequest } from '../../lib/cmg'
import { fetchRtdbMap } from '../../lib/rtdb-maps'
import { loadLocalMap, saveLocalMap } from '../../lib/map-store'
import { openLevelInSpriteX } from '../../lib/spritex-editor'
import { tilesetTextureFor } from '../level-assets'
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
  /** solid 'static' image objects (pipes, chip stacks) — like levele1's */
  private groundGroup: Phaser.Physics.Arcade.StaticGroup
  private currentLevel: string

  // level-editor trigger (SELECT+↑ chord; SHIFT+↑ on keyboard)
  private editorSelectKey: Phaser.Input.Keyboard.Key
  private editorUpKey: Phaser.Input.Keyboard.Key

  constructor() {
    super({
      key: 'GameScene',
    })
  }

  init(): void {
    // scene instances persist across restart() — clear the previous run's
    // objects so update()'s readiness guard holds while create() is waiting
    // on an RTDB map import
    this.player = undefined
    this.map = undefined

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

    // maps not shipped in pack.json (e.g. ?map=<key>) are imported from the
    // RTDB, then the scene restarts with the cache populated. An explicit
    // ?map= request also wins over a shipped map of the same name, so edits
    // saved to /maps/level1 are actually reachable.
    const rtdbRequested =
      this.registry.get('rtdbMap') === key && !this.registry.get('rtdbMapLoaded')
    if (!this.cache.tilemap.exists(key) || rtdbRequested) {
      this.loadMapFromRtdb(key)
      return
    }

    // the Vegas maps (levelVegas, levelVegasRoom1) share the castle tileset
    // and bg/ground layer names; the GB maps use tiles.png and
    // backgroundLayer/foregroundLayer; level4-2 ships its own 42-tile
    // playland tileset (tiles4-2.png) under the same in-map name 'tiles'
    const isVegas = key.startsWith('levelVegas')

    // create our tilemap from Tiled JSON
    this.map = this.make.tilemap({ key })
    // add our tileset and layers to our tilemap
    // Vegas uses a 16px extruded tileset (1px margin, 2px spacing); the GB
    // levels' 8px tileset uses the sizes embedded in the map itself
    const tilesetTexture = tilesetTextureFor(this, key)
    this.tileset = this.map.addTilesetImage(
      this.map.tilesets[0]?.name ?? 'tiles',
      tilesetTexture.key,
      ...(tilesetTexture.args ?? [])
    )
    // level4-2 has no background layer — createLayer returns null there
    this.backgroundLayer = this.map.createLayer(
      isVegas ? 'bg' : 'backgroundLayer',
      this.tileset,
      0,
      0
    )

    // RTDB-imported maps may name their main layer anything — fall back to
    // the first tile layer in the map
    const fgName = isVegas ? 'ground' : 'foregroundLayer'
    this.foregroundLayer = this.map.createLayer(
      this.map.getLayer(fgName) ? fgName : this.map.layers[0]?.name,
      this.tileset,
      0,
      0
    )
    this.foregroundLayer.setName('foregroundLayer')

    this.editorSelectKey = this.input.keyboard.addKey(
      gamepad.keyFor('select') ?? 'SHIFT'
    )
    this.editorUpKey = this.input.keyboard.addKey(gamepad.keyFor('up') ?? 'UP')

    // pin the tile layers' depths so decoration sprites can slot between
    // them (bg wall < decorations < ground/objects)
    this.backgroundLayer?.setDepth(Constants.DEPTH.background)
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
    this.groundGroup = this.physics.add.staticGroup()

    this.loadObjectsFromTilemap()

    // *****************************************************************
    // COLLIDERS
    // *****************************************************************
    this.physics.add.collider(this.player, this.foregroundLayer)
    this.physics.add.collider(this.player, this.groundGroup)
    this.physics.add.collider(this.enemies, this.foregroundLayer)
    this.physics.add.collider(this.enemies, this.groundGroup)
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
    // create() bails early while an RTDB map import is in flight
    if (!this.player) return

    // the CMG OSD "Level Editor" action hands the level family to SpriteX
    // (the launcher swaps the frame to it); the in-game editor stays on the
    // SELECT+UP chord for everything else. If the hand-off can't even be
    // posted (sandboxed parent, no maps), fall back to the in-game editor
    // so the OSD button never turns into a no-op.
    if (consumeEditorRequest()) {
      openLevelInSpriteX(this, this.currentLevel).then((posted) => {
        if (!posted && this.scene.isActive()) this.openEditor()
      })
      return
    }

    if (this.editorTriggered()) {
      this.openEditor()
      return
    }

    this.player.update()
  }

  /**
   * SELECT+↑ (SNES: SELECT+L2) during gameplay, SHIFT+↑ on keyboard, or the
   * touch pad's SELECT+↑ — opens the in-game editor.
   */
  private editorTriggered(): boolean {
    const selectHeld =
      this.editorSelectKey.isDown || gamepad.isDown('select') || touch.isDown('select')
    const upHeld = this.editorUpKey.isDown || gamepad.isDown('up') || touch.isDown('up')
    const keyboardFresh =
      Phaser.Input.Keyboard.JustDown(this.editorUpKey) ||
      Phaser.Input.Keyboard.JustDown(this.editorSelectKey)
    const touchFresh = touch.justPressed('up') || touch.justPressed('select')

    return (
      gamepad.justPressed('editor') ||
      (selectHeld && upHeld && (keyboardFresh || touchFresh))
    )
  }

  private openEditor(): void {
    this.scene.launch('LevelEditorScene', {
      levelKey: this.currentLevel,
      playerX: this.player.x,
      playerY: this.player.y,
    })
    // freeze and hide gameplay while the editor owns the screen — the
    // editor wakes/resumes (and restarts on save) when it exits
    this.scene.sleep('HUDScene')
    this.scene.setVisible(false)
    this.scene.pause()
  }

  /**
   * Import a map stored at RTDB /maps/<key> = { json, png }, then restart.
   * Fresh fetches stream straight into play and are copied to the local map
   * store in the background (CMG Network style); when the RTDB is
   * unreachable the local copy plays instead.
   */
  private async loadMapFromRtdb(key: string): Promise<void> {
    const loading = this.add.bitmapText(8, 8, 'font', 'LOADING MAP...', 8)
    let record = await fetchRtdbMap(key)
    const fromLocal = !record
    if (fromLocal) {
      record = await loadLocalMap(key)
      if (record) {
        // could be offline — or the RTDB record was deleted/corrupted and a
        // stale copy is masking it; say so instead of silently substituting
        console.warn(`🗺️ RTDB miss for "${key}" — playing the local copy`)
      }
    }
    if (!this.scene.isActive()) return
    loading.destroy()

    const fallback = (reason: string) => {
      console.warn(`🗺️ ${reason} — falling back to level1`)
      // don't retry the RTDB copy of this key on the next create
      this.registry.set('rtdbMapLoaded', true)
      this.registry.set('level', 'level1')
      this.registry.set('world', '1-1')
      this.scene.restart()
    }

    if (!record) {
      fallback(`map "${key}" not found in RTDB`)
      return
    }

    // only embedded-tileset, uncompressed maps are playable here
    const json = record.json
    const tileLayer = json.layers?.find((l: any) => l.type === 'tilelayer')
    const tileset = json.tilesets?.[0]
    if (
      !tileLayer ||
      !tileset ||
      tileset.source ||
      json.layers.some((l: any) => l.compression)
    ) {
      fallback(`map "${key}" needs an embedded tileset and uncompressed layers`)
      return
    }

    // keep a local copy (CMG Network style: stream now, replay offline) —
    // only once it's known playable, and snapshotted before the objects/player
    // synthesis below mutates the JSON
    if (!fromLocal) {
      saveLocalMap(key, { json: structuredClone(json), png: record.png })
    }

    // GameScene requires an 'objects' layer and a player object — synthesize
    // them for maps authored without either
    let objectLayer = json.layers.find(
      (l: any) => l.type === 'objectgroup' && l.name === 'objects'
    )
    if (!objectLayer) {
      objectLayer = {
        draworder: 'topdown',
        name: 'objects',
        objects: [],
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      }
      json.layers.push(objectLayer)
    }
    let playerObject = json.layers
      .filter((l: any) => l.type === 'objectgroup')
      .flatMap((l: any) => l.objects ?? [])
      .find((o: any) => o.type === 'player' || o.name === 'player')
    if (!playerObject) {
      playerObject = {
        id: (json.nextobjectid = (json.nextobjectid ?? 1) + 1),
        name: 'player',
        type: 'player',
        x: (json.tilewidth ?? 8) * 2,
        y: (json.tileheight ?? 8) * 5,
        width: 8,
        height: 14,
        rotation: 0,
        visible: true,
      }
      objectLayer.objects.push(playerObject)
    }

    // spawn where the player object sits (Tiled anchors objects bottom-left)
    this.registry.set('spawn', {
      x: playerObject.x,
      y: playerObject.y - (playerObject.height ?? 0),
      dir: 'down',
    })
    // imported maps get the GB feel, scaled up for 16px tiles
    this.registry.set('physics', 'gb')
    this.registry.set('physicsScale', (json.tilewidth ?? 8) >= 16 ? 2 : 1)
    this.registry.set('world', key)

    const finalize = () => {
      if (this.cache.tilemap.exists(key)) this.cache.tilemap.remove(key)
      this.cache.tilemap.add(key, {
        format: Phaser.Tilemaps.Formats.TILED_JSON,
        data: json,
      })
      if (this.registry.get('rtdbMap') === key) this.registry.set('rtdbMapLoaded', true)
      this.scene.restart()
    }

    if (!record.png) {
      // no tileset PNG stored — playable only via the built-in textures
      finalize()
      return
    }

    // (re)decode the stored tileset — replace any stale texture from an
    // earlier version of this map
    const textureKey = `map-${key}`
    if (this.textures.exists(textureKey)) this.textures.remove(textureKey)

    const onAdd = () => {
      cleanup()
      finalize()
    }
    const onError = (failedKey: unknown) => {
      const keys = Array.isArray(failedKey) ? failedKey : [failedKey]
      if (!keys.includes(textureKey)) return
      cleanup()
      fallback(`tileset PNG for "${key}" failed to decode`)
    }
    const cleanup = () => {
      this.textures.off(`addtexture-${textureKey}`, onAdd)
      this.textures.off(Phaser.Textures.Events.ERROR, onError)
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    }
    // the TextureManager outlives this scene — never leave these behind
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.textures.once(`addtexture-${textureKey}`, onAdd)
    this.textures.on(Phaser.Textures.Events.ERROR, onError)
    this.textures.addBase64(textureKey, record.png)
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
          .sprite(object.x, object.y, object.name, object.properties?.frame)
          .setOrigin(0, 1)
          .setDepth(Constants.DEPTH.foregroundSecondary)
          .setFlipX(!!object.flippedHorizontal)

        if (object.properties?.scale) decoration.setScale(object.properties.scale)

        if (this.anims.exists(object.name)) {
          decoration.play(object.name)
        }
      }

      if (object.type === Constants.OBJECT_TYPES.static) {
        // solid decoration (SMA4 pipe, casino chip stacks) — same bottom-left
        // anchor and name-is-texture convention as 'image', but Mario and the
        // enemies collide with it; a 'frame' property picks a spritesheet
        // frame, 'scale' shrinks oversized art
        const solid = this.groundGroup.create(
          object.x,
          object.y,
          object.name,
          object.properties?.frame
        ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
        solid.setOrigin(0, 1)
        if (object.properties?.scale) solid.setScale(object.properties.scale)
        solid.refreshBody()
        solid.setDepth(Constants.DEPTH.foregroundMain)
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
    if (_portal.name === 'exit') {
      // pipe exits (direction 'down') want the classic press-down while
      // standing on the pipe; door exits (direction 'none') fire on touch
      if (
        _portal.getPortalDestination().dir === 'down' &&
        !_player.actionIsDown('down')
      ) {
        return
      }
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
      } else if (this.currentLevel === 'level1') {
        // level1 complete — descend into level 4-2 (playland underground,
        // same GB physics and 8px tiles as level1)
        this.registry.set('level', 'level4-2')
        this.registry.set('world', '4-2')
        this.registry.set('physics', Constants.LEVEL42.physics)
        this.registry.set('physicsScale', Constants.LEVEL42.physicsScale)
        this.registry.set('spawn', Constants.LEVEL42.spawn)
        this.scene.restart()
      } else {
        // level4-2 complete — continue into levelVegas (16px tiles, GB feel)
        this.registry.set('level', 'levelVegas')
        this.registry.set('physics', Constants.VEGAS.physics)
        this.registry.set('physicsScale', Constants.VEGAS.physicsScale)
        this.registry.set('spawn', Constants.VEGAS.spawn)
        this.scene.restart()
      }
      return
    }

    // portals named for a level warp there when entered in their direction
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
