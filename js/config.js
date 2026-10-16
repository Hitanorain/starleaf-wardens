'use strict';
// 星叶守望 —— 全局配置与数据表
window.G = window.G || {};

G.CFG = {
  RS: 4, RX: 7, RY: 5,   // 区域：每块 4×4 格，整个世界 7×5 块
  W: 28, H: 20,          // 世界格数（= RS × RX/RY）
  START_REGIONS: [2, 4, 1, 3],   // 开局已开拓的区域范围 [rx0, rx1, ry0, ry1]（中央 3×3 块）
  STEP: 0.42,            // 每级地势的世界高度
  BASE: 0.35,            // 地面板厚度
  MAX_H: 3,              // 最高地势
  START_GOLD: 230,
  START_LEY: 8,
  LEY_PER_WAVE: 4,
  HAND_MAX: 6,           // 地形手牌上限
  HAND_START: 4,         // 开局手牌
  DRAW_PER_WAVE: 3,      // 每波结束抽几张
  REROLL_COST: 2,        // 重抽手牌 / 重刷区域的地脉能量花费
  EXPAND_EVERY: 2,       // 每隔几波获得一次区域扩张
  START_LIVES: 20,
  // 地势加成（下标 = 地势等级；塔只能建在 1 级以上，1 级为基准）
  HEIGHT_RANGE: [1, 1, 1.2, 1.4],
  HEIGHT_DMG:   [1, 1, 1.15, 1.3],
  PORTAL_B_WAVE: 4,      // 第二个传送门开启的波次
  FLY_Y: 1.5,
  SELL_RATE: 0.7,
  // 兵量：每组普通敌人数量 ×3（特殊兵种可用 countMul 再乘一个系数，例如投石地精只 ×1.5）；为了平衡，单个敌人的生命与金叶相应降低，出怪间隔变密
  COUNT_MUL: 3, ENEMY_HP: 0.5, ENEMY_GOLD: 0.5, INTERVAL_MUL: 0.45,
  TOWER_HEAL: 0.35,
  SLOW_CAP: 4,           // 敌人被连续减速超过这么多秒就会挣脱
  SLOW_IMMUNE: 1.5,      // 挣脱后这么多秒内不吃减速
  CONFUSE_IMMUNE: 2,     // 混乱结束后的免疫时间
  CONFUSE_MAX: 2,        // 每个敌人一生最多被迷惑几次（同一株迷魂花只生效一次）
  CONFUSE_SPEED: 0.6,    // 混乱时往回走的速度倍率      // 每波结束，塔自动恢复 35% 最大生命
  REPAIR_RATE: 0.6,      // 修理费用：缺失生命比例 × 已投入金叶 × 0.6
};

// 星核坠击：用金叶在局中召唤的毁灭性星核。价格每用一次上涨，有冷却
G.NUKE = { name: '星核坠击', icon: '☄️', key: 'G', cost: 260, costUp: 120, cd: 40, radius: 3.4, delay: 1.6,
  dmg: w => 700 + 70 * w, bossMul: 0.5,
  desc: '从星空召唤一颗燃烧的星核，砸向目标区域：对范围内所有敌人（包括飞行单位）造成巨额魔法伤害并击退、眩晕。对 Boss 伤害减半。' };

// 每波怪物生命倍率（Boss 不吃这个倍率）
// 10 波走完原来 15 波的成长曲线：第 w 波相当于原来的第 1 + (w-1)×14/9 波
G.oldWave = w => 1 + (w - 1) * 14 / 9;
G.hpMul = w => { const o = G.oldWave(w) - 1; return 1 + 0.13 * o + 0.014 * o * o; };
G.goldMul = w => 1 + 0.04 * (G.oldWave(w) - 1);

