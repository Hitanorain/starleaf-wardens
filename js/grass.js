'use strict';
// 风吹草地：成千上万株草叶（实例化渲染），风的摆动全在顶点着色器里算。
// 每株草属于一个地块的"地面层"或"高地顶面层"，高度与显隐从一张 W×H 的地块数据纹理读取，
// 所以地块升降、开拓、铺路时只要更新这张小纹理（560 个像素），不用逐株改矩阵。
(function () {
  const Gr = G.Grass = {};
  const { W, H, STEP } = G.CFG;
  const C = hex => new THREE.Color(hex).convertSRGBToLinear();

  // 每张地图的草：高度、每格株数（地面 / 顶面 / 地图外）、颜色
  const SETS = {
    forest: { h: [0.17, 0.34], ground: 20, top: 11, outer: 9, blades: 7,
      cols: [0x5f8c3a, 0x6d9a40, 0x7ba548, 0x557f36, 0x86aa4e, 0x93b25a], root: 0.38, tip: 1.12 },
    desert: { h: [0.1, 0.22], ground: 4, top: 2, outer: 3, blades: 6,
      cols: [0xb39a58, 0xa38c50, 0xc4ad6a, 0x96884e, 0x8f9a5a], root: 0.5, tip: 1.15 },
    snow: { h: [0.08, 0.16], ground: 3.5, top: 1.5, outer: 2, blades: 4,
      cols: [0x86a08e, 0x9ab4a6, 0x7a9686], root: 0.55, tip: 1.35 },
  };

  // 一簇草：几片向外微倾的尖叶，每片两节（4 个三角形）。顶点色：根部暗、叶尖亮
  function clumpGeo(n, rng) {
    const pos = [], col = [], idx = [];
    for (let b = 0; b < n; b++) {
      const a = rng() * Math.PI * 2, r = rng() * 0.28;   // 局部坐标（之后按草高整体缩放）
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      const face = rng() * Math.PI * 2, fx = Math.cos(face), fz = Math.sin(face);   // 叶面朝向
      const lean = 0.25 + rng() * 0.35, la = a + (rng() - 0.5) * 0.8;               // 向外倾倒
      const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
      const h = 0.7 + rng() * 0.3, w = 0.035 + rng() * 0.03;
      const base = pos.length / 3;
      // 根(2) → 中段(2) → 叶尖(1)；倾倒随高度平方增加，形成弧度
      const ring = [[0, w], [0.55, w * 0.7], [1, 0]];
      for (const [t, ww] of ring) {
        const y = t * h, bx = ox + lx * t * t * h, bz = oz + lz * t * t * h;
        const shade = t;   // 0 根部 → 1 叶尖
        if (ww > 0) {
          pos.push(bx - fz * ww, y, bz + fx * ww, bx + fz * ww, y, bz - fx * ww);
          col.push(shade, shade, shade, shade, shade, shade);
        } else { pos.push(bx, y, bz); col.push(shade, shade, shade); }
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(col.filter((_, i) => i % 3 === 0), 1));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    return g;
  }

  // 地块数据纹理：R 地面层高度 G 地面层可见 B 顶面层高度 A 顶面层（1 全显 / 0.5 有塔时只留边缘 / 0 隐藏）
  const tileData = new Float32Array(W * H * 4);
  const tileTex = new THREE.DataTexture(tileData, W, H, THREE.RGBAFormat, THREE.FloatType);
  tileTex.magFilter = tileTex.minFilter = THREE.NearestFilter;
  const uniforms = { uTime: { value: 0 }, uTiles: { value: tileTex }, uRoot: { value: 0.5 }, uTip: { value: 1.1 }, uCloud: { value: 0.3 } };

  // ---------- 云影：大块柔和的阴影缓缓飘过地面和草地（只压暗阳光直射的部分） ----------
  const CLOUD = `
    uniform float uTime, uCloud;
    float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float cNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float cloudShade(vec2 xz) {
      vec2 p = xz * 0.075 + vec2(uTime * 0.022, uTime * 0.012);
      float n = cNoise(p) * 0.65 + cNoise(p * 2.3 + 7.0) * 0.35;
      return 1.0 - uCloud * smoothstep(0.48, 0.72, n);
    }
  `;
  const CLOUD_AMT = { forest: 0.3, desert: 0.26, snow: 0.2 };
  // 给地面（Phong / Lambert）材质打补丁：片元里乘上云影
  Gr.cloudify = function (mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uCloud = uniforms.uCloud;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vCloudW;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vCloudW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vCloudW;
          ${CLOUD}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= cloudShade(vCloudW.xz);`)
        .split('reflectedLight.directDiffuse = vLightFront;').join('reflectedLight.directDiffuse = vLightFront * cloudShade(vCloudW.xz);');   // Lambert
    };
    mat.customProgramCacheKey = () => 'cloudy';
  };

  const MOVE = `
    vec3 grassMove(vec3 p) {
      vec3 ip = vec3(instanceMatrix[3]);
      float vis = 1.0;
      if (aTile.z < 1.5) {
        vec4 tv = texture2D(uTiles, (aTile.xy + 0.5) / vec2(${W}.0, ${H}.0));
        if (aTile.z < 0.5) { p.y += tv.r; vis = tv.g; }
        else { p.y += tv.b; vis = tv.a > 0.75 ? 1.0 : ((tv.a > 0.25 && aTile.w > 0.3) ? 1.0 : 0.0); }
      }
      if (vis < 0.5) return vec3(ip.x, -50.0, ip.z);       // 整簇缩成一点，不会被画出来
      float k = vShade * vShade;
      // 风：缓慢的大阵风在草地上推过去 + 叶子自己的小幅颤动
      float gust = 0.5 + 0.5 * sin(uTime * 0.55 - ip.x * 0.18 - ip.z * 0.11);
      float sway = sin(uTime * 1.9 - ip.x * 0.7 - ip.z * 0.45) * 0.55 + sin(uTime * 3.3 + ip.x * 1.7 + ip.z * 1.3) * 0.2;
      float amt = k * (0.035 + 0.075 * gust) * (1.0 + sway);
      p.x += amt * 0.85; p.z += amt * 0.5;
      p.y -= amt * amt * 2.0;                              // 被吹弯时略微压低
      return p;
    }
  `;

  function makeMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: false, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aTile; attribute float shade; varying float vShade; varying vec3 vCloudW;
          uniform float uTime; uniform sampler2D uTiles; uniform float uRoot, uTip;
          ${MOVE}`)
        // 法线大体朝上：草地整体受光均匀、柔和，不会一片亮一片黑
        .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + normal * 0.0);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vShade = shade;`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          mvPosition.xyz = grassMove(mvPosition.xyz);
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `
          vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0);
          worldPosition.xyz = grassMove(worldPosition.xyz);
          worldPosition = modelMatrix * worldPosition;
          vCloudW = worldPosition.xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vShade; varying vec3 vCloudW; uniform float uRoot, uTip;
          ${CLOUD}`)
        // 叶子两面受光一致（不区分正反面），阳光部分乘上云影
        .split('( gl_FrontFacing ) ? vLightFront : vLightBack').join('vLightFront * cloudShade(vCloudW.xz)')
        .split('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack').join('vIndirectFront')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(uRoot, uTip, vShade);`);
    };
    // 和其他 Lambert 材质区分开缓存（否则会共用一份没有打补丁的着色器）
    m.customProgramCacheKey = () => 'grass';
    return m;
  }
  const mat = makeMaterial();

  Gr.build = function (grp, rng, outerY) {
    const set = SETS[G.biome] || SETS.forest;
    uniforms.uRoot.value = set.root; uniforms.uTip.value = set.tip;
    uniforms.uCloud.value = CLOUD_AMT[G.biome] !== undefined ? CLOUD_AMT[G.biome] : 0.3;
    const items = [];   // [x, z, tx, ty, layer, r]
    const n = c => Math.floor(c) + (rng() < c % 1 ? 1 : 0);
    for (const t of G.World.tiles) {
      if (t.type === 'water' || t.type === 'crystal' || t.fixed) continue;
      for (let i = 0, k = n(set.ground); i < k; i++)
        items.push([t.wx + (rng() - 0.5) * 0.96, t.wz + (rng() - 0.5) * 0.96, t.x, t.y, 0, 1]);
      if (t.type === 'grass') for (let i = 0, k = n(set.top); i < k; i++) {
        // 顶面：避开最外圈（那里是圆角的坡）；r 是离中心的距离，有塔时只留外圈
        const ox = (rng() - 0.5) * 0.76, oz = (rng() - 0.5) * 0.76;
        items.push([t.wx + ox, t.wz + oz, t.x, t.y, 1, Math.max(Math.abs(ox), Math.abs(oz))]);
      }
    }
    // 地图外一圈，越远越稀
    const area = 30 * 26;
    for (let i = 0, k = n(set.outer * area); i < k; i++) {
      const x = (rng() - 0.5) * 60, z = -16 + (rng() - 0.5) * 52;
      const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - H / 2);
      if (d < 0.05 || rng() > 1.1 - d / 14) continue;
      items.push([x, z, 0, 0, 2, 1, outerY(x, z)]);
    }
    const geo = clumpGeo(set.blades, rng);
    const aTile = new Float32Array(items.length * 4);
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const hl = set.h[0], hr = set.h[1] - set.h[0];
    items.forEach((it, i) => {
      const h = hl + hr * rng(), wscale = 0.85 + rng() * 0.5;
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      m4.compose(v.set(it[0], it[4] === 2 ? it[6] : 0, it[1]), q, s.set(h * wscale, h, h * wscale));
      mesh.setMatrixAt(i, m4);
      const c = C(set.cols[Math.floor(rng() * set.cols.length)]).multiplyScalar(0.88 + rng() * 0.24);
      if (it[4] === 2) c.multiplyScalar(0.72);   // 地图外的草色调更沉，和外围地面一致
      mesh.setColorAt(i, c);
      aTile.set([it[2], it[3], it[4], it[5]], i * 4);
    });
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(aTile, 4));
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    grp.add(mesh);
    Gr.mesh = mesh;
    Gr.sync();
  };

  // 地块状态变了（升降、开拓、路线、建塔）就调用：只改一张 28×20 的纹理
  Gr.sync = function () {
    if (!G.World.tiles) return;
    for (const t of G.World.tiles) {
      const i = (t.y * W + t.x) * 4, grassy = t.type === 'grass' || t.type === 'tree';
      const flat = t.vh < 0.05;
      tileData[i] = t.locked ? -0.13 : 0;
      tileData[i + 1] = grassy && flat && !t.onPath ? 1 : 0;
      tileData[i + 2] = t.vh * STEP;
      tileData[i + 3] = t.type === 'grass' && t.vh > 0.05 ? (t.tower ? 0.5 : 1) : 0;
    }
    tileTex.needsUpdate = true;
  };

  Gr.update = function (time) { uniforms.uTime.value = time; };
})();
