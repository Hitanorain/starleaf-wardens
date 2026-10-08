'use strict';
// 地形渲染：斑驳地面（顶点色）、圆角土块、水面、细碎装饰、建造网格
(function () {
  const T = G.Terrain = {};
  const { W, H, STEP } = G.CFG;
  const M = G.M;
  const GW = W + 3, GH = H + 3, SUB = 10;  // 地面网格比地图大一圈，每格细分 10 份（高地也直接做在这张网格上）

  // ---------- 噪声 ----------
  let seedN = 1;
  function hash(a, b) {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + seedN | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  const fbm = (x, z) => vnoise(x, z) * 0.65 + vnoise(x * 2.3 + 17, z * 2.3 + 5) * 0.35;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const C = hex => new THREE.Color(hex).convertSRGBToLinear();

  // 在地块中心之间做双线性插值的“场”
  function field(fn) {
    const v = new Float32Array(W * H);
    for (const t of G.World.tiles) v[t.y * W + t.x] = fn(t);
    return (x, z) => {
      const gx = x + W / 2 - 0.5, gz = z + H / 2 - 0.5;
      const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
      const g = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : v[j * W + i];
      return (g(x0, z0) * (1 - fx) + g(x0 + 1, z0) * fx) * (1 - fz) + (g(x0, z0 + 1) * (1 - fx) + g(x0 + 1, z0 + 1) * fx) * fz;
    };
  }

  // ---------- 调色板 ----------
  const P = {};
  T.setBiome = function (b) {
    const pal = G.BIOMES[b].pal;
    for (const k in pal) P[k] = C(pal[k]);
    for (const k in geoCache) delete geoCache[k];
  };

  // ---------- 圆角土块几何（按高度缓存，顶点色已烘焙） ----------
  const geoCache = {};
  function chunkGeo(h, rock, variant = 0) {
    const key = h + (rock ? 'r' : 'g') + variant;
    if (geoCache[key]) return geoCache[key];
    const vr = Wd0rng(variant * 31 + h * 7 + (rock ? 3 : 0));
    const s = 0.44 + vr() * 0.06, r = 0.16 + vr() * 0.1, bs = 0.07, bt = 0.08;
    const sh = new THREE.Shape();
    sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
    sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s);
    sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r);
    sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
    const top = h * STEP;
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: top + 0.06 - 2 * bt, steps: h * 2, bevelEnabled: true,
      bevelThickness: bt, bevelSize: bs, bevelSegments: 5, curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.06 + bt, 0);
    // 轻微的噪声扰动，让每块轮廓都不一样
    {
      const ps = g.attributes.position;
      for (let i = 0; i < ps.count; i++) {
        const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i);
        const n = Math.sin(x * 23.1 + z * 17.3 + variant * 5.1) * Math.cos(z * 19.7 - x * 7.9 + y * 11.0);
        ps.setXYZ(i, x * (1 + n * 0.05), y + (y > top - 0.05 ? n * 0.015 : 0), z * (1 + n * 0.05));
      }
    }
    g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), ny = nor.getY(i);
      const k = Math.max(0, Math.min(1, y / top));
      if (ny > 0.92) c.copy(rock ? P.rockTop : P.top);
      else if (ny > 0.3) c.copy(rock ? P.rockRim : P.topRim);
      else {
        c.copy(rock ? P.rockLo : P.earthLo).lerp(rock ? P.rockHi : P.earthHi, Math.pow(k, 0.8));
        // 每级地势一条深色岩层线
        const band = (y / STEP) % 1;
        if (y > 0.05 && (band < 0.08 || band > 0.94)) c.multiplyScalar(0.72);
        // 顶部草皮垂边
        if (!rock && y > top - 0.1) c.copy(P.lip);
        // 底部环境光遮蔽
        if (y < 0.12) c.multiplyScalar(0.55 + y * 3.5);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geoCache[key] = g;
    return g;
  }
  function Wd0rng(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
  const chunkMats = [0xffffff, 0xe6eedc, 0xfff3e2, 0xdde8de, 0xf3f7e6].map(c =>
    new THREE.MeshPhongMaterial({ color: C(c), vertexColors: true, flatShading: true, shininess: 6, specular: 0x050505 }));

  // ---------- 装饰件（实例化渲染） ----------
  const U = THREE.BufferGeometryUtils;
  function merged(parts) {
    return U.mergeBufferGeometries(parts.map(([geo, p, s, r]) => {
      const g = geo.clone();
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new THREE.Vector3(...s));
      g.applyMatrix4(m);
      return g.index ? g.toNonIndexed() : g;
    }));
  }
  const DECOR = {
    tuft: { geo: () => merged([[new THREE.ConeGeometry(1, 1, 3), [0, 0.07, 0], [0.025, 0.15, 0.025], [0.15, 0, 0.1]], [new THREE.ConeGeometry(1, 1, 3), [0.04, 0.06, 0.02], [0.022, 0.12, 0.022], [0, 0, -0.45]], [new THREE.ConeGeometry(1, 1, 3), [-0.035, 0.055, -0.01], [0.022, 0.11, 0.022], [0.2, 0, 0.5]], [new THREE.ConeGeometry(1, 1, 3), [0.0, 0.05, 0.04], [0.02, 0.1, 0.02], [0.5, 0, 0]]]),
      colors: [0x6f9a44, 0x86a84e, 0x9cb85c, 0x5f8a3e], shadow: false, max: 3200 },
    shrub: { geo: () => merged([[new THREE.IcosahedronGeometry(1, 0), [0, 0.06, 0], [0.09, 0.07, 0.09]], [new THREE.IcosahedronGeometry(1, 0), [0.07, 0.04, 0.03], [0.06, 0.05, 0.06]], [new THREE.IcosahedronGeometry(1, 0), [-0.05, 0.04, -0.04], [0.06, 0.05, 0.06]]]),
      colors: [0x5e8a3f, 0x6f8f45, 0x7f9a4c, 0x9a6a4a, 0x8c6b4e], shadow: true, max: 1200 },
    pebble: { geo: () => merged([[new THREE.DodecahedronGeometry(1, 0), [0, 0.02, 0], [0.06, 0.035, 0.05]], [new THREE.DodecahedronGeometry(1, 0), [0.07, 0.015, 0.03], [0.035, 0.025, 0.03]]]),
      colors: [0x8f8a96, 0x847e74, 0x9e978a, 0x77727f], shadow: true, max: 1500 },
    flower: { geo: () => G.biome === 'desert'
      ? merged([[new THREE.CylinderGeometry(1, 1, 1, 6), [0, 0.07, 0], [0.03, 0.14, 0.03]], [new THREE.SphereGeometry(1, 6, 4), [0, 0.14, 0], [0.03, 0.025, 0.03]], [new THREE.CylinderGeometry(1, 1, 1, 6), [0.045, 0.07, 0], [0.018, 0.06, 0.018]], [new THREE.SphereGeometry(1, 6, 4), [0.06, 0.11, 0], [0.022, 0.03, 0.022]]])
      : merged([[new THREE.CylinderGeometry(1, 1, 1, 3), [0, 0.05, 0], [0.006, 0.1, 0.006]], [new THREE.IcosahedronGeometry(1, 0), [0, 0.11, 0], [0.03, 0.022, 0.03]], [new THREE.IcosahedronGeometry(1, 0), [0.05, 0.08, 0.02], [0.024, 0.018, 0.024]]]),
      colors: [0xfff7ea, 0xffe37a, 0xffb3d6, 0xd2bfff], shadow: false, max: 1000 },
  };
  T.items = [];

  // ---------- 构建 ----------
  T.build = function (grp, rng) {
    seedN = (G.World.seed * 2654435761) | 0;
    T.grp = grp;
    T.chunks = [];
    T.anims = [];
    T.ponds = [];
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 15 + rng() * 14;
      const px = Math.cos(a) * r * 1.2, pz = Math.sin(a) * r * 0.9;
      if (Math.abs(px) < W / 2 + 3 && Math.abs(pz) < H / 2 + 3) continue;
      T.ponds.push({ x: px, z: pz, rx: 1.5 + rng() * 2.5, rz: 1.2 + rng() * 1.8 });
    }
    buildGround(grp);
    buildOuter(grp);
    buildWater(grp);
    for (const t of G.World.tiles) t.vh = t.h;
    buildDecor(grp, rng);
    buildForest(grp, rng);
    T.grid = null;
    T.onExpand();
    buildSlots(grp);
  };
  T.onExpand = function () { buildGrid(T.grp); T.spots = null; };

  // 可玩区域外的大地面（中间挖空，被精细地面盖住）
  const OW = 120, OH = 100;
  function buildOuter(grp) {
    const g = new THREE.PlaneGeometry(OW, OH, OW, OH);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y;
      if (Math.abs(x) < GW / 2 - 1.1 && Math.abs(z) < GH / 2 - 1.1) { y = -1; c.setRGB(0, 0, 0); }
      else y = outer(x, z, c) - 0.02;
      pos.setY(i, y);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    // 中间挖洞会让洞边的法线歪掉、光照发亮，这里把洞附近的法线扶正
    const nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) < GW / 2 + 1.01 && Math.abs(pos.getZ(i)) < GH / 2 + 1.01) nor.setXYZ(i, 0, 1, 0);
    }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    grp.add(m);
  }

  // 外围森林与小山丘（纯装饰，用实例化渲染保证性能）
  function buildForest(grp, rng) {
    const trunkG = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 5); trunkG.translate(0, 0.22, 0);
    const pineG = merged([[new THREE.ConeGeometry(1, 1, 6), [0, 0.5, 0], [0.42, 0.5, 0.42]], [new THREE.ConeGeometry(1, 1, 6), [0, 0.78, 0], [0.33, 0.45, 0.33], [0, 0.5, 0]], [new THREE.ConeGeometry(1, 1, 6), [0, 1.03, 0], [0.23, 0.4, 0.23], [0, 1, 0]]]);
    const bushG = merged([[new THREE.IcosahedronGeometry(1, 0), [0, 0.62, 0], [0.34, 0.3, 0.34]], [new THREE.IcosahedronGeometry(1, 0), [0.18, 0.55, 0.1], [0.24, 0.22, 0.24], [0.5, 0.3, 0]], [new THREE.IcosahedronGeometry(1, 0), [-0.15, 0.78, -0.08], [0.24, 0.22, 0.24], [0.2, 1, 0]]]);
    const spots = [];
    for (let i = 0; i < 3000 && spots.length < 560; i++) {
      const x = (rng() - 0.5) * 80, z = -40 + rng() * 64;
      const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - H / 2);
      if (d < 1.1) continue;
      // 离可玩区越远越密，形成树林；靠近镜头的一侧稀一些
      const dens = Math.min(1, (d - 0.8) / 5) * (z > H / 2 ? 0.45 : 1) * (0.4 + 0.6 * fbm(x * 0.15, z * 0.15));
      if (rng() > dens) continue;
      let ok = true;
      for (const p of G.World.portals) if (Math.hypot(x - G.World.wx(p.x), z - G.World.wz(p.y)) < 3) ok = false;
      for (const p of T.ponds) if (Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) < 1.3) ok = false;
      if (ok) spots.push([x, z]);
    }
    const n = spots.length;
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: C(0x7a5236) }), n);
    const pines = new THREE.InstancedMesh(pineG, new THREE.MeshPhongMaterial({ flatShading: true, shininess: 4 }), n);
    const bushes = new THREE.InstancedMesh(bushG, new THREE.MeshPhongMaterial({ flatShading: true, shininess: 4 }), n);
    let np = 0, nb = 0;
    const desert = G.biome === 'desert';
    let pineCols = [0x3f7a4a, 0x4a8a50, 0x356b42, 0x5a9455], blossomCols = [0xe8a9c8, 0xf2c2d8, 0xc9a7e6, 0x7fa05a, 0x6e9a4e];
    if (desert) {   // 沙漠：仙人掌 + 风化石柱
      pines.geometry = merged([[new THREE.CylinderGeometry(1, 1, 1, 6), [0, 0.45, 0], [0.09, 0.9, 0.09]], [new THREE.CylinderGeometry(1, 1, 1, 6), [0.16, 0.5, 0], [0.06, 0.3, 0.06]], [new THREE.CylinderGeometry(1, 1, 1, 6), [0.1, 0.36, 0], [0.12, 0.06, 0.06], [0, 0, Math.PI / 2]], [new THREE.CylinderGeometry(1, 1, 1, 6), [-0.15, 0.62, 0], [0.055, 0.26, 0.055]], [new THREE.CylinderGeometry(1, 1, 1, 6), [-0.09, 0.5, 0], [0.11, 0.055, 0.055], [0, 0, Math.PI / 2]]]);
      bushes.geometry = merged([[new THREE.DodecahedronGeometry(1, 0), [0, 0.25, 0], [0.35, 0.3, 0.3]], [new THREE.DodecahedronGeometry(1, 0), [0.05, 0.6, 0], [0.25, 0.25, 0.22]], [new THREE.DodecahedronGeometry(1, 0), [0, 0.88, 0.02], [0.17, 0.18, 0.16]]]);
      trunks.visible = false;
      pineCols = [0x5f9450, 0x6aa05a, 0x4f8848, 0x77a862];
      blossomCols = [0xb07a5c, 0xc48a66, 0x9a6a54, 0xd0a07a];
    }
    const tc = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const s2 = 0.9 + rng() * 0.9, y = outer(x, z, tc);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      mtx.compose(v.set(x, y, z), q, sc.setScalar(s2));
      trunks.setMatrixAt(i, mtx);
      if (rng() < (desert ? 0.5 : 0.62)) { pines.setMatrixAt(np, mtx); pines.setColorAt(np++, C(pineCols[Math.floor(rng() * pineCols.length)])); }
      else { bushes.setMatrixAt(nb, mtx); bushes.setColorAt(nb++, C(blossomCols[Math.floor(rng() * blossomCols.length)])); }
    });
    pines.count = np; bushes.count = nb;
    for (const m of [trunks, pines, bushes]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    // 小山丘：几块抬高的土块
    for (let k = 0; k < (desert ? 34 : 18); k++) {
      const cx = Math.round((rng() - 0.5) * 40), cz = Math.round(-16 + rng() * 26);
      const d = Math.max(Math.abs(cx) - W / 2, Math.abs(cz) - H / 2);
      if (d < 2 || cz > H / 2 + 3) continue;
      const size = 1 + Math.floor(rng() * 4);
      for (let j = 0; j < size; j++) {
        const x = cx + Math.floor(rng() * 2) + 0.5, z = cz + Math.floor(rng() * 2) + 0.5;
        const h = 1 + Math.floor(rng() * (desert ? 3 : 2));
        const m = new THREE.Mesh(chunkGeo(h, rng() < 0.25, Math.floor(rng() * 6)), chunkMats[Math.floor(rng() * chunkMats.length)]);
        m.position.set(x, outer(x, z, tc) - 0.03, z);
        m.rotation.y = Math.floor(rng() * 4) * Math.PI / 2;
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
      }
    }
  }

  function buildGround(grp) {
    const g = new THREE.PlaneGeometry(GW, GH, GW * SUB, GH * SUB);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    // 平滑着色：高地的坡是连续的曲面
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 6, specular: 0x060606 }));
    m.receiveShadow = true; m.castShadow = true;
    grp.add(m);
    T.ground = m;
    T.NX = GW * SUB + 1; T.NZ = GH * SUB + 1;
    // 每个顶点不随地形变化的数据只算一次：基础草色、噪声、轮廓扰动
    const pos = g.attributes.position, c = new THREE.Color();
    T.base = new Float32Array(n * 3); T.noise = new Float32Array(n * 4); T.wob = new Float32Array(n);
    T.outY = new Float32Array(n); T.outC = new Float32Array(n * 3);
    T.owner = new Array(n); T.platY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const [n1, n2, n3] = grassColor(x, z, c);
      T.base[i * 3] = c.r; T.base[i * 3 + 1] = c.g; T.base[i * 3 + 2] = c.b;
      T.noise[i * 4] = n1; T.noise[i * 4 + 1] = n2; T.noise[i * 4 + 2] = n3; T.noise[i * 4 + 3] = vnoise(x * 2.1, z * 2.1);
      T.wob[i] = (vnoise(x * 3.3 + 7, z * 3.3 + 3) - 0.5) * 0.09 + (vnoise(x * 9, z * 9) - 0.5) * 0.03;
      if (Math.abs(x) >= W / 2 || Math.abs(z) >= H / 2) {
        T.outY[i] = outer(x, z, c);
        T.outC[i * 3] = c.r; T.outC[i * 3 + 1] = c.g; T.outC[i * 3 + 2] = c.b;
      }
    }
  }
  function buildWater(grp) {
    const g = new THREE.PlaneGeometry(OW, OH, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhongMaterial({
      color: C(0x4f9fc4), emissive: C(0x123e55), transparent: true, opacity: 0.82,
      shininess: 120, specular: new THREE.Color(0.6, 0.6, 0.6),
    });
    const m = new THREE.Mesh(g, mat);
    m.position.y = -0.17;
    m.receiveShadow = true;
    grp.add(m);
    T.water = m;
    // 波光：两层不同方向滚动的光点纹理叠在水面上，交错闪烁
    T.waterFx = [0, 1].map(i => {
      const tex = sparkleTex(i);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(OW / (i ? 3.2 : 4.2), OH / (i ? 3.2 : 4.2));
      const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: M.lin(0xf0fcff, 1.4), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      o.position.y = -0.165 + i * 0.002;
      grp.add(o);
      return o;
    });
  }
  // 波光纹理：随机的细长光点 + 几道弯曲的水纹
  function sparkleTex(seed) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const r = Wd0rng(seed * 101 + 7);
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const cx = r() * 256, cy = r() * 256, w = 18 + r() * 34;
      x.beginPath(); x.moveTo(cx - w, cy); x.quadraticCurveTo(cx, cy - 6 - r() * 6, cx + w, cy); x.stroke();
    }
    for (let i = 0; i < 75; i++) {
      const cx = r() * 256, cy = r() * 256, len = 4 + r() * 10, a = 0.4 + r() * 0.6;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, len);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.save(); x.translate(cx, cy); x.scale(1, 0.3); x.translate(-cx, -cy);
      x.beginPath(); x.arc(cx, cy, len, 0, Math.PI * 2); x.fill(); x.restore();
    }
    return new THREE.CanvasTexture(c);
  }
  // 可能出现闪光点的水面位置
  T.waterSpots = function () {
    const out = [];
    for (const t of G.World.tiles) if (t.type === 'water' && !t.locked) out.push([t.wx, t.wz, 0.4]);
    for (const p of T.ponds) out.push([p.x, p.z, Math.min(p.rx, p.rz) * 0.7]);
    T.spots = out;
  };

  // 草地基础色：大块明暗斑驳 + 细碎噪点
  function grassColor(x, z, c) {
    const n1 = fbm(x * 0.32, z * 0.32), n2 = fbm(x * 0.9 + 40, z * 0.9 + 40), n3 = hash(Math.round(x * 8), Math.round(z * 8));
    c.copy(P.grassB).lerp(P.grassA, smooth(0.25, 0.75, n1));
    c.lerp(P.grassLight, smooth(0.6, 0.85, n2) * 0.55);
    c.lerp(P.grassDeep, smooth(0.55, 0.2, n2) * 0.35);
    c.multiplyScalar(0.93 + n3 * 0.12);
    return [n1, n2, n3];
  }
  // 可玩区域以外：颜色更暗更沉，地面轻微起伏，偶尔有池塘。返回地面高度
  const tmpO = new THREE.Color();
  function outer(x, z, c) {
    const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - H / 2);
    const n1 = grassColor(x, z, c)[0];
    c.lerp(P.rim, 0.4).multiplyScalar(0.66 - Math.min(0.15, Math.max(0, d) * 0.01));
    // 边界处一圈浅浅的暗边，提示可建造范围
    c.multiplyScalar(1 - 0.12 * smooth(0.5, 0.0, Math.abs(d)));
    let y = -0.13 + n1 * 0.14 * Math.min(1, Math.max(0, d) * 0.6);
    for (const p of T.ponds) {
      const r = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
      if (r < 1.3) {
        const w = smooth(1.3, 0.75, r);
        tmpO.copy(c).lerp(P.sand, 0.45);
        c.lerp(tmpO, smooth(1.3, 1.0, r)).lerp(P.bed, smooth(0.95, 0.6, r));
        y = y * (1 - w) - 0.36 * w;
      }
    }
    return y;
  }

  // ---------- 高地：由地块高度生成圆润、相互融合的台地 ----------
  // 每块抬高的地块有一个“核心矩形”，与等高（或更高）的邻居相接的一侧延伸到边缘，
  // 核心外按距离平滑降下来，形成圆角的坡；再叠一点噪声让轮廓不规则。
  const EDGE_IN = 0.06, FALL = 0.26;
  let cores = null;
  function buildCores() {
    const Wd = G.World;
    cores = new Array(W * H).fill(null);
    for (const t of Wd.tiles) {
      if (!(t.vh > 0.001)) continue;
      const same = (n) => n && n.vh >= t.vh - 0.01;
      cores[t.y * W + t.x] = [
        same(Wd.get(t.x - 1, t.y)) ? -0.02 : EDGE_IN, same(Wd.get(t.x + 1, t.y)) ? 1.02 : 1 - EDGE_IN,
        same(Wd.get(t.x, t.y - 1)) ? -0.02 : EDGE_IN, same(Wd.get(t.x, t.y + 1)) ? 1.02 : 1 - EDGE_IN,
        t.vh * STEP, t,
      ];
    }
  }
  function plateau(x, z, wob, out) {
    const gx = x + W / 2, gz = z + H / 2;
    const tx = Math.floor(gx), tz = Math.floor(gz);
    let best = 0, bt = null;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = tz + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = tx + dx;
        if (xx < 0 || xx >= W) continue;
        const cr = cores[yy * W + xx];
        if (!cr || cr[4] <= best) continue;
        const lx = gx - xx, lz = gz - yy;
        const ddx = Math.max(cr[0] - lx, 0, lx - cr[1]), ddz = Math.max(cr[2] - lz, 0, lz - cr[3]);
        const d = Math.hypot(ddx, ddz) + wob;
        const v = cr[4] * (1 - smooth(0, FALL, d));
        if (v > best) { best = v; bt = cr[5]; }
      }
    }
    out.t = bt;
    return best;
  }

  // 地面顶点色与高度：草地明暗斑块、土路、水岸、高地。
  // rect（格坐标 {x0,y0,x1,y1}）给出时只重算那一小块，用于放地形块和升降动画
  T.paint = function (rect) {
    const fPath = field(t => t.onPath ? 1 : 0);
    const fRaised = field(t => t.h > 0 ? 1 : 0);
    const fTree = field(t => t.type === 'tree' ? 1 : 0);
    const fWater = field(t => t.type === 'water' ? 1 : 0);
    const fOpen = field(t => t.locked ? 0 : 1);
    buildCores();
    const geo = T.ground.geometry;
    const pos = geo.attributes.position, col = geo.attributes.color, nor = geo.attributes.normal;
    const NX = T.NX, NZ = T.NZ;
    let ix0 = 0, ix1 = NX - 1, iz0 = 0, iz1 = NZ - 1;
    if (rect) {
      ix0 = Math.max(0, Math.floor((rect.x0 - 2 + 1.5) * SUB)); ix1 = Math.min(NX - 1, Math.ceil((rect.x1 + 3 + 1.5) * SUB));
      iz0 = Math.max(0, Math.floor((rect.y0 - 2 + 1.5) * SUB)); iz1 = Math.min(NZ - 1, Math.ceil((rect.y1 + 3 + 1.5) * SUB));
    }
    const c = new THREE.Color(), tmp = new THREE.Color(), wild = new THREE.Color();
    const own = {}, plat = T.platY, B = T.base, NS = T.noise;
    const hw = W / 2, hh = H / 2;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * NX + ix;
      const x = pos.getX(i), z = pos.getZ(i);
      const inside = Math.abs(x) < hw && Math.abs(z) < hh;
      let y;
      if (!inside) {
        y = T.outY[i];
        c.setRGB(T.outC[i * 3], T.outC[i * 3 + 1], T.outC[i * 3 + 2]);
        plat[i] = 0;
      } else {
        const n1 = NS[i * 4], n2 = NS[i * 4 + 1], n3 = NS[i * 4 + 2];
        c.setRGB(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]);
        y = 0;
        // 土路
        const pw = smooth(0.32, 0.6, fPath(x, z) + (n2 - 0.5) * 0.3);
        if (pw > 0) {
          tmp.copy(P.dirt).lerp(P.dirtDark, smooth(0.3, 0.8, n1) * 0.7).multiplyScalar(0.92 + n3 * 0.14);
          c.lerp(tmp, pw);
        }
        c.multiplyScalar(1 - 0.18 * fTree(x, z));                          // 树下阴影
        c.multiplyScalar(1 - 0.32 * smooth(0.12, 0.55, fRaised(x, z)));    // 高地根部的环境光遮蔽
        const ww = fWater(x, z);                                           // 水岸与水底
        if (ww > 0.05) {
          c.lerp(P.sand, smooth(0.05, 0.3, ww) * 0.45);
          c.lerp(P.bed, smooth(0.45, 0.85, ww));
          y = -0.34 * smooth(0.25, 0.75, ww);
        }
        const op = fOpen(x, z);                                            // 未开拓的区域：暗沉、略低
        if (op < 0.95) {
          wild.setRGB(B[i * 3], B[i * 3 + 1], B[i * 3 + 2]).lerp(P.rim, 0.4).multiplyScalar(0.66);
          const k = 1 - smooth(0.3, 0.7, op);
          c.lerp(wild, k);
          y = Math.min(y, -0.13 * k);
        }
        const ph = plateau(x, z, T.wob[i], own);
        plat[i] = ph > y + 0.01 ? ph : 0;
        T.owner[i] = own.t;
        if (ph > 0) y = Math.max(y, ph);   // 只有高地才抬高；水塘、未开拓区保持下沉
      }
      pos.setY(i, y);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    // 法线：直接用高度图的差分（比整张网格重算快得多，也更平滑）
    if (!nor) geo.computeVertexNormals();
    const N = geo.attributes.normal, d2 = 2 / SUB;
    const nx0 = Math.max(0, ix0), nx1 = Math.min(NX - 1, ix1), nz0 = Math.max(0, iz0), nz1 = Math.min(NZ - 1, iz1);
    for (let iz = nz0; iz <= nz1; iz++) for (let ix = nx0; ix <= nx1; ix++) {
      const i = iz * NX + ix;
      const hl = pos.getY(iz * NX + Math.max(0, ix - 1)), hr = pos.getY(iz * NX + Math.min(NX - 1, ix + 1));
      const hu = pos.getY(Math.max(0, iz - 1) * NX + ix), hd = pos.getY(Math.min(NZ - 1, iz + 1) * NX + ix);
      const ax = (hl - hr) / d2, az = (hu - hd) / d2, l = Math.hypot(ax, 1, az);
      N.setXYZ(i, ax / l, 1 / l, az / l);
    }
    // 第二遍：按坡度给高地上色（顶面草皮 / 边缘亮边 / 坡面土层）
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * NX + ix;
      const ph = plat[i];
      if (!ph) continue;
      const t = T.owner[i], rock = t && t.type === 'rock';
      const ny = N.getY(i), n = NS[i * 4 + 3];
      const Hmax = t ? t.vh * STEP : ph;
      if (ny > 0.93 && ph > Hmax - 0.04) {
        c.copy(rock ? P.rockTop : P.top).multiplyScalar(0.92 + n * 0.16);
      } else if (ny > 0.6 && ph > Hmax - 0.12) {
        // 顶面到坡面的过渡：亮边
        c.copy(rock ? P.rockTop : P.top).lerp(rock ? P.rockRim : P.topRim, smooth(0.93, 0.75, ny)).multiplyScalar(0.94 + n * 0.12);
      } else {
        const k = Math.min(1, ph / Math.max(0.1, Hmax));
        c.copy(rock ? P.rockLo : P.earthLo).lerp(rock ? P.rockHi : P.earthHi, Math.pow(k, 0.75));
        const band = (ph / STEP) % 1;
        if (ph > 0.06 && (band < 0.1 || band > 0.93)) c.multiplyScalar(0.78);   // 每级一条岩层线
        if (!rock && ph > Hmax - 0.08) c.lerp(P.lip, 0.85);                     // 草皮垂边
        c.multiplyScalar(0.9 + n * 0.2);
        if (ph < 0.1) c.multiplyScalar(0.6 + ph * 4);                            // 根部阴影
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true; N.needsUpdate = true;
    geo.computeBoundingSphere();
    T.updateDecor();
  };

  // ---------- 土块 ----------
  // 正在升降的地块包围盒（局部重绘用）
  T.animTiles = function () {
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (const a of T.anims) { x0 = Math.min(x0, a.t.x); x1 = Math.max(x1, a.t.x); y0 = Math.min(y0, a.t.y); y1 = Math.max(y1, a.t.y); }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  };
  T.setChunk = function (t, oldH, animate = true) {
    if (animate && oldH !== t.h) {
      t.vh = oldH;
      T.anims = T.anims.filter(a => a.t !== t);
      T.anims.push({ t, from: oldH, to: t.h, k: 0 });
    } else t.vh = t.h;
  };
  T.pickables = () => T.chunks;

  // ---------- 装饰 ----------
  function buildDecor(grp, rng) {
    T.items = [];
    T.inst = {};
    for (const k in DECOR) {
      const d = DECOR[k];
      const mesh = new THREE.InstancedMesh(d.geo(), new THREE.MeshLambertMaterial({ color: 0xffffff }), d.max);
      mesh.castShadow = d.shadow; mesh.receiveShadow = true;
      grp.add(mesh);
      T.inst[k] = { mesh, d, n: 0 };
    }
    const pickType = (w) => { let r = rng() * w.reduce((a, b) => a + b[1], 0); for (const [k, p] of w) { if ((r -= p) <= 0) return k; } return w[0][0]; };
    const groundW = [['tuft', 6], ['pebble', 2], ['shrub', 1.2], ['flower', 0.7]];
    const topW = [['tuft', 6], ['pebble', 1.2], ['flower', 1], ['shrub', 0.6]];
    const add = (type, x, z, tile, layer, onPath) => {
      const I = T.inst[type];
      if (I.n >= I.d.max) return;
      const idx = I.n++;
      const cols = G.BIOMES[G.biome].decor[type] || I.d.colors;
      I.mesh.setColorAt(idx, C(cols[Math.floor(rng() * cols.length)]).multiplyScalar(0.85 + rng() * 0.3));
      T.items.push({ type, idx, x, z, tile, layer, onPath, rot: rng() * Math.PI * 2, s: 0.7 + rng() * 0.7 });
    };
    for (const t of G.World.tiles) {
      if (t.fixed && t.type !== 'rock') continue;   // 古树、传送门处不放装饰
      const n = t.type === 'water' ? 0 : 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const type = pickType(groundW);
        add(type, t.wx + (rng() - 0.5) * 0.85, t.wz + (rng() - 0.5) * 0.85, t, 'ground', type === 'pebble');
      }
      // 土块顶部的边角装饰（避开中间建塔的位置）
      for (let i = 0; i < 2; i++) {
        const a = rng() * Math.PI * 2;
        const ox = Math.cos(a) * 0.32, oz = Math.sin(a) * 0.32;
        add(pickType(topW), t.wx + ox, t.wz + oz, t, 'top', false);
      }
    }
    // 地图外一圈
    for (let i = 0; i < 2600; i++) {
      const x = (rng() - 0.5) * 60, z = -30 + rng() * 50;
      if (Math.abs(x) < W / 2 && Math.abs(z) < H / 2) continue;
      add(pickType(groundW), x, z, null, 'static', true);
    }
    for (const k in T.inst) { const I = T.inst[k]; I.mesh.count = I.n; if (I.mesh.instanceColor) I.mesh.instanceColor.needsUpdate = true; }
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  T.updateDecor = function () {
    if (!T.items.length) return;
    for (const it of T.items) {
      const t = it.tile;
      let show = true, y = 0;
      if (it.layer === 'ground') { show = t.locked || (t.h === 0 && t.type !== 'water' && (!t.onPath || it.onPath)); if (t.locked) y = -0.13; }
      else if (it.layer === 'top') { show = t.h > 0 && !t.tower; y = t.h * STEP; }
      else y = groundAt(it.x, it.z);
      v.set(it.x, y, it.z);
      q.setFromAxisAngle(up, it.rot);
      sc.setScalar(show ? it.s : 0);
      mtx.compose(v, q, sc);
      T.inst[it.type].mesh.setMatrixAt(it.idx, mtx);
    }
    for (const k in T.inst) T.inst[k].mesh.instanceMatrix.needsUpdate = true;
  };
  const gc = new THREE.Color();
  function groundAt(x, z) { return outer(x, z, gc); }   // 地图外装饰贴着起伏的地面

  // ---------- 建造网格（只在拿着工具时显示） ----------
  // 只画已开拓地块的格线
  function buildGrid(grp) {
    if (T.grid) { grp.remove(T.grid); T.grid.geometry.dispose(); }
    const pts = [];
    for (const t of G.World.tiles) {
      if (t.locked) continue;
      const x0 = t.wx - 0.5, z0 = t.wz - 0.5;
      pts.push(x0, 0.02, z0, x0 + 1, 0.02, z0, x0, 0.02, z0, x0, 0.02, z0 + 1);
      const r = G.World.get(t.x + 1, t.y), b = G.World.get(t.x, t.y + 1);
      if (!r || r.locked) pts.push(x0 + 1, 0.02, z0, x0 + 1, 0.02, z0 + 1);
      if (!b || b.locked) pts.push(x0, 0.02, z0 + 1, x0 + 1, 0.02, z0 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    T.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
    T.grid.visible = false;
    grp.add(T.grid);
  }

  // ---------- 区域扩张：空位标记与预览 ----------
  const RS = G.CFG.RS;
  function buildSlots(grp) {
    T.slotGrp = new THREE.Group();
    grp.add(T.slotGrp);
    T.slotMat = new THREE.LineBasicMaterial({ color: M.lin(0x7ff0ff, 1.4), transparent: true, opacity: 0.85, depthWrite: false });
    T.slotFill = new THREE.MeshBasicMaterial({ color: M.lin(0x7ff0ff, 0.6), transparent: true, opacity: 0.12, depthWrite: false });
    T.slotHot = new THREE.MeshBasicMaterial({ color: M.lin(0x7ff0ff, 0.9), transparent: true, opacity: 0.25, depthWrite: false });
    T.plusMat = new THREE.MeshBasicMaterial({ color: M.lin(0x7ff0ff, 1.4), transparent: true, opacity: 0.8, depthWrite: false });
    T.ghostGrp = new THREE.Group();
    grp.add(T.ghostGrp);
  }
  // slots: [{rx,ry}]，hover: 当前悬停的空位，cells: 预览的区域布局，bad: 是否不能放
  T.showSlots = function (slots, hover, cells, bad) {
    T.slotGrp.clear();
    T.ghostGrp.clear();
    if (!slots) return;
    const s = RS - 0.15;
    for (const sl of slots) {
      const cx = G.World.wx(sl.rx * RS) - 0.5 + RS / 2, cz = G.World.wz(sl.ry * RS) - 0.5 + RS / 2;
      const hot = hover && hover.rx === sl.rx && hover.ry === sl.ry;
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(s, s), hot ? T.slotHot : T.slotFill);
      sq.rotation.x = -Math.PI / 2; sq.position.set(cx, 0.04, cz);
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(cx + a * s / 2, 0.05, cz + b * s / 2));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), T.slotMat);
      // 中间的加号
      const plus = new THREE.Group();
      for (const r of [0, Math.PI / 2]) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.14), T.plusMat);
        bar.rotation.set(-Math.PI / 2, 0, r); plus.add(bar);
      }
      plus.position.set(cx, 0.06, cz);
      plus.visible = !hot;
      T.slotGrp.add(sq, line, plus);
    }
    if (hover && cells) {
      const geo = M.GEO.box;
      cells.forEach((c, i) => {
        const x = hover.rx * RS + (i % RS), y = hover.ry * RS + Math.floor(i / RS);
        const wx = G.World.wx(x), wz = G.World.wz(y);
        let col = bad ? 0xff7070 : 0x9dffb0, h = 0.05;
        if (c.type === 'water') col = bad ? 0xff7070 : 0x6fc8ff;
        else if (c.type === 'crystal') { col = 0xb8a0ff; h = 0.6; }
        else if (c.type === 'tree') { col = bad ? 0xff7070 : 0x3f9a50; h = 0.5; }
        if (c.h) h = c.h * STEP;
        if (h <= 0.05 && c.type === 'grass') return;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false }));
        m.scale.set(c.type === 'tree' ? 0.4 : 0.9, h, c.type === 'tree' ? 0.4 : 0.9);
        m.position.set(wx, h / 2, wz);
        T.ghostGrp.add(m);
      });
    }
  };

  T.update = function (dt, time) {
    // 地块升降动画：逐帧改变显示高度并重塑地面
    if (T.anims.length) {
      for (let i = T.anims.length - 1; i >= 0; i--) {
        const a = T.anims[i];
        a.k = Math.min(1, a.k + dt * 4.5);
        const e = 1 - Math.pow(1 - a.k, 3);
        const over = a.k < 1 ? Math.sin(a.k * Math.PI) * 0.15 * Math.sign(a.to - a.from) : 0;
        a.t.vh = a.from + (a.to - a.from) * e + over;
        if (a.k >= 1) { a.t.vh = a.to; T.anims.splice(i, 1); }
      }
      const ts = T.animTiles();
      T.paint(ts);
    }
    if (T.water) {
      T.water.material.emissiveIntensity = 0.6 + Math.sin(time * 1.3) * 0.12;
      const [a, b] = T.waterFx;
      a.material.map.offset.set(time * 0.035, time * 0.02);
      b.material.map.offset.set(-time * 0.025, time * 0.03);
      a.material.opacity = 0.3 + Math.sin(time * 2.1) * 0.14;
      b.material.opacity = 0.3 + Math.sin(time * 1.7 + 1.5) * 0.14;
      // 一闪而过的亮点
      if (!T.spots) T.waterSpots();
      for (const [x, z, r] of T.spots) {
        if (Math.random() < dt * 9 * r) {
          const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
          G.FX.emit(new THREE.Vector3(x + Math.cos(ang) * d, -0.14, z + Math.sin(ang) * d), 1, 0xffffff, 0.02, 0.3 + Math.random() * 0.3, 0, 0, 0.02, 2.6);
        }
      }
    }
    if (T.grid) T.grid.visible = !!(G.UI && G.UI.tool && G.UI.tool !== 'cast:q');
  };
})();
