'use strict';
// 无尽模式「永夜守望」：整张地图一开始就全部开拓，按“轮”持续出兵、没有尽头。
//   · 一轮出完后倒数几秒，下一轮直接接上（场上的敌人不会清空）
//   · 每 5 轮是 Boss 轮：打完并清场后进入休整（改地形、选祝福、抽天象），按空格继续
//   · 生命 / 数量 / Boss 强度逐轮上涨；第 8 轮起出现精英怪
//   · 记录每张地图坚持到的最高轮数
(function () {
  const En = G.Endless = {};
  const S = G.S;
  const REST_EVERY = 5;
  En.REST_EVERY = REST_EVERY;
  En.GAP = 6;                 // 一轮出完到下一轮开始的间隔（秒）
  En.START = { gold: 400, ley: 16 };

  // 每轮生命倍率：沿用守护模式的曲线，但不封顶（第 r 轮约等于原来 15 波制的第 1 + 0.9(r-1) 波）
  En.hpMul = r => { const o = (r - 1) * 0.9; return 1 + 0.13 * o + 0.014 * o * o; };
  En.goldMul = r => 1 + 0.04 * (r - 1) * 0.9;
  En.countMul = r => 1 + 0.035 * (r - 1);                     // 数量也逐轮增加
  En.bossMul = r => 1 + 0.3 * (Math.ceil(r / REST_EVERY) - 1); // 每过一次休整，Boss 更厚
  En.eliteChance = r => r < 8 ? 0 : Math.min(0.2, 0.02 + 0.008 * (r - 8));
  En.isRest = r => r % REST_EVERY === 0;

  // 每个 Boss 轮的 Boss；第 30 轮以后从池子里随机抽 3 个
  const BOSS_ROUNDS = [['golem'], ['ogre', 'golem'], ['lich'], ['golem', 'ogre'], ['lich', 'golem'], ['troll']];
  const BOSS_POOL = ['golem', 'ogre', 'lich', 'golem', 'lich'];

  // 第 r 轮的出兵：2 段进攻（从难度相近的段落里随机挑），Boss 轮在中段加入 Boss。结果按轮缓存，备战面板的预告与实际一致
  En.groups = function (r) {
    S.roundCache = S.roundCache || {};
    if (S.roundCache[r]) return S.roundCache[r];
    const segs = G.WAVE_SEGMENTS, C = G.CFG;
    const top = Math.min(segs.length - 1, Math.floor((r - 1) * 0.8));
    const k = En.countMul(r);
    const groups = [];
    let t0 = 0;
    for (let j = 0; j < 2; j++) {
      const idx = Math.max(0, top - Math.floor(Math.random() * Math.min(4, top + 1)));
      const seg = segs[idx].filter(g => !G.ENEMIES[g[0]].boss);
      let end = 0;
      for (const [type, c, iv, d] of seg) {
        groups.push([type, c * k, iv, d + t0]);
        end = Math.max(end, d + (c * C.COUNT_MUL * (G.ENEMIES[type].countMul || 1) - 1) * iv * C.INTERVAL_MUL);
      }
      t0 += end + G.SEGMENT_GAP;
    }
    if (En.isRest(r)) {
      const n = r / REST_EVERY;
      const list = n <= BOSS_ROUNDS.length ? BOSS_ROUNDS[n - 1] : [0, 1, 2].map(() => BOSS_POOL[Math.floor(Math.random() * BOSS_POOL.length)]);
      list.forEach((type, i) => groups.push([type, 1, 1, Math.round(t0 * (0.3 + 0.4 * i / Math.max(1, list.length - 1)))]));
    }
    S.roundCache[r] = groups;
    return groups;
  };

  // 天象：第一段风平浪静；之后每段一个，第 3 段起两个（一个凶兆 + 吉兆/异象）
  En.rollOmens = function (block) {
    G.rollOmens(block <= 1 ? 1 : block === 2 ? 3 : 9);
  };

  // 开局：满图、更多金叶与地脉、没有区域扩张
  En.setupRun = function () {
    S.endless = true;
    S.gold = En.START.gold; S.ley = En.START.ley;
    S.expandTokens = 0;
    S.nextRoundT = 0; S.roundCache = {};
    G.drawPieces(G.CFG.HAND_MAX - S.hand.length);
  };

  // 一轮出完：倒数后开始下一轮（Boss 轮之后则等清场进入休整）
  En.update = function (dt) {
    if (S.queue.length || En.isRest(S.wave)) return false;
    if (S.nextRoundT <= 0) S.nextRoundT = S.enemies.some(e => !e.dead) ? En.GAP : 2;
    S.nextRoundT -= dt;
    if (S.nextRoundT <= 0) { S.nextRoundT = 0; En.nextRound(); }
    return true;   // 告诉 updateWave：不要结算波次
  };
  En.nextRound = function () {
    // 上一轮的奖励
    const bonus = 15 + 5 * S.wave;
    S.gold += bonus;
    G.UI.toast(`第 ${S.wave} 轮结束　+${bonus} 金叶`, 'good');
    S.wave++;
    S.waveTime = 0;
    const q = G.queueGroups(En.groups(S.wave));
    S.queue = q; S.waveTotal = q.length;
    const boss = En.isRest(S.wave);
    const newPortal = G.World.portals.find(p => p.openWave === S.wave);
    if (newPortal) { G.Audio.play('portal'); G.UI.banner(`${newPortal.name}已开启！`, '敌人将从两个方向进攻'); }
    else G.UI.banner(`第 ${S.wave} 轮`, boss ? '⚠ Boss 轮：击败它们后可以休整' : G.waveSummary(En.groups(S.wave)).map(([t, n]) => G.ENEMIES[t].name + ' ×' + n).join('　'));
    if (boss) setTimeout(() => G.UI.toast('⚠ Boss 来袭！', 'warn'), 1500);
    G.Audio.play('wave');
    G.Music.setIntensity(boss ? 2 : 1);
    G.UI.refresh();
  };

  // 休整：比守护模式的波次奖励更丰厚（相当于 5 轮的量）
  En.restRewards = function () {
    const crystals = G.World.tiles.filter(t => t.type === 'crystal').length;
    const bonus = 60 + 12 * S.wave + crystals * 40;
    const ley = 6 + S.mods.leyBonus + crystals * 3;
    S.gold += bonus; S.ley += ley;
    const drawn = G.drawPieces(4);
    return { bonus, ley, drawn };
  };

  // ---------- 纪录 ----------
  const KEY = 'starleaf.endlessBest';
  En.best = function (biome) {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}')[biome || G.biome] || null; } catch (e) { return null; }
  };
  En.saveBest = function () {
    const old = En.best();
    const rec = { round: S.wave, kills: S.stats.kills };
    const better = !old || rec.round > old.round || (rec.round === old.round && rec.kills > old.kills);
    if (better) {
      try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[G.biome] = rec; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 忽略 */ }
    }
    return { old, better };
  };
})();