G.TOWERS = {
  archer: {
    name: '精灵弓手塔', key: '1', icon: '🏹', dmgType: 'phys', air: true,
    desc: '精灵射手连续放箭，单体物理伤害，可以攻击飞行单位。',
    levels: [
      { hp: 110, armor: 0.1, cost: 50,  dmg: 9,  cd: 0.62, range: 3.2 },
      { hp: 150, armor: 0.15, cost: 60,  dmg: 15, cd: 0.52, range: 3.4 },
      { hp: 200, armor: 0.2, cost: 110, dmg: 22, cd: 0.44, range: 3.6, multi: 2, note: '一次射出 2 支箭' },
    ],
  },
  obelisk: {
    name: '星辉方尖碑', key: '2', icon: '🔮', dmgType: 'magic', air: true,
    desc: '凝聚星光的魔法弹，无视护甲，对护盾造成双倍伤害，可以攻击飞行单位。',
    levels: [
      { hp: 130, armor: 0.15, cost: 80,  dmg: 26, cd: 1.3, range: 3.0 },
      { hp: 180, armor: 0.2, cost: 90,  dmg: 46, cd: 1.2, range: 3.2 },
      { hp: 240, armor: 0.25, cost: 150, dmg: 72, cd: 1.1, range: 3.4, chain: 2, note: '星光会弹射 2 个额外目标' },
    ],
  },
  catapult: {
    name: '水晶投石机', key: '3', icon: '💎', dmgType: 'phys', air: false,
    desc: '远程抛射魔晶，落地爆炸造成范围物理伤害。不能攻击飞行单位，脚下有盲区。',
    levels: [
      { hp: 140, armor: 0.2, cost: 110, dmg: 40,  cd: 2.4, range: 4.2, splash: 1.1, minRange: 1.2 },
      { hp: 190, armor: 0.25, cost: 120, dmg: 70,  cd: 2.2, range: 4.4, splash: 1.2, minRange: 1.2 },
      { hp: 250, armor: 0.3, cost: 180, dmg: 110, cd: 2.0, range: 4.6, splash: 1.5, minRange: 1.2, note: '爆炸范围更大' },
    ],
  },
  chime: {
    name: '霜铃塔', key: '4', icon: '🔔', dmgType: 'magic', air: true, pulse: true, frost: true,
    desc: '水晶拱门下悬着一口冰铃，每次摇响都放出一圈寒霜涟漪：范围内所有敌人（包括飞行单位）大幅减速，并受到少量魔法伤害。',
    levels: [
      { hp: 120, armor: 0.1,  cost: 70,  dmg: 4,  cd: 1.3, range: 2.3, slow: 0.4,  slowT: 2.0 },
      { hp: 170, armor: 0.15, cost: 80,  dmg: 8,  cd: 1.2, range: 2.6, slow: 0.5,  slowT: 2.2 },
      { hp: 230, armor: 0.2,  cost: 130, dmg: 14, cd: 1.1, range: 2.9, slow: 0.6,  slowT: 2.5, brittle: 0.2, note: '寒蚀：被冻伤的敌人护甲 -20%' },
    ],
  },
  frost: {
    name: '凛冬尖碑', key: '5', icon: '🧊', dmgType: 'magic', air: false,
    desc: '投出冰枪，把命中的敌人冻成冰块，一段时间内无法移动。Boss 只会被冻住很短的时间；刚解冻的敌人短时间内不会再被冻住。',
    levels: [
      { hp: 130, armor: 0.15, cost: 100, dmg: 18, cd: 2.6, range: 3.0, freeze: 1.1 },
      { hp: 180, armor: 0.2,  cost: 110, dmg: 32, cd: 2.4, range: 3.2, freeze: 1.5 },
      { hp: 240, armor: 0.25, cost: 170, dmg: 50, cd: 2.2, range: 3.4, freeze: 1.9, freezeAoe: 1.0, note: '冰爆：同时冻住周围 1 格内的敌人' },
    ],
  },
  // ---------- 地面陷阱：只能放在平地上（可以直接放在敌人路线上，不挡路），只影响地面敌人 ----------
  thorn: {
    name: '荆棘丛', key: '6', icon: '🌿', dmgType: 'magic', air: false, ground: true, trap: 'thorn',
    desc: '种在平地上的尖刺荆棘。敌人踩进范围就会被持续刺伤（没有冷却，按每秒伤害计算），可以直接种在敌人路线上。',
    levels: [
      { hp: 150, armor: 0.2,  cost: 60,  dmg: 12, cd: 1, range: 0.8 },
      { hp: 210, armor: 0.25, cost: 70,  dmg: 22, cd: 1, range: 0.9 },
      { hp: 290, armor: 0.3,  cost: 120, dmg: 36, cd: 1, range: 1.05, note: '荆棘蔓延得更远' },
    ],
  },
  mire: {
    name: '泥沼藤网', key: '7', icon: '🫧', dmgType: 'magic', air: false, ground: true, trap: 'mire',
    desc: '黏稠的泥沼与缠人的藤网：踩进去的地面敌人大幅减速，离开后减速还会持续一会儿。注意：敌人被连续减速太久会挣脱。',
    levels: [
      { hp: 140, armor: 0.15, cost: 50,  dmg: 0, cd: 1, range: 1.0, slow: 0.45, slowT: 1.8 },
      { hp: 190, armor: 0.2,  cost: 60,  dmg: 0, cd: 1, range: 1.2, slow: 0.55, slowT: 2.2 },
      { hp: 260, armor: 0.25, cost: 100, dmg: 6, cd: 1, range: 1.4, slow: 0.65, slowT: 2.6, note: '腐蚀泥浆：每秒造成少量伤害' },
    ],
  },
  lure: {
    name: '迷魂花阵', key: '8', icon: '🌸', dmgType: 'magic', air: false, ground: true, trap: 'lure',
    desc: '巨大的迷魂花。敌人靠近时喷出花粉，让附近几个地面敌人陷入混乱、慢慢掉头往回走；之后需要冷却。同一株花对同一个敌人只生效一次，每个敌人最多被迷惑 2 次；Boss 不受影响。',
    levels: [
      { hp: 130, armor: 0.1,  cost: 80,  dmg: 0, cd: 6.0, range: 1.3, confuse: 2.0, targets: 2 },
      { hp: 180, armor: 0.15, cost: 90,  dmg: 0, cd: 5.5, range: 1.5, confuse: 2.5, targets: 3 },
      { hp: 240, armor: 0.2,  cost: 140, dmg: 0, cd: 5.0, range: 1.7, confuse: 3.0, targets: 5, note: '一次迷惑 5 个敌人' },
    ],
  },
};

