/* setup canvas */
let c = document.createElement('canvas');
document.body.style.margin = 0;
document.body.style.height = '100%';
document.body.style.overflow = 'hidden';
document.body.appendChild(c);
c.width = window.innerWidth;
c.height = window.innerHeight;
let ctx = c.getContext('2d');

const FPS = 16;

/* load bitmaps */
let shipImg = new Image;
Object.assign(shipImg, {
  src: 'https://i.stack.imgur.com/rsH6n.png',
  width: 64,
  height: 64
}
);
let bulletImg = new Image;
Object.assign(bulletImg, {
  src: 'https://16bitjusticesociety.files.wordpress.com/2010/11/bullet.png',
  width: 32,
  height: 32
}
);
let enemyImg = new Image;
Object.assign(enemyImg, {
  src: 'https://www.codeproject.com/KB/game/677417/Ship3.png',
  width: 64,
  height: 64
}
);
let explosionSprite = new Image;
explosionSprite.src = 'https://orig06.deviantart.net/28c3/f/2013/010/9/f/explosion_spritesheet_for_games_by_gintasdx-d5r28q5.png';
let explosionSpriteCount = explosionSprite.width / explosionSprite.height;

/* Audio Subjects */
let laserSound = new Audio;
laserSound.volume = 0.3;
laserSound.src = 'https://www.freesound.org/data/previews/170/170161_2578041-lq.mp3';

let explosionSound = new Audio;
explosionSound.src = 'http://www.freesound.org/data/previews/259/259962_2463454-lq.mp3';

/* Subjects */
let shootSubject = new Rx.Subject;
shootSubject.subscribe(function() {
  laserSound.currentTime = 1;
  return laserSound.play();
});

//### After Load ###
let preloadObjects = [
  shipImg,
  bulletImg,
  enemyImg,
  explosionSprite
];
let PreloadSteam = Rx.Observable.from(preloadObjects)
.flatMap(obj=>
  Rx.Observable.create(o=>
    obj.onload = function() {
      o.next(obj);
      return o.complete();
    }
  )
)
.take(preloadObjects.length+1);
let explosionSubject = new Rx.Subject;
explosionSubject.subscribe(function({x,y}) {
  explosionSound.currentTime = 0.5;
  explosionSound.play();
  return Rx.Observable.interval(FPS)
  .takeWhile(frame => frame < explosionSpriteCount * 2)
  .subscribe(function(frame) {
    let cnt = (frame > explosionSpriteCount && (explosionSpriteCount - (frame >> 1))) || frame;
    return ctx.drawImage(explosionSprite, explosionSprite.height * cnt, 0, explosionSprite.height, explosionSprite.height, x - 32, y - 32, 128, 128);
  });
});

/* collion helper */
let collision = (aPosition, aSize, bPosition, bSize) => aPosition.x + aSize.width > bPosition.x && aPosition.x < bPosition.x + bSize.width && aPosition.y + aSize.height > bPosition.y && aPosition.y < bPosition.y + bSize.height;

/* StarStream */
let paintStars = function(stars) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  return stars.forEach(({x,y,size}) => ctx.fillRect(x, y, size, size));
};

let StarStream = Rx.Observable.range(1, 200)
.map(() =>
  ({
    x: parseInt(Math.random() * c.width),
    y: parseInt(Math.random() * c.height),
    size: (Math.random() * 2) + 1
  })
)
.toArray()
.flatMap(starArray =>
  Rx.Observable.interval(10)
  .map(() =>
    starArray.map(star => Object.assign(star, {y: (star.y < c.height && (star.y + 1)) || 0}))
  )
);

/* ShipStream */
let paintShip = ({x,y}) => ctx.drawImage(shipImg, x, y, 64, 64);
let ShipStream = Rx.Observable.merge(
  Rx.Observable.fromEvent(c, 'mousemove'),
  Rx.Observable.fromEvent(c, 'touchmove')
)
.map(({clientX}) =>
    ({
      x: clientX - 32,
      y: c.height - 100
    })
)
.startWith({
  x: -32 + (c.width / 2),
  y: c.height - 100,
  life: 3
});

// Dead Stream
let DeadSubject = new Rx.Subject;
let DeadStream = DeadSubject.throttleTime(300)
  .bufferCount(3);

/* EnemyStream */
let paintEnemy = ({x,y}) => ctx.drawImage(enemyImg, x, y, 64, 64);
let paintEnemies = (enemies, ship) =>
  (() => {
    let result = [];
    for (let _ in enemies) {
      let enemy = enemies[_];
      let item;
      paintEnemy(enemy);
      if (collision(ship, shipImg, enemy, enemyImg)) {
        DeadStream.next(enemies);
        item = enemy.y = c.height + 100;
      }
      result.push(item);
    }
    return result;
  })()
;

