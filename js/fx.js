'use strict';
// 特效：粒子、光环、闪电、飘字、血条
(function () {
  const FX = G.FX = { list: [] };

  // 圆点贴图（canvas 生成）
  (function () {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    G.dotTex = new THREE.CanvasTexture(c);
  })();

  // ---------- 粒子系统 ----------
  const N = 2500;
  let pts, pos, col, vel, life, maxLife, base, grav, head = 0;
  FX.init = function (scene) {
    const geo = new THREE.BufferGeometry();
    pos = new Float32Array(N * 3); col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: G.dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    vel = new Float32Array(N * 3); life = new Float32Array(N); maxLife = new Float32Array(N); base = new Float32Array(N * 3); grav = new Float32Array(N);
    FX.scene = scene;
    FX.dom = document.getElementById('overlay');
  };
  const tc = new THREE.Color();
  FX.emit = function (p, count, color, speed = 2, lifeT = 0.6, up = 1, g = 4, spread = 0.1, boost = 2.2) {
    tc.set(color).convertSRGBToLinear().multiplyScalar(boost);
    for (let k = 0; k < count; k++) {
      const i = head; head = (head + 1) % N;
      pos[i * 3] = p.x + (Math.random() - 0.5) * spread; pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread; pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = up * (0.5 + Math.random()) * speed * 0.8; vel[i * 3 + 2] = Math.sin(a) * s;
      life[i] = maxLife[i] = lifeT * (0.6 + Math.random() * 0.6);
      base[i * 3] = tc.r; base[i * 3 + 1] = tc.g; base[i * 3 + 2] = tc.b;
      grav[i] = g;
    }
  };
  FX.updateParticles = function (dt) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -50; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = life[i] / maxLife[i];
      col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.geometry.attributes.color.needsUpdate = true;
  };

  // ---------- 一次性特效 ----------
  FX.add = function (fn) { FX.list.push(fn); };
  FX.update = function (dt) {
    for (let i = FX.list.length - 1; i >= 0; i--) if (!FX.list[i](dt)) FX.list.splice(i, 1);
    FX.updateParticles(dt);
  };
  FX.clear = function () {
    FX.list.length = 0;
    for (let i = 0; i < N; i++) { life[i] = 0; pos[i * 3 + 1] = -50; }
  };

  // 扩散光环
  FX.ring = function (p, color, r0, r1, dur = 0.5, y = 0.06, opacity = 0.8) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), G.M.glow(color, opacity, true));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, y, p.z);
    FX.scene.add(m);
    let t = 0;
    FX.add(dt => {
      t += dt; const k = Math.min(1, t / dur);
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2));
      m.scale.set(r, r, r);
      m.material.opacity = opacity * (1 - k);
      if (k >= 1) { FX.scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }
      return true;
    });
  };
  // 柔边光环 / 光斑贴图（canvas 径向渐变生成）
  function radialTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  const SOFT = {
    ring: radialTex([[0, 0], [0.5, 0], [0.74, 0.55], [0.84, 1], [0.92, 0.45], [1, 0]]),
    disc: radialTex([[0, 1], [0.35, 0.7], [0.7, 0.25], [1, 0]]),
  };
  const planeGeo = new THREE.PlaneGeometry(2, 2);
  // 贴在地面上的柔光环：从 r0 扩散到 r1 并淡出，没有硬边
  FX.softRing = function (p, color, r0, r1, dur = 0.8, y = 0.08, opacity = 0.8, kind = 'ring', boost = 1.4) {
    const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: SOFT[kind], color: G.M.lin(color, boost), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, y, p.z);
    FX.scene.add(m);
    let t = 0;
    FX.add(dt => {
      t += dt; const k = Math.min(1, t / dur);
      const r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2.2));
      m.scale.set(r, r, r);
      m.material.opacity = opacity * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      if (k >= 1) { FX.scene.remove(m); m.material.dispose(); return false; }
      return true;
    });
    return m;
  };

  // 闪光：柔边光斑迅速放大并淡出，中心叠一个白热小光点（开火、命中、爆炸）
  FX.flash = function (p, color, size = 0.5, dur = 0.14, boost = 1.5) {
    const mk = (c, b, s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.dotTex, color: G.M.lin(c, b), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.position.copy(p); sp.scale.setScalar(s);
      FX.scene.add(sp);
      return sp;
    };
    const glow = mk(color, boost, size), core = mk(0xffffff, 2, size * 0.3);
    let t = 0;
    FX.add(dt => {
      t += dt; const k = Math.min(1, t / dur);
      glow.scale.setScalar(size * (0.6 + k * 0.7));
      core.scale.setScalar(size * 0.35 * (1 - k * 0.5));
      glow.material.opacity = 1 - k; core.material.opacity = 1 - k;
      if (k >= 1) { for (const s of [glow, core]) { FX.scene.remove(s); s.material.dispose(); } return false; }
      return true;
    });
  };
  // 光带拖尾：记录最近的位置，生成一条始终面向镜头、越往后越细越暗的发光带
  class Ribbon {
    constructor(color, width, n = 14) {
      this.n = n; this.width = width; this.pts = [];
      this.col = G.M.lin(color, 1.25);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      this.mesh.frustumCulled = false;
      FX.scene.add(this.mesh);
    }
    push(p) {
      this.pts.unshift(p.clone());
      if (this.pts.length > this.n) this.pts.pop();
      this.build();
    }
    build() {
      const pos = this.mesh.geometry.attributes.position, col = this.mesh.geometry.attributes.color;
      const cam = G.camera.position, m = this.pts.length;
      const dir = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
      for (let i = 0; i < this.n; i++) {
        const j = Math.min(i, m - 1);
        const p = this.pts[j];
        if (!p) continue;
        // 方向：指向更新的那个点（第一个点则用下一个点反推）
        if (j > 0) dir.subVectors(this.pts[j - 1], p);
        else if (m > 1) dir.subVectors(p, this.pts[1]);
        else dir.set(0, 0, 1);
        view.subVectors(cam, p);
        side.crossVectors(dir, view).normalize();
        const k = i < m ? 1 - i / (this.n - 1) : 0;
        const w = this.width * k;
        pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
        const f = k * k;
        col.setXYZ(i * 2, this.col.r * f, this.col.g * f, this.col.b * f);
        col.setXYZ(i * 2 + 1, this.col.r * f, this.col.g * f, this.col.b * f);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    // 弹道消失后，拖尾向终点收缩再移除
    fade() {
      let t = 0;
      FX.add(dt => {
        t += dt;
        if (this.pts.length > 1) this.pts.pop();
        this.build();
        if (t > 0.25 || this.pts.length <= 1) { FX.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); return false; }
        return true;
      });
    }
  }
  FX.Ribbon = Ribbon;
  // 拖尾：沿着一段移动轨迹均匀撒下逐渐消失的光点
  const tv = new THREE.Vector3();
  FX.trail = function (a, b, color, n = 3, lifeT = 0.3) {
    for (let i = 0; i < n; i++) {
      tv.lerpVectors(a, b, i / n);
      FX.emit(tv, 1, color, 0.04, lifeT, 0, 0, 0.015, 2.4);
    }
  };
  // 闪电/光束
  FX.beam = function (a, b, color, dur = 0.18) {
    const pts = [a.clone()];
    const segs = 6;
    for (let i = 1; i < segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      p.x += (Math.random() - 0.5) * 0.2; p.y += (Math.random() - 0.5) * 0.2; p.z += (Math.random() - 0.5) * 0.2;
      pts.push(p);
    }
    pts.push(b.clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: G.M.lin(color, 2.5), transparent: true, blending: THREE.AdditiveBlending }));
    FX.scene.add(line);
    let t = 0;
    FX.add(dt => {
      t += dt; line.material.opacity = 1 - t / dur;
      if (t >= dur) { FX.scene.remove(line); geo.dispose(); line.material.dispose(); return false; }
      return true;
    });
  };
  // 荆棘刺出
  FX.spikes = function (p, lv = 0) {
    const g = new THREE.Group();
    const mat = lv === 2 ? G.M.mat(0x2f9a4a, { emissive: 0xff4fa0, emissiveIntensity: 0.35 }) : G.M.mat(0x3f8f3f);
    for (let i = 0; i < 3 + lv; i++) {
      const s = new THREE.Mesh(G.M.GEO.cone4, mat);
      s.scale.set(0.05 + lv * 0.01, 0.3 + lv * 0.1, 0.05 + lv * 0.01);
      s.position.set((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3);
      s.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      g.add(s);
    }
    g.position.set(p.x, 0, p.z);
    FX.scene.add(g);
    let t = 0;
    FX.add(dt => {
      t += dt;
      const k = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.1) / 0.3);
      g.scale.set(1, k, 1);
      if (t > 0.4) { FX.scene.remove(g); return false; }
      return true;
    });
  };
  // 物体缩小消失（死亡）
  FX.shrink = function (obj, dur = 0.3) {
    let t = 0;
    const s0 = obj.scale.x;
    FX.add(dt => {
      t += dt;
      const k = Math.max(0, 1 - t / dur);
      obj.scale.setScalar(s0 * k);
      obj.rotation.y += dt * 8;
      if (t >= dur) { FX.scene.remove(obj); return false; }
      return true;
    });
  };

  // ---------- DOM 飘字 ----------
  const v3 = new THREE.Vector3();
  FX.toScreen = function (p, out) {
    v3.copy(p).project(G.camera);
    out.x = (v3.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v3.y * 0.5 + 0.5) * window.innerHeight;
    out.vis = v3.z < 1;
    return out;
  };
  FX.texts = [];
  FX.text = function (p, str, cls = '', dur = 0.9) {
    if (FX.texts.length > 70) return;
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = str;
    FX.dom.appendChild(el);
    FX.texts.push({ el, p: p.clone(), t: 0, dur, dx: (Math.random() - 0.5) * 20 });
  };
  const sp = {};
  FX.updateTexts = function (dt) {
    for (let i = FX.texts.length - 1; i >= 0; i--) {
      const f = FX.texts[i];
      f.t += dt;
      FX.toScreen(f.p, sp);
      const k = f.t / f.dur;
      f.el.style.transform = `translate(${sp.x + f.dx * k}px, ${sp.y - 40 * k}px) translate(-50%,-50%)`;
      f.el.style.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
      if (f.t >= f.dur) { f.el.remove(); FX.texts.splice(i, 1); }
    }
  };
  FX.clearTexts = function () { for (const f of FX.texts) f.el.remove(); FX.texts.length = 0; };
})();