G.ENEMIES = {
  goblin:   { name: '哥布林',     icon: '👺', hp: 40,   speed: 1.5,  gold: 3,   armor: 0,    leak: 1, scale: 1,
              desc: '数量众多的小喽啰。' },
  wolf:     { name: '腐化狼',     icon: '🐺', hp: 30,   speed: 2.4,  gold: 3,   armor: 0,    leak: 1, scale: 1,
              desc: '速度极快，成群出没。荆棘藤可以有效减速。' },
  orc:      { name: '兽人蛮兵',   icon: '👹', hp: 170,  speed: 0.85, gold: 9,   armor: 0.4,  leak: 2, scale: 1,
              desc: '护甲 40%：物理伤害降低 40%。用方尖碑、荆棘或露娜的魔法伤害对付。' },
  skeleton: { name: '骷髅盾卫',   icon: '💀', hp: 70,   speed: 1.1,  gold: 7,   armor: 0,    leak: 2, scale: 1, shield: 90,
              desc: '护盾：先吸收伤害，魔法伤害对护盾 ×2。' },
  bat:      { name: '暗影蝙蝠',   icon: '🦇', hp: 35,   speed: 1.7,  gold: 4,   armor: 0,    leak: 1, scale: 1, fly: true, countMul: 0.5,
              desc: '飞行：无视地形直线飞向古树。只有弓手塔、方尖碑和露娜能攻击。' },
  ogre:     { name: '食人魔督军', icon: '👿', hp: 3200, speed: 0.6,  gold: 80,  armor: 0.3,  leak: 6, scale: 1.3, boss: true,
              desc: 'Boss：血量很高，护甲 30%。' },
  slinger:  { name: '投石地精',   icon: '🪨', hp: 60,   speed: 1.2,  gold: 5,   armor: 0,    leak: 1, scale: 1,
              sling: { range: 2.3, every: 3.0, dmg: 7 }, countMul: 0.5,
              desc: '边走边向附近的塔投掷石块，会损坏防御塔。优先消灭它们，或者把塔建在离路远一点的地方。' },
  shaman:   { name: '迷雾萨满',   icon: '🌫️', hp: 110,  speed: 1.0,  gold: 7,   armor: 0.1,  leak: 2, scale: 1,
              fogAura: { range: 2.2, rate: 0.6 }, countMul: 0.5,
              desc: '身边笼罩着紫色迷雾：附近的塔攻击速度 -40%。' },
  wisp:     { name: '噤声精怪',   icon: '👁️', hp: 70,   speed: 1.45, gold: 7,   armor: 0,    leak: 1, scale: 1, fly: true,
              silence: { range: 2.8, every: 4.5, dur: 2.6 }, countMul: 0.5,
              desc: '飞行。每隔几秒用暗影锁链封住附近的一座塔，使它暂时无法攻击。只有能对空的塔与露娜能打到它。' },
  golem:    { name: '熔岩巨像',   icon: '🌋', hp: 4600, speed: 0.45, gold: 90,  armor: 0.35, leak: 8, scale: 1.45, boss: true,
              slam: { range: 2.2, every: 7, dmg: 32, stun: 1.5 },
              desc: 'Boss：岩石与熔岩构成的巨人，护甲 35%。每隔几秒重踏地面，砸伤并震晕附近的塔。' },
  lich:     { name: '亡灵巫王',   icon: '☠️', hp: 5200, speed: 0.55, gold: 110, armor: 0.2,  leak: 10, scale: 1.4, boss: true, shield: 900,
              summon: { type: 'skeleton', every: 5, count: 3 },
              desc: 'Boss：被魔法护盾包裹的巫王，不断从地下召唤骷髅盾卫。先用魔法伤害击破护盾。' },
  troll:    { name: '腐化巨魔王', icon: '👑', hp: 19000, speed: 0.5, gold: 200, armor: 0.3,  leak: 99, scale: 1.7, boss: true,
              regen: 20, summon: { type: 'goblin', every: 6, count: 3 },
              desc: '最终 Boss：每秒回复生命，并不断召唤哥布林。放过它就失败。' },
};

