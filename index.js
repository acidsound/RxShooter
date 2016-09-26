/* setup canvas */
let c = document.createElement('canvas');
document.body.style.margin=0;
document.body.appendChild(c);
c.width = window.innerWidth;
c.height = window.innerHeight;
let ctx = c.getContext('2d');
/* load bitmaps */
let shipImg = new Image();
Object.assign(shipImg,{
  src: 'http://i.stack.imgur.com/rsH6n.png',
  width: 64,
  height: 64
});
let bulletImg = new Image();
Object.assign(bulletImg, {
  src: 'https://16bitjusticesociety.files.wordpress.com/2010/11/bullet.png',
  width: 32,
  height: 32
});
let enemyImg = new Image();
Object.assign(enemyImg, {
  src: 'http://www.codeproject.com/KB/game/677417/Ship3.png',
  width: 64,
  height: 64
});
let explosionSprite = new Image();
explosionSprite.src = 'http://orig06.deviantart.net/28c3/f/2013/010/9/f/explosion_spritesheet_for_games_by_gintasdx-d5r28q5.png';
let explosionSpriteCount = explosionSprite.width/ explosionSprite.height;

/* Laser Subjects */
let laserSound = new Audio('http://www.freesound.org/data/previews/170/170161_2578041-lq.mp3');
const shootSubject = new Rx.Subject();
shootSubject.subscribe(o=>{
  laserSound.currentTime = 1;
  laserSound.play();
});

/* Explosion Subject */
let explosionSound = new Audio('http://www.freesound.org/data/previews/259/259962_2463454-lq.mp3');
let explosionSubject = new Rx.Subject();
explosionSubject.subscribe(({x,y})=>{
  explosionSound.currentTime = 0.5;
  explosionSound.play();
  Rx.Observable.interval(16)
  .takeWhile(frame=>frame<explosionSpriteCount*2)
  .subscribe(frame=>{
    let cnt = (frame>explosionSpriteCount && explosionSpriteCount-(frame>>1) || frame)
    ctx.drawImage(
      explosionSprite,
      explosionSprite.height * cnt,
      0,
      explosionSprite.height,
      explosionSprite.height,
      x-32, y-32, 128, 128
    );
  })
});

/* StarStream */
const paintStars = (stars)=> {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  stars.forEach(function({x,y,size}) {
    ctx.fillRect(x, y, size, size);
  })
};
const StarStream = Rx.Observable.range(1, 200)
  .map(()=>({
    // Each star is representing by an object
    // with coordinates and a size
    x: parseInt(Math.random() * c.width),
    y: parseInt(Math.random() * c.height),
    size: Math.random() * 2 + 1
  }))
  .toArray()
  .flatMap(starArray=>
    Rx.Observable.interval(10).map(()=>
      starArray.map(star=>Object.assign(star,{
        y: star.y<c.height && star.y+1 || 0
      }))
    )
  );
/* ShipStream */
const paintShip = ({x,y})=>ctx.drawImage(shipImg, x, y, 64, 64);
const ShipStream =
  Rx.Observable.merge(
    Rx.Observable.fromEvent(c, 'mousemove'),
    Rx.Observable.fromEvent(c, 'touchmove')
  )
    .map(({clientX, clientY})=>({x: clientX-32, y: c.height - 64}))
    .startWith({
      x: -32+c.width/2, y: c.height - 64
    });
const paintEnemy = ({x,y})=>ctx.drawImage(enemyImg, x, y, 64, 64)
const paintEnemies = enemies=>{
  for (let idx in enemies) paintEnemy(enemies[idx]);
};
/* EnemyStream */
const EnemyStream = Rx.Observable.interval(950)
  .map(o=>({
    x: Math.random()*c.width - enemyImg.width,
    y: -enemyImg.height,
    t: +new Date
  }))
  .map(b=>
    Rx.Observable.interval(9)
    .map(d=>3)
    .map(d=>Object.assign(b, {y: b.y + d}))
  )
  .flatMap(o=>o)
  .scan((a,b)=>{
    /* grouping */
    if (b.y<c.height) { a[b.t]=b; } else {
      delete a[b.t];
    }
    return a;
  },{})
  .startWith({});

/* collion helper */
const collision = (aPosition, aSize, bPosition, bSize)=>
  (aPosition.x + aSize.width > bPosition.x) && (aPosition.x < bPosition.x+bSize.width ) &&
  (aPosition.y + aSize.height> bPosition.y) && (aPosition.y < bPosition.y+bSize.height )
/* ProjectileStream */
const paintProjectile = ({x,y})=>ctx.drawImage(bulletImg, x, y, 32, 32);
const paintProjectiles = (projectiles, enemies)=> {
  for (let pidx in projectiles) {
    let projectile = projectiles[pidx];
    paintProjectile(projectile);
    for (let eidx in enemies) {
      let enemy = enemies[eidx];
      if (collision(projectile, bulletImg, enemy, enemyImg)) {
        explosionSubject.next(enemy);
        projectile.y = -100;
        enemy.y = c.height + 100;
      }
    }
  }
};
const ProjectileTrig =
  Rx.Observable.merge(
    Rx.Observable.fromEvent(document, 'keydown')
    .filter(({keyCode})=>keyCode === 32),
    Rx.Observable.fromEvent(c, 'mousedown'),
    Rx.Observable.fromEvent(c, 'touchstart')
  )
ProjectileTrig.subscribe(o=>shootSubject.next())

/*
  trigger + ship
    t: - 1 - - 1 - 1 - -
    s: a - - b - - - c -
  WLF: - a - - b - b - -
*/
const ProjectileStream = ProjectileTrig
  .withLatestFrom(ShipStream)
  .map(x=>x[1])
  .map(({x,y})=>({
    x: x+(shipImg.width-bulletImg.width)/2,
    y: y-(bulletImg.height)/2,
    t: +new Date()
  }))
  .map(b=>
    Rx.Observable.interval(10)
      .map(d=>5)
      .map(d=>Object.assign(b, {
        y: b.y - d
      }))
  )
  .flatMap(o=>o)
  .scan((a,b)=>{
    /* grouping */
    if (b.y>-bulletImg.height) { a[b.t]=b; } else {
      delete a[b.t];
    }
    return a;
  },{})
  .startWith({});

/* Combine All */
Rx.Observable.combineLatest(
    StarStream, ShipStream, ProjectileStream, EnemyStream,
    ( stars, ship, projectiles, enemies )=>({ stars, ship, projectiles, enemies })
  )
  .sample(Rx.Observable.interval(16)) /* 60 frame 1/60*1000 */
  .takeWhile(o=>true)
  .subscribe(({stars,ship,projectiles,enemies})=>{
    paintStars(stars);
    paintShip(ship);
    paintProjectiles(projectiles, enemies);
    paintEnemies(enemies);
  });
