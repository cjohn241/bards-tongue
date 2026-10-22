// sprite.js — Christon the Cleric, the same 16x16 pixel hero as the
// Shawnee Home Hub. Any <canvas class="sprite" width="18" height="26">
// on the page gets drawn, with a little idle bob and a glint on the staff.

const CLERIC = {
  // "." is empty; every other letter is a color from `pal`.
  px: [
    '.....hhhhh...gg.', '....hhhhhhh.gWWg', '....hhssssh..gg.', '...hhsesesh..w..',
    '...hhssssss..w..', '...hh.ssss...w..', '....rrggrr...w..', '...rrrggrrr.sw..',
    '..rrrrggrrrrsw..', '..srrrggrrr..w..', '...rrrggrrr..w..', '...rrRggRrr..w..',
    '..rrrRggRrrr.w..', '..rrRRggRRrr.w..', '.rrrRRggRRrrrw..', '..kk.....kk..w..',
  ],
  pal: { h: '#5a3524', s: '#e9b98f', e: '#2a1d2e', r: '#9b4aa1', R: '#6a2c70', g: '#e6c36e', W: '#fff6d8', w: '#8b5a2b', k: '#3a2a3f' },
  glint: 'W',
};
const OUTLINE = '#0d0b12';

const stillMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function drawSprite(canvas, tick) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const bob = stillMotion ? 0 : Math.floor(tick / 3) % 2;
  const ox = 1;
  const oy = 8 + bob;
  const solid = (x, y) => y >= 0 && y < 16 && x >= 0 && x < 16 && CLERIC.px[y][x] !== '.';

  // Ground shadow
  g.fillStyle = 'rgba(0, 0, 0, .35)';
  g.fillRect(3, 25, 12, 1);

  // Dark outline around every pixel that has an empty neighbor
  g.fillStyle = OUTLINE;
  for (let y = -1; y <= 16; y++) {
    for (let x = -1; x <= 16; x++) {
      if (solid(x, y)) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) g.fillRect(ox + x, oy + y, 1, 1);
    }
  }

  // The pixels themselves; the staff's orb flashes white now and then
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = CLERIC.px[y][x];
      if (ch === '.') continue;
      const flash = ch === CLERIC.glint && !stillMotion && Math.floor(tick / 2) % 5 === 0;
      g.fillStyle = flash ? '#ffffff' : CLERIC.pal[ch];
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

let spriteTick = 0;
function drawAllSprites() {
  document.querySelectorAll('canvas.sprite').forEach((c) => drawSprite(c, spriteTick));
}
setInterval(() => {
  if (document.hidden) return; // rest when the tab isn't on screen
  spriteTick++;
  drawAllSprites();
}, 150);