// 进攻段落（原来的 15 波）：每组 [类型, 基础数量, 间隔秒, 开始延迟秒]。
// 真正的波次由下面的 buildWaves() 把 3 段串成一波，共 10 波——每波大约是一段的 3 倍长
G.WAVE_SEGMENTS = [
  [['goblin', 14, 0.75, 0]],
  [['goblin', 16, 0.6, 0], ['wolf', 6, 0.6, 8]],
  [['wolf', 12, 0.5, 0], ['goblin', 12, 0.6, 4], ['slinger', 4, 1.2, 8]],
  [['goblin', 14, 0.55, 0], ['orc', 5, 1.8, 3], ['shaman', 2, 3, 6]],
  [['goblin', 12, 0.6, 0], ['bat', 12, 0.7, 4], ['wolf', 8, 0.5, 10], ['slinger', 5, 1.2, 6]],
  [['skeleton', 9, 1.2, 0], ['wolf', 14, 0.45, 3], ['wisp', 3, 2.5, 6], ['goblin', 10, 0.5, 8]],
  [['goblin', 20, 0.4, 0], ['orc', 8, 1.4, 4], ['slinger', 6, 1.0, 6], ['golem', 1, 1, 9]],
  [['bat', 18, 0.45, 0], ['skeleton', 10, 1.0, 2], ['wisp', 5, 2, 5], ['shaman', 3, 2.5, 8]],
  [['wolf', 28, 0.3, 0], ['orc', 9, 1.2, 5], ['bat', 9, 0.6, 10], ['slinger', 8, 0.9, 7]],
  [['goblin', 26, 0.4, 0], ['orc', 6, 1.5, 4], ['ogre', 1, 1, 8], ['wolf', 12, 0.4, 14], ['shaman', 4, 2, 6]],
  [['skeleton', 16, 0.8, 0], ['bat', 20, 0.45, 3], ['wisp', 6, 1.6, 6], ['goblin', 16, 0.35, 10]],
  [['orc', 14, 0.9, 0], ['wolf', 24, 0.3, 4], ['lich', 1, 1, 8], ['shaman', 5, 1.8, 6]],
  [['skeleton', 14, 0.7, 0], ['orc', 12, 0.9, 2], ['bat', 20, 0.4, 6], ['wolf', 14, 0.35, 12], ['slinger', 10, 0.8, 4], ['wisp', 6, 1.5, 9]],
  [['wolf', 30, 0.28, 0], ['orc', 16, 0.8, 3], ['skeleton', 14, 0.7, 6], ['golem', 1, 1, 8], ['ogre', 1, 1, 16], ['shaman', 6, 1.6, 5]],
  [['goblin', 26, 0.4, 0], ['orc', 12, 1.0, 4], ['troll', 1, 1, 8], ['lich', 1, 1, 20], ['bat', 16, 0.5, 12], ['wisp', 8, 1.4, 10]],
];
// 每波的 Boss（不放在段落里，单独在波次中段登场）：[类型, 出场时间占本波出怪时长的比例]
G.WAVE_BOSSES = {
  4: [['golem', 0.5]],
  6: [['ogre', 0.55]],
  7: [['lich', 0.5]],
  8: [['golem', 0.35], ['ogre', 0.7]],
  9: [['lich', 0.35], ['golem', 0.65]],
  10: [['lich', 0.3], ['troll', 0.6]],
};
G.WAVE_COUNT = 10;
G.SEGMENT_GAP = 3;   // 段与段之间的喘息时间（秒）
// 第 k 波（从 1 开始）使用第 3k-2 ~ 3k 个"槽位"，30 个槽位依次对应段落 1,1,2,2,3,3…15,15，难度平滑上升
G.buildWaves = function () {
  const C = G.CFG, segs = G.WAVE_SEGMENTS;
  const groupEnd = ([type, c0, i0, d]) => d + (c0 * C.COUNT_MUL * (G.ENEMIES[type].countMul || 1) - 1) * i0 * C.INTERVAL_MUL;
  const waves = [];
  for (let k = 0; k < G.WAVE_COUNT; k++) {
    const groups = [];
    let t0 = 0;
    for (let j = 0; j < 3; j++) {
      const seg = segs[Math.min(segs.length - 1, Math.floor((k * 3 + j) * segs.length / (G.WAVE_COUNT * 3)))]
        .filter(g => !G.ENEMIES[g[0]].boss);
      for (const g of seg) groups.push([g[0], g[1], g[2], g[3] + t0]);
      t0 += Math.max(...seg.map(groupEnd)) + G.SEGMENT_GAP;
    }
    for (const [type, at] of G.WAVE_BOSSES[k + 1] || []) groups.push([type, 1, 1, Math.round(t0 * at)]);
    waves.push(groups);
  }
  return waves;
};
G.WAVES = G.buildWaves();

