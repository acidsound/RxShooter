'use strict'

### setup canvas ###
c = document.createElement 'canvas'
document.body.style.margin = 0
document.body.style.height = '100%'
document.body.style.overflow = 'hidden'
document.body.appendChild c
c.width = window.innerWidth
c.height = window.innerHeight
ctx = c.getContext '2d'

FPS = 16

### load bitmaps ###
shipImg = new Image
Object.assign shipImg,
  src: 'https://i.stack.imgur.com/rsH6n.png'
  width: 64
  height: 64
bulletImg = new Image
Object.assign bulletImg,
  src: 'https://16bitjusticesociety.files.wordpress.com/2010/11/bullet.png'
  width: 32
  height: 32
enemyImg = new Image
Object.assign enemyImg,
  src: 'https://www.codeproject.com/KB/game/677417/Ship3.png'
  width: 64
  height: 64
explosionSprite = new Image
explosionSprite.src = 'https://orig06.deviantart.net/28c3/f/2013/010/9/f/explosion_spritesheet_for_games_by_gintasdx-d5r28q5.png'
explosionSpriteCount = explosionSprite.width / explosionSprite.height

### Audio Subjects ###
laserSound = new Audio
laserSound.volume = 0.3
laserSound.src = 'https://www.freesound.org/data/previews/170/170161_2578041-lq.mp3'

explosionSound = new Audio
explosionSound.src = 'http://www.freesound.org/data/previews/259/259962_2463454-lq.mp3'

### Subjects ###
shootSubject = new Rx.Subject
shootSubject.subscribe ->
  laserSound.currentTime = 1
  laserSound.play()

#### After Load ###
preloadObjects = [
  shipImg
  bulletImg
  enemyImg
  explosionSprite
]
PreloadSteam = Rx.Observable.from preloadObjects
.flatMap (obj)->
  Rx.Observable.create (o)->
    obj.onload = ->
      o.next obj
      o.complete()
.take preloadObjects.length+1
explosionSubject = new Rx.Subject
explosionSubject.subscribe ({x,y}) ->
  explosionSound.currentTime = 0.5
  explosionSound.play()
  Rx.Observable.interval FPS
  .takeWhile (frame) -> frame < explosionSpriteCount * 2
  .subscribe (frame) ->
    cnt = frame > explosionSpriteCount and explosionSpriteCount - (frame >> 1) or frame
    ctx.drawImage explosionSprite, explosionSprite.height * cnt, 0, explosionSprite.height, explosionSprite.height, x - 32, y - 32, 128, 128

### collion helper ###
collision = (aPosition, aSize, bPosition, bSize) ->
  aPosition.x + aSize.width > bPosition.x and aPosition.x < bPosition.x + bSize.width and aPosition.y + aSize.height > bPosition.y and aPosition.y < bPosition.y + bSize.height

### StarStream ###
paintStars = (stars) ->
  ctx.fillStyle = '#000000'
  ctx.fillRect 0, 0, c.width, c.height
  ctx.fillStyle = '#ffffff'
  stars.forEach ({x,y,size}) ->
    ctx.fillRect x, y, size, size

StarStream = Rx.Observable.range(1, 200)
.map ->
  x: parseInt(Math.random() * c.width)
  y: parseInt(Math.random() * c.height)
  size: Math.random() * 2 + 1
.toArray()
.flatMap (starArray) ->
  Rx.Observable.interval 10
  .map ->
    starArray.map (star) ->
      Object.assign star, y: star.y < c.height and star.y + 1 or 0

### ShipStream ###
paintShip = ({x,y}) -> ctx.drawImage shipImg, x, y, 64, 64
ShipStream = Rx.Observable.merge(
  Rx.Observable.fromEvent(c, 'mousemove')
  Rx.Observable.fromEvent(c, 'touchmove')
)
.map ({clientX}) ->
    x: clientX - 32
    y: c.height - 100
.startWith
  x: -32 + c.width / 2
  y: c.height - 100

# Dead Stream
DeadStream = new Rx.Subject

### EnemyStream ###
paintEnemy = ({x,y}) -> ctx.drawImage enemyImg, x, y, 64, 64
paintEnemies = (enemies, ship) ->
  for _, enemy of enemies
    paintEnemy enemy
    if collision ship, shipImg, enemy, enemyImg
      DeadStream.next ship
      enemy.y = c.height + 100

EnemyStream = Rx.Observable.interval 950
.map ->
    x: Math.random() * c.width - (enemyImg.width)
    y: -enemyImg.height
    vx: Math.random() * 2 - 1
    vy: 3
    t: +new Date
