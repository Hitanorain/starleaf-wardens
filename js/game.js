'use strict';
// 游戏逻辑：状态、敌人、塔、弹道、英雄、波次与玩家操作
(function () {
  const S = G.S = {};
  const CFG = G.CFG, Wd = G.World, M = G.M, FX = G.FX, A = G.Audio;
  const V = () => new THREE.Vector3();
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  G.newState = function () {
    for (const e of S.enemies || []) e.remove();
    for (const t of S.towers || []) G.scene.remove(t.m.group);
    for (const p of S.projectiles || []) p.remove(true);
    if (G.OmenFX) G.OmenFX.clear();
    Object.assign(S, {
      phase: 'prep', wave: 0, gold: CFG.START_GOLD, ley: CFG.START_LEY, lives: CFG.START_LIVES,
      speed: 1, paused: false, time: 0,
      enemies: [], towers: [], projectiles: [], queue: [], waveTime: 0, undo: [], selected: null,
      stats: { kills: 0, leaks: 0, built: 0 }, taken: new Set(), portalCounter: 0,
      hand: [], expandTokens: 0, offers: null, rng: Math.random,
      omens: [], om: Object.assign({}, G.OMEN_DEFAULT), purged: false, seenOmen: false, lastOmens: [], boltT: 0,
      mods: {
        dmg: { archer: 1, obelisk: 1, thorn: 1, catapult: 1 },
        range: { archer: 1, obelisk: 1, thorn: 1, catapult: 1 },
        rate: 1, heightMul: 1, cost: 1, sell: CFG.SELL_RATE, killGold: 1, leyBonus: 0, splash: 1, heroDmg: 1, heroCd: 1,
      },
    });
  };

  // ======================= 伤害 =======================
  G.damage = function (e, amt, type) {
    if (e.dead) return;
    let a = amt;
    if (e.shield > 0) {
      const mul = type === 'magic' ? 2 : 1;
      const eff = a * mul;
      if (eff >= e.shield) {
        a = (eff - e.shield) / mul; e.shield = 0;
        A.play('shield');
        FX.emit(e.aimPoint(), 14, 0x7fd4ff, 2.2, 0.5);
        FX.text(e.aimPoint(), '护盾破碎', 'shieldtxt');
      } else { e.shield -= eff; a = 0; }
    }
    if (type === 'phys') a *= 1 - e.armor;
    e.hp -= a;
    e.flash = 0.08;
    e.dmgAcc += amt;
    if (e.hp <= 0) e.kill();
  };

  // ======================= 敌人 =======================
  class Enemy {
    constructor(type, start, fromPos) {
      const d = this.def = G.ENEMIES[type];
      this.type = type;
      const om = S.om;
      const hm = d.boss ? 1 : G.hpMul(S.wave) * om.hp;
      this.maxHp = this.hp = Math.round(d.hp * hm);
      this.maxShield = this.shield = Math.round((d.shield || 0) * hm * om.shieldMul) + (d.boss ? 0 : Math.round(this.maxHp * om.shieldPct));
      this.armor = om.noArmor ? 0 : Math.min(0.75, Math.max(d.armor, d.armor + om.armor));
      this.speed = d.speed * om.speed; this.fly = !!d.fly;
      this.regen = (d.regen || 0) + (d.boss ? 0 : om.regen * this.maxHp);
      this.m = M.enemy(type);
      this.scale = d.scale * 1.25;
      this.m.group.scale.setScalar(this.scale);
      this.pos = V().set(start.wx, this.fly ? CFG.FLY_Y : 0, start.wz);
      if (fromPos) { this.pos.x = fromPos.x; this.pos.z = fromPos.z; }
      this.vel = V();
      this.tile = start; this.next = null;
      this.off = d.boss ? { x: 0, z: 0 } : { x: (Math.random() - 0.5) * 0.36, z: (Math.random() - 0.5) * 0.36 };
      this.slowT = 0; this.slowAmt = 0; this.stunT = 0; this.flash = 0; this.anim = Math.random() * 10;
      this.summonT = d.summon ? d.summon.every : 0;
      this.dmgAcc = 0; this.dmgT = 0;
      this.baseEm = G.OmenFX.enemyTint();   // 天象给敌人身体染上的颜色
      for (const m of this.m.mats) m.emissive.copy(this.baseEm);
      G.scene.add(this.m.group);
      this.m.group.position.copy(this.pos);
      // 血条
      const hb = this.hb = document.createElement('div');
      hb.className = 'hb' + (d.boss ? ' boss' : '');
      hb.innerHTML = '<i class="hp"></i><i class="sh"></i>' + (d.boss ? `<b>${d.name}</b>` : '');
      FX.dom.appendChild(hb);
      this.hpEl = hb.children[0]; this.shEl = hb.children[1];
      if (!this.fly) this.chooseNext();
    }
    chooseNext() {
      const n = Wd.nextStep(Wd.dist, this.tile.x, this.tile.y);
      this.next = n;
      if (n) {
        const isHeart = n.x === Wd.heart.x && n.y === Wd.heart.y;
        this.tx = n.wx + (isHeart ? 0 : this.off.x); this.tz = n.wz + (isHeart ? 0 : this.off.z);
      }
    }
    progress() {
      if (this.fly) return hyp(this.pos.x, this.pos.z, Wd.heartObj.group.position.x, Wd.heartObj.group.position.z);
      if (!this.next) return 0;
      return Wd.dist[this.next.y * CFG.W + this.next.x] + hyp(this.tx, this.tz, this.pos.x, this.pos.z);
    }
    aimPoint() {
      const p = this.pos.clone();
      p.y += this.fly ? 0 : 0.3 * this.scale + (this.def.boss ? 0.3 : 0);
      return p;
    }
    update(dt) {
      this.anim += dt;
      if (this.flash > 0) {
        this.flash -= dt;
        for (const m of this.m.mats) { if (this.flash > 0) m.emissive.setHex(0x888888); else m.emissive.copy(this.baseEm); }
      }
      if (this.regen) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
      if (this.def.summon) {
        this.summonT -= dt;
        if (this.summonT <= 0 && this.tile) {
          this.summonT = this.def.summon.every;
          for (let i = 0; i < this.def.summon.count; i++) {
            const e = new Enemy(this.def.summon.type, this.tile, this.pos);
            S.enemies.push(e);
          }
          FX.ring(this.pos, 0xb04dff, 0.2, 1.6, 0.6);
          FX.emit(this.aimPoint(), 20, 0xb04dff, 2, 0.6);
        }
      }
      if (this.stunT > 0) { this.stunT -= dt; this.vel.set(0, 0, 0); this.place(dt); return; }
      if (this.slowT > 0) this.slowT -= dt;
      const sp = this.speed * (this.slowT > 0 ? 1 - this.slowAmt : 1) * dt;
      const ox = this.pos.x, oz = this.pos.z;
      if (this.fly) {
        const hx = Wd.heartObj.group.position.x, hz = Wd.heartObj.group.position.z;
        const d = hyp(hx, hz, this.pos.x, this.pos.z);
        if (d < 0.35) return this.leak();
        this.pos.x += (hx - this.pos.x) / d * sp; this.pos.z += (hz - this.pos.z) / d * sp;
        this.pos.y = CFG.FLY_Y + Math.sin(this.anim * 3) * 0.12;
      } else {
        if (!this.next) {
          if (this.tile.x === Wd.heart.x && this.tile.y === Wd.heart.y) return this.leak();
          this.chooseNext();
          if (!this.next) return;
        }
        const dx = this.tx - this.pos.x, dz = this.tz - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d <= sp) {
          this.pos.x = this.tx; this.pos.z = this.tz;
          this.tile = this.next;
          if (this.tile.x === Wd.heart.x && this.tile.y === Wd.heart.y) return this.leak();
          this.chooseNext();
        } else { this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; }
        this.pos.y = 0;
      }
      if (dt > 0) this.vel.set((this.pos.x - ox) / dt, 0, (this.pos.z - oz) / dt);
      this.place(dt);
    }
    place(dt) {
      const g = this.m.group;
      g.position.copy(this.pos);
      if (this.vel.lengthSq() > 0.0001) {
        const want = Math.atan2(this.vel.x, this.vel.z);
        let diff = want - g.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        g.rotation.y += diff * Math.min(1, dt * 10);
      }
      const moving = this.stunT <= 0;
      const k = this.anim * this.speed * 9;
      if (moving) {
        this.m.body.position.y = Math.abs(Math.sin(k)) * 0.04;
        this.m.legs.forEach((l, i) => { l.rotation.x = Math.sin(k + i * Math.PI) * 0.6; });
      }
      for (const w of this.m.wings) w.g.rotation.z = w.s * Math.sin(this.anim * 18) * 0.7;
      if (this.m.shieldMesh) this.m.shieldMesh.visible = this.shield > 0;
      if (this.stunT > 0 && Math.random() < 0.2) FX.emit(this.aimPoint().add(V().set(0, 0.35, 0)), 1, 0xfff27a, 0.5, 0.4, 0.2, 0);
    }
    leak() {
      S.lives -= this.def.leak;
      S.stats.leaks++;
      A.play('leak');
      const hp = Wd.heartObj.group.position;
      FX.ring(hp, 0xff3d6a, 0.3, 1.8, 0.6, 0.1);
      FX.emit(V().set(hp.x, 1.2, hp.z), 25, 0xff4d7a, 2.5, 0.7);
      FX.text(V().set(hp.x, 2.2, hp.z), '-' + this.def.leak + ' ♥', 'leaktxt', 1.2);
      G.shake(0.25);
      this.remove();
      if (S.lives <= 0) { S.lives = 0; G.endGame(false); }
    }
    kill() {
      if (this.dead) return;
      const gold = Math.round(this.def.gold * G.goldMul(S.wave) * S.mods.killGold * S.om.gold);
      S.gold += gold;
      S.stats.kills++;
      A.play('die');
      const p = this.aimPoint();
      FX.emit(p, this.def.boss ? 80 : 16, 0xb04dff, this.def.boss ? 4 : 2, 0.6);
      FX.emit(p, 6, 0xffe27a, 1.5, 0.5);
      if (!G.OmenFX.onKill(this, gold)) FX.text(p, '+' + gold, 'goldtxt');
      G.Hero.gainXp(this.def.boss ? 30 : 1);
      if (this.def.boss) { G.shake(0.6); FX.ring(this.pos, 0xff7be0, 0.3, 3, 0.8); }
      this.dead = true;
      this.hb.remove();
      FX.shrink(this.m.group, 0.35);
    }
    remove() {
      this.dead = true;
      this.hb.remove();
      G.scene.remove(this.m.group);
    }
  }
  G.Enemy = Enemy;

  // ======================= 塔 =======================
  G.towerStats = function (type, level, h, buff) {
    const def = G.TOWERS[type], L = def.levels[level], hm = S.mods.heightMul, om = S.om;
    const rM = 1 + (CFG.HEIGHT_RANGE[h] - 1) * hm, dM = 1 + (CFG.HEIGHT_DMG[h] - 1) * hm;
    return {
      dmg: L.dmg * dM * S.mods.dmg[type] * (def.dmgType === 'magic' ? om.magic : 1),
      range: L.range * rM * S.mods.range[type] * om.range,
      cd: L.cd / (S.mods.rate * om.rate * (buff ? 1 + G.HERO.skills.e.haste : 1)),
      splash: (L.splash || 0) * S.mods.splash, minRange: L.minRange || 0, slow: L.slow || 0,
      multi: L.multi || 1, chain: L.chain || 0, rM, dM,
    };
  };
  G.towerCost = (type, level) => Math.round(G.TOWERS[type].levels[level].cost * S.mods.cost);

  class Tower {
    constructor(type, tile) {
      this.type = type; this.def = G.TOWERS[type]; this.level = 0; this.tile = tile;
      tile.tower = this;
      this.cd = 0.3; this.buff = 0; this.mode = 'first'; this.anim = 0; this.kick = 0;
      this.invested = G.towerCost(type, 0);
      this.pos = V().set(tile.wx, 0, tile.wz);
      this.rebuild();
      this.m.group.scale.setScalar(0.01);
      this.pop = 0;
    }
    rebuild() {
      let rotY = 0;
      if (this.m) { G.scene.remove(this.m.group); if (this.m.head) rotY = this.m.head.rotation.y; }
      this.m = M.tower(this.type, this.level);
      if (this.m.head) this.m.head.rotation.y = rotY;
      this.m.group.position.set(this.tile.wx, Wd.top(this.tile), this.tile.wz);
      this.m.group.userData.tower = this;
      G.scene.add(this.m.group);
      this.m.group.traverse(o => { o.userData.tower = this; });
    }
    stats() { return G.towerStats(this.type, this.level, this.tile.h, this.buff > 0); }
    muzzle() { const p = V(); this.m.muzzle.getWorldPosition(p); return p; }
    targets(st, n) {
      const list = [];
      for (const e of S.enemies) {
        if (e.dead || (e.fly && !this.def.air)) continue;
        const d = hyp(e.pos.x, e.pos.z, this.pos.x, this.pos.z);
        if (d > st.range || d < st.minRange) continue;
        const score = this.mode === 'first' ? e.progress() : this.mode === 'strong' ? -(e.hp + e.shield) : d;
        list.push([score, e]);
      }
      list.sort((a, b) => a[0] - b[0]);
      return list.slice(0, n).map(x => x[1]);
    }
    update(dt) {
      this.anim += dt;
      const g = this.m.group;
      const ty = Wd.top(this.tile);
      g.position.y += (ty - g.position.y) * Math.min(1, dt * 10);
      if (this.pop < 1) {
        this.pop = Math.min(1, this.pop + dt * 4);
        const k = this.pop;
        g.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k) * 0.6 : 1);
      }
      if (this.buff > 0) {
        this.buff -= dt;
        if (Math.random() < dt * 12) FX.emit(V().set(this.pos.x, ty + 0.4, this.pos.z), 1, 0xff9ccf, 0.6, 0.6, 1, -0.5, 0.6);
      }
      // 动画：模型里登记的旋转件与浮动件
      for (const [o, axis, sp] of this.m.spin) o.rotation[axis] += dt * sp;
      for (const [o, y0, amp, f, ph] of this.m.bob) o.position.y = y0 + Math.sin(this.anim * f + ph) * amp;
      if (this.kick > 0) {
        this.kick -= dt;
        if (this.m.vines) { const s = 1 + Math.max(0, this.kick) * 1.2; this.m.vines.scale.set(s, 1 + Math.max(0, this.kick) * 2, s); }
      }
      if (this.m.arm) this.m.arm.rotation.x += ((this.kick > 0 ? -1.2 : 0.5) - this.m.arm.rotation.x) * Math.min(1, dt * (this.kick > 0 ? 25 : 3));

      if (S.phase !== 'combat') return;
      this.cd -= dt;
      const st = this.stats();
      if (this.def.pulse) {
        if (this.cd > 0) return;
        const hit = this.targets(st, 99);
        if (!hit.length) return;
        this.cd = st.cd; this.kick = 0.25;
        A.play('thorn', 0.1);
        const top = Wd.top(this.tile);
        FX.ring(this.pos, [0x7fe07a, 0x9fe86a, 0xff8fc8][this.level], 0.2, st.range, 0.4 + this.level * 0.1, 0.07, 0.6);
        if (this.level >= 1) FX.emit(V().set(this.pos.x, top + 0.6, this.pos.z), 6 + this.level * 8, this.level === 2 ? 0xffb3d6 : 0xc8ff9a, 1.8, 0.8, 0.6, -0.3, 0.3, 1.3);
        if (this.level === 2) { FX.ring(this.pos, 0xfff27a, 0.1, st.range * 0.6, 0.35, 0.09, 0.5); FX.flash(V().set(this.pos.x, top + 0.85, this.pos.z), 0xff8fc8, 0.9, 0.2); }
        hit.forEach((e, i) => {
          G.damage(e, st.dmg, 'magic');
          e.slowAmt = Math.max(e.slowT > 0 ? e.slowAmt : 0, st.slow); e.slowT = 1.2;
          if (i < 6) FX.spikes(e.pos, this.level);
        });
        return;
      }
      const tg = this.targets(st, st.multi);
      if (!tg.length) return;
      if (this.m.head) {
        const e = tg[0];
        const want = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        let diff = want - this.m.head.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.m.head.rotation.y += diff * Math.min(1, dt * 12);
      }
      if (this.cd > 0) return;
      this.cd = st.cd;
      const from = this.muzzle();
      if (this.type === 'archer') {
        A.play('arrow');
        const sty = Proj.styleOf('arrow', this.level);
        FX.flash(from, sty.hitColor, 0.3 + this.level * 0.2, 0.1);
        tg.forEach(e => S.projectiles.push(new Proj('arrow', from, e, { dmg: st.dmg, level: this.level })));
      } else if (this.type === 'obelisk') {
        A.play('bolt');
        const sty = Proj.styleOf('bolt', this.level);
        S.projectiles.push(new Proj('bolt', from, tg[0], { dmg: st.dmg, chain: st.chain, level: this.level }));
        FX.emit(from, 6 + this.level * 6, sty.trail, 1.2, 0.4, 0.5, 0);
        FX.flash(from, sty.hitColor, 0.6 + this.level * 0.35, 0.18);
        if (this.level === 2) FX.ring(from, sty.hitColor, 0.1, 0.6, 0.3, from.y);
      } else if (this.type === 'catapult') {
        A.play('catapult');
        this.kick = 0.18;
        FX.flash(from, 0x7fe0ff, 0.6 + this.level * 0.3, 0.15);
        const e = tg[0];
        const d = hyp(e.pos.x, e.pos.z, this.pos.x, this.pos.z);
        const T = 0.7 + d * 0.08;
        const to = e.pos.clone().addScaledVector(e.vel, T * 0.9);
        to.y = 0;
        S.projectiles.push(new Proj('rock', from, null, { dmg: st.dmg, splash: st.splash, to, T, level: this.level }));
      }
    }
    remove() {
      G.scene.remove(this.m.group);
      this.tile.tower = null;
    }
  }
  G.Tower = Tower;

  // ======================= 弹道 =======================
  // 每种塔的弹道分 3 级外观：越高级越长、越亮、拖尾越宽，并附加星屑 / 螺旋 / 冲击波
  class Proj {
    constructor(kind, from, target, o) {
      this.kind = kind; this.target = target; this.o = o;
      this.pos = from.clone(); this.start = from.clone(); this.t = 0;
      const S0 = this.style = Proj.styleOf(kind, o.level || 0);
      this.speed = S0.speed;
      if (S0.wood) this.m = M.arrow(true);
      else this.m = M.tracer(S0.color, S0.len, S0.width, S0.halo);
      if (kind === 'rock') {   // 投石机：飞行中翻滚的发光晶体
        const cr = new THREE.Mesh(M.GEO.ico0, M.glow(S0.core, 1, false, 2.2));
        cr.scale.setScalar(S0.crystal);
        this.m.add(cr); this.crystal = cr;
      }
      this.prev = this.pos.clone();
      this.rib = new FX.Ribbon(S0.trail, S0.ribW, S0.ribN);
      this.rib.push(this.pos);
      this.m.position.copy(this.pos);
      G.scene.add(this.m);
      this.last = target ? target.aimPoint() : null;
    }
    trailFx() {
      const S0 = this.style;
      if (S0.sparkle && Math.random() < 0.8) FX.emit(this.pos, 1, S0.sparkle, 0.35, 0.45, 0.2, 0, 0.06, 1.6);
      if (S0.spiral) {   // 绕着弹道螺旋的星屑（3 级是双螺旋）
        for (let k = 0; k < S0.spiral; k++) {
          const a = this.t * 25 + k * Math.PI;
          FX.emit(V().set(this.pos.x + Math.cos(a) * 0.13, this.pos.y + Math.sin(a) * 0.13, this.pos.z + Math.sin(a) * 0.05), 1, S0.spiralColor, 0.08, 0.4, 0, 0, 0.01, 1.4);
        }
      }
    }
    update(dt) {
      this.t += dt;
      if (this.kind === 'rock') {
        const k = Math.min(1, this.t / this.o.T);
        const d = this.start.distanceTo(this.o.to);
        this.pos.lerpVectors(this.start, this.o.to, k);
        this.pos.y += Math.sin(k * Math.PI) * (1 + d * 0.18);
        this.m.position.copy(this.pos);
        if (this.pos.distanceToSquared(this.prev) > 1e-6) this.m.lookAt(this.pos.clone().multiplyScalar(2).sub(this.prev));
        this.crystal.rotation.x += dt * 9; this.crystal.rotation.y += dt * 6;
        this.rib.push(this.pos);
        if (Math.random() < 0.5) FX.emit(this.pos, 1, this.style.trail, 0.2, 0.4, 0, 0, 0.05, 1.3);
        this.trailFx();
        this.prev.copy(this.pos);
        if (k >= 1) { this.explode(); return false; }
        return true;
      }
      if (this.target && !this.target.dead) this.last = this.target.aimPoint();
      const dir = this.last.clone().sub(this.pos);
      const d = dir.length();
      const step = this.speed * dt;
      if (d <= step + 0.05) { this.hit(); return false; }
      dir.multiplyScalar(1 / d);
      this.pos.addScaledVector(dir, step);
      this.m.position.copy(this.pos);
      this.m.lookAt(this.last);
      const h = this.m.userData.halo;
      if (h) h.material.opacity = 0.65 + Math.sin(this.t * 40) * 0.2;   // 光晕轻微闪烁
      this.rib.push(this.pos);
      this.trailFx();
      this.prev.copy(this.pos);
      return true;
    }
    hit() {
      this.remove();
      const e = this.target, S0 = this.style;
      if (!e || e.dead) return;
      FX.flash(this.last, S0.hitColor, S0.hit, 0.12 + S0.hit * 0.06);
      if (S0.hitRing) FX.ring(this.last, S0.hitColor, 0.05, S0.hitRing, 0.3, this.last.y);
      if (this.kind === 'arrow') {
        G.damage(e, this.o.dmg, 'phys');
        FX.emit(this.last, 4 + (this.o.level || 0) * 4, S0.trail, 1.8, 0.25, 0.6, 2);
        A.play('hit', 0.08);
      } else if (this.kind === 'bolt') {
        G.damage(e, this.o.dmg, 'magic');
        FX.emit(this.last, 10 + (this.o.level || 0) * 6, S0.spiralColor || S0.trail, 1.8, 0.4);
        // 弹射
        let from = e, hitSet = new Set([e]);
        for (let i = 0; i < (this.o.chain || 0); i++) {
          let best = null, bd = 2.2;
          for (const n of S.enemies) {
            if (n.dead || hitSet.has(n)) continue;
            const dd = hyp(n.pos.x, n.pos.z, from.pos.x, from.pos.z);
            if (dd < bd) { bd = dd; best = n; }
          }
          if (!best) break;
          FX.beam(from.aimPoint(), best.aimPoint(), S0.trail);
          FX.beam(from.aimPoint(), best.aimPoint(), 0xffffff, 0.12);
          FX.flash(best.aimPoint(), S0.hitColor, S0.hit * 0.6, 0.15);
          G.damage(best, this.o.dmg * 0.6, 'magic');
          hitSet.add(best); from = best;
        }
      } else if (this.kind === 'star') {
        G.damage(e, this.o.dmg, 'magic');
        FX.emit(this.last, 8, 0xfff27a, 1.4, 0.35);
      }
    }
    explode() {
      this.remove();
      const p = this.o.to, S0 = this.style, lv = this.o.level || 0;
      A.play('boom', 0.08);
      FX.ring(p, S0.trail, 0.1, this.o.splash, 0.35, 0.08);
      if (lv >= 1) FX.ring(p, 0xffffff, 0.1, this.o.splash * 0.7, 0.25, 0.1, 0.6);
      if (lv >= 2) FX.ring(p, S0.core, this.o.splash * 0.4, this.o.splash * 1.5, 0.55, 0.06, 0.5);
      FX.flash(V().set(p.x, 0.3, p.z), S0.hitColor, this.o.splash * S0.hit, 0.28);
      FX.emit(V().set(p.x, 0.2, p.z), 16 + lv * 12, S0.trail, 2.6 + lv * 0.6, 0.55, 1.2, 6);
      FX.emit(V().set(p.x, 0.2, p.z), 8, 0xc9a07a, 1.8, 0.5, 1, 6);
      if (lv >= 2) {   // 3 级：碎晶四溅后各自小爆
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + Math.random();
          const q = V().set(p.x + Math.cos(a) * this.o.splash * 0.8, 0.15, p.z + Math.sin(a) * this.o.splash * 0.8);
          setTimeout(() => { FX.flash(q, S0.core, 0.6, 0.15); FX.emit(q, 6, S0.core, 1.5, 0.35, 1, 5); }, 90 + i * 40);
        }
        G.shake(0.12);
      }
      for (const e of S.enemies) {
        if (e.dead || e.fly) continue;
        const d = hyp(e.pos.x, e.pos.z, p.x, p.z);
        if (d <= this.o.splash) G.damage(e, this.o.dmg * (d < this.o.splash * 0.5 ? 1 : 0.6), 'phys');
      }
    }
    remove(now) { G.scene.remove(this.m); if (now) FX.scene.remove(this.rib.mesh); else this.rib.fade(); }
  }
  Proj.LV = {
    arrow: [
      { speed: 13, wood: true, trail: 0xfff1d0, ribW: 0.014, ribN: 6, hit: 0.35, hitColor: 0xfff1c0 },                                     // 1 级：普通木箭
      { speed: 15, color: 0x5dff96, len: 0.5, width: 0.04, halo: 0.35, trail: 0x4dff8a, ribW: 0.035, ribN: 9, hit: 0.55, hitColor: 0x9dffb8 },   // 2 级：绿色光箭
      { speed: 17, color: 0x7dffc0, len: 0.7, width: 0.055, halo: 0.6, trail: 0x3dffa0, ribW: 0.055, ribN: 14, sparkle: 0xd8ffe8, hit: 0.85, hitColor: 0x9dffc8, hitRing: 0.45 },  // 3 级：翡翠灵箭
    ],
    bolt: [
      { speed: 8, color: 0xa070ff, len: 0.22, width: 0.08, halo: 0.45, trail: 0x8a4dff, ribW: 0.05, ribN: 8, hit: 0.7, hitColor: 0xb07cff },
      { speed: 8.5, color: 0x9a5cff, len: 0.4, width: 0.1, halo: 0.75, trail: 0x8a4dff, ribW: 0.09, ribN: 16, spiral: 1, spiralColor: 0xd8c0ff, hit: 1.1, hitColor: 0xb07cff },
      { speed: 9.5, color: 0x8fe8ff, len: 0.6, width: 0.14, halo: 1.15, trail: 0x6fd0ff, ribW: 0.13, ribN: 22, spiral: 2, spiralColor: 0xffffff, sparkle: 0xc8f8ff, hit: 1.6, hitColor: 0x9ff4ff, hitRing: 0.8 },
    ],
    rock: [
      { speed: 0, color: 0x4fd2ff, len: 0.18, width: 0.09, halo: 0.6, trail: 0x3fc4ff, ribW: 0.05, ribN: 10, core: 0x9fe8ff, crystal: 0.08, hit: 1.6, hitColor: 0x9fe8ff },
      { speed: 0, color: 0x4fd2ff, len: 0.25, width: 0.12, halo: 0.9, trail: 0x3fc4ff, ribW: 0.09, ribN: 18, core: 0xbff4ff, crystal: 0.1, hit: 2.2, hitColor: 0x9fe8ff },
      { speed: 0, color: 0xbff8ff, len: 0.32, width: 0.16, halo: 1.3, trail: 0x8fe8ff, ribW: 0.14, ribN: 24, core: 0xe8fcff, crystal: 0.13, sparkle: 0xffffff, hit: 2.8, hitColor: 0xcffaff },
    ],
    star: [{ speed: 11, color: 0xffc94a, len: 0.38, width: 0.07, halo: 0.55, trail: 0xffb830, ribW: 0.06, ribN: 13, hit: 0.8, hitColor: 0xffd76a }],
  };
  Proj.styleOf = (kind, lv) => { const l = Proj.LV[kind]; return l[Math.min(lv, l.length - 1)]; };
  G.Proj = Proj;

  // ======================= 英雄：露娜 =======================
  const Hero = G.Hero = {};
  Hero.init = function () {
    if (Hero.m) G.scene.remove(Hero.m.group);
    Hero.m = M.fairy();
    Hero.m.group.scale.setScalar(1.4);
    G.scene.add(Hero.m.group);
    const h = Wd.heartObj.group.position;
    Hero.pos = V().set(h.x - 1.2, 0, h.z);
    Hero.dest = Hero.pos.clone();
    Hero.cd = 0; Hero.lvl = 1; Hero.xp = 0; Hero.anim = 0;
    Hero.skill = { q: 0, e: 0 };
    Hero.marker = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 20), M.glow(0xfff4a8, 0.8, true));
    Hero.marker.rotation.x = -Math.PI / 2; Hero.marker.visible = false;
    G.scene.add(Hero.marker);
  };
  Hero.moveTo = function (x, z) {
    const hw = CFG.W / 2 - 0.3, hh = CFG.H / 2 - 0.3;
    Hero.dest.set(Math.max(-hw, Math.min(hw, x)), 0, Math.max(-hh, Math.min(hh, z)));
    Hero.marker.visible = true;
    Hero.marker.position.set(Hero.dest.x, Wd.groundY(Hero.dest.x, Hero.dest.z) + 0.05, Hero.dest.z);
    Hero.markerT = 0.8;
  };
  Hero.dmg = () => G.HERO.dmg * (1 + 0.25 * (Hero.lvl - 1)) * S.mods.heroDmg * S.om.heroDmg * S.om.magic;
  Hero.cdMul = () => S.mods.heroCd * S.om.heroCd;
  Hero.gainXp = function (n) {
    if (Hero.lvl >= G.HERO.xpLevels.length) return;
    Hero.xp += n;
    while (Hero.lvl < G.HERO.xpLevels.length && Hero.xp >= G.HERO.xpLevels[Hero.lvl]) {
      Hero.lvl++;
      A.play('levelup');
      FX.ring(Hero.pos, 0xfff27a, 0.2, 1.5, 0.7, Hero.m.group.position.y - 0.5);
      FX.emit(Hero.m.group.position, 30, 0xfff27a, 2, 0.8);
      FX.text(Hero.m.group.position.clone().add(V().set(0, 0.8, 0)), '露娜升级！Lv' + Hero.lvl, 'lvtxt', 1.6);
    }
  };
  Hero.update = function (dt) {
    Hero.anim += dt;
    const g = Hero.m.group;
    // 移动
    const dx = Hero.dest.x - Hero.pos.x, dz = Hero.dest.z - Hero.pos.z;
    const d = Math.hypot(dx, dz);
    const step = G.HERO.speed * dt;
    let moving = false;
    if (d > 0.02) {
      moving = true;
      const k = Math.min(1, step / d);
      Hero.pos.x += dx * k; Hero.pos.z += dz * k;
      g.rotation.y = Math.atan2(dx, dz);
    } else Hero.marker.visible = false;
    const gy = Wd.groundY(Hero.pos.x, Hero.pos.z);
    const wantY = gy + 0.75 + Math.sin(Hero.anim * 2.2) * 0.08;
    g.position.x = Hero.pos.x; g.position.z = Hero.pos.z;
    g.position.y += (wantY - g.position.y) * Math.min(1, dt * 6);
    Hero.m.body.rotation.x = moving ? 0.25 : 0;
    for (const w of Hero.m.wings) w.g.rotation.y = w.s * (0.5 + Math.sin(Hero.anim * (moving ? 22 : 12)) * 0.45);
    Hero.m.star.rotation.y += dt * 4;
    if (Math.random() < dt * (moving ? 30 : 8)) {
      FX.emit(V().set(g.position.x, g.position.y + 0.3, g.position.z), 1, Math.random() < 0.5 ? 0xbff3ff : 0xffc8f0, 0.3, 0.8, -0.2, -0.3, 0.3);
    }
    if (Hero.markerT > 0) { Hero.markerT -= dt; Hero.marker.scale.setScalar(1 + Math.sin(Hero.anim * 8) * 0.15); }
    for (const k of ['q', 'e']) if (Hero.skill[k] > 0) Hero.skill[k] -= dt;
    if (S.phase !== 'combat') return;
    // 攻击
    Hero.cd -= dt;
    if (Hero.cd <= 0) {
      let best = null, bd = G.HERO.range;
      for (const e of S.enemies) {
        if (e.dead) continue;
        const dd = hyp(e.pos.x, e.pos.z, Hero.pos.x, Hero.pos.z);
        if (dd < bd) { bd = dd; best = e; }
      }
      if (best) {
        Hero.cd = G.HERO.cd;
        const from = V(); Hero.m.star.getWorldPosition(from);
        S.projectiles.push(new Proj('star', from, best, { dmg: Hero.dmg() }));
        A.play('hero', 0.15);
        g.rotation.y = Math.atan2(best.pos.x - Hero.pos.x, best.pos.z - Hero.pos.z);
      }
    }
  };
  Hero.ready = k => Hero.skill[k] <= 0;
  // Q 星落：一场流星雨——大小不一的陨石先后落下，中心最大的一颗伤害最高
  Hero.castStarfall = function (p) {
    const sk = G.HERO.skills.q;
    if (!Hero.ready('q')) return false;
    Hero.skill.q = sk.cd * Hero.cdMul();
    A.play('star');
    const total = (sk.dmg + 40 * (Hero.lvl - 1)) * S.mods.heroDmg * S.om.heroDmg * S.om.magic;
    // 预警：地面上柔和的金色光斑
    FX.softRing(p, 0xffc860, sk.radius * 0.9, sk.radius * 1.05, 1.3, 0.07, 0.55, 'disc', 0.9);
    FX.softRing(p, 0xffd27a, sk.radius * 1.15, sk.radius * 0.95, 1.3, 0.08, 0.7);
    const rocks = [{ dx: 0, dz: 0, size: 0.4, delay: 0.25, share: 0.55, r: sk.radius * 0.75, stun: true }];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + Math.random() * 0.8, d = sk.radius * (0.35 + Math.random() * 0.5);
      rocks.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, size: 0.15 + Math.random() * 0.12, delay: Math.random() * 0.55, share: 0.18, r: 0.75 });
    }
    rocks.forEach((rk, idx) => {
      const to = V().set(p.x + rk.dx, 0.15, p.z + rk.dz);
      const from = V().set(to.x + 5 + Math.random() * 1.5, 9 + Math.random() * 2, to.z - 1.5 - Math.random());
      const m = M.meteor(rk.size, Math.random() * 10 + idx);
      m.position.copy(from);
      const rib = new FX.Ribbon(0xff8a30, rk.size * 1.6, 28);
      const spin = V().set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const dur = 1.0 + rk.size * 0.8;
      let t = -rk.delay, added = false;
      const prev = from.clone();
      FX.add(dt => {
        if (dt <= 0) return true;   // 暂停时不推进
        t += dt;
        if (t < 0) return true;
        if (!added) { G.scene.add(m); added = true; }
        const k = Math.min(1, t / dur);
        m.position.lerpVectors(from, to, Math.pow(k, 1.25));   // 略微加速落下
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
        m.userData.shell.material.opacity = 0.1 + Math.random() * 0.12;
        rib.push(m.position);
        if (Math.random() < 0.9) FX.emit(m.position, 1, Math.random() < 0.5 ? 0xffb040 : 0xff7a30, 0.3, 0.5, 0.2, -0.4, rk.size, 1.6);
        if (Math.random() < 0.35) FX.emit(m.position, 1, 0x5a4a5a, 0.2, 0.9, 0.3, -0.3, rk.size, 0.6);   // 烟尘
        prev.copy(m.position);
        if (k < 1) return true;
        // 落地
        G.scene.remove(m); rib.fade();
        A.play(rk.stun ? 'boom' : 'catapult', 0.05);
        G.shake(rk.stun ? 0.45 : 0.15);
        FX.flash(V().set(to.x, 0.35, to.z), 0xffc860, rk.r * 2.2, 0.3);
        FX.softRing(to, 0xffb040, 0.2, rk.r * 1.6, 0.6, 0.09, 0.9);
        FX.softRing(to, 0xffe0a0, 0.1, rk.r * 0.9, 0.35, 0.1, 0.8, 'disc');
        FX.emit(to, rk.stun ? 50 : 18, 0xffc860, rk.stun ? 4 : 2.6, 0.7, 1.2, 6);
        FX.emit(to, rk.stun ? 22 : 8, 0x6a5040, 2.2, 0.8, 1.4, 7, 0.2, 0.8);   // 碎石
        for (const e of S.enemies) {
          if (e.dead) continue;
          if (hyp(e.pos.x, e.pos.z, to.x, to.z) <= rk.r) { G.damage(e, total * rk.share, 'magic'); if (!e.dead && rk.stun) e.stunT = sk.stun; }
        }
        return false;
      });
    });
    return true;
  };
  // E 森之绽放：柔光波向外扩散，花瓣从地面飘起
  Hero.castBloom = function () {
    const sk = G.HERO.skills.e;
    if (!Hero.ready('e')) return false;
    Hero.skill.e = sk.cd * Hero.cdMul();
    A.play('bloom');
    const c = V().set(Hero.pos.x, Wd.groundY(Hero.pos.x, Hero.pos.z), Hero.pos.z);
    FX.softRing(c, 0xff6fb0, 0.3, sk.radius * 1.1, 1.2, c.y + 0.1, 0.55, 'ring', 1.0);
    FX.softRing(c, 0xffb0d8, 0.2, sk.radius * 0.7, 0.9, c.y + 0.12, 0.35, 'ring', 1.0);
    FX.softRing(c, 0xff7ab8, 0.5, sk.radius, 1.4, c.y + 0.08, 0.16, 'disc', 0.8);
    FX.emit(Hero.m.group.position, 30, 0xff9ccf, 2, 1, 0.5, 1);
    for (let i = 0; i < 40; i++) {   // 范围内飘起的花瓣
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sk.radius;
      FX.emit(V().set(c.x + Math.cos(a) * r, c.y + 0.1, c.z + Math.sin(a) * r), 1, Math.random() < 0.5 ? 0xffb3d6 : 0xfff0f6, 0.3, 1.4, 0.8, -0.2, 0.05, 1.3);
    }
    let n = 0;
    for (const t of S.towers) {
      if (hyp(t.pos.x, t.pos.z, Hero.pos.x, Hero.pos.z) <= sk.radius) {
        t.buff = sk.dur; n++;
        const ty = Wd.top(t.tile);
        FX.softRing(V().set(t.pos.x, 0, t.pos.z), 0xff6fb0, 0.2, 0.75, 0.8, ty + 0.06, 0.6, 'ring', 1.0);
        FX.emit(V().set(t.pos.x, ty + 0.6, t.pos.z), 12, 0xff9ccf, 1.2, 0.7);
      }
    }
    G.UI.toast(n ? `森之绽放：${n} 座塔攻速提升！` : '附近没有塔……让露娜靠近你的塔再施放', n ? 'good' : 'warn');
    return true;
  };

  // ======================= 波次 =======================
  G.startWave = function () {
    if (S.phase !== 'prep') return;
    S.wave++;
    S.phase = 'combat';
    S.waveTime = 0;
    S.undo = [];
    const groups = G.WAVES[S.wave - 1];
    const active = Wd.portals.filter(p => p.openWave <= S.wave);
    const q = [];
    for (const [type, count0, interval0, delay] of groups) {
      const boss = G.ENEMIES[type].boss;
      const count = boss ? count0 : Math.round(count0 * S.om.count);
      const interval = interval0 * count0 / Math.max(1, count);   // 数量变多时出怪更密，整组时长不变
      for (let i = 0; i < count; i++) {
        let portal;
        if (G.ENEMIES[type].boss) portal = active[0];
        else portal = active[(S.portalCounter++) % active.length];
        q.push({ t: delay + i * interval, type, portal });
      }
    }
    q.sort((a, b) => a.t - b.t);
    S.queue = q;
    S.waveTotal = q.length;
    S.boltT = S.om.bolt;
    A.play('wave');
    const omenLine = S.omens.length ? '<br>' + S.omens.map(id => { const o = G.omen(id); return o.icon + ' ' + o.name; }).join('　') : '';
    const newPortal = Wd.portals.find(p => p.openWave === S.wave && S.wave > 1);
    if (newPortal) { A.play('portal'); G.UI.banner(`${newPortal.name}已开启！`, '敌人将从两个方向进攻' + omenLine); }
    else G.UI.banner(`第 ${S.wave} 波`, groups.map(g => G.ENEMIES[g[0]].name + ' ×' + G.groupCount(g)).join('　') + omenLine);
    const boss = groups.some(g => G.ENEMIES[g[0]].boss);
    if (boss) setTimeout(() => G.UI.toast('⚠ Boss 来袭！', 'warn'), 1500);
    G.Music.setIntensity(boss ? 2 : 1);   // 配乐进入战斗版（Boss 波更激烈）
    G.OmenFX.activate();
    G.UI.refresh();
  };
  G.updateWave = function (dt) {
    S.waveTime += dt;
    while (S.queue.length && S.queue[0].t <= S.waveTime) {
      const s = S.queue.shift();
      const tile = Wd.get(s.portal.x, s.portal.y);
      S.enemies.push(new Enemy(s.type, tile));
      FX.emit(V().set(tile.wx, 0.5, tile.wz), 8, 0xb04dff, 1.2, 0.5);
    }
    if (S.om.bolt > 0) {   // 雷暴：定时落雷
      S.boltT -= dt;
      if (S.boltT <= 0) {
        const alive = S.enemies.filter(e => !e.dead);
        if (alive.length) { G.lightning(alive[Math.floor(Math.random() * alive.length)]); S.boltT = S.om.bolt; }
      }
    }
    if (!S.queue.length && !S.enemies.some(e => !e.dead)) G.waveCleared();
  };
  G.waveCleared = function () {
    const crystals = Wd.tiles.filter(t => t.type === 'crystal' && !t.locked).length;
    const bonus = 20 + 4 * S.wave + crystals * 15;
    const ley = CFG.LEY_PER_WAVE + S.mods.leyBonus + crystals * 2;
    S.gold += bonus; S.ley += ley;
    const drawn = G.drawPieces(CFG.DRAW_PER_WAVE);
    if (S.wave % CFG.EXPAND_EVERY === 0 && S.wave < G.WAVES.length) { S.expandTokens++; S.offers = null; }
    A.play('clear');
    G.Music.setIntensity(0);
    for (const p of S.projectiles) p.remove();
    S.projectiles = [];
    if (S.wave >= G.WAVES.length) { G.endGame(true); return; }
    S.phase = 'blessing';
    G.UI.toast(`第 ${S.wave} 波完成！+${bonus} 金叶　+${ley} 地脉能量　+${drawn} 张地形块`, 'good');
    G.UI.showBlessings(G.pickBlessings());
  };
  G.pickBlessings = function () {
    const pool = G.BLESSINGS.filter(b => b.repeat || !S.taken.has(b.id));
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  };
  G.chooseBlessing = function (b) {
    b.apply(S);
    if (!b.repeat) S.taken.add(b.id);
    A.play('bless');
    S.phase = 'prep';
    G.rollOmens(S.wave + 1);
    Wd.recompute();
    if (S.expandTokens > 0) setTimeout(() => G.UI.toast(`🗺 获得区域扩张机会（${S.expandTokens}）——点击右上角「区域扩张」`, 'good'), 600);
    const portalNews = S.wave + 1 === CFG.PORTAL_B_WAVE;
    if (S.omens.length) setTimeout(() => { if (S.phase !== 'prep') return; G.OmenFX.reveal(S.seenOmen ? '天象降临' : '天象初现', `第 ${S.wave + 1} 波`); S.seenOmen = true; }, portalNews ? 3000 : 350);
    if (portalNews) {
      const p = Wd.portals[1];
      G.UI.banner(`${p.name}正在苏醒……`, '下一波开始，敌人会从两个方向进攻。紫色虚线是它们的路线');
    }
    G.UI.refresh();
  };

  // ======================= 天象（整波的全场效果） =======================
  G.omen = id => G.OMENS.find(o => o.id === id);
  G.groupCount = g => G.ENEMIES[g[0]].boss ? g[1] : Math.round(g[1] * S.om.count);
  G.applyOmens = function () {
    const om = S.om = Object.assign({}, G.OMEN_DEFAULT);
    for (const id of S.omens) {
      const fx = G.omen(id).fx;
      for (const k in fx) {
        if (k === 'noArmor') om.noArmor = om.noArmor || fx.noArmor;
        else if (k === 'armor' || k === 'shieldPct' || k === 'regen') om[k] += fx[k];
        else if (k === 'bolt') om.bolt = om.bolt ? Math.min(om.bolt, fx.bolt) : fx.bolt;
        else om[k] *= fx[k];
      }
    }
  };
  // 第 1~2 波风平浪静；3~8 波一个天象（凶兆 50% / 吉兆 30% / 异象 20%）；
  // 9 波起必有一个凶兆，另加一个吉兆（60%）或异象（40%）。不会连续两波出现同一个天象
  G.rollOmens = function (n) {
    const pick = kind => {
      const fresh = o => o.kind === kind && !S.omens.includes(o.id);
      const pool = G.OMENS.filter(o => fresh(o) && !S.lastOmens.includes(o.id));
      const list = pool.length ? pool : G.OMENS.filter(fresh);
      S.omens.push(list[Math.floor(Math.random() * list.length)].id);
    };
    S.lastOmens = S.omens;
    S.omens = []; S.purged = false;
    if (n >= 3 && n <= 8) { const r = Math.random(); pick(r < 0.5 ? 'curse' : r < 0.8 ? 'boon' : 'twist'); }
    else if (n >= 9) { pick('curse'); pick(Math.random() < 0.6 ? 'boon' : 'twist'); }
    G.applyOmens();
  };
  // 落雷（G.lightning）的实现在 omenfx.js
  // 用地脉能量驱散一个凶兆（每波一次）
  G.purgeOmen = function (id) {
    if (S.phase !== 'prep') return fail('只能在备战阶段驱散');
    const o = G.omen(id);
    if (!o || o.kind !== 'curse' || !S.omens.includes(id)) return false;
    if (S.purged) return fail('每波只能驱散一次凶兆');
    if (S.ley < G.PURGE_COST) return fail('地脉能量不足');
    S.ley -= G.PURGE_COST;
    S.omens = S.omens.filter(x => x !== id);
    S.purged = true;
    G.applyOmens();
    A.play('bless');
    const h = Wd.heartObj.group.position;
    FX.softRing(V().set(h.x, 0, h.z), 0x9ff4ff, 0.3, 4, 1.2, 0.1, 0.6);
    FX.emit(V().set(h.x, 1.5, h.z), 40, 0x9ff4ff, 2.5, 0.9);
    G.UI.toast(`古树的光辉驱散了「${o.name}」`, 'good');
    G.UI.refresh();
    return true;
  };
  G.endGame = function (win) {
    if (S.phase === 'over' || S.phase === 'win') return;
    S.phase = win ? 'win' : 'over';
    G.Music.setIntensity(0);
    A.play(win ? 'clear' : 'lose');
    G.UI.showEnd(win);
  };

  // ======================= 玩家操作 =======================
  const act = G.act = {};
  const dust = (t, col) => {
    FX.emit(V().set(t.wx, Wd.top(t) + 0.05, t.wz), 14, col, 1.6, 0.5, 0.8, 4, 0.8);
  };
  act.raise = function (t, silentErr) {
    if (S.phase !== 'prep') return fail('只能在备战阶段改变地形', silentErr);
    const err = Wd.canRaise(t);
    if (err) return fail(err, silentErr);
    if (S.ley < 1) return fail('地脉能量不足', silentErr);
    S.ley--;
    Wd.setHeight(t, t.h + 1);
    S.undo.push({ k: 'raise', t });
    Wd.recompute();
    dust(t, 0xc9a07a);
    A.play('raise', 0.06);
    G.UI.refresh();
    return true;
  };
  act.lower = function (t, silentErr) {
    if (S.phase !== 'prep') return fail('只能在备战阶段改变地形', silentErr);
    const err = Wd.canLower(t);
    if (err) return fail(err, silentErr);
    if (S.ley < 1) return fail('地脉能量不足', silentErr);
    S.ley--;
    Wd.setHeight(t, t.h - 1);
    S.undo.push({ k: 'lower', t });
    Wd.recompute();
    dust(t, 0x9a7350);
    A.play('lower', 0.06);
    G.UI.refresh();
    return true;
  };
  act.canBuild = function (type, t) {
    if (!t) return '无效位置';
    if (t.locked) return '这里还没有开拓';
    if (t.tower) return '这里已经有塔了';
    if (t.type !== 'grass' && t.type !== 'rock') return '这里不能建塔';
    if (t.h < 1) return '塔只能建在高地上（先用地形块把地抬高）';
    if (S.gold < G.towerCost(type, 0)) return '金叶不足';
    return null;
  };
  act.build = function (type, t) {
    if (S.phase === 'over' || S.phase === 'win') return false;
    const err = act.canBuild(type, t);
    if (err) return fail(err);
    S.gold -= G.towerCost(type, 0);
    const tw = new Tower(type, t);
    S.towers.push(tw);
    S.stats.built++;
    if (S.phase === 'prep') S.undo.push({ k: 'build', tower: tw });
    G.Terrain.updateDecor();
    A.play('build');
    dust(t, 0xfff1c0);
    G.UI.refresh();
    return tw;
  };
  act.upgrade = function (tw) {
    if (tw.level >= 2) return fail('已经满级');
    const c = G.towerCost(tw.type, tw.level + 1);
    if (S.gold < c) return fail('金叶不足');
    S.gold -= c; tw.invested += c; tw.level++;
    tw.rebuild();
    tw.pop = 0.3;
    S.undo = S.undo.filter(u => u.tower !== tw);
    A.play('levelup');
    FX.emit(V().set(tw.pos.x, Wd.top(tw.tile) + 0.6, tw.pos.z), 30, 0xffe27a, 2, 0.8);
    FX.ring(V().set(tw.pos.x, 0, tw.pos.z), 0xffe27a, 0.2, 1, 0.5, Wd.top(tw.tile) + 0.05);
    G.UI.refresh();
    return true;
  };
  act.sell = function (tw, refundAll) {
    const v = refundAll ? tw.invested : Math.floor(tw.invested * S.mods.sell);
    S.gold += v;
    tw.remove();
    S.towers.splice(S.towers.indexOf(tw), 1);
    G.Terrain.updateDecor();
    S.undo = S.undo.filter(u => u.tower !== tw);
    if (S.selected === tw) S.selected = null;
    if (!refundAll) { FX.text(V().set(tw.pos.x, Wd.top(tw.tile) + 0.6, tw.pos.z), '+' + v, 'goldtxt'); A.play('coin'); }
    dust(tw.tile, 0xc9a07a);
    G.UI.refresh();
  };
  act.undo = function () {
    if (S.phase !== 'prep') return fail('只能撤销本次备战阶段的操作');
    const u = S.undo.pop();
    if (!u) return fail('没有可以撤销的操作');
    if (u.k === 'build') { act.sell(u.tower, true); A.play('lower'); return true; }
    if (u.k === 'piece') {
      for (const [t, h] of u.prev) Wd.setHeight(t, h);
      S.hand.splice(Math.min(u.idx, S.hand.length), 0, u.id);
      Wd.recompute(); A.play('lower'); G.UI.refresh();
      return true;
    }
    if (u.k === 'raise') {
      if (u.t.tower && u.t.h === 1) { S.undo.push(u); return fail('先出售这里的塔才能撤销'); }
      Wd.setHeight(u.t, u.t.h - 1);
    } else {
      Wd.setHeight(u.t, u.t.h + 1);
    }
    S.ley++;
    Wd.recompute();
    A.play('lower');
    G.UI.refresh();
    return true;
  };
  // ---------- 地形手牌 ----------
  const pickWeighted = (obj) => {
    const keys = Object.keys(obj);
    let r = Math.random() * keys.reduce((a, k) => a + obj[k].w, 0);
    for (const k of keys) if ((r -= obj[k].w) <= 0) return k;
    return keys[0];
  };
  G.drawPieces = function (n) {
    let k = 0;
    while (k < n && S.hand.length < CFG.HAND_MAX) { S.hand.push(pickWeighted(G.PIECES)); k++; }
    return k;
  };
  G.startRun = function () {
    S.expandTokens = 1;   // 开局送一次区域扩张
    S.hand = ['sq', 'tri', 'ell3'];
    S.omens = []; S.lastOmens = [];
    G.rollOmens(1);
    G.drawPieces(CFG.HAND_START - S.hand.length);
  };
  // 形状旋转后的格子（以悬停的格子为中心）
  G.pieceCells = function (id, rot, ax, ay) {
    let cells = G.PIECES[id].cells.map(c => c.slice());
    for (let r = 0; r < rot; r++) cells = cells.map(([x, y]) => [-y, x]);
    const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
    cells = cells.map(([x, y]) => [x - mx, y - my]);
    const cx = Math.floor(Math.max(...cells.map(c => c[0])) / 2), cy = Math.floor(Math.max(...cells.map(c => c[1])) / 2);
    return cells.map(([x, y]) => [ax + x - cx, ay + y - cy]);
  };
  act.placePiece = function (idx, anchor, rot) {
    if (S.phase !== 'prep') return fail('只能在备战阶段改变地形');
    const id = S.hand[idx];
    if (!id || !anchor) return false;
    const piece = G.PIECES[id];
    const { err, tiles } = Wd.checkPiece(G.pieceCells(id, rot, anchor.x, anchor.y), piece);
    if (err) return fail(err);
    const prev = tiles.map(t => [t, t.h]);
    for (const t of tiles) Wd.setHeight(t, piece.dig ? t.h - 1 : t.h + (piece.raise || 1));
    S.hand.splice(idx, 1);
    S.undo.push({ k: 'piece', id, idx, prev });
    Wd.recompute();
    for (const t of tiles) dust(t, piece.dig ? 0x9a7350 : 0xc9a07a);
    A.play(piece.dig ? 'lower' : 'raise');
    G.shake(0.12);
    G.UI.refresh();
    return true;
  };
  act.rerollHand = function () {
    if (S.phase !== 'prep') return fail('只能在备战阶段重抽');
    if (S.ley < CFG.REROLL_COST) return fail('地脉能量不足');
    const n = S.hand.length || 2;
    S.ley -= CFG.REROLL_COST;
    S.hand = [];
    G.drawPieces(n);
    S.undo = S.undo.filter(u => u.k !== 'piece');
    A.play('bless');
    G.UI.refresh();
    return true;
  };

  // ---------- 区域扩张 ----------
  G.regionOffers = function () {
    if (!S.offers) {
      const ids = Object.keys(G.REGIONS);
      const pick = [];
      while (pick.length < 3) { const id = ids[Math.floor(Math.random() * ids.length)]; if (!pick.includes(id) || pick.length >= ids.length) pick.push(id); }
      const rng = Wd.rngFrom(Math.floor(Math.random() * 1e9));
      S.offers = pick.map(id => ({ id, cells: Wd.makeRegion(id, rng) }));
    }
    return S.offers;
  };
  act.rerollRegions = function () {
    if (S.ley < CFG.REROLL_COST) return fail('地脉能量不足');
    S.ley -= CFG.REROLL_COST;
    S.offers = null;
    G.regionOffers();
    A.play('bless');
    G.UI.refresh();
    return true;
  };
  act.expand = function (offerIdx, rx, ry, rot) {
    if (S.phase !== 'prep') return fail('只能在备战阶段扩张');
    if (S.expandTokens < 1) return fail('没有扩张机会');
    const offer = G.regionOffers()[offerIdx];
    const cells = Wd.rotateCells(offer.cells, rot);
    const err = Wd.checkExpand(rx, ry, cells);
    if (err) return fail(err);
    const moved = Wd.expand(rx, ry, cells);
    S.expandTokens--;
    S.offers = null;
    S.undo = [];
    if (offer.id === 'lake') { S.lives += 3; G.UI.toast('水源滋养了古树：生命 +3', 'good'); }
    if (offer.id === 'crystal') G.UI.toast('发现地脉水晶：之后每波 +2 地脉能量、+15 金叶', 'good');
    for (const p of moved) G.UI.toast(`${p.name}后退了！敌人路线变长`, 'good');
    const cx = Wd.wx(rx * CFG.RS) + CFG.RS / 2 - 0.5, cz = Wd.wz(ry * CFG.RS) + CFG.RS / 2 - 0.5;
    FX.ring(V().set(cx, 0, cz), 0x7ff0ff, 0.5, 3.5, 0.8, 0.1);
    FX.emit(V().set(cx, 0.3, cz), 50, 0x9ff4ff, 3, 0.9, 1, 3, 2.5);
    A.play('levelup'); G.shake(0.3);
    G.camFit();
    G.UI.refresh();
    return true;
  };

  function fail(msg, silent) {
    if (!silent) { G.UI.toast(msg, 'warn'); A.play('error', 0.2); }
    return false;
  }

  // ======================= 每帧 =======================
  G.update = function (dt) {
    S.time += dt;
    if (S.phase === 'combat') G.updateWave(dt);
    for (const e of S.enemies) if (!e.dead) e.update(dt);
    S.enemies = S.enemies.filter(e => !e.dead);
    for (const t of S.towers) t.update(dt);
    S.projectiles = S.projectiles.filter(p => p.update(dt));
    Hero.update(dt);
  };
})();
