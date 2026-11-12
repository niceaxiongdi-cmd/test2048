(function () {
  const BASE_SIZE = 4;
  const MAX_SIZE = 5;
  const UPGRADE_VALUE = 65536; // 显示为 65k
  let SIZE = BASE_SIZE;
  const BEST_KEY = 'game-2048-best';
  const STATE_KEY = 'game-2048-state';

  const tilesEl = document.getElementById('tiles');
  const gridBg = document.getElementById('grid-bg');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ov-title');
  const ovSub = document.getElementById('ov-sub');
  const ovBtn = document.getElementById('ov-btn');
  const boardEl = document.getElementById('board');

  let uid = 0;
  let grid = [];
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let busy = false;
  let over = false;

  /* ---------- 颜色：2 黄 -> 2048 及以上红 ---------- */
  function tileHueLight(value) {
    const t = Math.min((Math.log2(value) - 1) / 10, 1); // 2 => 0, 2048 => 1
    return { h: 52 - 52 * t, l: 80 - 32 * t };            // hsl(h 85% l)
  }

  function formatValue(value) {
    return value >= 10000 ? Math.floor(value / 1000) + 'k' : String(value);
  }

  function paint(el, value) {
    const { h, l } = tileHueLight(value);
    const text = formatValue(value);
    el.style.setProperty('--h', h.toFixed(1));
    el.style.setProperty('--l', l.toFixed(1) + '%');
    el.style.color = l > 66 ? '#43260c' : '#fff8f0';
    el.dataset.digits = text.length;
    el.textContent = text;
  }

  /* ---------- 基础渲染 ---------- */
  function buildBackground() {
    gridBg.innerHTML = '';
    gridBg.style.gridTemplateColumns = 'repeat(' + SIZE + ', 1fr)';
    for (let i = 0; i < SIZE * SIZE; i++) gridBg.appendChild(document.createElement('div'));
  }

  function newTile(r, c, value, isNew) {
    const tile = { id: ++uid, value, r, c, el: null };
    const el = document.createElement('div');
    el.className = 'tile' + (isNew ? ' appear' : '');
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
    paint(el, value);
    tilesEl.appendChild(el);
    tile.el = el;
    grid[r][c] = tile;
    return tile;
  }

  function setPos(tile, r, c) {
    tile.r = r;
    tile.c = c;
    tile.el.style.setProperty('--r', r);
    tile.el.style.setProperty('--c', c);
  }

  function spawnRandom() {
    const empty = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty.push([r, c]);
    }
    if (!empty.length) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    return newTile(r, c, 2, true);
  }

  function updateScore(gained) {
    score += gained;
    scoreEl.textContent = score;
    if (gained > 0) {
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
    }
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem(BEST_KEY, best);
    }
  }

  /* ---------- 移动逻辑 ---------- */
  function getLines(dir) {
    const lines = [];
    const horizontal = dir === 'left' || dir === 'right';
    for (let i = 0; i < SIZE; i++) {
      const line = [];
      for (let j = 0; j < SIZE; j++) {
        const k = (dir === 'left' || dir === 'up') ? j : SIZE - 1 - j;
        line.push(horizontal ? [i, k] : [k, i]);
      }
      lines.push(line);
    }
    return lines;
  }

  function move(dir) {
    if (busy || over) return;

    let moved = false;
    let gained = 0;
    const merges = [];

    for (const line of getLines(dir)) {
      const seq = line.map(([r, c]) => grid[r][c]).filter(Boolean);
      for (const [r, c] of line) grid[r][c] = null;

      const results = [];
      for (const t of seq) {
        const last = results[results.length - 1];
        if (last && !last.merged && last.value === t.value) {
          last.merged = true;
          last.value *= 2;
          last.tiles.push(t);
        } else {
          results.push({ value: t.value, tiles: [t], merged: false });
        }
      }

      results.forEach((res, i) => {
        const [r, c] = line[i];
        const survivor = res.tiles[0];
        if (survivor.r !== r || survivor.c !== c) moved = true;

        setPos(survivor, r, c);
        grid[r][c] = survivor;

        if (res.merged) {
          const extra = res.tiles[1];
          moved = true;
          gained += res.value;
          setPos(extra, r, c);
          extra.el.style.zIndex = 2;
          merges.push({ survivor, extra, value: res.value });
        }
      });
    }

    if (!moved) return;

    busy = true;
    updateScore(gained);

    setTimeout(() => {
      for (const m of merges) {
        m.extra.el.remove();
        m.survivor.value = m.value;
        paint(m.survivor.el, m.value);
        m.survivor.el.classList.remove('pop');
        void m.survivor.el.offsetWidth;
        m.survivor.el.classList.add('pop');
      }

      spawnRandom();
      busy = false;
      tryUpgrade();
      checkState();
      saveState();
    }, 135);
  }

  /* ---------- 状态判定 ---------- */
  function canMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c];
        if (!t) return true;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].value === t.value) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].value === t.value) return true;
      }
    }
    return false;
  }

  function showOverlay(title, sub, btn, action) {
    ovTitle.textContent = title;
    ovSub.textContent = sub;
    ovBtn.textContent = btn;
    ovBtn.onclick = action;
    overlay.classList.add('show');
  }

  function hideOverlay() {
    overlay.classList.remove('show');
  }

  function checkState() {
    if (!canMove()) {
      over = true;
      showOverlay('游戏结束', '最终得分 ' + score + '，没位置可走了', '再来一局', newGame);
    }
  }

  /* ---------- 尺寸 ---------- */
  function updateTileSize() {
    const gap = parseFloat(getComputedStyle(tilesEl).getPropertyValue('--gap')) || 12;
    const size = (tilesEl.clientWidth - (SIZE - 1) * gap) / SIZE;
    if (size > 0) tilesEl.style.setProperty('--s', size + 'px');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  /* ---------- 最大数字首次到 65k：4×4 缩到右下角，左/上新增一格变 5×5 ---------- */
  function tryUpgrade() {
    if (SIZE >= MAX_SIZE) return;

    let reached = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] && grid[r][c].value >= UPGRADE_VALUE) reached = true;
      }
    }
    if (!reached) return;

    const old = grid;
    SIZE = MAX_SIZE;
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

    // 旧瓦片整体右下移一格，顶部与左侧空出新格
    for (let r = 0; r < old.length; r++) {
      for (let c = 0; c < old[r].length; c++) {
        const t = old[r][c];
        if (!t) continue;
        grid[r + 1][c + 1] = t;
        setPos(t, r + 1, c + 1);
      }
    }

    buildBackground();
    updateTileSize();
    toast('最大数字达到 65k，棋盘升级为 5×5！');
  }

  /* ---------- 本地存档 ---------- */
  function saveState() {
    const tiles = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) tiles.push([r, c, grid[r][c].value]);
      }
    }
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ size: SIZE, score: score, over: over, tiles: tiles }));
    } catch (e) { /* 存储不可用时忽略 */ }
  }

  function restoreGame() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STATE_KEY));
    } catch (e) {
      return false;
    }
    if (!data || !Array.isArray(data.tiles) || !data.tiles.length) return false;

    const size = data.size === MAX_SIZE ? MAX_SIZE : BASE_SIZE;
    const tiles = data.tiles.filter(function (t) {
      return Array.isArray(t) && t.length === 3 && t[2] > 0;
    });
    if (!tiles.length) return false;

    SIZE = size;
    tilesEl.innerHTML = '';
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    buildBackground();
    updateTileSize();

    score = Number(data.score) || 0;
    scoreEl.textContent = score;
    bestEl.textContent = best;
    busy = false;
    over = !!data.over;
    hideOverlay();

    for (const t of tiles) {
      const r = t[0], c = t[1], v = t[2];
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || grid[r][c]) continue;
      newTile(r, c, v, false);
    }

    if (over) showOverlay('游戏结束', '最终得分 ' + score + '，没位置可走了', '再来一局', newGame);
    return true;
  }

  /* ---------- 新游戏 ---------- */
  function newGame() {
    SIZE = BASE_SIZE;
    tilesEl.innerHTML = '';
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    buildBackground();
    updateTileSize();
    score = 0;
    busy = false;
    over = false;
    scoreEl.textContent = '0';
    bestEl.textContent = best;
    hideOverlay();
    spawnRandom();
    spawnRandom();
    saveState();
  }

  /* ---------- 输入 ---------- */
  const KEY_MAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down'
  };

  window.addEventListener('keydown', (e) => {
    const dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  let touchStart = null;
  boardEl.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  boardEl.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  document.getElementById('new-game').addEventListener('click', newGame);

  window.addEventListener('resize', updateTileSize);
  updateTileSize();
  if (!restoreGame()) newGame();
})();