let EnemyStream = Rx.Observable.interval(950)
.map(() =>
    ({
      x: (Math.random() * c.width) - (enemyImg.width),
      y: -enemyImg.height,
      vx: (Math.random() * 2) - 1,
      vy: 3,
      t: +new Date
    })
)
.map(b =>
  Rx.Observable.interval(9)
  .map(() => Object.assign(b, {x: b.x + b.vx, y: b.y + b.vy}))
)
.flatMap(o => o)
.scan(function(a, b) {
  /* grouping */
  if (b.y < c.height) { a[b.t] = b; } else { delete a[b.t]; }
  return a;
}
, {})
.startWith({})
.takeUntil(DeadStream)
.repeat();

/* ProjectileStream */
let paintProjectile = ({x,y}) => ctx.drawImage(bulletImg, x, y, 32, 32);
let paintProjectiles = (projectiles, enemies) =>
  (() => {
    let result = [];
    for (let _ in projectiles) {
      let projectile = projectiles[_];
      paintProjectile(projectile);
      result.push((() => {
        let result1 = [];
        for (_ in enemies) {
          let enemy = enemies[_];
          let item;
          if (collision(projectile, bulletImg, enemy, enemyImg)) {
            explosionSubject.next(enemy);
            projectile.y = -100;
            item = enemy.y = c.height + 100;
          }
          result1.push(item);
        }
        return result1;
      })());
    }
    return result;
  })()
;

let ProjectileTrig = Rx.Observable.merge(
  Rx.Observable.fromEvent(document, 'keydown').filter(({keyCode}) => keyCode === 32),
  Rx.Observable.fromEvent(c, 'mousedown'),
  Rx.Observable.fromEvent(c, 'touchstart')
);

ProjectileTrig.subscribe(() => shootSubject.next());

/*
  trigger + ship
    t: - 1 - - 1 - 1 - -
    s: a - - b - - - c -
  WLF: - a - - b - b - -
*/
let ProjectileStream = ProjectileTrig.withLatestFrom(ShipStream).map(x => x[1])
.map(({x,y}) =>
  ({
    x: x + ((shipImg.width - (bulletImg.width)) / 2),
    y: y - (bulletImg.height / 2),
    vx: (Math.random() * 2) - 1,
    vy: 3,
    t: +new Date
  })
)
.map(b =>
  Rx.Observable.interval(10)
  .map(() =>
    Object.assign(b, {
      x: b.x - (b.vx),
      y: b.y - (b.vy)
    }
    )
  )
)
.flatMap(o => o)
.scan(function(a, b) {
  /* grouping */
  if (b.y > -bulletImg.height) { a[b.t] = b; } else { delete a[b.t]; }
  return a;
}
, {})
.startWith({});

Rx.Observable.fromEvent(document, "DOMContentLoaded")
.subscribe(() => {
  let paintGameOver = function(t){
    ctx.fillStyle = "#ea3a3a";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#eaeaea";
    ctx.textAlign = "center";
    ctx.font = "3rem arial";
    let [x, y] = [c.width / 2, c.height / 2];
    ctx.fillText("Game", x, y - 20);
    return ctx.fillText("Over", x, y + 20);
  };
  let goGameOver = () =>
    Rx.Observable.interval(FPS)
    .takeUntil(Rx.Observable.timer(3500))
    .subscribe(paintGameOver, (function() {}), goTitle)
  ;
  let goGame = () => {
    /* Combine All */
    return Rx.Observable.combineLatest(StarStream, ShipStream, ProjectileStream, EnemyStream,
      (stars, ship, projectiles, enemies) => ({stars,ship,projectiles,enemies}))
    .sample(Rx.Observable.interval(FPS))
    .takeUntil(DeadStream)
    .subscribe(function({stars, ship, projectiles, enemies}) {
      paintStars(stars);
      paintShip(ship);
      paintProjectiles(projectiles, enemies);
      return paintEnemies(enemies, ship);
    }
    ,(function() {}) ,goGameOver);
  };
  let paintTitle = function(t){
    ctx.fillStyle = "#363636";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#eaeaea";
    ctx.textAlign = "center";
    ctx.font = "3rem arial";
    let [x, y] = [c.width / 2, c.height/2];
    ctx.fillText("RxShooter", x, (y + (Math.sin(t/7)*15)) - 20);
    ctx.font = "1rem arial";
    return ctx.fillText("click to start", x, y+30);
  };
  var goTitle = function() {
    let TitleStream = Rx.Observable.fromEvent(c, "mouseup");
    return Rx.Observable.interval(FPS)
    .takeUntil(TitleStream)
    .subscribe(paintTitle, (function() {}), goGame);
  };

  let paintSplash = function(t){
    let int2hex = i=> `0${i.toString(16)}`.toString(16).substr(-2);
    let q = int2hex(((255-(t*3))>0 && (255-(t*3))) || 0);
    ctx.fillStyle = `#${q}${q}${q}`;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#eaeaea";
    ctx.font = "3rem arial";
    ctx.textAlign = "center";
    let [x, y] = [c.width/2, c.height/2];
    ctx.fillText("Appsoulute", x, y - 25);
    if (t>150) { return ctx.fillText("games", x, y + 25); }
  };
  let goSplash = () =>
    Rx.Observable.interval(FPS)
    .takeUntil(Rx.Observable.timer(5000))
    .subscribe(paintSplash, (function() {}), goTitle)
  ;
  return goSplash();
}
);