// 天象：作用于整波的全场效果。备战阶段就会公布，方便提前应对。
// kind: curse 凶兆（不利）/ boon 吉兆（有利）/ twist 异象（有利有弊）
// fx 字段（未写的取默认值）：
//   hp 敌人生命倍率   speed 敌人移速倍率   armor 护甲加值   shieldPct 额外护盾（占生命比例）   shieldMul 原有护盾倍率
//   regen 每秒回复最大生命的比例   count 普通敌人数量倍率   noArmor 护甲清零
//   range / rate 塔射程 / 攻速倍率   magic 魔法伤害倍率（塔与露娜）   gold 击杀金叶倍率
//   heroDmg / heroCd 露娜伤害 / 技能冷却倍率   bolt 每隔几秒落雷劈中随机敌人（伤害 = 40 + 14 × 波次，连锁 2 个目标各 50%）
// Boss 不吃 hp / shieldPct / regen 效果
G.OMENS = [
  // ---- 凶兆 ----
  { id: 'bloodmoon', kind: 'curse', icon: '🩸', name: '血月',     desc: '血色月光笼罩战场：敌人生命 +25%。',                   fx: { hp: 1.25 } },
  { id: 'gale',      kind: 'curse', icon: '🌪️', name: '狂风',     desc: '狂风推着敌人前进：敌人移动速度 +18%。',              fx: { speed: 1.18 } },
  { id: 'iron',      kind: 'curse', icon: '🛡️', name: '铁鳞',     desc: '敌人披上铁鳞：所有敌人护甲 +25%（最高 75%）。',      fx: { armor: 0.25 } },
  { id: 'boneward',  kind: 'curse', icon: '☠️', name: '亡骨庇护', desc: '每个敌人额外获得相当于 35% 生命的护盾。',               fx: { shieldPct: 0.35 } },
  { id: 'horde',     kind: 'curse', icon: '👣', name: '兽潮',     desc: '敌人数量 +40%（生命 -10%）。',                         fx: { count: 1.4, hp: 0.9 } },
  { id: 'rot',       kind: 'curse', icon: '🍄', name: '腐生',     desc: '腐化之力滋养敌人：每秒回复 2% 最大生命。',             fx: { regen: 0.02 } },
  { id: 'mist',      kind: 'curse', icon: '☁️', name: '迷雾',     desc: '浓雾遮蔽视野：所有塔射程 -15%。',                     fx: { range: 0.85 } },
  { id: 'leyrift',   kind: 'curse', icon: '🌀', name: '地脉紊乱', desc: '地脉失衡：所有塔攻击速度 -15%。',                      fx: { rate: 0.85 } },
  // ---- 吉兆 ----
  { id: 'starry',    kind: 'boon',  icon: '🌌', name: '星辉之夜', desc: '星光倾泻：塔与露娜的魔法伤害 +30%。',                  fx: { magic: 1.3 } },
  { id: 'tailwind',  kind: 'boon',  icon: '🍃', name: '顺风',     desc: '林间顺风：所有塔攻击速度 +20%。',                      fx: { rate: 1.2 } },
  { id: 'mire',      kind: 'boon',  icon: '🐌', name: '泥沼',     desc: '雨后泥泞：敌人移动速度 -15%。',                        fx: { speed: 0.85 } },
  { id: 'brittle',   kind: 'boon',  icon: '🧊', name: '霜脆',     desc: '寒气侵蚀：敌人护甲清零，护盾减半。',                   fx: { noArmor: true, shieldMul: 0.5 } },
  { id: 'fullmoon',  kind: 'boon',  icon: '🌕', name: '满月',     desc: '露娜之力满盈：露娜伤害 +40%，技能冷却 -40%。',          fx: { heroDmg: 1.4, heroCd: 0.6 } },
  { id: 'bounty',    kind: 'boon',  icon: '💰', name: '丰饶',     desc: '本波击杀获得的金叶 +50%。',                            fx: { gold: 1.5 } },
  // ---- 异象 ----
  { id: 'eclipse',   kind: 'twist', icon: '🌑', name: '日蚀',     desc: '敌人生命 +30%，但击杀金叶翻倍。',                      fx: { hp: 1.3, gold: 2 } },
  { id: 'storm',     kind: 'twist', icon: '⛈️', name: '雷暴',     desc: '敌人移速 +10%，但每 2.5 秒落雷劈中一个敌人并眩晕它，闪电还会连锁 2 个附近的敌人。',          fx: { speed: 1.1, bolt: 2.5 } },
  { id: 'aurora',    kind: 'twist', icon: '🌠', name: '极光',     desc: '塔射程 +15%，但敌人数量 +25%。',                       fx: { range: 1.15, count: 1.25 } },
  { id: 'frenzy',    kind: 'twist', icon: '🔥', name: '狂热',     desc: '敌人移速 +15%，但生命 -15%，所有塔攻速 +10%。',         fx: { speed: 1.15, hp: 0.85, rate: 1.1 } },
];
G.OMEN_DEFAULT = { hp: 1, speed: 1, armor: 0, shieldPct: 0, shieldMul: 1, regen: 0, count: 1, noArmor: false,
  range: 1, rate: 1, magic: 1, gold: 1, heroDmg: 1, heroCd: 1, bolt: 0 };
