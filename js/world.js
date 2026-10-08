'use strict';
// 世界：区域化地图（开拓 / 未开拓）、地块与地势、传送门迁移、寻路与路线显示
(function () {
  const Wd = G.World = {};
  const { W, H, STEP, MAX_H, RS, RX, RY } = G.CFG;
  const M = G.M;

  Wd.rngFrom = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  Wd.inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  Wd.get = (x, y) => Wd.inb(x, y) ? Wd.tiles[y * W + x] : null;
  Wd.wx = x => x - W / 2 + 0.5;
  Wd.wz = y => y - H / 2 + 0.5;
  Wd.tileAt = (wx, wz) => Wd.get(Math.floor(wx + W / 2), Math.floor(wz + H / 2));
  Wd.top = t => t.type === 'water' ? -0.12 : t.h * STEP;
  Wd.groundY = (wx, wz) => { const t = Wd.tileAt(wx, wz); return t ? Math.max(0, Wd.top(t)) : 0; };

  // ---------- 区域 ----------
  const rkey = (rx, ry) => rx + ',' + ry;
  Wd.isOpen = (rx, ry) => Wd.open.has(rkey(rx, ry));
  Wd.regionTiles = function (rx, ry) {
    const out = [];
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) out.push(Wd.get(rx * RS + x, ry * RS + y));
    return out;
  };
  // 已开拓范围的包围盒（格）
  Wd.bounds = function () {
    let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
    for (const k of Wd.open) {
      const [rx, ry] = k.split(',').map(Number);
      x0 = Math.min(x0, rx * RS); x1 = Math.max(x1, rx * RS + RS - 1);
      y0 = Math.min(y0, ry * RS); y1 = Math.max(y1, ry * RS + RS - 1);
    }
    return { x0, x1, y0, y1, cx: (Wd.wx(x0) + Wd.wx(x1)) / 2, cz: (Wd.wz(y0) + Wd.wz(y1)) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  // 可以扩张的空位：与已开拓区域相邻的未开拓区域
  Wd.slots = function () {
    const out = [];
    for (let ry = 0; ry < RY; ry++) for (let rx = 0; rx < RX; rx++) {
      if (Wd.isOpen(rx, ry)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => Wd.isOpen(rx + dx, ry + dy))) out.push({ rx, ry });
    }
    return out;
  };

  // 区域布局：16 个格子 {type, h}
  Wd.makeRegion = function (id, rng) {
    const cells = [];
    for (let i = 0; i < RS * RS; i++) cells.push({ type: 'grass', h: 0 });
    const at = (x, y) => cells[y * RS + x];
    const rc = () => at(Math.floor(rng() * RS), Math.floor(rng() * RS));
    const trees = n => { for (let i = 0; i < n; i++) { const c = rc(); if (c.type === 'grass' && !c.h) c.type = 'tree'; } };
    if (id === 'meadow') { trees(Math.floor(rng() * 3)); }
    else if (id === 'outcrop') {
      const n = 3 + Math.floor(rng() * 3);
      let x = 1 + Math.floor(rng() * 2), y = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const c = at(x, y); c.type = 'rock'; c.h = rng() < 0.45 ? 2 : 1;
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
        x = Math.max(0, Math.min(RS - 1, x + d[0] * (rng() < 0.6 ? 1 : 2))); y = Math.max(0, Math.min(RS - 1, y + d[1] * (rng() < 0.6 ? 1 : 2)));
      }
      trees(1);
    } else if (id === 'crystal') {
      at(1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2)).type = 'crystal';
      trees(1 + Math.floor(rng() * 2));
    } else if (id === 'lake') {
      let x = 1 + Math.floor(rng() * 2), y = 1 + Math.floor(rng() * 2);
      const n = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        at(x, y).type = 'water';
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
        x = Math.max(0, Math.min(RS - 1, x + d[0])); y = Math.max(0, Math.min(RS - 1, y + d[1]));
      }
      trees(1);
    } else if (id === 'ruins') {
      const ox = Math.floor(rng() * 3), oy = Math.floor(rng() * 3);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) at(ox + dx, oy + dy).h = 2;
      for (let i = 0; i < 2; i++) { const c = rc(); if (!c.h) { c.type = 'rock'; c.h = 1; } }
    }
    return cells;
  };
  Wd.rotateCells = function (cells, rot) {
    let c = cells;
    for (let r = 0; r < rot; r++) {
      const n = [];
      for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) n.push(c[(RS - 1 - x) * RS + y]);
      c = n;
    }
    return c;
  };
  function applyCells(rx, ry, cells) {
    Wd.regionTiles(rx, ry).forEach((t, i) => {
      const c = cells[i];
      t.type = c.type; t.h = c.h; t.minH = c.type === 'rock' ? c.h : 0;
      t.locked = false; t.fixed = false;
    });
    Wd.open.add(rkey(rx, ry));
  }

  // ---------- 传送门：始终位于自己方向上已开拓范围的最外缘 ----------
  // axis: w/e 从左右进入（固定行），n/s 从上下进入（固定列）
  function portalSpot(p) {
    if (p.axis === 'w' || p.axis === 'e') {
      const ry = Math.floor(p.row / RS);
      let best = null;
      for (let rx = 0; rx < RX; rx++) if (Wd.isOpen(rx, ry)) {
        if (best === null || (p.axis === 'w' ? rx < best : rx > best)) best = rx;
      }
      return { x: p.axis === 'w' ? best * RS : best * RS + RS - 1, y: p.row };
    }
    const rx = Math.floor(p.col / RS);
    let best = null;
    for (let ry = 0; ry < RY; ry++) if (Wd.isOpen(rx, ry)) {
      if (best === null || (p.axis === 'n' ? ry < best : ry > best)) best = ry;
    }
    return { x: p.col, y: p.axis === 'n' ? best * RS : best * RS + RS - 1 };
  }
  const INWARD = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] };
  // 重新定位所有传送门，返回发生变化的地块（传送门入口会被清理成平地）
  function placePortals() {
    const changed = [];
    for (const p of Wd.portals) {
      const s = portalSpot(p);
      if (p.x !== undefined && (p.x !== s.x || p.y !== s.y)) { const old = Wd.get(p.x, p.y); old.fixed = false; }
      p.x = s.x; p.y = s.y;
      const d = INWARD[p.axis];
      for (const t of [Wd.get(s.x, s.y), Wd.get(s.x + d[0], s.y + d[1])]) {
        if (t.type !== 'grass' || t.h !== 0) { changed.push({ t, type: t.type, h: t.h, minH: t.minH }); t.type = 'grass'; t.h = 0; t.minH = 0; }
      }
      Wd.get(s.x, s.y).fixed = true;
    }
    return changed;
  }

  // ---------- 地图生成 ----------
  Wd.gen = function (seed) {
    const [rx0, rx1, ry0, ry1] = G.CFG.START_REGIONS;
    for (let attempt = 0; attempt < 120; attempt++) {
      const rng = Wd.rngFrom(seed + attempt * 977);
      Wd.tiles = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        Wd.tiles.push({ x, y, h: 0, minH: 0, type: 'grass', fixed: false, locked: true, tower: null, onPath: false });
      Wd.open = new Set();
      const crx = (rx0 + rx1) >> 1, cry = (ry0 + ry1) >> 1;
      const pool = ['meadow', 'meadow', 'outcrop', 'outcrop', 'lake', 'meadow', 'ruins'];
      for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
        const id = rx === crx && ry === cry ? 'meadow' : pool[Math.floor(rng() * pool.length)];
        applyCells(rx, ry, Wd.makeRegion(id, rng));
      }
      // 两个传送门在相互垂直的两个方向；古树放在中央偏向西/东传送门的对侧，拉长初始路线
      const aAxis = rng() < 0.5 ? 'w' : 'e', bAxis = rng() < 0.5 ? 'n' : 's';
      const hx = aAxis === 'w' ? (crx + 1) * RS - 1 - Math.floor(rng() * 2) : crx * RS + Math.floor(rng() * 2);
      const hy = bAxis === 'n' ? (cry + 1) * RS - 1 - Math.floor(rng() * 2) : cry * RS + Math.floor(rng() * 2);
      const heart = { x: hx, y: hy };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = Wd.get(heart.x + dx, heart.y + dy); t.type = 'grass'; t.h = 0; t.minH = 0; }
      Wd.get(heart.x, heart.y).fixed = true;
      Wd.heart = heart;
      Wd.portals = [
        { axis: aAxis, row: ry0 * RS + 1 + Math.floor(rng() * ((ry1 - ry0 + 1) * RS - 2)), openWave: 1, name: aAxis === 'w' ? '西方传送门' : '东方传送门' },
        { axis: bAxis, col: rx0 * RS + 1 + Math.floor(rng() * ((rx1 - rx0 + 1) * RS - 2)), openWave: G.CFG.PORTAL_B_WAVE, name: bAxis === 'n' ? '北方传送门' : '南方传送门' },
      ];
      if (Math.abs(Wd.portals[0].row - heart.y) < 2 && rng() < 0.5) continue;
      placePortals();
      const f = Wd.field();
      if (Wd.reachAll(f) && f[Wd.portals[0].y * W + Wd.portals[0].x] >= 10) { Wd.seed = seed; return; }
    }
  };

  // ---------- 寻路（Dijkstra 距离场，从古树向外） ----------
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  // ov：Map<tile, 假设的高度>，用于预览“如果这样改地形”
  Wd.walk = function (t, ov) {
    if (!t || t.locked) return false;
    const h = ov && ov.has(t) ? ov.get(t) : t.h;
    return h === 0 && t.type === 'grass';
  };
  function canStep(x, y, d, ov) {
    const n = Wd.get(x + d[0], y + d[1]);
    if (!Wd.walk(n, ov)) return false;
    if (d[0] && d[1]) return Wd.walk(Wd.get(x + d[0], y), ov) && Wd.walk(Wd.get(x, y + d[1]), ov);
    return true;
  }
  Wd.field = function (ov) {
    const N = W * H;
    const dist = new Float32Array(N).fill(Infinity);
    const done = new Uint8Array(N);
    dist[Wd.heart.y * W + Wd.heart.x] = 0;
    // 简单的二叉堆
    const heap = [[0, Wd.heart.y * W + Wd.heart.x]];
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [bd, best] = pop();
      if (done[best]) continue;
      done[best] = 1;
      const x = best % W, y = (best / W) | 0;
      for (const d of DIRS) {
        if (!canStep(x, y, d, ov)) continue;
        const ni = (y + d[1]) * W + x + d[0];
        const nd = bd + d[2];
        if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
      }
    }
    return dist;
  };
  Wd.reachAll = f => Wd.portals.every(p => isFinite(f[p.y * W + p.x]));
  Wd.nextStep = function (f, x, y) {
    let best = null, bv = f[y * W + x];
    for (const d of DIRS) {
      if (!canStep(x, y, d)) continue;
      const v = f[(y + d[1]) * W + x + d[0]] + d[2] * 0.001;
      if (v < bv) { bv = v; best = Wd.get(x + d[0], y + d[1]); }
    }
    return best;
  };
  Wd.route = function (f, sx, sy) {
    const out = [Wd.get(sx, sy)];
    let t = out[0], guard = 0;
    while (t && !(t.x === Wd.heart.x && t.y === Wd.heart.y) && guard++ < 600) {
      t = Wd.nextStep(f, t.x, t.y);
      if (t) out.push(t);
    }
    return out;
  };
  Wd.pathLen = p => Wd.dist ? Wd.dist[p.y * W + p.x] : 0;

  // ---------- 构建场景 ----------
  Wd.pickables = [];
  Wd.build = function (scene) {
    if (Wd.group) scene.remove(Wd.group);
    const grp = Wd.group = new THREE.Group();
    scene.add(grp);
    const rng = Wd.decoRng = Wd.rngFrom(Wd.seed * 7 + 3);
    for (const t of Wd.tiles) { t.wx = Wd.wx(t.x); t.wz = Wd.wz(t.y); t.deco = null; }
    G.Terrain.build(grp, rng);
    Wd.pickables = G.Terrain.chunks;
    for (const t of Wd.tiles) if (!t.locked) Wd.makeDeco(t);
    const heart = Wd.heartObj = M.heart();
    heart.group.position.set(Wd.wx(Wd.heart.x), 0, Wd.wz(Wd.heart.y));
    grp.add(heart.group);
    for (const p of Wd.portals) {
      const o = M.portal();
      if (p.axis === 'n' || p.axis === 's') o.group.rotation.y = Math.PI / 2;
      grp.add(o.group);
      p.obj = o;
    }
    Wd.syncPortals();
    buildEnvironment(grp, rng);
    buildDots(grp);
  };
  Wd.syncPortals = function () {
    for (const p of Wd.portals) p.obj.group.position.set(Wd.wx(p.x), 0, Wd.wz(p.y));
  };
  // 地块上的模型：树（或仙人掌）、岩石顶上的碎石、地脉水晶
  Wd.makeDeco = function (t) {
    const rng = Wd.decoRng;
    if (t.deco) { Wd.group.remove(t.deco); t.deco = null; }
    if (t.type === 'tree') {
      t.deco = M.tree(rng); t.deco.position.set(t.wx + (rng() - 0.5) * 0.25, 0, t.wz + (rng() - 0.5) * 0.25);
    } else if (t.type === 'rock') {
      t.deco = M.rock(rng); t.deco.scale.setScalar(0.6); t.deco.position.set(t.wx + 0.28, Wd.top(t), t.wz - 0.28); t.deco.userData.onTop = true;
    } else if (t.type === 'crystal') {
      t.deco = M.crystalNode(); t.deco.position.set(t.wx, 0, t.wz);
    }
    if (t.deco) Wd.group.add(t.deco);
  };

  Wd.setHeight = function (t, h) {
    const old = t.h;
    t.h = h;
    G.Terrain.setChunk(t, old);
    if (t.deco && t.deco.userData.onTop) t.deco.position.y = Wd.top(t);
  };

  Wd.canRaise = function (t, by = 1) {
    if (!t) return '无效位置';
    if (t.locked) return '这里还没有开拓（通过「区域扩张」解锁）';
    if (t.type === 'tree' || t.type === 'water' || t.type === 'crystal') return '树木、水面和水晶处无法改变地形';
    if (t.fixed) return '传送门与古树所在的地块无法改变';
    if (t.h + by > MAX_H) return '超过最高地势（3 级）';
    if (t.h === 0) {
      const f = Wd.field(new Map([[t, by]]));
      if (!Wd.reachAll(f)) return '不能完全堵死敌人的道路！';
    }
    return null;
  };
  Wd.canLower = function (t) {
    if (!t) return '无效位置';
    if (t.locked) return '这里还没有开拓';
    if (t.type === 'tree' || t.type === 'water' || t.type === 'crystal') return '树木、水面和水晶处无法改变地形';
    if (t.h <= t.minH) return t.h === 0 ? '已经是地面了' : '天然岩石不能再降低';
    if (t.tower && t.h === 1) return '塔下的地块不能降为地面（先出售这座塔）';
    return null;
  };
  // 多格地形块的整体检查：返回 { err, tiles }
  Wd.checkPiece = function (cells, piece) {
    const tiles = [];
    for (const [x, y] of cells) {
      const t = Wd.get(x, y);
      if (!t) return { err: '超出地图范围' };
      tiles.push(t);
    }
    if (piece.dig) {
      const hit = tiles.filter(t => !t.locked && t.h > t.minH && !['tree', 'water', 'crystal'].includes(t.type));
      if (!hit.length) return { err: '这里没有可以削低的高地', tiles };
      const bad = hit.find(t => t.tower && t.h === 1);
      if (bad) return { err: '塔下的地块不能降为地面', tiles };
      return { err: null, tiles: hit };
    }
    const by = piece.raise || 1;
    for (const t of tiles) {
      if (t.locked) return { err: '有格子落在未开拓的区域', tiles };
      if (t.type === 'tree' || t.type === 'water' || t.type === 'crystal') return { err: '不能盖在树木、水面或水晶上', tiles };
      if (t.fixed) return { err: '不能盖住传送门或古树', tiles };
      if (t.h + by > MAX_H) return { err: '超过最高地势（3 级）', tiles };
    }
    const ov = new Map(tiles.map(t => [t, t.h + by]));
    if (!Wd.reachAll(Wd.field(ov))) return { err: '不能完全堵死敌人的道路！', tiles };
    return { err: null, tiles };
  };

  // ---------- 区域扩张 ----------
  // 试放：返回错误信息或 null（不改动任何东西）
  Wd.checkExpand = function (rx, ry, cells) {
    if (!Wd.slots().some(s => s.rx === rx && s.ry === ry)) return '只能放在已开拓区域的旁边';
    const tiles = Wd.regionTiles(rx, ry);
    const saved = tiles.map(t => ({ type: t.type, h: t.h, minH: t.minH, locked: t.locked, fixed: t.fixed }));
    const savedPortals = Wd.portals.map(p => ({ x: p.x, y: p.y }));
    const savedFixed = Wd.portals.map(p => Wd.get(p.x, p.y).fixed);
    applyCells(rx, ry, cells);
    const changed = placePortals();
    const ok = Wd.reachAll(Wd.field());
    // 还原
    for (const c of changed) { c.t.type = c.type; c.t.h = c.h; c.t.minH = c.minH; }
    for (const p of Wd.portals) Wd.get(p.x, p.y).fixed = false;
    tiles.forEach((t, i) => Object.assign(t, saved[i]));
    Wd.open.delete(rkey(rx, ry));
    Wd.portals.forEach((p, i) => { p.x = savedPortals[i].x; p.y = savedPortals[i].y; Wd.get(p.x, p.y).fixed = savedFixed[i]; });
    return ok ? null : '这样放会堵死敌人的道路，换个方向试试（R 旋转）';
  };
  Wd.expand = function (rx, ry, cells) {
    const tiles = Wd.regionTiles(rx, ry);
    const before = Wd.portals.map(p => p.x + ',' + p.y);
    applyCells(rx, ry, cells);
    const changed = placePortals();
    for (const t of tiles) { G.Terrain.setChunk(t, 0, true); Wd.makeDeco(t); }
    for (const c of changed) { G.Terrain.setChunk(c.t, c.h, false); Wd.makeDeco(c.t); }
    Wd.syncPortals();
    G.Terrain.onExpand();
    Wd.recompute();
    return Wd.portals.filter((p, i) => before[i] !== p.x + ',' + p.y);
  };

  // ---------- 路线计算与显示 ----------
  Wd.recompute = function () {
    Wd.dist = Wd.field();
    for (const t of Wd.tiles) t.onPath = false;
    Wd.routes = Wd.portals.map(p => Wd.route(Wd.dist, p.x, p.y));
    Wd.routes.forEach((r, i) => {
      if (Wd.portals[i].openWave <= G.S.wave + 1) for (const t of r) t.onPath = true;
    });
    G.Terrain.paint();
    Wd.polys = Wd.routes.map(r => polyline(r));
  };
  function polyline(r) {
    const pts = r.map(t => new THREE.Vector3(t.wx, 0.08, t.wz));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function sample(poly, d, out) {
    const { pts, cum } = poly;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i] || a;
    const seg = (cum[i] - cum[i - 1]) || 1;
    out.lerpVectors(a, b, Math.min(1, (d - cum[i - 1]) / seg));
    return out;
  }
  const MAXD = 900;
  function buildDots(grp) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXD * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXD * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 0.3, map: G.dotTex, vertexColors: true, transparent: true, depthWrite: false });
    Wd.dots = new THREE.Points(geo, mat);
    Wd.dots.frustumCulled = false;
    grp.add(Wd.dots);
  }
  const tmp = new THREE.Vector3();
  Wd.updateDots = function (time, show) {
    const pos = Wd.dots.geometry.attributes.position, col = Wd.dots.geometry.attributes.color;
    let n = 0;
    if (show && Wd.polys) {
      Wd.polys.forEach((poly, i) => {
        const active = Wd.portals[i].openWave <= G.S.wave + 1;
        const c = active ? [1.6, 0.62, 0.12] : [0.7, 0.25, 1.4];
        const spacing = 0.55, off = (time * 1.4) % spacing;
        for (let d = off; d < poly.len && n < MAXD; d += spacing) {
          sample(poly, d, tmp);
          pos.setXYZ(n, tmp.x, tmp.y, tmp.z);
          col.setXYZ(n, c[0], c[1], c[2]);
          n++;
        }
      });
    }
    for (let i = n; i < MAXD; i++) pos.setXYZ(i, 0, -50, 0);
    pos.needsUpdate = true; col.needsUpdate = true;
  };

  // ---------- 环境：飘浮的光点（森林里是萤火虫，沙漠里是金色尘埃） ----------
  function buildEnvironment(grp, rng) {
    const FN = 160;
    const fg = new THREE.BufferGeometry();
    Wd.fireSeeds = [];
    for (let i = 0; i < FN; i++) Wd.fireSeeds.push([(rng() - 0.5) * (W + 4), 0.3 + rng() * 1.6, (rng() - 0.5) * (H + 4), rng() * 10]);
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 3), 3));
    Wd.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.13, map: G.dotTex, color: M.lin(G.BIOMES[G.biome].motes, 2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    Wd.fireflies.frustumCulled = false;
    grp.add(Wd.fireflies);
  }

  const RUNE_ON = M.lin(0xff7be0, 1.8), RUNE_OFF = M.lin(0x5a4a6a);
  Wd.update = function (dt, time) {
    G.Terrain.update(dt, time);
    const fp = Wd.fireflies.geometry.attributes.position;
    Wd.fireSeeds.forEach((s, i) => {
      fp.setXYZ(i, s[0] + Math.sin(time * 0.4 + s[3]) * 0.6, s[1] + Math.sin(time * 0.9 + s[3] * 2) * 0.25, s[2] + Math.cos(time * 0.35 + s[3]) * 0.6);
    });
    fp.needsUpdate = true;
    const h = Wd.heartObj;
    h.crystal.rotation.y += dt * 1.2;
    h.crystal.position.y = 2.0 + Math.sin(time * 2) * 0.06;
    h.halo.rotation.z += dt * 0.6;
    h.halo.position.y = h.crystal.position.y;
    h.light.intensity = 0.55 + Math.sin(time * 1.6) * 0.15;
    h.glow.material.opacity = 0.35 + Math.sin(time * 1.6) * 0.12;
    h.glow.scale.setScalar(2.1 + Math.sin(time * 1.6) * 0.2);
    h.fruits.forEach((f, i) => { f.position.y += Math.sin(time * 1.5 + i) * 0.0007; });
    // 不断向外扩散的光辉：一圈圈光环 + 缓缓升起的光点
    const hp = h.group.position;
    Wd.auraT = (Wd.auraT || 0) - dt;
    if (Wd.auraT <= 0) {
      Wd.auraT = 1.4;
      G.FX.softRing(hp, 0x9ff4ff, 0.4, 3.0, 2.4, 0.07, 0.4, 'ring', 1.0);
      G.FX.softRing(new THREE.Vector3(hp.x + 0.2, 0, hp.z), 0xd8c8ff, 0.3, 1.8, 2.0, 1.4, 0.22, 'ring', 1.0);
    }
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.7;
      G.FX.emit(new THREE.Vector3(hp.x + 0.2 + Math.cos(a) * r, 0.9 + Math.random() * 0.9, hp.z + Math.sin(a) * r), 1, Math.random() < 0.5 ? 0x9ff4ff : 0xe0d0ff, 0.15, 2.2, 0.35, -0.12, 0.05, 1.3);
    }
    for (const p of Wd.portals) {
      const active = p.openWave <= G.S.wave + (G.S.phase === 'combat' ? 0 : 1);
      p.obj.swirl2.rotation.x += dt * (active ? 2.5 : 0.3);
      p.obj.swirlMat.opacity = active ? 0.7 + Math.sin(time * 4) * 0.15 : 0.12;
      p.obj.runeMat.color.copy(active ? RUNE_ON : RUNE_OFF);
      p.obj.swirl2.visible = active;
    }
    for (const t of Wd.tiles) if (t.type === 'crystal' && t.deco) {
      t.deco.userData.crystals.forEach((c, i) => { c.position.y += Math.sin(time * 2 + i) * 0.0008; });
      t.deco.rotation.y += dt * 0.2;
    }
  };
})();
