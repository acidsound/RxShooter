'use strict'

### setup canvas ###
c = document.createElement 'canvas'
document.body.style.margin = 0
document.body.appendChild c
c.width = window.innerWidth
c.height = window.innerHeight
ctx = c.getContext '2d'

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

### Laser Subjects ###
laserSound = new Audio 'https://www.freesound.org/data/previews/170/170161_2578041-lq.mp3'
shootSubject = new Rx.Subject
shootSubject.subscribe (o) ->
  laserSound.currentTime = 1
  laserSound.play()

### Explosion Subject ###
explosionSound = new Audio 'http://www.freesound.org/data/previews/259/259962_2463454-lq.mp3'
explosionSubject = new Rx.Subject
explosionSubject.subscribe ({x,y}) ->
  explosionSound.currentTime = 0.5
  explosionSound.play()
  Rx.Observable.interval(16).takeWhile (frame) ->
    frame < explosionSpriteCount * 2
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
.map ({clientX, clientY}) ->
    x: clientX - 32
    y: c.height - 100
.startWith
  x: -32 + c.width / 2
  y: c.height - 100

paintEnemy = ({x,y}) -> ctx.drawImage enemyImg, x, y, 64, 64
paintEnemies = (enemies) -> paintEnemy enemy for _, enemy of enemies

### EnemyStream ###
EnemyStream = Rx.Observable.interval 950
.map (o) ->
    x: Math.random() * c.width - (enemyImg.width)
    y: -enemyImg.height
    vx: Math.random() * 2 - 1
    vy: 3
    t: +new Date
.map (b) ->
  Rx.Observable.interval 9
  .map (d) -> Object.assign b, x: b.x + b.vx, y: b.y + b.vy
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

ProjectileTrig.subscribe (o) -> shootSubject.next()

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
  Rx.Observable.interval(10).map((d) ->
    5
  ).map (d) ->
    Object.assign b,
      x: b.x - (b.vx)
      y: b.y - (b.vy)
.flatMap (o) -> o
.scan (a, b) ->
  ### grouping ###
  if b.y > -bulletImg.height then a[b.t] = b else delete a[b.t]
  a
, {}
.startWith({})

### Combine All ###
Rx.Observable.combineLatest StarStream, ShipStream, ProjectileStream, EnemyStream,
  (stars, ship, projectiles, enemies) -> {stars,ship,projectiles,enemies}
.sample Rx.Observable.interval(16)
.takeWhile -> true
.subscribe ({stars, ship, projectiles, enemies}) ->
  paintStars stars
  paintShip ship
  paintProjectiles projectiles, enemies
  paintEnemies enemies, ship
