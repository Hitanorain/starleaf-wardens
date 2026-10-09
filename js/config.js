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
  START_GOLD: 170,
  START_LEY: 8,
  LEY_PER_WAVE: 3,
  HAND_MAX: 6,           // 地形手牌上限
  HAND_START: 4,         // 开局手牌
  DRAW_PER_WAVE: 2,      // 每波结束抽几张
  REROLL_COST: 2,        // 重抽手牌 / 重刷区域的地脉能量花费
  EXPAND_EVERY: 2,       // 每隔几波获得一次区域扩张
  START_LIVES: 20,
  // 地势加成（下标 = 地势等级；塔只能建在 1 级以上，1 级为基准）
  HEIGHT_RANGE: [1, 1, 1.2, 1.4],
  HEIGHT_DMG:   [1, 1, 1.15, 1.3],
  PORTAL_B_WAVE: 6,      // 第二个传送门开启的波次
  FLY_Y: 1.5,
  SELL_RATE: 0.7,
};

// 每波怪物生命倍率（Boss 不吃这个倍率）
G.hpMul = w => 1 + 0.11 * (w - 1) + 0.011 * (w - 1) * (w - 1);
G.goldMul = w => 1 + 0.04 * (w - 1);

G.TOWERS = {
  archer: {
    name: '精灵弓手塔', key: '1', icon: '🏹', dmgType: 'phys', air: true,
    desc: '精灵射手连续放箭，单体物理伤害，可以攻击飞行单位。',
    levels: [
      { cost: 50,  dmg: 9,  cd: 0.62, range: 3.2 },
      { cost: 60,  dmg: 15, cd: 0.52, range: 3.4 },
      { cost: 110, dmg: 22, cd: 0.44, range: 3.6, multi: 2, note: '一次射出 2 支箭' },
    ],
  },
  obelisk: {
    name: '星辉方尖碑', key: '2', icon: '🔮', dmgType: 'magic', air: true,
    desc: '凝聚星光的魔法弹，无视护甲，对护盾造成双倍伤害，可以攻击飞行单位。',
    levels: [
      { cost: 80,  dmg: 26, cd: 1.3, range: 3.0 },
      { cost: 90,  dmg: 46, cd: 1.2, range: 3.2 },
      { cost: 150, dmg: 72, cd: 1.1, range: 3.4, chain: 2, note: '星光会弹射 2 个额外目标' },
    ],
  },
  thorn: {
    name: '荆棘藤蔓', key: '3', icon: '🌿', dmgType: 'magic', air: false, pulse: true,
    desc: '周期性地刺出荆棘，伤害并减速范围内所有地面敌人。',
    levels: [
      { cost: 60,  dmg: 6,  cd: 1.0, range: 2.0, slow: 0.35 },
      { cost: 70,  dmg: 11, cd: 1.0, range: 2.2, slow: 0.45 },
      { cost: 120, dmg: 18, cd: 0.9, range: 2.4, slow: 0.55, note: '减速 55%' },
    ],
  },
  catapult: {
    name: '水晶投石机', key: '4', icon: '💎', dmgType: 'phys', air: false,
    desc: '远程抛射魔晶，落地爆炸造成范围物理伤害。不能攻击飞行单位，脚下有盲区。',
    levels: [
      { cost: 110, dmg: 40,  cd: 2.4, range: 4.2, splash: 1.1, minRange: 1.2 },
      { cost: 120, dmg: 70,  cd: 2.2, range: 4.4, splash: 1.2, minRange: 1.2 },
      { cost: 180, dmg: 110, cd: 2.0, range: 4.6, splash: 1.5, minRange: 1.2, note: '爆炸范围更大' },
    ],
  },
};

G.ENEMIES = {
  goblin:   { name: '哥布林',     icon: '👺', hp: 40,   speed: 1.5,  gold: 4,   armor: 0,    leak: 1, scale: 1,
              desc: '数量众多的小喽啰。' },
  wolf:     { name: '腐化狼',     icon: '🐺', hp: 30,   speed: 2.4,  gold: 4,   armor: 0,    leak: 1, scale: 1,
              desc: '速度极快，成群出没。荆棘藤可以有效减速。' },
  orc:      { name: '兽人蛮兵',   icon: '👹', hp: 170,  speed: 0.85, gold: 12,  armor: 0.4,  leak: 2, scale: 1,
              desc: '护甲 40%：物理伤害降低 40%。用方尖碑、荆棘或露娜的魔法伤害对付。' },
  skeleton: { name: '骷髅盾卫',   icon: '💀', hp: 70,   speed: 1.1,  gold: 9,   armor: 0,    leak: 2, scale: 1, shield: 90,
              desc: '护盾：先吸收伤害，魔法伤害对护盾 ×2。' },
  bat:      { name: '暗影蝙蝠',   icon: '🦇', hp: 35,   speed: 1.7,  gold: 5,   armor: 0,    leak: 1, scale: 1, fly: true,
              desc: '飞行：无视地形直线飞向古树。只有弓手塔、方尖碑和露娜能攻击。' },
  ogre:     { name: '食人魔督军', icon: '👿', hp: 2600, speed: 0.6,  gold: 80,  armor: 0.3,  leak: 6, scale: 1.3, boss: true,
              desc: 'Boss：血量很高，护甲 30%。' },
  troll:    { name: '腐化巨魔王', icon: '👑', hp: 16000, speed: 0.5, gold: 200, armor: 0.3,  leak: 99, scale: 1.7, boss: true,
              regen: 20, summon: { type: 'goblin', every: 6, count: 3 },
              desc: '最终 Boss：每秒回复生命，并不断召唤哥布林。放过它就失败。' },
};

// 每组：[类型, 数量, 间隔秒, 开始延迟秒]
G.WAVES = [
  [['goblin', 8, 1.0, 0]],
  [['goblin', 12, 0.8, 0]],
  [['wolf', 8, 0.7, 0], ['goblin', 8, 0.9, 4]],
  [['goblin', 10, 0.8, 0], ['orc', 4, 2.2, 3]],
  [['goblin', 8, 0.8, 0], ['bat', 10, 0.9, 4]],
  [['skeleton', 6, 1.6, 0], ['wolf', 10, 0.6, 3]],
  [['goblin', 16, 0.5, 0], ['orc', 6, 1.8, 4]],
  [['bat', 14, 0.6, 0], ['skeleton', 8, 1.3, 2]],
  [['wolf', 22, 0.4, 0], ['orc', 6, 1.6, 5]],
  [['goblin', 20, 0.5, 0], ['ogre', 1, 1, 6]],
  [['skeleton', 12, 1.0, 0], ['bat', 14, 0.6, 3]],
  [['orc', 10, 1.2, 0], ['wolf', 18, 0.4, 4]],
  [['skeleton', 10, 0.9, 0], ['orc', 8, 1.2, 2], ['bat', 16, 0.5, 6]],
  [['wolf', 24, 0.35, 0], ['orc', 12, 1.0, 3], ['skeleton', 12, 0.9, 6], ['bat', 16, 0.5, 8]],
  [['goblin', 20, 0.5, 0], ['orc', 8, 1.4, 4], ['troll', 1, 1, 8], ['bat', 12, 0.6, 12]],
];

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
  { id: 'venom',   icon: '🥀', name: '剧毒荆棘', desc: '荆棘藤伤害 ×2，范围 +15%。',                      apply: s => { s.mods.dmg.thorn *= 2; s.mods.range.thorn *= 1.15; } },
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
