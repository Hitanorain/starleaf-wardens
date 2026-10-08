'use strict';
// 低多边形模型工厂：全部由基础几何体拼出来
(function () {
  const M = G.M = {};
  const matCache = {};

  // 颜色都按 sRGB 书写，这里转成线性空间（最终由后处理统一做色调映射与伽马）
  M.lin = (hex, boost = 1) => new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(boost);
  M.mat = function (color, opts) {
    const base = { color: M.lin(color), flatShading: true, shininess: 10, specular: 0x0a0a0a };
    if (!opts) {
      const k = 'c' + color;
      if (!matCache[k]) matCache[k] = new THREE.MeshPhongMaterial(base);
      return matCache[k];
    }
    if (typeof opts.emissive === 'number') opts = Object.assign({}, opts, { emissive: M.lin(opts.emissive) });
    return new THREE.MeshPhongMaterial(Object.assign(base, opts));
  };
  // 发光材质：boost > 1 时亮度超过 1，会触发泛光
  M.glow = function (color, opacity = 1, additive = false, boost = 1.8) {
    return new THREE.MeshBasicMaterial({
      color: M.lin(color, boost), transparent: opacity < 1 || additive, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive, side: THREE.DoubleSide, fog: false,
    });
  };

  const GEO = M.GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
    taper4: new THREE.CylinderGeometry(0.65, 1, 1, 4),
    cone4: new THREE.ConeGeometry(1, 1, 4),
    cone5: new THREE.ConeGeometry(1, 1, 5),
    cone6: new THREE.ConeGeometry(1, 1, 6),
    cone8: new THREE.ConeGeometry(1, 1, 8),
    ico0: new THREE.IcosahedronGeometry(1, 0),
    ico1: new THREE.IcosahedronGeometry(1, 1),
    oct: new THREE.OctahedronGeometry(1, 0),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    dodec: new THREE.DodecahedronGeometry(1, 0),
  };
  // 翅膀：椭圆形花瓣，枢轴在一端
  const wingShape = new THREE.Shape();
  wingShape.absellipse(0, 0, 0.26, 0.11, 0, Math.PI * 2, false, 0);
  GEO.wing = new THREE.ShapeGeometry(wingShape, 10);
  GEO.wing.translate(0.24, 0, 0);
  const batWing = new THREE.Shape();
  batWing.moveTo(0, 0); batWing.lineTo(0.42, 0.12); batWing.lineTo(0.34, -0.02);
  batWing.lineTo(0.26, 0.06); batWing.lineTo(0.18, -0.06); batWing.lineTo(0, -0.04);
  GEO.batWing = new THREE.ShapeGeometry(batWing);

  // 通用拼件：part(父, 几何, 材质, [位置], [缩放], [旋转])
  function part(parent, geo, material, p = [0, 0, 0], s = [1, 1, 1], r) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(p[0], p[1], p[2]);
    if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  M.part = part;

  // ---------------- 环境 ----------------
  // 沙漠植物：仙人掌、仙人球、枯树、棕榈
  M.desertPlant = function (rng) {
    const g = new THREE.Group();
    const k = rng();
    const green = [0x5f9450, 0x6aa05a, 0x4f8848][Math.floor(rng() * 3)];
    if (k < 0.45) { // 柱状仙人掌
      const h = 0.55 + rng() * 0.35;
      part(g, GEO.cyl6, M.mat(green), [0, h / 2, 0], [0.08, h, 0.08]);
      part(g, GEO.sphere, M.mat(green), [0, h, 0], [0.08, 0.06, 0.08]);
      for (const s of [1, -1]) {
        if (rng() < 0.3) continue;
        const ay = h * (0.35 + rng() * 0.3), ah = 0.18 + rng() * 0.15;
        part(g, GEO.cyl6, M.mat(green), [s * 0.1, ay, 0], [0.05, 0.14, 0.05], [0, 0, s * Math.PI / 2]);
        part(g, GEO.cyl6, M.mat(green), [s * 0.17, ay + ah / 2, 0], [0.05, ah, 0.05]);
        part(g, GEO.sphere, M.mat(green), [s * 0.17, ay + ah, 0], 0.05);
      }
      if (rng() < 0.5) part(g, GEO.ico0, M.mat(0xff8fb0), [0, h + 0.05, 0], 0.04);
    } else if (k < 0.65) { // 仙人球丛
      for (let i = 0; i < 3; i++)
        part(g, GEO.ico0, M.mat(green), [(rng() - 0.5) * 0.3, 0.1, (rng() - 0.5) * 0.3], [0.14, 0.11 + rng() * 0.06, 0.04 + 0.08], [0, rng() * 3, 0]);
    } else if (k < 0.85) { // 枯树
      const wood = M.mat(0x8a6a50);
      part(g, GEO.cyl6, wood, [0, 0.28, 0], [0.05, 0.56, 0.05], [0, 0, 0.1]);
      for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        part(g, GEO.cyl6, wood, [Math.cos(a) * 0.1, 0.45 + i * 0.07, Math.sin(a) * 0.1], [0.025, 0.28, 0.025], [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8]);
      }
    } else { // 棕榈
      const trunk = M.mat(0x9a7450);
      for (let i = 0; i < 4; i++) part(g, GEO.cyl6, trunk, [i * 0.03, 0.1 + i * 0.18, 0], [0.06 - i * 0.008, 0.2, 0.06 - i * 0.008], [0, 0, -0.15]);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        part(g, GEO.cone4, M.mat(0x5f9a4a), [0.12 + Math.cos(a) * 0.2, 0.78, Math.sin(a) * 0.2], [0.05, 0.42, 0.11], [Math.sin(a) * 1.2, -a, -Math.cos(a) * 1.2]);
      }
    }
    g.scale.setScalar(0.9 + rng() * 0.4);
    g.rotation.y = rng() * Math.PI * 2;
    return g;
  };

  // 地脉水晶簇（区域扩张里的资源点）
  M.crystalNode = function () {
    const g = new THREE.Group();
    part(g, GEO.dodec, M.mat(0x6a6080), [0, 0.08, 0], [0.36, 0.14, 0.32]);
    const crystals = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const h = 0.35 + (i % 3) * 0.15;
      crystals.push(part(g, GEO.oct, M.glow(i % 2 ? 0x8ff0ff : 0xb8a0ff, 1, false, 1.6), [Math.cos(a) * 0.14, 0.15 + h / 2, Math.sin(a) * 0.14], [0.07, h / 2, 0.07], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
    }
    crystals.push(part(g, GEO.oct, M.glow(0xbff8ff, 1, false, 2), [0, 0.55, 0], [0.1, 0.3, 0.1]));
    g.userData.crystals = crystals;
    return g;
  };

  M.tree = function (rng) {
    if (G.biome === 'desert') return M.desertPlant(rng);
    const g = new THREE.Group();
    const k = rng();
    if (k < 0.5) { // 松树
      part(g, GEO.cyl6, M.mat(0x7a5236), [0, 0.18, 0], [0.07, 0.36, 0.07]);
      const greens = [0x2f7d4a, 0x3c9a57, 0x4fb466];
      for (let i = 0; i < 3; i++)
        part(g, GEO.cone6, M.mat(greens[i]), [0, 0.42 + i * 0.25, 0], [0.4 - i * 0.1, 0.45, 0.4 - i * 0.1], [0, rng() * 3, 0]);
    } else if (k < 0.85) { // 花树（粉/紫）
      const cols = [0xf4a6c8, 0xffc4dd, 0xc9a7f0, 0xffd9ec];
      part(g, GEO.cyl6, M.mat(0x8a6248), [0, 0.25, 0], [0.07, 0.5, 0.07]);
      for (let i = 0; i < 3; i++) {
        const c = cols[Math.floor(rng() * cols.length)];
        part(g, GEO.ico0, M.mat(c), [(rng() - 0.5) * 0.3, 0.6 + rng() * 0.25, (rng() - 0.5) * 0.3], 0.22 + rng() * 0.12, [rng(), rng(), rng()]);
      }
    } else { // 发光蘑菇
      const capCol = rng() < 0.5 ? 0x7fe8ff : 0xd59bff;
      for (let i = 0; i < 3; i++) {
        const x = (rng() - 0.5) * 0.4, z = (rng() - 0.5) * 0.4, h = 0.15 + rng() * 0.25;
        part(g, GEO.cyl6, M.mat(0xf2ead8), [x, h / 2, z], [0.035, h, 0.035]);
        part(g, GEO.sphere, M.glow(capCol), [x, h, z], [0.13, 0.07, 0.13]);
      }
    }
    const s = 0.85 + rng() * 0.35;
    g.scale.setScalar(s);
    g.rotation.y = rng() * Math.PI * 2;
    return g;
  };

  M.rock = function (rng) {
    const g = new THREE.Group();
    part(g, GEO.dodec, M.mat(0x8f88a3), [0, 0.12, 0], [0.22, 0.16, 0.2], [rng(), rng(), rng()]);
    part(g, GEO.dodec, M.mat(0x7d7792), [0.15, 0.08, 0.1], [0.12, 0.1, 0.12], [rng(), rng(), rng()]);
    return g;
  };

  M.grassTuft = function (rng) {
    const g = new THREE.Group();
    const c = [0x5fae55, 0x6dbd5d, 0x88cc66][Math.floor(rng() * 3)];
    for (let i = 0; i < 3; i++)
      part(g, GEO.cone4, M.mat(c), [(rng() - 0.5) * 0.12, 0.05, (rng() - 0.5) * 0.12], [0.03, 0.12 + rng() * 0.06, 0.03], [(rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5]).castShadow = false;
    if (rng() < 0.4) {
      const fc = [0xffffff, 0xffe27a, 0xff9ccf, 0xb9a3ff][Math.floor(rng() * 4)];
      part(g, GEO.ico0, M.mat(fc), [0, 0.13, 0], 0.035).castShadow = false;
    }
    return g;
  };

  // 月光古树（玩家要守护的核心）：弯曲的树干、长短不一的枝杈、偏向一侧的光团树冠
  M.heart = function () {
    const g = new THREE.Group();
    const bark = M.mat(0xe2dcef), bark2 = M.mat(0xc9c0dc);
    // 根系
    [[0.3, 0.2, 0.9], [-0.25, 0.28, 1.6], [0.05, -0.32, 2.6], [-0.18, -0.22, 3.8], [0.33, -0.12, 5.2]].forEach(([x, z, a]) => {
      part(g, GEO.cone5, bark2, [x * 0.7, 0.06, z * 0.7], [0.07, 0.42, 0.06], [Math.cos(a) * 1.25, a, Math.sin(a) * 1.25]);
    });
    // 弯曲的主干：一节节错开叠上去
    const segs = [[0, 0.18, 0, 0.17], [0.03, 0.45, 0.02, 0.14], [0.08, 0.7, 0.01, 0.12], [0.15, 0.93, -0.03, 0.1], [0.19, 1.13, -0.06, 0.085]];
    segs.forEach(([x, y, z, r], i) => part(g, GEO.cyl6, i % 2 ? bark : bark2, [x, y, z], [r, 0.32, r * 0.9], [0.1 * i, i, -0.12 - i * 0.04]));
    // 枝杈（长短、角度都不一样）
    [[0.2, 1.1, -0.05, 0.45, -1.0, 0.3], [0.08, 0.95, 0.04, 0.32, 0.9, -0.4], [0.16, 1.2, 0, 0.28, 0.2, 0.9], [0.05, 0.8, -0.02, 0.22, -0.4, -1.1]].forEach(([x, y, z, len, rz, rx]) => {
      part(g, GEO.cyl6, bark, [x + Math.sin(-rz) * len * 0.5, y + len * 0.4, z + Math.sin(rx) * len * 0.4], [0.035, len, 0.035], [rx, 0, rz]);
    });
    // 树冠：大小错落、偏向一侧的光团
    const cols = [0x7fd0e4, 0xb4a4ee, 0xd4e4f6, 0x68c0dc, 0xc6aef0];
    const leaves = [];
    [[0.25, 1.42, -0.05, 0.36], [-0.12, 1.3, 0.1, 0.28], [0.52, 1.25, 0.12, 0.24], [0.1, 1.62, -0.15, 0.26], [-0.25, 1.15, -0.18, 0.2],
     [0.45, 1.55, -0.2, 0.2], [0.02, 1.45, 0.3, 0.22], [0.62, 1.4, -0.08, 0.15], [-0.05, 1.08, 0.28, 0.16]].forEach(([x, y, z, r], i) => {
      const c = cols[i % cols.length];
      leaves.push(part(g, GEO.ico0, M.mat(c, { emissive: c, emissiveIntensity: 0.05 }), [x, y, z], [r, r * 0.85, r], [i, i * 2.1, i * 0.7]));
    });
    // 垂挂的小光果
    const fruits = [];
    [[0.55, 1.05, 0.15], [-0.2, 0.95, -0.15], [0.3, 1.12, 0.25], [0.7, 1.18, -0.1], [-0.08, 1.0, 0.32]].forEach(([x, y, z], i) => {
      part(g, GEO.cyl6, M.mat(0xe8e0f4), [x, y + 0.08, z], [0.005, 0.16, 0.005]).castShadow = false;
      fruits.push(part(g, GEO.sphere, M.glow(i % 2 ? 0x9ff4ff : 0xe6d6ff, 1, false, 1.25), [x, y, z], 0.035));
    });
    // 偏离中心悬浮的月晶 + 光环
    const crystal = part(g, GEO.oct, M.glow(0xbff6ff, 1, false, 1.35), [0.35, 2.0, -0.08], [0.1, 0.19, 0.1]);
    const halo = part(g, new THREE.TorusGeometry(0.22, 0.01, 4, 24), M.glow(0xbff6ff, 0.6, true, 1.0), [0.35, 2.0, -0.08], 1, [Math.PI / 2, 0, 0]);
    halo.castShadow = false;
    // 柔和的光晕（会呼吸）
    const glowSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.dotTex, color: M.lin(0xbfe8ff, 0.3), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowSp.position.set(0.2, 1.4, 0); glowSp.scale.setScalar(2.2);
    g.add(glowSp);
    const light = new THREE.PointLight(0x9ff4ff, 0.6, 4.5, 2);
    light.position.set(0.2, 1.5, 0);
    g.add(light);
    return { group: g, crystal, halo, leaves, fruits, glow: glowSp, light };
  };

  // 腐化传送门
  M.portal = function () {
    const g = new THREE.Group();
    const stone = M.mat(0x4a3f5c), stone2 = M.mat(0x5d5272);
    part(g, GEO.box, stone, [0, 0.45, -0.42], [0.2, 0.9, 0.2]);
    part(g, GEO.box, stone, [0, 0.45, 0.42], [0.2, 0.9, 0.2]);
    part(g, GEO.box, stone2, [0, 0.98, 0], [0.26, 0.18, 1.08]);
    part(g, GEO.cone4, stone2, [0, 1.17, -0.42], [0.12, 0.22, 0.12]);
    part(g, GEO.cone4, stone2, [0, 1.17, 0.42], [0.12, 0.22, 0.12]);
    const swirlMat = M.glow(0xb04dff, 0.75, true);
    const swirl = part(g, new THREE.CircleGeometry(0.38, 16), swirlMat, [0, 0.47, 0], [1, 1.15, 1], [0, Math.PI / 2, 0]);
    swirl.castShadow = false;
    const swirl2 = part(g, new THREE.RingGeometry(0.15, 0.36, 5), M.glow(0xff7be0, 0.6, true), [0.01, 0.47, 0], [1, 1.15, 1], [0, Math.PI / 2, 0]);
    swirl2.castShadow = false;
    const runeMat = M.glow(0xff7be0);
    const runes = [];
    for (let i = 0; i < 3; i++) {
      runes.push(part(g, GEO.box, runeMat, [0.11, 0.2 + i * 0.25, -0.42], [0.02, 0.07, 0.07]));
      runes.push(part(g, GEO.box, runeMat, [0.11, 0.2 + i * 0.25, 0.42], [0.02, 0.07, 0.07]));
    }
    return { group: g, swirl, swirl2, swirlMat, runeMat, runes };
  };

  M.cloud = function (rng) {
    const g = new THREE.Group();
    const m = M.mat(0xffffff, { emissive: 0xe8eeff, emissiveIntensity: 0.25 });
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++)
      part(g, GEO.ico0, m, [i * 0.7 - n * 0.35, rng() * 0.3, (rng() - 0.5) * 0.6], 0.45 + rng() * 0.4).castShadow = false;
    return g;
  };

  // ---------------- 塔 ----------------
  // 每一级都是不同的造型：1 级简陋、2 级成型、3 级华丽并带有悬浮 / 发光部件
  // 返回 { group, head(会转向目标), muzzle(发射点), spin[], bob[] 以及各塔专属的动画引用 }
  M.tower = function (type, level) {
    const g = new THREE.Group();
    const r = { group: g, head: null, muzzle: new THREE.Object3D(), type, level, spin: [], bob: [] };
    const gold = M.mat(0xf2c85b, { emissive: 0x6b4a00, emissiveIntensity: 0.4 });
    const spin = (o, sp, axis = 'y') => { r.spin.push([o, axis, sp]); return o; };
    const bob = (o, amp, f, ph = 0) => { r.bob.push([o, o.position.y, amp, f, ph]); return o; };
    // 精灵射手小人
    const archer = (parent, x, z, cloak) => {
      const a = new THREE.Group(); a.position.set(x, 0, z); parent.add(a);
      part(a, GEO.cone8, M.mat(cloak), [0, 0.17, 0], [0.11, 0.34, 0.11]);
      part(a, GEO.sphere, M.mat(0xffe0c8), [0, 0.39, 0], 0.075);
      part(a, GEO.sphere, M.mat(0xf3d27a), [0, 0.41, -0.02], [0.08, 0.075, 0.08]);
      part(a, GEO.cone4, M.mat(0xf3d27a), [0, 0.3, -0.07], [0.05, 0.2, 0.03], [0.3, 0, 0]);
      part(a, GEO.cone4, M.mat(0xffe0c8), [0.075, 0.41, 0], [0.015, 0.07, 0.015], [0, 0, -1.2]);
      part(a, GEO.cone4, M.mat(0xffe0c8), [-0.075, 0.41, 0], [0.015, 0.07, 0.015], [0, 0, 1.2]);
      const bow = part(a, new THREE.TorusGeometry(0.17, 0.014, 4, 10, Math.PI), M.mat(level >= 2 ? 0xf2c85b : 0x9b6a3c), [0, 0.28, 0.12], 1, [0, 0, Math.PI / 2]);
      bow.castShadow = false;
      return a;
    };

    if (type === 'archer') {
      const wood = M.mat(0x8a5a3a), wood2 = M.mat(0xa8744a);
      let top;
      if (level === 0) {            // 木制瞭望台
        top = 0.62;
        for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]])
          part(g, GEO.cyl6, wood, [x, top / 2, z], [0.04, top, 0.04], [x * 0.25, 0, -z * 0.25]);
        part(g, GEO.box, wood2, [0, 0.25, 0], [0.5, 0.04, 0.04], [0, 0.78, 0]);
        part(g, GEO.box, wood2, [0, 0.25, 0], [0.5, 0.04, 0.04], [0, -0.78, 0]);
        part(g, GEO.cyl8, wood, [0, top, 0], [0.36, 0.07, 0.36]);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(g, GEO.box, wood2, [Math.cos(a) * 0.33, top + 0.1, Math.sin(a) * 0.33], [0.04, 0.16, 0.04]); }
      } else if (level === 1) {     // 石塔 + 绿色篷顶
        top = 0.85;
        const stone = M.mat(0xe2d8c0), stone2 = M.mat(0xcabd9f);
        part(g, GEO.cyl8, stone2, [0, 0.1, 0], [0.4, 0.2, 0.4]);
        part(g, GEO.cyl8, stone, [0, top / 2, 0], [0.3, top, 0.3]);
        part(g, GEO.cyl8, stone2, [0, top * 0.55, 0], [0.32, 0.05, 0.32]);
        part(g, GEO.cyl8, wood, [0, top + 0.03, 0], [0.4, 0.07, 0.4]);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          part(g, GEO.box, stone, [Math.cos(a) * 0.34, top + 0.14, Math.sin(a) * 0.34], [0.1, 0.18, 0.1]);
          part(g, GEO.cyl6, wood, [Math.cos(a) * 0.3, top + 0.35, Math.sin(a) * 0.3], [0.02, 0.5, 0.02]);
        }
        part(g, GEO.cone8, M.mat(0x3fae6a), [0, top + 0.68, 0], [0.48, 0.3, 0.48]);
        for (const s of [1, -1]) {   // 两侧的绿光灯笼
          part(g, GEO.box, wood, [s * 0.34, top * 0.62, 0], [0.12, 0.03, 0.03]);
          bob(part(g, GEO.oct, M.glow(0x9dffb0), [s * 0.4, top * 0.55, 0], [0.04, 0.06, 0.04]), 0.02, 2, s);
        }
        part(g, GEO.box, M.mat(0x3fae6a), [0.3, top + 0.2, 0.36], [0.01, 0.2, 0.18]);
      } else {                      // 精灵尖塔：白石、金环、悬浮叶晶、双射手
        top = 1.05;
        const white = M.mat(0xf4efe4), white2 = M.mat(0xe0d8c8);
        part(g, GEO.cyl8, white2, [0, 0.08, 0], [0.44, 0.16, 0.44]);
        part(g, new THREE.CylinderGeometry(0.22, 0.32, 1, 8), white, [0, top / 2, 0], [1, top, 1]);
        for (const y of [0.25, 0.6, top - 0.04]) part(g, GEO.cyl8, gold, [0, y, 0], [0.33 - y * 0.08, 0.04, 0.33 - y * 0.08]);
        part(g, GEO.cyl8, white2, [0, top + 0.03, 0], [0.42, 0.07, 0.42]);
        // 弯刀形的叶片装饰
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          part(g, GEO.cone4, M.mat(0x2f9a6a), [Math.cos(a) * 0.3, top * 0.55, Math.sin(a) * 0.3], [0.05, 0.5, 0.12], [Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5]);
          part(g, GEO.box, M.glow(0x9dffb0), [Math.cos(a) * 0.235, top * 0.4, Math.sin(a) * 0.235], [0.03, 0.12, 0.03]);
        }
        // 金色尖顶伞盖（四根细柱）
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          part(g, GEO.cyl6, gold, [Math.cos(a) * 0.32, top + 0.3, Math.sin(a) * 0.32], [0.018, 0.55, 0.018]);
        }
        part(g, GEO.cone8, M.mat(0x2f8f6f), [0, top + 0.68, 0], [0.5, 0.36, 0.5]);
        part(g, GEO.cone8, gold, [0, top + 0.95, 0], [0.06, 0.2, 0.06]);
        r.gem = spin(bob(part(g, GEO.oct, M.glow(0x9dffb0, 1, false, 2.2), [0, top + 1.18, 0], [0.07, 0.12, 0.07]), 0.04, 2), 2);
        // 环绕的叶晶
        const orbit = new THREE.Group(); orbit.position.y = top * 0.7; g.add(orbit);
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          part(orbit, GEO.oct, M.glow(0x7dffb0, 1, false, 1.8), [Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48], [0.035, 0.08, 0.035], [0.4, 0, 0.4]).castShadow = false;
        }
        spin(orbit, 1.2);
      }
      const head = new THREE.Group(); head.position.y = top + 0.07; g.add(head);
      const cloak = level === 0 ? 0x5a8a3f : level === 1 ? 0x3f8f4f : 0x2f8f6f;
      if (level < 2) archer(head, 0, 0, cloak);
      else { archer(head, -0.11, 0, cloak); archer(head, 0.11, 0, cloak); }
      r.head = head;
      r.muzzle.position.set(0, 0.3, 0.15); head.add(r.muzzle);

    } else if (type === 'obelisk') {
      const dark = M.mat(0x3d3b5c), mid = M.mat(0x5b56a0), mid2 = M.mat(0x4a477a);
      let top;
      if (level === 0) {            // 小石柱 + 悬浮水晶
        part(g, GEO.box, dark, [0, 0.08, 0], [0.5, 0.16, 0.5]);
        part(g, GEO.taper4, mid, [0, 0.45, 0], [0.16, 0.6, 0.16], [0, Math.PI / 4, 0]);
        top = 1.0;
        r.crystal = spin(bob(part(g, GEO.oct, M.glow(0xc49bff), [0, top, 0], [0.13, 0.22, 0.13]), 0.05, 2), 1.5);
      } else if (level === 1) {     // 方尖碑：发光符文、阶梯底座、两颗环绕光球
        part(g, GEO.box, dark, [0, 0.1, 0], [0.72, 0.2, 0.72]);
        part(g, GEO.box, mid2, [0, 0.25, 0], [0.54, 0.12, 0.54]);
        part(g, GEO.taper4, mid, [0, 0.75, 0], [0.2, 0.9, 0.2], [0, Math.PI / 4, 0]);
        const rune = M.glow(0xc9a2ff);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          part(g, GEO.box, rune, [Math.cos(a) * 0.17, 0.75, Math.sin(a) * 0.17], [0.04, 0.3, 0.04]);
          part(g, GEO.oct, M.glow(0xb48cff), [Math.cos(a + Math.PI / 4) * 0.32, 0.36, Math.sin(a + Math.PI / 4) * 0.32], [0.04, 0.09, 0.04]);
        }
        top = 1.45;
        r.crystal = spin(bob(part(g, GEO.oct, M.glow(0xd0b0ff), [0, top, 0], [0.18, 0.3, 0.18]), 0.05, 2), 1.5);
        const orbit = new THREE.Group(); orbit.position.y = top; g.add(orbit);
        for (let i = 0; i < 2; i++) part(orbit, GEO.oct, M.glow(0xe6d6ff), [Math.cos(i * Math.PI) * 0.32, 0, Math.sin(i * Math.PI) * 0.32], 0.06).castShadow = false;
        spin(orbit, 2.2);
      } else {                      // 星界方尖碑：分段悬浮、双环、水晶王冠、地面法阵
        part(g, GEO.box, dark, [0, 0.1, 0], [0.76, 0.2, 0.76]);
        part(g, GEO.box, gold, [0, 0.22, 0], [0.6, 0.04, 0.6]);
        const circle = part(g, new THREE.RingGeometry(0.3, 0.37, 6), M.glow(0x9ff4ff, 0.8, true, 1.6), [0, 0.25, 0], 1, [-Math.PI / 2, 0, 0]);
        circle.castShadow = false; spin(circle, 0.8, 'z');
        // 三段悬浮的碑身
        [[0.45, 0.32, 0.2], [0.85, 0.3, 0.17], [1.2, 0.26, 0.14]].forEach(([y, hgt, w], i) => {
          const seg = part(g, GEO.taper4, M.mat(0x6a64c0, { emissive: 0x2a1a6a, emissiveIntensity: 0.4 }), [0, y, 0], [w, hgt, w], [0, Math.PI / 4, 0]);
          bob(seg, 0.025, 1.6, i * 0.8);
          part(seg, GEO.box, M.glow(0x9ff4ff, 1, false, 2), [0, 0, 0.62], [0.25, 0.6, 0.12]).castShadow = false;
        });
        top = 1.62;
        r.crystal = spin(bob(part(g, GEO.oct, M.glow(0xdffcff, 1, false, 2.4), [0, top, 0], [0.2, 0.34, 0.2]), 0.06, 2), 1.8);
        for (let i = 0; i < 5; i++) {   // 水晶王冠
          const a = i / 5 * Math.PI * 2;
          const sp = part(g, GEO.oct, M.glow(0x9ff4ff, 1, false, 1.8), [Math.cos(a) * 0.2, top - 0.22, Math.sin(a) * 0.2], [0.04, 0.12, 0.04], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
          sp.castShadow = false;
        }
        const ring1 = part(g, new THREE.TorusGeometry(0.34, 0.016, 4, 32), M.glow(0x9ff4ff, 0.9, true, 1.8), [0, top, 0], 1, [Math.PI / 2, 0, 0]);
        const ring2 = part(g, new THREE.TorusGeometry(0.42, 0.012, 4, 32), M.glow(0xd0b0ff, 0.8, true, 1.6), [0, top, 0], 1, [Math.PI / 2 + 0.6, 0, 0]);
        ring1.castShadow = ring2.castShadow = false;
        spin(ring1, 1.4, 'x'); spin(ring2, -1.1, 'y');
        const orbit = new THREE.Group(); orbit.position.y = top - 0.1; g.add(orbit);
        for (let i = 0; i < 3; i++) part(orbit, GEO.oct, M.glow(0xffffff, 1, false, 2), [Math.cos(i * 2.09) * 0.55, 0, Math.sin(i * 2.09) * 0.55], 0.05).castShadow = false;
        spin(orbit, 2.6);
      }
      r.muzzle.position.set(0, top, 0); g.add(r.muzzle);

    } else if (type === 'thorn') {
      const vineC = level === 0 ? 0x4f8a3f : level === 1 ? 0x3f8f3f : 0x2f9a4a;
      const vine = M.mat(vineC);
      if (level < 2) {
        part(g, GEO.ico0, M.mat(0x2e6b3a), [0, 0.06, 0], [0.42, 0.2, 0.42]);
        const n = level === 0 ? 5 : 9;
        const vines = new THREE.Group(); g.add(vines);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          const h = (level === 0 ? 0.28 : 0.42) + (i % 3) * 0.1;
          part(vines, GEO.cone5, vine, [Math.cos(a) * 0.22, h / 2 + 0.05, Math.sin(a) * 0.22], [0.05, h, 0.05], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
        }
        r.vines = vines;
        const fh = level === 0 ? 0.42 : 0.6;
        part(g, GEO.cyl6, vine, [0, fh / 2, 0], [0.04, fh, 0.04]);
        const flower = new THREE.Group(); flower.position.y = fh; g.add(flower);
        if (level === 0) {      // 花苞
          part(flower, GEO.cone5, M.mat(0xff9ccf), [0, 0.05, 0], [0.06, 0.12, 0.06]);
        } else {                // 盛开的花 + 叶片
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            part(flower, GEO.sphere, M.mat(0xff9ccf), [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [0.09, 0.03, 0.06], [0, -a, 0.3]);
          }
          part(flower, GEO.sphere, M.glow(0xfff27a), [0, 0.02, 0], 0.05);
          for (const s of [1, -1]) part(g, GEO.sphere, M.mat(0x4faa4a), [s * 0.12, fh * 0.5, 0], [0.1, 0.02, 0.05], [0, 0, s * 0.5]);
        }
        r.flower = spin(flower, 0.8);
        r.muzzle.position.set(0, fh, 0);
      } else {                  // 古老荆棘树：扭曲树干 + 发光花冠 + 飘落花瓣
        part(g, GEO.ico0, M.mat(0x2e5a34), [0, 0.07, 0], [0.46, 0.22, 0.46]);
        const bark = M.mat(0x5a4a3a);
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          part(g, GEO.cyl6, bark, [Math.cos(a) * 0.06, 0.4, Math.sin(a) * 0.06], [0.05, 0.75, 0.05], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]);
        }
        const vines = new THREE.Group(); g.add(vines);
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          const h = 0.45 + (i % 3) * 0.14;
          part(vines, GEO.cone5, vine, [Math.cos(a) * 0.26, h / 2 + 0.05, Math.sin(a) * 0.26], [0.055, h, 0.055], [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]);
        }
        r.vines = vines;
        const crown = new THREE.Group(); crown.position.y = 0.85; g.add(crown);
        const petal = M.mat(0xff7fbf, { emissive: 0xff4fa0, emissiveIntensity: 0.6 });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          part(crown, GEO.sphere, petal, [Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16], [0.13, 0.035, 0.07], [0, -a, 0.35]);
        }
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2 + 0.3;
          part(crown, GEO.sphere, M.mat(0xffc0e0, { emissive: 0xff8fc8, emissiveIntensity: 0.5 }), [Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08], [0.08, 0.03, 0.05], [0, -a, 0.6]);
        }
        part(crown, GEO.sphere, M.glow(0xfff27a, 1, false, 2.2), [0, 0.07, 0], 0.06);
        r.flower = spin(crown, 0.6);
        const petals = new THREE.Group(); petals.position.y = 0.6; g.add(petals);
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2;
          bob(part(petals, GEO.sphere, M.glow(0xffb3d6, 1, false, 1.6), [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], [0.04, 0.012, 0.025]), 0.12, 1.3, i);
        }
        spin(petals, 0.9);
        r.muzzle.position.set(0, 0.85, 0);
      }
      g.add(r.muzzle);

    } else if (type === 'catapult') {
      const wood = M.mat(0x7b5034), wood2 = M.mat(0x9a6a44);
      const metal = M.mat(level >= 2 ? 0xf2c85b : 0x8d8d99);
      const head = new THREE.Group(); head.position.y = 0.14; g.add(head);
      part(g, GEO.box, wood, [0, 0.07, 0], [0.8, 0.14, 0.8]);
      const armLen = level === 2 ? 0.75 : 0.6;
      const pivotY = level === 2 ? 0.62 : 0.42;
      if (level === 0) {        // 简易木投石机
        for (const sx of [-0.2, 0.2]) part(head, GEO.box, wood2, [sx, 0.21, 0], [0.07, 0.42, 0.07]);
      } else {                  // 加固：金属包边、轮子、旁边一堆晶石
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
          part(g, GEO.cyl8, metal, [sx * 0.42, 0.12, sz * 0.25], [0.12, 0.05, 0.12], [0, 0, Math.PI / 2]);
        for (const sx of [-0.22, 0.22]) {
          part(head, GEO.box, wood2, [sx, pivotY / 2, 0], [0.08, pivotY, 0.08]);
          part(head, GEO.box, metal, [sx, pivotY * 0.5, 0], [0.09, 0.04, 0.09]);
          part(head, GEO.box, wood2, [sx, 0.15, 0.16], [0.06, 0.06, 0.38], [-0.6, 0, 0]);
        }
        for (let i = 0; i < 3; i++) part(g, GEO.ico0, M.glow(0x7fe0ff, 1, false, 1.3), [0.3 + (i % 2) * 0.07, 0.18 + (i === 2 ? 0.05 : 0), 0.3 - i * 0.05], 0.05).castShadow = false;
      }
      if (level === 2) {        // 奥术投石车：高架、配重晶核、浮空符文环
        for (const sx of [-0.28, 0.28]) part(head, GEO.box, metal, [sx, pivotY + 0.02, 0], [0.04, 0.04, 0.3]);
        const runeRing = part(g, new THREE.TorusGeometry(0.46, 0.012, 4, 36), M.glow(0x7fe0ff, 0.8, true, 1.6), [0, 0.32, 0], 1, [Math.PI / 2, 0, 0]);
        runeRing.castShadow = false;
        spin(bob(runeRing, 0.04, 1.5), 0.7, 'z');
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          part(g, GEO.cone4, metal, [Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4], [0.04, 0.14, 0.04]);
        }
      }
      part(head, GEO.cyl6, metal, [0, pivotY, 0], [0.04, 0.5, 0.04], [0, 0, Math.PI / 2]);
      const arm = new THREE.Group(); arm.position.set(0, pivotY, 0); head.add(arm);
      part(arm, GEO.box, wood, [0, 0, -armLen * 0.42], [0.06, 0.06, armLen]);
      part(arm, GEO.cyl8, wood2, [0, 0.04, -armLen * 0.9], [0.1, 0.06, 0.1]);
      if (level >= 1) part(arm, GEO.box, metal, [0, 0, -armLen * 0.2], [0.075, 0.075, 0.05]);
      if (level === 2) {        // 配重：发光晶核
        const core = part(arm, GEO.oct, M.glow(0xbff8ff, 1, false, 2.2), [0, -0.05, armLen * 0.2], [0.11, 0.14, 0.11]);
        part(arm, GEO.box, metal, [0, 0, armLen * 0.12], [0.05, 0.05, 0.12]);
        spin(core, 3);
      }
      const crystal = part(arm, GEO.ico0, M.glow(level >= 2 ? 0xdffcff : 0x7fe0ff, 1, false, 1.8), [0, 0.12, -armLen * 0.9], 0.07 + level * 0.025);
      arm.rotation.x = 0.5;
      r.arm = arm; r.crystal = crystal; r.head = head;
      r.muzzle.position.set(0, pivotY + 0.2, -0.4); head.add(r.muzzle);
    }
    // 等级标记：金色小宝石
    for (let i = 0; i <= level; i++) {
      const pip = part(g, GEO.oct, M.glow(0xffe27a), [-0.36 + i * 0.12, 0.05, 0.4], 0.04);
      pip.castShadow = false;
    }
    return r;
  };

  // ---------------- 敌人 ----------------
  // 每个敌人使用自己的材质，方便受击闪白
  M.enemy = function (type) {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    const mats = [];
    const mm = (c, o) => { const m = M.mat(c, Object.assign({ emissive: 0x000000 }, o || {})); mats.push(m); return m; };
    const eye = M.glow(0xff3d7f);
    const r = { group: g, body, mats, legs: [], wings: [] };
    if (type === 'goblin') {
      const skin = mm(0x7cb342);
      part(body, GEO.box, mm(0x6a4a7a), [0, 0.2, 0], [0.26, 0.24, 0.2]);
      part(body, GEO.ico0, skin, [0, 0.42, 0.02], 0.15);
      part(body, GEO.cone4, skin, [0.16, 0.45, 0], [0.04, 0.16, 0.04], [0, 0, -1.3]);
      part(body, GEO.cone4, skin, [-0.16, 0.45, 0], [0.04, 0.16, 0.04], [0, 0, 1.3]);
      part(body, GEO.box, eye, [0.05, 0.44, 0.14], 0.035);
      part(body, GEO.box, eye, [-0.05, 0.44, 0.14], 0.035);
      part(body, GEO.cyl6, mm(0x6b4a2c), [0.17, 0.24, 0.08], [0.035, 0.32, 0.035], [0.5, 0, 0]);
      r.legs.push(part(body, GEO.box, skin, [0.07, 0.05, 0], [0.07, 0.12, 0.07]));
      r.legs.push(part(body, GEO.box, skin, [-0.07, 0.05, 0], [0.07, 0.12, 0.07]));
    } else if (type === 'wolf') {
      const fur = mm(0x4b3a63), fur2 = mm(0x63507e);
      part(body, GEO.box, fur, [0, 0.22, 0], [0.24, 0.2, 0.5]);
      part(body, GEO.box, fur2, [0, 0.3, 0.3], [0.2, 0.18, 0.2]);
      part(body, GEO.box, fur2, [0, 0.27, 0.43], [0.12, 0.1, 0.12]);
      part(body, GEO.cone4, fur, [0.06, 0.43, 0.27], [0.04, 0.1, 0.04]);
      part(body, GEO.cone4, fur, [-0.06, 0.43, 0.27], [0.04, 0.1, 0.04]);
      part(body, GEO.box, eye, [0.06, 0.33, 0.4], 0.03);
      part(body, GEO.box, eye, [-0.06, 0.33, 0.4], 0.03);
      part(body, GEO.cone4, fur2, [0, 0.3, -0.32], [0.05, 0.25, 0.05], [-1.9, 0, 0]);
      for (const [x, z] of [[0.08, 0.17], [-0.08, 0.17], [0.08, -0.17], [-0.08, -0.17]])
        r.legs.push(part(body, GEO.box, fur, [x, 0.07, z], [0.06, 0.14, 0.06]));
    } else if (type === 'orc' || type === 'ogre') {
      const ogre = type === 'ogre';
      const skin = mm(ogre ? 0x8a6fa0 : 0x5f7f3a), plate = mm(ogre ? 0x4a3d5e : 0x6b6b78);
      part(body, GEO.box, skin, [0, 0.36, 0], [0.42, 0.42, 0.3]);
      part(body, GEO.box, plate, [0, 0.42, 0.02], [0.46, 0.22, 0.34]);
      part(body, GEO.box, skin, [0, 0.66, 0.04], [0.22, 0.2, 0.2]);
      part(body, GEO.cone4, mm(0xf5f0de), [0.06, 0.62, 0.15], [0.025, 0.08, 0.025]);
      part(body, GEO.cone4, mm(0xf5f0de), [-0.06, 0.62, 0.15], [0.025, 0.08, 0.025]);
      part(body, GEO.box, eye, [0.05, 0.7, 0.14], 0.035);
      part(body, GEO.box, eye, [-0.05, 0.7, 0.14], 0.035);
      part(body, GEO.box, skin, [0.27, 0.36, 0], [0.12, 0.34, 0.12]);
      part(body, GEO.box, skin, [-0.27, 0.36, 0], [0.12, 0.34, 0.12]);
      part(body, GEO.cyl6, mm(0x6b4a2c), [0.3, 0.3, 0.15], [0.03, 0.5, 0.03], [1.2, 0, 0]);
      part(body, GEO.box, mm(0xaab0bf), [0.3, 0.3, 0.38], [0.04, 0.2, 0.14], [1.2, 0, 0]);
      if (ogre) {
        part(body, GEO.cone4, mm(0xe8dcc0), [0.1, 0.82, 0.04], [0.04, 0.14, 0.04], [0, 0, -0.4]);
        part(body, GEO.cone4, mm(0xe8dcc0), [-0.1, 0.82, 0.04], [0.04, 0.14, 0.04], [0, 0, 0.4]);
        part(body, GEO.oct, M.glow(0xff4fd8), [0, 0.5, -0.18], 0.08);
      }
      r.legs.push(part(body, GEO.box, plate, [0.1, 0.08, 0], [0.13, 0.16, 0.13]));
      r.legs.push(part(body, GEO.box, plate, [-0.1, 0.08, 0], [0.13, 0.16, 0.13]));
    } else if (type === 'skeleton') {
      const bone = mm(0xe8e2d0);
      part(body, GEO.box, bone, [0, 0.32, 0], [0.2, 0.26, 0.14]);
      part(body, GEO.sphere, bone, [0, 0.55, 0], [0.12, 0.13, 0.12]);
      part(body, GEO.box, M.glow(0x7fd4ff), [0.04, 0.56, 0.1], 0.03);
      part(body, GEO.box, M.glow(0x7fd4ff), [-0.04, 0.56, 0.1], 0.03);
      part(body, GEO.cyl6, bone, [0, 0.14, 0], [0.04, 0.16, 0.04]);
      r.legs.push(part(body, GEO.box, bone, [0.06, 0.06, 0], [0.04, 0.14, 0.04]));
      r.legs.push(part(body, GEO.box, bone, [-0.06, 0.06, 0], [0.04, 0.14, 0.04]));
      part(body, GEO.cyl12, mm(0x5a6fb8), [-0.05, 0.32, 0.16], [0.2, 0.04, 0.2], [Math.PI / 2, 0, 0]);
      part(body, GEO.cyl12, mm(0xc9cde0), [-0.05, 0.32, 0.18], [0.07, 0.02, 0.07], [Math.PI / 2, 0, 0]);
      const bubble = new THREE.Mesh(GEO.ico1, M.glow(0x7fd4ff, 0.22, true));
      bubble.position.y = 0.33; bubble.scale.setScalar(0.38); body.add(bubble);
      r.shieldMesh = bubble;
    } else if (type === 'bat') {
      const fur = mm(0x3a2a4d);
      part(body, GEO.ico0, fur, [0, 0, 0], [0.13, 0.12, 0.16]);
      part(body, GEO.cone4, fur, [0.06, 0.12, 0.05], [0.03, 0.08, 0.03]);
      part(body, GEO.cone4, fur, [-0.06, 0.12, 0.05], [0.03, 0.08, 0.03]);
      part(body, GEO.box, eye, [0.04, 0.03, 0.13], 0.03);
      part(body, GEO.box, eye, [-0.04, 0.03, 0.13], 0.03);
      const wm = mm(0x5a3f73, { side: THREE.DoubleSide });
      for (const s of [1, -1]) {
        const w = new THREE.Group(); body.add(w);
        const m = part(w, GEO.batWing, wm, [0, 0, 0], [s, 1, 1], [-Math.PI / 2, 0, 0]);
        m.castShadow = true;
        r.wings.push({ g: w, s });
      }
    } else if (type === 'troll') {
      const skin = mm(0x6a4f86), moss = mm(0x4f7a4a), dark = mm(0x3a2b4d);
      part(body, GEO.ico0, skin, [0, 0.42, 0], [0.32, 0.34, 0.26]);
      part(body, GEO.ico0, moss, [0, 0.55, -0.1], [0.28, 0.2, 0.2]);
      part(body, GEO.ico0, skin, [0, 0.74, 0.12], [0.16, 0.14, 0.15]);
      part(body, GEO.box, eye, [0.06, 0.77, 0.25], 0.035);
      part(body, GEO.box, eye, [-0.06, 0.77, 0.25], 0.035);
      part(body, GEO.cone4, mm(0xf5f0de), [0.07, 0.68, 0.25], [0.025, 0.07, 0.025]);
      part(body, GEO.cone4, mm(0xf5f0de), [-0.07, 0.68, 0.25], [0.025, 0.07, 0.025]);
      // 王冠
      const crown = mm(0xf2c85b, { emissive: 0x6b4a00, emissiveIntensity: 0.5 });
      part(body, GEO.cyl8, crown, [0, 0.88, 0.1], [0.12, 0.05, 0.12]);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        part(body, GEO.cone4, crown, [Math.cos(a) * 0.1, 0.93, 0.1 + Math.sin(a) * 0.1], [0.025, 0.08, 0.025]);
      }
      // 背上的腐化水晶
      for (let i = 0; i < 4; i++)
        part(body, GEO.oct, M.glow(0xff4fd8), [(i - 1.5) * 0.12, 0.65 + (i % 2) * 0.06, -0.22], [0.05, 0.13, 0.05], [-0.5, 0, (i - 1.5) * 0.3]);
      part(body, GEO.box, skin, [0.34, 0.38, 0.05], [0.14, 0.42, 0.14], [0.2, 0, 0.2]);
      part(body, GEO.box, skin, [-0.34, 0.38, 0.05], [0.14, 0.42, 0.14], [0.2, 0, -0.2]);
      part(body, GEO.cyl6, dark, [0.38, 0.25, 0.25], [0.06, 0.7, 0.06], [1.1, 0, 0]);
      r.legs.push(part(body, GEO.box, dark, [0.13, 0.08, 0], [0.15, 0.18, 0.15]));
      r.legs.push(part(body, GEO.box, dark, [-0.13, 0.08, 0], [0.15, 0.18, 0.15]));
    }
    // 脚下腐化阴影光圈
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), M.glow(0x7a2bbf, 0.35, true));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    if (type !== 'bat') g.add(ring);
    return r;
  };

  // ---------------- 英雄：月之仙子 露娜 ----------------
  M.fairy = function () {
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    const dress = M.mat(0xf7f2ff), dress2 = M.mat(0xc9b4ff), skin = M.mat(0xffe6d6);
    const hair = M.mat(0xf6e7b0);
    part(body, GEO.cone8, dress2, [0, 0.16, 0], [0.2, 0.32, 0.2]);
    part(body, GEO.cone8, dress, [0, 0.22, 0], [0.16, 0.3, 0.16]);
    part(body, GEO.cyl8, dress, [0, 0.4, 0], [0.065, 0.14, 0.055]);
    part(body, GEO.sphere, skin, [0, 0.55, 0], 0.085);
    part(body, GEO.sphere, hair, [0, 0.575, -0.015], [0.095, 0.085, 0.095]);
    part(body, GEO.cone6, hair, [0, 0.38, -0.06], [0.08, 0.36, 0.04], [0.15, 0, 0]);
    part(body, GEO.cone4, skin, [0.085, 0.57, 0], [0.012, 0.07, 0.012], [0, 0, -1.1]);
    part(body, GEO.cone4, skin, [-0.085, 0.57, 0], [0.012, 0.07, 0.012], [0, 0, 1.1]);
    part(body, GEO.box, M.mat(0x4a5aa8), [0.03, 0.56, 0.08], [0.018, 0.018, 0.01]);
    part(body, GEO.box, M.mat(0x4a5aa8), [-0.03, 0.56, 0.08], [0.018, 0.018, 0.01]);
    const crown = part(body, new THREE.TorusGeometry(0.06, 0.01, 4, 12), M.mat(0xffd86b, { emissive: 0x8a6a00, emissiveIntensity: 0.6 }), [0, 0.64, 0], 1, [Math.PI / 2 - 0.2, 0, 0]);
    crown.castShadow = false;
    part(body, GEO.oct, M.glow(0x9ff4ff), [0, 0.655, 0.05], 0.018);
    // 手臂与法杖
    part(body, GEO.cyl6, skin, [0.08, 0.42, 0.04], [0.018, 0.14, 0.018], [0.6, 0, -0.4]);
    const wand = new THREE.Group(); wand.position.set(0.12, 0.38, 0.1); body.add(wand);
    part(wand, GEO.cyl6, M.mat(0xe8d7ff), [0, 0.1, 0], [0.01, 0.24, 0.01]);
    const star = part(wand, GEO.oct, M.glow(0xfff4a8), [0, 0.24, 0], 0.04);
    // 翅膀
    const wingMat = M.glow(0xbff3ff, 0.55, true);
    const wingMat2 = M.glow(0xffc8f0, 0.45, true);
    const wings = [];
    for (const s of [1, -1]) {
      for (const [lift, sc, m] of [[0.12, 1, wingMat], [-0.06, 0.7, wingMat2]]) {
        const w = new THREE.Group(); w.position.set(0, 0.42, -0.06); body.add(w);
        const wm = new THREE.Mesh(GEO.wing, m);
        wm.scale.set(s * sc, sc, sc);
        wm.rotation.z = lift * s * 3;
        w.add(wm);
        wings.push({ g: w, s });
      }
    }
    const light = new THREE.PointLight(0xcfe9ff, 0.9, 3.2, 2);
    light.position.set(0, 0.5, 0); g.add(light);
    // 选中光环
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 24), M.glow(0xfff4a8, 0.7, true));
    sel.rotation.x = -Math.PI / 2;
    return { group: g, body, wings, star, sel };
  };

  // 弹道
  M.arrow = function (plain) {
    const g = new THREE.Group();
    part(g, GEO.box, M.mat(0xe8d6a8), [0, 0, 0], [0.025, 0.025, 0.36]).castShadow = false;
    part(g, GEO.cone4, plain ? M.mat(0xb0b8c0) : M.glow(0xd8fff0), [0, 0, 0.2], [0.03, 0.08, 0.03], [Math.PI / 2, 0, 0]).castShadow = false;
    part(g, GEO.box, M.mat(0xf4f0e8), [0, 0, -0.17], [0.06, 0.005, 0.06]).castShadow = false;
    if (!plain) part(g, GEO.box, M.glow(0xc8ffd8, 0.6, true, 1.6), [0, 0, -0.05], [0.05, 0.05, 0.5]).castShadow = false;
    return g;
  };
  // 陨石：随机扭曲的岩块，裂缝透出金光，外面裹一层火光和光晕
  M.meteor = function (size, seed) {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // 按位置取噪声，保证共享的顶点位移相同（不会裂开）
      const n = Math.sin(x * 4.1 + seed) * Math.cos(y * 3.7 - seed * 0.7) + Math.sin(z * 5.3 + seed * 1.3) * 0.6;
      const k = 1 + n * 0.18;
      pos.setXYZ(i, x * k * 1.15, y * k * 0.9, z * k);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, M.mat(0x4a3a48, { emissive: 0xff6a1a, emissiveIntensity: 0.12 }));
    rock.scale.setScalar(size);
    g.add(rock);
    const shell = new THREE.Mesh(geo, M.glow(0xff7a30, 0.16, true, 1.4));
    shell.scale.setScalar(size * 1.18);
    g.add(shell);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.dotTex, color: M.lin(0xff9a40, 1.1), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.scale.setScalar(size * 3.2);
    g.add(sp);
    g.userData = { rock, shell };
    return g;
  };

  // 曳光弹：白热的弹芯 + 有色的拉长光体 + 柔光晕（沿 +z 方向飞行，用 lookAt 对准目标）
  const capsule = new THREE.SphereGeometry(1, 10, 6);
  M.tracer = function (color, len, width, halo) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(capsule, M.glow(0xffffff, 0.9, true, 2.2));
    core.scale.set(width * 0.45, width * 0.45, len * 0.5);
    const body = new THREE.Mesh(capsule, M.glow(color, 0.8, true, 1.5));
    body.scale.set(width, width, len * 0.62);
    g.add(core, body);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.dotTex, color: M.lin(color, 1.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.scale.setScalar(halo);
    g.add(sp);
    g.userData.halo = sp;
    return g;
  };
  M.orb = function (color, size) {
    const g = new THREE.Group();
    part(g, GEO.ico1, M.glow(color), [0, 0, 0], size).castShadow = false;
    part(g, GEO.ico1, M.glow(color, 0.35, true), [0, 0, 0], size * 2).castShadow = false;
    return g;
  };
})();