G.PURGE_COST = 5;   // 用地脉能量驱散一个凶兆

G.HERO = {
  name: '露娜', title: '月之仙子',
  speed: 4.2, range: 3.0, dmg: 12, cd: 0.7,
  xpLevels: [0, 20, 55, 110, 190],
  skills: {
    q: { name: '星落', icon: '🌠', cd: 18, radius: 1.8, dmg: 110, stun: 1.0,
         desc: '召唤流星砸向目标区域，造成魔法伤害并眩晕敌人（可命中飞行单位）。' },
    e: { name: '森之绽放', icon: '🌸', cd: 24, radius: 3.2, dur: 6, haste: 0.6,
         desc: '露娜身边的塔攻击速度 +60%，持续 6 秒。' },
  },
};

// 每波结束后的三选一祝福
G.BLESSINGS = [
  { id: 'ley',     icon: '💠', name: '地脉涌动', repeat: true, desc: '立即获得 +8 地脉能量。',              apply: s => { s.ley += 8; } },
  { id: 'gold',    icon: '🍂', name: '金叶馈赠', repeat: true, desc: '立即获得 +150 金叶。',               apply: s => { s.gold += 150; } },
  { id: 'heart',   icon: '💚', name: '古树之心', repeat: true, desc: '月光古树恢复 5 点生命。',            apply: s => { s.lives += 5; } },
  { id: 'hawk',    icon: '🦅', name: '鹰眼',     desc: '弓手塔射程 +20%，伤害 +15%。',                     apply: s => { s.mods.range.archer *= 1.2; s.mods.dmg.archer *= 1.15; } },
  { id: 'starres', icon: '✨', name: '星辉共鸣', desc: '方尖碑伤害 +30%。',                               apply: s => { s.mods.dmg.obelisk *= 1.3; } },
  { id: 'venom',   icon: '🥀', name: '剧毒荆棘', desc: '荆棘丛伤害 ×2，范围 +15%。',                      apply: s => { s.mods.dmg.thorn *= 2; s.mods.range.thorn *= 1.15; } },
  { id: 'shatter', icon: '💥', name: '碎晶冲击', desc: '投石机爆炸范围 +35%，伤害 +15%。',                 apply: s => { s.mods.splash *= 1.35; s.mods.dmg.catapult *= 1.15; } },
  { id: 'peak',    icon: '⛰️', name: '高山之息', desc: '地势加成翻倍：高地上的塔获得双倍射程与伤害加成。', apply: s => { s.mods.heightMul *= 2; } },
  { id: 'song',    icon: '🎶', name: '露娜之歌', desc: '露娜伤害 +50%，技能冷却 -25%。',                  apply: s => { s.mods.heroDmg *= 1.5; s.mods.heroCd *= 0.75; } },
  { id: 'craft',   icon: '🔨', name: '精灵工匠', desc: '所有塔的建造与升级费用 -15%。',                    apply: s => { s.mods.cost *= 0.85; } },
  { id: 'wind',    icon: '🍃', name: '风之低语', desc: '所有塔攻击速度 +12%。',                           apply: s => { s.mods.rate *= 1.12; } },
  { id: 'harvest', icon: '🌕', name: '丰收之月', desc: '击杀获得的金叶 +25%。',                           apply: s => { s.mods.killGold *= 1.25; } },
  { id: 'earth',   icon: '🪨', name: '大地亲和', desc: '之后每波额外获得 +2 地脉能量。',                   apply: s => { s.mods.leyBonus += 2; } },
  { id: 'cycle',   icon: '♻️', name: '自然轮回', desc: '出售塔时返还 100% 花费。',                         apply: s => { s.mods.sell = 1; } },
];

