'use strict';
// 操作指引：左上角一行 ✦ 当前目标 + 相关按键提示。
// 每一步的完成条件直接看游戏状态（不要求按顺序，提前做完的步骤会自动跳过）；全部完成后淡出。
(function () {
  const Gd = G.Guide = {};
  const S = G.S;
  const did = { piece: false, hero: false };
  let step = -1, combatT = 0, el = null;

  const STEPS = [
    { text: '用下方的<b>地形手牌</b>搭一块高地，拉长敌人的路线', keys: [['R', '旋转'], ['右键', '取消']],
      done: () => did.piece },
    { text: '在高地上建一座<b>塔</b>——站得越高，射程越远', keys: [['1–5', '选择塔'], ['6–8', '地面陷阱'], ['Shift', '连续建造']],
      done: () => S.towers.length > 0 },
    { text: '准备好了，就迎接第一波敌人吧', keys: [['空格', '开始战斗']],
      done: () => S.wave >= 1 },
    { text: '<b>右键</b>点击地图，让露娜飞过去帮忙', keys: [['Q', '星落'], ['E', '森之绽放']],
      done: () => did.hero || combatT > 18 },
  ];

  // 包装玩家操作，记录"做过了"
  function wrap(obj, name, flag) {
    const f = obj[name];
    obj[name] = function () { const r = f.apply(this, arguments); if (r !== false) did[flag] = true; return r; };
  }
  wrap(G.act, 'placePiece', 'piece');
  wrap(G.act, 'raise', 'piece');
  wrap(G.Hero, 'moveTo', 'hero');

  function render() {
    const s = STEPS[step];
    el.innerHTML = s ? `<div class="g-line"><i>✦</i><span>${s.text}</span></div>
      <div class="g-keys">${s.keys.map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('')}</div>` : '';
  }
  function go(n) {
    step = n;
    el.classList.remove('show');
    clearTimeout(Gd.t);
    if (step >= STEPS.length) return;
    // 先淡出上一条，再换字淡入
    Gd.t = setTimeout(() => { render(); el.classList.add('show'); }, step === 0 ? 1200 : 450);
  }

  // 新的一局开始时调用
  Gd.start = function () {
    if (!el) { el = document.createElement('div'); el.id = 'guide'; document.getElementById('app').appendChild(el); }
    did.piece = did.hero = false; combatT = 0;
    go(0);
  };
  Gd.stop = function () { step = STEPS.length; if (el) el.classList.remove('show'); clearTimeout(Gd.t); };

  Gd.update = function (dt) {
    if (step < 0 || step >= STEPS.length) return;
    if (S.phase === 'combat') combatT += dt;
    // 后面的步骤已经做到了（玩家没按顺序来），就直接跳过前面的
    let n = step;
    for (let i = STEPS.length - 1; i >= step; i--) if (STEPS[i].done()) { n = i + 1; break; }
    if (n !== step) {
      el.classList.add('done');
      setTimeout(() => el.classList.remove('done'), 500);
      go(n);
    }
  };
})();