.map (b) ->
  Rx.Observable.interval 9
  .map -> Object.assign b, x: b.x + b.vx, y: b.y + b.vy
.flatMap (o) -> o
.scan (a, b) ->
  ### grouping ###
  if b.y < c.height then a[b.t] = b else delete a[b.t]
  a
, {}
.startWith {}

### ProjectileStream ###
paintProjectile = ({x,y}) -> ctx.drawImage bulletImg, x, y, 32, 32

paintProjectiles = (projectiles, enemies) ->
  for _, projectile of projectiles
    paintProjectile projectile
    for _, enemy of enemies
      if collision projectile, bulletImg, enemy, enemyImg
        explosionSubject.next enemy
        projectile.y = -100
        enemy.y = c.height + 100

ProjectileTrig = Rx.Observable.merge(
  Rx.Observable.fromEvent(document, 'keydown').filter ({keyCode}) -> keyCode is 32
  Rx.Observable.fromEvent(c, 'mousedown')
  Rx.Observable.fromEvent(c, 'touchstart')
)

ProjectileTrig.subscribe -> shootSubject.next()

###
  trigger + ship
    t: - 1 - - 1 - 1 - -
    s: a - - b - - - c -
  WLF: - a - - b - b - -
###
ProjectileStream = ProjectileTrig.withLatestFrom(ShipStream).map (x) -> x[1]
.map ({x,y}) ->
  x: x + (shipImg.width - (bulletImg.width)) / 2
  y: y - (bulletImg.height / 2)
  vx: Math.random() * 2 - 1
  vy: 3
  t: +new Date
.map (b) ->
  Rx.Observable.interval 10
  .map ->
    Object.assign b,
      x: b.x - (b.vx)
      y: b.y - (b.vy)
.flatMap (o) -> o
.scan (a, b) ->
  ### grouping ###
  if b.y > -bulletImg.height then a[b.t] = b else delete a[b.t]
  a
, {}
.startWith {}

Rx.Observable.fromEvent document, "DOMContentLoaded"
.subscribe =>
  paintGameOver = (t)->
    ctx.fillStyle = "#ea3a3a"
    ctx.fillRect 0, 0, c.width, c.height
    ctx.fillStyle = "#eaeaea"
    ctx.textAlign = "center"
    ctx.font = "3rem arial"
    [x, y] = [c.width / 2, c.height / 2]
    ctx.fillText "Game", x, y - 20
    ctx.fillText "Over", x, y + 20
  goGameOver = ->
    Rx.Observable.interval FPS
    .takeUntil Rx.Observable.timer 3500
    .subscribe paintGameOver, (->), goTitle

  goGame = =>
    console.log "game"
    ### Combine All ###
    Rx.Observable.combineLatest StarStream, ShipStream, ProjectileStream, EnemyStream,
      (stars, ship, projectiles, enemies) -> {stars,ship,projectiles,enemies}
    .sample Rx.Observable.interval FPS
    .takeUntil DeadStream
    .subscribe ({stars, ship, projectiles, enemies}) ->
      paintStars stars
      paintShip ship
      paintProjectiles projectiles, enemies
      paintEnemies enemies, ship
    ,(->) ,goGameOver
  paintTitle = (t)->
    ctx.fillStyle = "#363636"
    ctx.fillRect 0, 0, c.width, c.height
    ctx.fillStyle = "#eaeaea"
    ctx.textAlign = "center"
    ctx.font = "3rem arial"
    [x, y] = [c.width / 2, c.height/2]
    ctx.fillText "RxShooter", x, y + Math.sin(t/7)*15 - 20
    ctx.font = "1rem arial"
    ctx.fillText "click to start", x, y+30
  goTitle = ->
    TitleStream = Rx.Observable.fromEvent c, "mouseup"
    Rx.Observable.interval FPS
    .takeUntil TitleStream
    .subscribe paintTitle, (->), goGame

  paintSplash = (t)->
    int2hex = (i)-> "0#{i.toString(16)}".toString(16).substr(-2)
    q = int2hex (255-t*3)>0 && 255-t*3 || 0
    ctx.fillStyle = "##{q}#{q}#{q}"
    ctx.fillRect 0, 0, c.width, c.height
    ctx.fillStyle = "#eaeaea"
    ctx.font = "3rem arial"
    ctx.textAlign = "center"
    [x, y] = [c.width/2, c.height/2]
    ctx.fillText "Appsoulute", x, y - 25
    ctx.fillText "games", x, y + 25 if t>150
  goSplash = ->
    Rx.Observable.interval FPS
    .takeUntil Rx.Observable.timer 5000
    .subscribe paintSplash, (->), goTitle
  goSplash()