// 地形手牌：形状（格子坐标）、抽到的权重。raise = 每格抬高几级，dig = 挖低
G.PIECES = {
  mono:  { name: '单块', cells: [[0, 0]], w: 2 },
  duo:   { name: '双连', cells: [[0, 0], [1, 0]], w: 3 },
  tri:   { name: '直三', cells: [[0, 0], [1, 0], [2, 0]], w: 3 },
  ell3:  { name: '小角', cells: [[0, 0], [1, 0], [0, 1]], w: 3 },
  bar4:  { name: '长条', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], w: 2 },
  ell4:  { name: 'L 形', cells: [[0, 0], [0, 1], [0, 2], [1, 2]], w: 2 },
  tee:   { name: 'T 形', cells: [[0, 0], [1, 0], [2, 0], [1, 1]], w: 2 },
  ess:   { name: 'S 形', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], w: 2 },
  sq:    { name: '方块', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], w: 2 },
  spire: { name: '尖塔基座', cells: [[0, 0]], raise: 2, w: 1, desc: '一格直接抬高 2 级' },
  dig:   { name: '沟渠', cells: [[0, 0], [1, 0], [2, 0]], dig: true, w: 1, desc: '把覆盖的高地各削低 1 级' },
};

// 区域扩张可选的区域
G.REGIONS = {
  meadow:  { name: '开阔平地', icon: '🌾', desc: '几乎没有障碍的平地，最适合铺设迷宫。' },
  outcrop: { name: '岩石高地', icon: '⛰️', desc: '自带 3~5 块天然高地，可以直接建塔。' },
  crystal: { name: '地脉晶簇', icon: '💠', desc: '含一处地脉水晶：之后每波额外 +2 地脉能量、+15 金叶。' },
  lake:    { name: '静谧水源', icon: '💧', desc: '一片水域。放下时古树恢复 3 点生命。' },
  ruins:   { name: '远古遗迹', icon: '🏛️', desc: '一座现成的 2×2 二级高台，外加碎石高地。' },
};

