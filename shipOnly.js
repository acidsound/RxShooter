/* setup canvas */
let c = document.createElement('canvas');
document.body.style.margin=0;
document.body.appendChild(c);
c.width = window.innerWidth;
c.height = window.innerHeight;
let ctx = c.getContext('2d');
/* load bitmap */
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

/* ProjectileStream
   t: - 1 - - 1 - 1 - -
   s: a - - b - - - c -
 WLF: - a - - b - b - -
*/
const paintProjectile = ({x,y})=>ctx.drawImage(bulletImg, x, y, 32, 32);
const paintProjectiles = projectiles=> {
  for (let idx in projectiles) {
    paintProjectile(projectiles[idx])
  }
};

const ProjectileStream =
  Rx.Observable.merge(
    Rx.Observable.fromEvent(document, 'keydown')
    .filter(({keyCode})=>keyCode === 32),
    Rx.Observable.fromEvent(c, 'mousedown'),
    Rx.Observable.fromEvent(c, 'touchstart')
  )
    .withLatestFrom(ShipStream)
    .map(x=>x[1])
    .map(({x,y})=>({
      x: x+(shipImg.width-bulletImg.width)/2,
      y: y-(bulletImg.height)/2,
      t: +new Date()
    }))
  .map(b=>
    Rx.Observable.interval(1)
      .map(d=>5)
      .map(d=>Object.assign(b, {
        y: b.y - d
      }))
      // .takeWhile(({x,y})=>y>-bulletImg.height)
  )
  .flatMap(o=>o)
  .scan((a,b)=>{
    /* grouping */
    if (b.y>-bulletImg.height) { a[b.t]=b; } else {
      delete a[b.t];
    }
    return a;
  },{})
  /* b   a            a
     t11 a []         [t11]
     t12 a [t11]      [t12]
     t13 a [t12]      [t13]
     t21 a [t13]      [t13, t21]
     t14 a [t13, t21] [t14, t21]
     t22 a [t14, t21] [t14, t22]
     t15 a [t14, t22] [t15, t22] t15 destory
     t23 a [t15, t22] [t15, t23]
     t24 a [t15, t23] [t15, t24]
   */
  .startWith({});

// ProjectileStream.subscribe(o=>console.log(o));
  /*
    s: -- s1 -- s2 -- s3 -- -- --
    -----------------------------
    i: -- -- i1 i2 i3 -- -- -- --
    j: -- -- -- -- j1 j2 j3 -- --
    k: -- -- -- -- -- -- k1 k2 k3
   r0: -- -- 11 12 13 -- -- -- --
   r1: -- -- -- -- 21 22 23 -- --
   r2: -- -- -- -- -- -- 31 32 33
 flat: -- -- 11 12 13 21 22 23 31 32 33
 goal: -- -- 11 12[13 21]22[23 31]32 33
  */

/* Combine All */
Rx.Observable.combineLatest(
    StarStream, ShipStream, ProjectileStream,
    ( stars, ship, projectiles )=>({ stars, ship, projectiles })
  )
  .sample(Rx.Observable.interval(16)) /* 60 frame 1/60*1000 */
  .takeWhile(o=>true)
  .subscribe(({stars,ship,projectiles})=>{
    paintStars(stars);
    paintShip(ship);
    paintProjectiles(projectiles);
  });
