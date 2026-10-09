'use strict';
// 天象的表现层：屏幕中央的揭示动画、全屏色调、战场氛围（粒子 / 风 / 雨 / 雾 / 极光）、敌人着色、落雷
// 数值效果在 game.js（S.om），这里只负责"让玩家看得出来"
(function () {
  const S = G.S, FX = G.FX, M = G.M, A = G.Audio, Wd = G.World, CFG = G.CFG;
  const V = () => new THREE.Vector3();
  const O = G.OmenFX = {};
  const KIND = { curse: '凶兆', boon: '吉兆', twist: '异象' };

  // 每个天象的表现：
  //   color 主题色（揭示卡片、扩散光环）  veil 全屏色调样式（css .veil.v-*）  tint 敌人身体的自发光颜色
  //   enemy / tower / hero: [粒子颜色, 每秒每个单位几颗, 样式]
  //   wind [颜色, 每秒几道]  rain 每秒雨滴数  mist / aurora 大片柔光云  stars 流星  coins 击杀时金币四溅
  const VIS = {
    bloodmoon: { color: 0xff2d4a, veil: 'blood',   tint: 0x9a0a22, enemy: [0xff3050, 2.5, 'drip'] },
    gale:      { color: 0xdff4ff, veil: 'gale',    wind: [0xeef8ff, 16], enemy: [0xe8f6ff, 6, 'trail'] },
    iron:      { color: 0xc8d4e8, veil: 'iron',    tint: 0x5a6e8a, enemy: [0xe8eeff, 2, 'spark'] },
    boneward:  { color: 0x9fe0ff, veil: 'bone',    tint: 0x2a6a9a, enemy: [0xbfeaff, 4, 'orbit'] },
    horde:     { color: 0xc070ff, veil: 'horde',   tint: 0x4a1070, enemy: [0xb060ff, 1.5, 'mote'], portal: true },
    rot:       { color: 0x7dff5a, veil: 'rot',     tint: 0x2a7a10, enemy: [0x8dff5a, 3, 'rise'] },
    mist:      { color: 0xe8ecf6, veil: 'mist',    mist: true },
    leyrift:   { color: 0xb060ff, veil: 'rift',    tower: [0xb060ff, 5, 'glitch'] },
    starry:    { color: 0x9fc8ff, veil: 'starry',  stars: true, tower: [0xcfe4ff, 3, 'rise', 'magic'], hero: [0xcfe4ff, 10] },
    tailwind:  { color: 0x9dffb0, veil: 'tail',    wind: [0x9dffb0, 10], tower: [0x9dffb0, 3, 'rise'] },
    mire:      { color: 0xc8a070, veil: 'mire',    tint: 0x3a2a10, enemy: [0x8a6a3a, 4, 'drop'] },
    brittle:   { color: 0xbfe8ff, veil: 'frost',   tint: 0x4a8ac0, enemy: [0xe8f8ff, 2.5, 'spark'] },
    fullmoon:  { color: 0xffe9a8, veil: 'moon',    hero: [0xffe9a8, 40] },
    bounty:    { color: 0xffd04a, veil: 'gold',    coins: true },
    eclipse:   { color: 0xff9a40, veil: 'eclipse', tint: 0x6a2a00, coins: true, enemy: [0xff9a40, 1.5, 'mote'] },
    storm:     { color: 0x9fd8ff, veil: 'storm',   rain: 220 },
    aurora:    { color: 0x7dffd0, veil: 'aurora',  aurora: true, tower: [0x9dffe0, 2, 'rise'] },
    frenzy:    { color: 0xff7a30, veil: 'frenzy',  tint: 0x9a3a00, enemy: [0xff8a30, 3, 'rise'] },
  };
  O.VIS = VIS;
  const hexCss = h => '#' + h.toString(16).padStart(6, '0');
  const vis = () => S.omens.map(id => VIS[id]).filter(Boolean);

  // ---------------- DOM：全屏色调、闪屏、揭示卡片 ----------------
  let veilBox, flashEl, revealEl;
  function dom() {
    if (veilBox) return;
    const app = document.getElementById('app');
    veilBox = document.createElement('div'); veilBox.id = 'omen-veils';
    app.insertBefore(veilBox, app.firstChild);   // 在 HUD 下面
    flashEl = document.createElement('div'); flashEl.id = 'omen-flash';
    app.insertBefore(flashEl, veilBox.nextSibling);
    revealEl = document.createElement('div'); revealEl.id = 'omen-reveal'; revealEl.hidden = true;
    app.appendChild(revealEl);
    revealEl.onclick = () => O.hideReveal();
  }
  O.screenFlash = function (color, strength = 0.5, dur = 0.35) {
    dom();
    flashEl.style.transition = 'none';
    flashEl.style.background = typeof color === 'number' ? hexCss(color) : color;
    flashEl.style.opacity = strength;
    void flashEl.offsetWidth;
    flashEl.style.transition = `opacity ${dur}s ease-out`;
    flashEl.style.opacity = 0;
  };
  // 根据当前天象与阶段同步全屏色调（备战时淡淡预告，战斗中完整显示）
  O.sync = function () {
    dom();
    const ids = (S.omens || []).filter(id => VIS[id]);
    const want = ids.map(id => VIS[id].veil);
    for (const el of [...veilBox.children]) if (!want.includes(el.dataset.v)) { el.classList.remove('prep', 'on'); el.classList.add('gone'); setTimeout(() => el.remove(), 1500); }
    const live = S.phase === 'combat' ? 'on' : (S.phase === 'prep' || S.phase === 'blessing') ? 'prep' : '';
    for (const v of want) {
      let el = veilBox.querySelector(`[data-v="${v}"]:not(.gone)`);
      if (!el) { el = document.createElement('div'); el.className = 'veil v-' + v; el.dataset.v = v; veilBox.appendChild(el); void el.offsetWidth; }
      el.classList.toggle('on', live === 'on');
      el.classList.toggle('prep', live === 'prep');
    }
  };

  // 屏幕中央的揭示：天象图标 + 名称 + 效果，约 4 秒后淡出（点击可跳过）
  let revealT = null;
  O.reveal = function (head, sub) {
    dom();
    const list = S.omens.map(id => G.omen(id));
    if (!list.length) return;
    revealEl.innerHTML = `<div class="or-head">${head}</div><div class="or-sub">${sub}</div>
      <div class="or-cards">${list.map((o, i) => `<div class="or-card ${o.kind}" style="--c:${hexCss(VIS[o.id].color)};animation-delay:${0.15 + i * 0.25}s">
        <div class="or-icon"><i></i><span>${o.icon}</span></div>
        <div class="or-kind">${KIND[o.kind]}</div><div class="or-name">${o.name}</div><div class="or-desc">${o.desc}</div></div>`).join('')}</div>
      <div class="or-hint">天象持续整个下一波${list.some(o => o.kind === 'curse') ? `　·　凶兆可在右上角花费 💠${G.PURGE_COST} 驱散` : ''}　·　点击继续</div>`;
    revealEl.hidden = false;
    revealEl.classList.remove('out', 'show'); void revealEl.offsetWidth; revealEl.classList.add('show');
    const k = list.some(o => o.kind === 'curse') ? 'omenCurse' : list.some(o => o.kind === 'twist') ? 'omenTwist' : 'omenBoon';
    A.play(k);
    O.screenFlash(VIS[list[0].id].color, 0.35, 1.2);
    clearTimeout(revealT);
    revealT = setTimeout(O.hideReveal, 4200);
  };
  O.hideReveal = function () {
    if (!revealEl || revealEl.hidden) return;
    clearTimeout(revealT);
    revealEl.classList.add('out');
    setTimeout(() => { revealEl.hidden = true; revealEl.classList.remove('out', 'show'); }, 450);
  };

  // 开战瞬间：天象"降临"——从古树扩散到全图的光环 + 闪屏
  O.activate = function () {
    O.sync();
    const list = vis();
    if (!list.length) return;
    const h = Wd.heartObj.group.position;
    list.forEach((v, i) => {
      setTimeout(() => {
        FX.softRing(V().set(h.x, 0, h.z), v.color, 0.5, 16, 1.6, 0.12, 0.7, 'ring', 1.3);
        FX.softRing(V().set(h.x, 0, h.z), v.color, 0.5, 9, 1.2, 0.1, 0.25, 'disc', 1.0);
        O.screenFlash(v.color, 0.4, 0.9);
      }, i * 350);
    });
    for (const p of Wd.portals) {   // 传送门喷出该天象颜色的光
      if (p.openWave > S.wave) continue;
      const t = Wd.get(p.x, p.y);
      FX.emit(V().set(t.wx, 0.6, t.wz), 40, list[0].color, 2.5, 0.9, 1.2, 2, 0.4);
    }
  };

  // 敌人的自发光底色（受击闪白后会回到这个颜色）
  const black = new THREE.Color(0, 0, 0);
  O.enemyTint = function () {
    for (const v of vis()) if (v.tint) return M.lin(v.tint);
    return black;
  };

  // 击杀时金币四溅（丰饶 / 日蚀）
  O.onKill = function (e, gold) {
    if (!vis().some(v => v.coins)) return false;
    const p = e.aimPoint();
    FX.emit(p, 16, 0xffd04a, 2.6, 0.7, 1.6, 7, 0.1, 2.6);
    FX.flash(p, 0xffd04a, 0.5, 0.18);
    FX.text(p, '+' + gold, 'goldtxt big');
    return true;
  };

  // ---------------- 每帧氛围 ----------------
  const tmp = V();
  function emitStyle(p, color, style, n = 1) {
    switch (style) {
      case 'drip':   FX.emit(p, n, color, 0.4, 0.8, -0.2, 4, 0.25, 2.4); break;
      case 'trail':  FX.emit(p, n, color, 0.05, 0.45, 0, 0, 0.3, 1.6); break;
      case 'spark':  FX.emit(p, n, color, 1.4, 0.35, 1, 6, 0.3, 2.6); break;
      case 'mote':   FX.emit(p, n, color, 0.3, 0.7, 0.6, 0, 0.35, 2.2); break;
      case 'rise':   FX.emit(p, n, color, 0.15, 1.0, 1.0, -0.4, 0.4, 2.2); break;
      case 'drop':   FX.emit(V().set(p.x, 0.05, p.z), n, color, 0.9, 0.4, 0.8, 8, 0.3, 1.4); break;
      case 'glitch': FX.emit(p, n, color, 1.8, 0.25, 0.4, 0, 0.5, 2.8); break;
      case 'orbit': {
        const a = Math.random() * Math.PI * 2;
        FX.emit(V().set(p.x + Math.cos(a) * 0.38, p.y, p.z + Math.sin(a) * 0.38), n, color, 0.05, 0.5, 0.4, 0, 0.02, 2.4);
        break;
      }
    }
  }
  const chance = r => Math.random() < r;
  const randMap = () => V().set((Math.random() - 0.5) * CFG.W, 0, (Math.random() - 0.5) * CFG.H);

  // 风：贴地掠过的发光细线
  const streakGeo = new THREE.PlaneGeometry(1, 0.035);
  function windStreak(color) {
    const p = randMap();
    const mat = M.glow(color, 0, true, 1.4);
    const m = new THREE.Mesh(streakGeo, mat);
    const len = 0.8 + Math.random() * 1.4;
    m.scale.set(len, 1, 1);
    m.position.set(p.x - 4, 0.3 + Math.random() * 1.6, p.z);
    m.rotation.x = -Math.PI / 2 + 0.3;
    G.scene.add(m);
    const sp = 7 + Math.random() * 5, life = 0.9 + Math.random() * 0.6;
    let t = 0;
    FX.add(dt => {
      if (dt <= 0) return true;
      t += dt;
      m.position.x += sp * dt; m.position.z += Math.sin(t * 3) * dt * 0.4;
      mat.opacity = Math.sin(Math.min(1, t / life) * Math.PI) * 0.75;
      if (t >= life) { G.scene.remove(m); mat.dispose(); return false; }
      return true;
    });
  }
  // 流星：划过天空的光带
  function shootingStar() {
    const p = randMap();
    const from = V().set(p.x - 3, 7 + Math.random() * 2, p.z - 2), dir = V().set(5, -3.5, 2).normalize();
    const rib = new FX.Ribbon(0xbfd8ff, 0.08, 18);
    const pos = from.clone(); let t = 0;
    FX.add(dt => {
      if (dt <= 0) return true;
      t += dt;
      pos.addScaledVector(dir, dt * 9);
      rib.push(pos);
      if (chance(0.7)) FX.emit(pos, 1, 0xe8f0ff, 0.2, 0.5, 0, 0.5, 0.05, 2.4);
      if (t > 0.7) { rib.fade(); return false; }
      return true;
    });
  }
  // 大片柔光云（迷雾 / 极光），淡入淡出
  const clouds = [];
  function cloudLayer(kind, want) {
    let have = clouds.filter(c => c.kind === kind);
    if (want && !have.length) {
      const n = kind === 'mist' ? 26 : 10;
      for (let i = 0; i < n; i++) {
        const mist = kind === 'mist';
        const col = mist ? 0xf2f4fa : (i % 2 ? 0x6dffc0 : 0xb070ff);
        const mat = new THREE.SpriteMaterial({ map: G.dotTex, color: M.lin(col, mist ? 1 : 1.3), transparent: true, opacity: 0,
          blending: mist ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, fog: false });
        const s = new THREE.Sprite(mat);
        const p = randMap();
        s.position.set(p.x, mist ? 0.5 + Math.random() * 0.8 : 4.5 + Math.random() * 1.5, p.z);
        const sc = mist ? 5 + Math.random() * 4 : 7 + Math.random() * 5;
        s.scale.set(sc, mist ? sc * 0.55 : sc * 0.35, 1);
        G.scene.add(s);
        clouds.push({ kind, s, mat, ph: Math.random() * 6, max: mist ? 0.42 : 0.3, x0: p.x, want: true });
      }
      have = clouds.filter(c => c.kind === kind);
    }
    for (const c of have) c.want = want;
  }
  function updateClouds(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.ph += dt * 0.3;
      const tgt = c.want ? c.max * (S.phase === 'combat' ? 1 : 0.5) : 0;
      c.mat.opacity += (tgt - c.mat.opacity) * Math.min(1, dt * 1.5);
      c.s.position.x = c.x0 + Math.sin(c.ph) * 1.2;
      if (!c.want && c.mat.opacity < 0.01) { G.scene.remove(c.s); c.mat.dispose(); clouds.splice(i, 1); }
    }
  }

  let flickerT = 3;
  O.update = function (dt) {
    if (dt <= 0) return;
    const list = vis();
    cloudLayer('mist', list.some(v => v.mist));
    cloudLayer('aurora', list.some(v => v.aurora));
    updateClouds(dt);
    if (S.phase !== 'combat' || !list.length) return;
    for (const v of list) {
      if (v.enemy) {
        const [col, rate, style] = v.enemy;
        for (const e of S.enemies) {
          if (e.dead || !chance(rate * dt)) continue;
          if (style === 'orbit' && e.shield <= 0) continue;   // 亡骨庇护：只有护盾还在时才有光点
          if (style === 'rise' && v === VIS.rot && e.hp >= e.maxHp) continue;   // 腐生：回血时才冒孢子
          emitStyle(e.aimPoint(), col, style);
        }
      }
      if (v.tower) {
        const [col, rate, style, only] = v.tower;
        for (const t of S.towers) {
          if (only === 'magic' && t.def.dmgType !== 'magic') continue;
          if (!chance(rate * dt)) continue;
          emitStyle(tmp.set(t.pos.x, Wd.top(t.tile) + 0.5, t.pos.z), col, style);
        }
      }
      if (v.hero && chance(v.hero[1] * dt)) emitStyle(G.Hero.m.group.position, v.hero[0], 'rise', 2);
      if (v.hero && chance(dt * 0.6)) {
        const hp = G.Hero.pos;
        FX.softRing(V().set(hp.x, 0, hp.z), v.hero[0], 0.2, 1.4, 0.9, Wd.groundY(hp.x, hp.z) + 0.08, 0.6);
      }
      if (v.wind && chance(Math.min(1, v.wind[1] * dt))) windStreak(v.wind[0]);
      if (v.wind && chance(Math.min(1, v.wind[1] * dt * 0.5))) windStreak(v.wind[0]);
      if (v.stars && chance(dt * 2)) shootingStar();
      if (v.rain) {
        const n = Math.round(v.rain * dt + Math.random());
        for (let i = 0; i < n; i++) {
          const p = randMap();
          FX.emit(V().set(p.x, 6 + Math.random() * 2, p.z), 1, 0x9fc8ff, 0.18, 0.9, -30, 8, 0.1, 1.3);
          if (chance(0.3)) FX.emit(V().set(p.x, 0.05, p.z), 1, 0xbfe0ff, 0.6, 0.2, 0.6, 6, 0.05, 1.4);
        }
        flickerT -= dt;
        if (flickerT <= 0) { flickerT = 3 + Math.random() * 5; O.screenFlash(0xdfeeff, 0.18, 0.5); A.play('rumble'); }
      }
      if (v.portal) {
        for (const p of Wd.portals) {
          if (p.openWave > S.wave || !chance(dt * 12)) continue;
          const t = Wd.get(p.x, p.y);
          FX.emit(V().set(t.wx, 0.4, t.wz), 1, 0xb04dff, 1.4, 0.8, 1.4, 0, 0.6, 2.6);
        }
      }
    }
  };

  // ---------------- 落雷 ----------------
  // 由发光方柱拼成的折线闪电（亮度 > 1，会触发泛光），带分叉，闪两下后淡出
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function boltPath(a, b, segs, jitter) {
    const pts = [a.clone()];
    for (let i = 1; i < segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      p.x += (Math.random() - 0.5) * jitter; p.z += (Math.random() - 0.5) * jitter; p.y += (Math.random() - 0.5) * jitter * 0.3;
      pts.push(p);
    }
    pts.push(b.clone());
    return pts;
  }
  function boltMesh(pts, width, group, mats) {
    const outer = M.glow(0x8fcfff, 1, true, 2.4), core = M.glow(0xffffff, 1, true, 3.2);
    mats.push(outer, core);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      for (const [mat, w] of [[outer, width], [core, width * 0.35]]) {
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, w, len + w);
        m.position.copy(a).lerp(b, 0.5);
        m.lookAt(b);
        group.add(m);
      }
    }
  }
  function showBolt(from, to, width, branches) {
    const g = new THREE.Group(), mats = [];
    const pts = boltPath(from, to, 9, 0.9);
    boltMesh(pts, width, g, mats);
    for (let k = 0; k < branches; k++) {   // 分叉
      const s = pts[2 + Math.floor(Math.random() * 5)];
      const e = s.clone().add(V().set((Math.random() - 0.5) * 3, -1 - Math.random() * 2, (Math.random() - 0.5) * 3));
      boltMesh(boltPath(s, e, 4, 0.5), width * 0.45, g, mats);
    }
    G.scene.add(g);
    let t = 0;
    FX.add(dt => {
      t += dt;
      g.visible = !(t > 0.06 && t < 0.11);   // 闪两下
      const f = t < 0.15 ? 1 : Math.max(0, 1 - (t - 0.15) / 0.25);
      for (const m of mats) m.opacity = f;
      if (t >= 0.4) { G.scene.remove(g); mats.forEach(m => m.dispose()); return false; }
      return true;
    });
  }
  function strike(e, dmg, main) {
    const to = e.aimPoint();
    if (main) {
      showBolt(V().set(to.x + (Math.random() - 0.5) * 3, 13, to.z - 2.5), to, 0.16, 3);
      FX.flash(to, 0xbfe8ff, 3.2, 0.35, 2.4);
      FX.flash(V().set(to.x, 0.2, to.z), 0xffffff, 1.4, 0.2, 2.5);
      FX.softRing(V().set(to.x, 0, to.z), 0x9fd8ff, 0.2, 2.2, 0.55, 0.08, 0.9);
      FX.softRing(V().set(to.x, 0, to.z), 0xdff4ff, 0.1, 1.0, 0.4, 0.1, 0.8, 'disc');
      FX.emit(V().set(to.x, 0.2, to.z), 40, 0xbfe8ff, 3.6, 0.5, 1.4, 6, 0.2, 2.8);
      FX.emit(V().set(to.x, 0.1, to.z), 14, 0x5a5a6a, 2, 0.8, 1.2, 6, 0.2, 0.8);
      O.screenFlash(0xe8f4ff, 0.55, 0.4);
      G.shake(0.32);
      A.play('thunder', 0.1);
    } else {
      FX.flash(to, 0xbfe8ff, 1.2, 0.2, 2);
      FX.emit(to, 12, 0xbfe8ff, 2, 0.35, 1, 4);
    }
    FX.text(to, '⚡' + Math.round(dmg), 'bolttxt', 1.1);
    G.damage(e, dmg, 'magic');
    if (!e.dead) e.stunT = Math.max(e.stunT, main ? 0.6 : 0.3);
  }
  // 雷暴：先在目标脚下出现收缩的预警光圈，0.35 秒后落雷，并连锁到附近 2 个敌人（50% 伤害）
  O.lightning = function (e) {
    const dmg = 40 + 14 * S.wave;
    const warn = e.pos.clone();
    FX.softRing(V().set(warn.x, 0, warn.z), 0x9fd8ff, 1.4, 0.25, 0.35, 0.09, 0.9);
    FX.softRing(V().set(warn.x, 0, warn.z), 0xffffff, 0.9, 0.15, 0.35, 0.1, 0.5, 'disc');
    let t = 0;
    FX.add(dt => {
      if (dt <= 0) return true;
      t += dt;
      if (t < 0.35) return true;
      if (e.dead) return false;
      strike(e, dmg, true);
      let from = e; const hit = new Set([e]);
      for (let i = 0; i < 2; i++) {
        let best = null, bd = 2.6;
        for (const n of S.enemies) {
          if (n.dead || hit.has(n)) continue;
          const d = Math.hypot(n.pos.x - from.pos.x, n.pos.z - from.pos.z);
          if (d < bd) { bd = d; best = n; }
        }
        if (!best) break;
        showBolt(from.aimPoint(), best.aimPoint(), 0.07, 0);
        strike(best, dmg * 0.5, false);
        hit.add(best); from = best;
      }
      return false;
    });
  };
  G.lightning = O.lightning;

  // 每帧（游戏没暂停时）
  const baseUpdate = G.update;
  G.update = function (dt) { baseUpdate(dt); O.update(dt); };
  O.clear = function () {
    for (const c of clouds) c.want = false;
    O.hideReveal();
    if (veilBox) veilBox.innerHTML = '';
  };
})();