// 生物群系：地面配色、装饰、光照
G.BIOMES = {
  forest: {
    name: '翠叶森林', icon: '🌲', desc: '花树、松林与溪流环绕的精灵森林。',
    pal: {
      grassA: 0x84a65a, grassB: 0x678c4e, grassLight: 0xa6ba72, grassDeep: 0x527a46,
      dirt: 0xb39168, dirtDark: 0x8a6a4c, sand: 0xc9b68a, bed: 0x5f9c95, rim: 0x6a8c48,
      top: 0x7fa357, topRim: 0x9fb86c, lip: 0x5f8442, earthLo: 0x4f3b2e, earthHi: 0xa47a55,
      rockTop: 0xb6aec4, rockRim: 0xcfc8db, rockLo: 0x5d5670, rockHi: 0x988fab,
    },
    sky: ['#5f6fbf', '#a9b4ea', '#f0d4ea', '#f7e6ef'], fog: 0xc9c2ee,
    sun: [0xffe0b8, 1.5], hemi: [0xd6e2ff, 0x7a6450, 0.55], motes: 0xd8ff9a,
  },
  desert: {
    name: '黄沙峡谷', icon: '🏜️', desc: '赤红砂岩台地、仙人掌与绿洲点缀的峡谷。',
    pal: {
      grassA: 0xcfa680, grassB: 0xbb9070, grassLight: 0xdcb890, grassDeep: 0xa87c60,
      dirt: 0x8f5f58, dirtDark: 0x744a4a, sand: 0xe8d4a8, bed: 0x3f9c98, rim: 0xc09a78,
      top: 0xdc9a68, topRim: 0xe8b282, lip: 0xc9845a, earthLo: 0x7a3e2e, earthHi: 0xcf8455,
      rockTop: 0xbfa898, rockRim: 0xd4c0b0, rockLo: 0x6a5048, rockHi: 0xa08474,
    },
    sky: ['#7a6ab0', '#d9a8a0', '#f4cfa8', '#f8e4c8'], fog: 0xe8c8a8,
    sun: [0xffd3a0, 1.3], hemi: [0xe8d8d0, 0x7a4a38, 0.5], motes: 0xffe2b0,
  },
  snow: {
    name: '霜雪高原', icon: '❄️', desc: '积雪台地、雪松林与冰晶点缀的寒冷高原。',
    pal: {
      grassA: 0xc6d2e2, grassB: 0xb2c0d4, grassLight: 0xd8e2ee, grassDeep: 0x9eaec6,
      dirt: 0x7a8396, dirtDark: 0x626b7e, sand: 0xc8d4e2, bed: 0x3a6c88, rim: 0x98a6bc,
      top: 0xf0f5fb, topRim: 0xfdfeff, lip: 0xdfe7f1, earthLo: 0x40425a, earthHi: 0x7c7f9a,
      rockTop: 0xc8d6e6, rockRim: 0xe2ecf6, rockLo: 0x4e5a70, rockHi: 0x8a9ab4,
    },
    sky: ['#5a6aa8', '#9fb2e0', '#dbe4f6', '#eef2fa'], fog: 0xd4ddef,
    sun: [0xffeedd, 0.95], hemi: [0xc8d8f8, 0x5a6478, 0.5], motes: 0xffffff, snowfall: true,
  },
};
