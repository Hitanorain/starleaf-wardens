'use strict';
// 界面与输入
(function () {
  const UI = G.UI = { tool: null, hover: null, keys: new Set(), rot: 0 };
  const S = G.S, Wd = G.World, M = G.M, FX = G.FX, A = G.Audio, CFG = G.CFG;
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n);

  // 带图片的图标：图片加载失败时显示 emoji（等 ChatGPT 的美术资源放进 assets/ 后自动替换）
  UI.ic = (src, emoji, cls = '') => `<span class="ic ${cls}"><em>${emoji}</em><img src="${src}" alt="" onerror="this.remove()"></span>`;
  const towerIc = (type, cls) => UI.ic(`assets/icons/tower_${type}.png`, G.TOWERS[type].icon, cls);
  const enemyIc = (type, cls) => UI.ic(`assets/icons/enemy_${type}.png`, G.ENEMIES[type].icon, cls);

  // ---------------- 初始化 ----------------
  UI.init = function () {
    buildBar();
    buildHero();
    $('#btn-start').onclick = () => { G.startWave(); };
    $('#btn-speed').onclick = cycleSpeed;
    $('#btn-pause').onclick = togglePause;
    $('#btn-sound').onclick = () => { A.muted = !A.muted; $('#btn-sound').textContent = A.muted ? '🔇' : '🔊'; };
    $('#btn-help').onclick = () => toggleHelp();
    $('#help').onclick = () => toggleHelp(false);
    $('#title-start').onclick = () => { A.unlock(); G.beginRun(UI.seed); };
    // 标题画面：地图卡（真实截图做缩略图）
    UI.drawBiomes = () => {
      $('#biomes').innerHTML = Object.entries(G.BIOMES).map(([k, b]) => {
        const img = UI.thumbs && UI.thumbs[k] ? `style="background-image:url(${UI.thumbs[k]})"` : '';
        return `<button data-biome="${k}" class="${G.biome === k ? 'on' : ''}"><div class="thumb" ${img}><span class="bi">${b.icon}</span><span class="ok">✓</span></div>
          <div class="bt"><b>${b.name}</b><small>${b.desc}</small></div></button>`;
      }).join('');
      // 切换地图时同时随机一个新布局，并重拍这张地图的缩略图
      $('#biomes').querySelectorAll('button').forEach(btn => btn.onclick = () => {
        if (G.biome === btn.dataset.biome) return;
        UI.seed = Math.floor(Math.random() * 99999);
        G.biome = btn.dataset.biome;
        G.makeThumbs(UI.seed, [G.biome]);
        G.newMap(UI.seed, G.biome); UI.drawBiomes();
      });
      $('#seed').textContent = UI.seed;
      $('#pv-seed').textContent = UI.seed;
      $('#pv-name').textContent = G.BIOMES[G.biome].name;
    };
    // 换一个布局：同一种地图，重新随机生成地形
    $('#title-reroll').onclick = () => {
      UI.seed = Math.floor(Math.random() * 99999);
      G.makeThumbs(UI.seed, [G.biome]);
      G.newMap(UI.seed);
      UI.drawBiomes();
    };
    $('#title-help').onclick = () => toggleHelp(true);
    // 返回标题：游戏中先确认（确认期间暂停），结算画面直接返回
    let pausedBefore = false;
    const closeConfirm = () => { $('#confirm-home').hidden = true; S.paused = pausedBefore; };
    $('#btn-home').onclick = () => { pausedBefore = S.paused; S.paused = true; $('#confirm-home').hidden = false; };
    $('#home-no').onclick = closeConfirm;
    $('#home-yes').onclick = () => { $('#confirm-home').hidden = true; G.returnToTitle(); };
    $('#end-home').onclick = () => { $('#screen-end').hidden = true; G.returnToTitle(); };
    // 背景音乐开关（标题画面和游戏内各一个，状态同步）
    UI.syncMusic = () => {
      const off = G.Music.muted;
      $('#title-music').classList.toggle('off', off);
      $('#title-music span').textContent = off ? '音乐：关' : '音乐：开';
      $('#btn-music').classList.toggle('off', off);
    };
    $('#title-music').onclick = () => { G.Music.toggle(); UI.syncMusic(); };
    $('#btn-music').onclick = () => { G.Music.toggle(); UI.syncMusic(); };
    UI.syncMusic();
    document.body.classList.add('on-title');
    $('#end-retry').onclick = () => { $('#screen-end').hidden = true; G.newMap(Wd.seed); G.beginRun(Wd.seed); };
    $('#end-new').onclick = () => { $('#screen-end').hidden = true; UI.seed = Math.floor(Math.random() * 99999); G.newMap(UI.seed); G.beginRun(UI.seed); };
    $('#title-luna').innerHTML = UI.ic('assets/portraits/luna.png', '🧚', 'big');
    bindInput();
    bindTips();
    UI.ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), M.glow(0xfff4c0, 0.7, true, 0.6));
    UI.ring.rotation.x = -Math.PI / 2; UI.ring.visible = false;
    UI.ringFill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), M.glow(0xfff4c0, 0.08, true, 0.6));
    UI.ringFill.rotation.x = -Math.PI / 2; UI.ringFill.visible = false;
    UI.minRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), M.glow(0xff7b7b, 0.6, true, 0.6));
    UI.minRing.rotation.x = -Math.PI / 2; UI.minRing.visible = false;
    G.scene.add(UI.ring, UI.ringFill, UI.minRing);
    UI.ghostOk = new THREE.MeshBasicMaterial({ color: 0x9dffb0, transparent: true, opacity: 0.45, depthWrite: false });
    UI.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.45, depthWrite: false });
    UI.ghostBlock = new THREE.Mesh(M.GEO.box, UI.ghostOk);
    UI.ghostBlock.visible = false;
    G.scene.add(UI.ghostBlock);
    UI.ghostTowers = {};
    UI.pieceGhosts = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Mesh(M.GEO.box, UI.ghostOk); g.visible = false; G.scene.add(g); UI.pieceGhosts.push(g);
    }
    UI.selRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 6), M.glow(0xffe27a, 0.9, true, 1.0));
    UI.selRing.rotation.x = -Math.PI / 2; UI.selRing.visible = false;
    G.scene.add(UI.selRing);
  };

  function buildBar() {
    let h = `
      <button class="tool" data-tool="raise" data-tip="tip:raise">${UI.ic('assets/icons/tool_raise.png', '⛰️')}<span class="nm">隆起</span><span class="cost ley">💠1</span><kbd>Z</kbd></button>
      <button class="tool" data-tool="lower" data-tip="tip:lower">${UI.ic('assets/icons/tool_lower.png', '⛏️')}<span class="nm">削低</span><span class="cost ley">💠1</span><kbd>X</kbd></button>
      <button class="tool small" id="btn-undo" data-tip="撤销本次备战阶段的上一步操作（地形 / 建塔），全额返还。快捷键 Ctrl+Z">↶<span class="nm">撤销</span></button>
      <div class="sep"></div>`;
    for (const type in G.TOWERS) {
      const d = G.TOWERS[type];
      h += `<button class="tool tower" data-tool="tower:${type}" data-tip="tip:tower:${type}">${towerIc(type)}<span class="nm">${d.name}</span><span class="cost gold" data-cost="${type}">🍂${d.levels[0].cost}</span><kbd>${d.key}</kbd></button>`;
    }
    $('#build-bar').innerHTML = h;
    $('#build-bar').querySelectorAll('[data-tool]').forEach(b => b.onclick = () => UI.setTool(UI.tool === b.dataset.tool ? null : b.dataset.tool));
    $('#btn-undo').onclick = () => G.act.undo();
  }
  function buildHero() {
    const H = G.HERO;
    $('#hero-panel').innerHTML = `
      <div class="portrait" id="hero-portrait" data-tip="tip:hero">${UI.ic('assets/portraits/luna.png', '🧚', 'big')}<span class="lv" id="hero-lv">Lv1</span></div>
      <div class="hero-info"><div class="hname">${H.name}<small>${H.title}</small></div><div class="xp"><i id="hero-xp"></i></div>
        <div class="skills">
          <button class="skill" id="sk-q" data-tip="tip:q">${UI.ic('assets/icons/skill_starfall.png', H.skills.q.icon)}<kbd>Q</kbd><div class="cdmask"></div><span class="cdt"></span></button>
          <button class="skill" id="sk-e" data-tip="tip:e">${UI.ic('assets/icons/skill_bloom.png', H.skills.e.icon)}<kbd>E</kbd><div class="cdmask"></div><span class="cdt"></span></button>
        </div></div>`;
    $('#sk-q').onclick = () => skillQ();
    $('#sk-e').onclick = () => G.Hero.castBloom();
    $('#hero-portrait').onclick = () => { const p = G.Hero.pos; G.cam.target.set(p.x, 0, p.z); };
  }
  function skillQ() {
    if (!G.Hero.ready('q')) { UI.toast('星落还在冷却', 'warn'); return; }
    UI.setTool(UI.tool === 'cast:q' ? null : 'cast:q');
  }

  UI.setTool = function (t) {
    if (t !== UI.tool && !(t && UI.tool && t.split(':')[0] === UI.tool.split(':')[0])) UI.rot = 0;
    UI.tool = t;
    UI.slotKey = null;
    if (!t || !t.startsWith('region:')) G.Terrain.showSlots(null);
    if (t) { S.selected = null; }
    document.querySelectorAll('#build-bar [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    $('#sk-q').classList.toggle('active', t === 'cast:q');
    document.body.dataset.tool = t || '';
    UI.refresh();
  };

  // ---------------- 刷新 ----------------
  UI.refresh = function () {
    G.OmenFX.sync();
    $('#r-lives').textContent = S.lives;
    $('#r-gold').textContent = fmt(S.gold);
    $('#r-ley').textContent = S.ley;
    $('#r-wave').textContent = `${Math.min(S.wave + (S.phase === 'prep' ? 1 : 0), G.WAVES.length)} / ${G.WAVES.length}`;
    // 路径长度
    if (Wd.dist) {
      const lens = Wd.portals.filter(p => p.openWave <= S.wave + 1).map(p => fmt(Wd.pathLen(p)));
      $('#r-path').textContent = lens.join(' / ');
    }
    document.querySelectorAll('[data-cost]').forEach(el => {
      const c = G.towerCost(el.dataset.cost, 0);
      el.textContent = '🍂' + c;
      el.closest('.tool').classList.toggle('poor', S.gold < c);
    });
    const prep = S.phase === 'prep';
    document.body.classList.remove('disabled');
    document.querySelectorAll('#build-bar [data-tool=raise], #build-bar [data-tool=lower]').forEach(b => b.classList.toggle('disabled', !prep || S.ley < 1));
    $('#btn-undo').classList.toggle('disabled', !prep || !S.undo.length);
    // 波次面板
    const wp = $('#wave-panel');
    if (prep && S.wave < G.WAVES.length) {
      const next = G.WAVES[S.wave];
      const n = S.wave + 1;
      const twoPortals = Wd.portals[1].openWave <= n;
      wp.hidden = false;
      wp.innerHTML = `<div class="wp-title">下一波 · 第 ${n} 波${twoPortals ? '<span class="tag">双向进攻</span>' : ''}</div>
        <div class="wp-list">${next.map(g => `<span class="chip" data-tip="enemy:${g[0]}">${enemyIc(g[0])}×${G.groupCount(g)}</span>`).join('')}</div>
        ${omenHtml(true)}
        <button id="btn-start2" class="primary">⚔ 开始战斗 <kbd>空格</kbd></button>`;
      $('#btn-start2').onclick = () => G.startWave();
      wp.querySelectorAll('[data-purge]').forEach(b => b.onclick = () => G.purgeOmen(b.dataset.purge));
    } else if (S.phase === 'combat') {
      wp.hidden = false;
      wp.innerHTML = `<div class="wp-title">第 ${S.wave} 波 · 战斗中</div>${omenHtml(false)}<div class="wprog"><i id="wprog"></i></div><div class="wp-sub" id="wleft"></div>`;
    } else wp.hidden = true;
    $('#btn-start').hidden = true;
    if (prep && S.expandTokens > 0) {
      wp.insertAdjacentHTML('beforeend', `<button id="btn-expand" class="expand ${$('#region-panel').hidden ? '' : 'on'}">🗺 区域扩张 ×${S.expandTokens}</button>`);
      $('#btn-expand').onclick = () => { $('#region-panel').hidden = !$('#region-panel').hidden; if ($('#region-panel').hidden && UI.tool && UI.tool.startsWith('region:')) UI.setTool(null); UI.refresh(); };
    }
    if (!prep || S.expandTokens < 1) $('#region-panel').hidden = true;
    renderHand();
    renderRegions();
    UI.refreshTower();
  };

  // 迷你形状图（地形块 / 区域布局）
  function shapeHtml(cells, cls = '') {
    const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
    const set = new Set(cells.map(c => c[0] + ',' + c[1]));
    let out = `<div class="shape ${cls}" style="grid-template-columns:repeat(${w},1fr)">`;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out += `<i class="${set.has(x + ',' + y) ? 'on' : ''}"></i>`;
    return out + '</div>';
  }
  function renderHand() {
    const bar = $('#hand-bar');
    if (!['prep', 'combat', 'blessing'].includes(S.phase)) { bar.innerHTML = ''; return; }
    const prep = S.phase === 'prep';
    let h = `<div class="hand-title">地形手牌 <small>${S.hand.length}/${CFG.HAND_MAX}</small></div>`;
    S.hand.forEach((id, i) => {
      const pc = G.PIECES[id];
      const on = UI.tool === 'piece:' + i;
      const cells = G.pieceCells(id, on ? UI.rot : 0, 0, 0);
      const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
      h += `<button class="piece ${on ? 'active' : ''} ${pc.dig ? 'dig' : ''} ${pc.raise ? 'spire' : ''} ${prep ? '' : 'disabled'}" data-piece="${i}" data-tip="piece:${id}">
        ${shapeHtml(cells.map(([x, y]) => [x - mx, y - my]))}<span class="nm">${pc.name}</span></button>`;
    });
    if (!S.hand.length) h += `<div class="hand-empty">手牌用完了，每波结束会补充</div>`;
    h += `<button class="piece reroll ${prep && S.ley >= CFG.REROLL_COST ? '' : 'disabled'}" id="btn-reroll" data-tip="把手里的地形块全部换成新的随机形状">🎲<span class="nm">重抽 💠${CFG.REROLL_COST}</span></button>`;
    bar.innerHTML = h;
    bar.querySelectorAll('[data-piece]').forEach(b => b.onclick = () => {
      if (S.phase !== 'prep') { UI.toast('只能在备战阶段改变地形', 'warn'); return; }
      const t = 'piece:' + b.dataset.piece;
      UI.setTool(UI.tool === t ? null : t);
    });
    $('#btn-reroll').onclick = () => G.act.rerollHand();
  }
  function renderRegions() {
    const p = $('#region-panel');
    if (p.hidden) return;
    const offers = G.regionOffers();
    const RS = CFG.RS;
    p.innerHTML = `<div class="rp-title">🗺 区域扩张 <small>剩余 ${S.expandTokens} 次</small></div>
      <div class="rp-sub">选择一块区域，<kbd>R</kbd> 旋转，放到地图边缘发光的空位上。放在传送门一侧会把入口推远。</div>
      ${offers.map((o, i) => {
        const R = G.REGIONS[o.id];
        const on = UI.tool === 'region:' + i;
        const cells = Wd.rotateCells(o.cells, on ? UI.rot : 0);
        const grid = cells.map(c => `<i class="${c.type}${c.h ? ' h' + c.h : ''}"></i>`).join('');
        return `<div class="rcard ${on ? 'active' : ''}" data-region="${i}"><div class="rmap" style="grid-template-columns:repeat(${RS},1fr)">${grid}</div>
          <div class="rinfo"><b>${R.icon} ${R.name}</b><small>${R.desc}</small></div></div>`;
      }).join('')}
      <button id="btn-rreroll" class="${S.ley >= CFG.REROLL_COST ? '' : 'disabled'}">🎲 重刷区域 💠${CFG.REROLL_COST}</button>`;
    p.querySelectorAll('[data-region]').forEach(c => c.onclick = () => {
      const t = 'region:' + c.dataset.region;
      UI.setTool(UI.tool === t ? null : t);
    });
    $('#btn-rreroll').onclick = () => G.act.rerollRegions();
  }

  UI.refreshTower = function () {
    const tw = S.selected;
    const p = $('#tower-panel');
    if (!tw) { p.hidden = true; return; }
    p.hidden = false;
    const st = tw.stats();
    const d = tw.def, L = d.levels[tw.level];
    const h = tw.tile.h;
    const bonus = h >= 2 ? `<span class="hb-tag">地势 ${h} 级：射程 +${fmt((st.rM - 1) * 100)}%　伤害 +${fmt((st.dM - 1) * 100)}%</span>` : `<span class="hb-tag dim">地势 1 级（抬高到 2、3 级可获得射程与伤害加成）</span>`;
    let rows = `<div class="row"><b>伤害</b>${fmt(st.dmg)} <small>${d.dmgType === 'magic' ? '魔法' : '物理'}</small></div>
      <div class="row"><b>${d.pulse ? '频率' : '攻速'}</b>${(1 / st.cd).toFixed(2)} 次/秒</div>
      <div class="row"><b>射程</b>${st.range.toFixed(1)} 格</div>`;
    if (st.splash) rows += `<div class="row"><b>爆炸</b>${st.splash.toFixed(1)} 格</div>`;
    if (st.slow) rows += `<div class="row"><b>减速</b>${fmt(st.slow * 100)}%</div>`;
    if (st.multi > 1) rows += `<div class="row"><b>多重</b>${st.multi} 支箭</div>`;
    if (st.chain) rows += `<div class="row"><b>弹射</b>${st.chain} 次</div>`;
    rows += `<div class="row"><b>对空</b>${d.air ? '✔ 可以' : '✘ 不能'}</div>`;
    let up = '';
    if (tw.level < 2) {
      const c = G.towerCost(tw.type, tw.level + 1);
      const nx = G.towerStats(tw.type, tw.level + 1, h, false);
      const N = d.levels[tw.level + 1];
      up = `<button id="tp-up" class="primary ${S.gold < c ? 'disabled' : ''}">⬆ 升级 🍂${c} <kbd>U</kbd></button>
        <div class="upinfo">伤害 ${fmt(st.dmg)} → <b>${fmt(nx.dmg)}</b>　射程 ${st.range.toFixed(1)} → <b>${nx.range.toFixed(1)}</b>${N.note ? '<br>✨ ' + N.note : ''}</div>`;
    } else up = `<div class="maxed">★ 已满级</div>`;
    const modes = d.pulse ? '' : `<div class="modes">目标：${[['first', '先头'], ['strong', '最强'], ['close', '最近']].map(([k, n]) => `<button data-mode="${k}" class="${tw.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    p.innerHTML = `<div class="tp-head">${towerIc(tw.type, 'mid')}<div><div class="tp-name">${d.name}</div><div class="stars">${'★'.repeat(tw.level + 1)}${'☆'.repeat(2 - tw.level)}</div></div><button class="x" id="tp-close">✕</button></div>
      ${bonus}<div class="stats">${rows}</div>${modes}${up}
      <button id="tp-sell" class="danger">出售 +🍂${Math.floor(tw.invested * S.mods.sell)} <kbd>Del</kbd></button>`;
    $('#tp-close').onclick = () => { S.selected = null; UI.refresh(); };
    $('#tp-sell').onclick = () => G.act.sell(tw);
    if ($('#tp-up')) $('#tp-up').onclick = () => G.act.upgrade(tw);
    p.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { tw.mode = b.dataset.mode; UI.refreshTower(); });
  };

  // 天象：备战时可驱散凶兆
  const OMEN_KIND = { curse: '凶兆', boon: '吉兆', twist: '异象' };
  function omenHtml(prep) {
    if (!S.omens.length) return '';
    return `<div class="wp-omens">${S.omens.map(id => {
      const o = G.omen(id);
      const purge = prep && o.kind === 'curse' && !S.purged
        ? `<button class="purge ${S.ley < G.PURGE_COST ? 'poor' : ''}" data-purge="${id}" data-tip="purge">驱散 💠${G.PURGE_COST}</button>` : '';
      return `<div class="omen ${o.kind}" data-tip="omen:${id}"><span class="oi">${o.icon}</span><span class="on"><small>${OMEN_KIND[o.kind]}</small>${o.name}</span>${purge}</div>`;
    }).join('')}</div>`;
  }

  // ---------------- 提示框 ----------------
  function tipHtml(key) {
    if (key === 'tip:raise') return `<h4>⛰️ 隆起地块 <kbd>Z</kbd></h4><p>花费 1 地脉能量，把地块抬高一级（最高 3 级）。</p><p>· 高于地面的地块<b>会挡住敌人</b>，可以用来规划敌人的路线。<br>· 塔只能建在高地上。<br>· 2 级、3 级高地上的塔获得<b>射程和伤害加成</b>。<br>· 按住左键拖动可以连续隆起。<br>· 只能在备战阶段使用，不能完全堵死道路。</p>`;
    if (key === 'tip:lower') return `<h4>⛏️ 削低地块 <kbd>X</kbd></h4><p>花费 1 地脉能量，把地块降低一级。降到地面后敌人又能从这里通过。</p>`;
    if (key === 'tip:hero') return `<h4>🧚 月之仙子 · 露娜</h4><p>会自动攻击附近的敌人，包括飞行单位。<br><b>右键</b>点击地图可以让她飞过去。每次击杀都会给她经验，最高 5 级。<br>点击头像可以把镜头移到她身上。</p>`;
    if (key === 'tip:q' || key === 'tip:e') {
      const k = key.slice(4), sk = G.HERO.skills[k];
      return `<h4>${sk.icon} ${sk.name} <kbd>${k.toUpperCase()}</kbd></h4><p>${sk.desc}</p><p class="dim">冷却 ${fmt(sk.cd * G.Hero.cdMul())} 秒${k === 'q' ? '　·　按 Q 后左键点击目标位置' : ''}</p>`;
    }
    if (key.startsWith('tip:tower:')) {
      const type = key.slice(10), d = G.TOWERS[type];
      const st = G.towerStats(type, 0, 1, false);
      return `<h4>${d.icon} ${d.name} <kbd>${d.key}</kbd></h4><p>${d.desc}</p>
        <p>伤害 <b>${fmt(st.dmg)}</b>（${d.dmgType === 'magic' ? '魔法' : '物理'}）　攻速 <b>${(1 / st.cd).toFixed(2)}</b>/秒　射程 <b>${st.range.toFixed(1)}</b>　对空 ${d.air ? '✔' : '✘'}</p>
        <p class="dim">建造 🍂${G.towerCost(type, 0)}　·　只能建在高地上</p>`;
    }
    if (key.startsWith('piece:')) {
      const pc = G.PIECES[key.slice(6)];
      return `<h4>🧩 ${pc.name}</h4><p>${pc.desc || '覆盖的格子各抬高 1 级。抬高的地块会挡住敌人，也可以在上面建塔。'}</p><p class="dim">点击选中 → <kbd>R</kbd> 旋转 → 左键放下（免费，可撤销）</p>`;
    }
    if (key.startsWith('enemy:')) {
      const type = key.slice(6), d = G.ENEMIES[type], om = S.om;
      const hm = d.boss ? 1 : G.hpMul(S.phase === 'combat' ? S.wave : S.wave + 1) * om.hp;
      const hp = Math.round(d.hp * hm);
      const sh = Math.round((d.shield || 0) * hm * om.shieldMul) + (d.boss ? 0 : Math.round(hp * om.shieldPct));
      const ar = om.noArmor ? 0 : Math.min(0.75, Math.max(d.armor, d.armor + om.armor));
      return `<h4>${d.icon} ${d.name}</h4><p>${d.desc}</p><p class="dim">生命 ${hp}${sh ? '　护盾 ' + sh : ''}${ar ? '　护甲 ' + Math.round(ar * 100) + '%' : ''}　速度 ${+(d.speed * om.speed).toFixed(2)}　漏怪扣 ${d.leak >= 99 ? '全部' : d.leak} 点生命</p>${S.omens.length ? '<p class="dim">（已计入天象效果）</p>' : ''}`;
    }
    if (key.startsWith('omen:')) {
      const o = G.omen(key.slice(5));
      return `<h4>${o.icon} ${o.name} <small class="okind ${o.kind}">${OMEN_KIND[o.kind]}</small></h4><p>${o.desc}</p><p class="dim">天象只持续这一波，下一波会重新变化。${o.kind === 'curse' ? `<br>备战时可花费 💠${G.PURGE_COST} 地脉能量驱散（每波一次）。` : ''}</p>`;
    }
    if (key === 'purge') return `<h4>✨ 驱散凶兆</h4><p>花费 💠${G.PURGE_COST} 地脉能量，借古树之力驱散这个凶兆。每波只能驱散一次。</p>`;
    return key;
  }
  function bindTips() {
    const tip = $('#tooltip');
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (!el) { if (!UI.worldTip) tip.hidden = true; return; }
      tip.innerHTML = tipHtml(el.dataset.tip);
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
      if (y < 8) y = r.bottom + 10;
      x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      UI.domTip = true;
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('[data-tip]')) { tip.hidden = true; UI.domTip = false; }
    });
  }

  // ---------------- 提示消息 ----------------
  UI.toast = function (msg, kind = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  };
  UI.banner = function (title, sub) {
    const b = $('#banner');
    b.innerHTML = `<div class="bt">${title}</div><div class="bs">${sub || ''}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  };

  // ---------------- 祝福三选一 ----------------
  UI.showBlessings = function (list) {
    const m = $('#modal-bless');
    m.hidden = false;
    m.innerHTML = `<div class="bless-box"><div class="bless-title">✦ 森林的祝福 ✦</div><div class="bless-sub">第 ${S.wave} 波已击退。选择一项祝福（按 1 / 2 / 3）</div>
      <div class="cards">${list.map((b, i) => `<div class="card" data-i="${i}">${UI.ic(`assets/icons/blessing_${b.id}.png`, b.icon, 'big')}<div class="cn">${b.name}</div><div class="cd">${b.desc}</div>${b.repeat ? '' : '<div class="once">永久效果</div>'}<kbd>${i + 1}</kbd></div>`).join('')}</div></div>`;
    UI.blessList = list;
    m.querySelectorAll('.card').forEach(c => c.onclick = () => pickBless(+c.dataset.i));
  };
  function pickBless(i) {
    const b = UI.blessList && UI.blessList[i];
    if (!b || S.phase !== 'blessing') return;
    $('#modal-bless').hidden = true;
    UI.blessList = null;
    G.chooseBlessing(b);
    UI.toast(`获得祝福：${b.name}`, 'good');
  }

  UI.showEnd = function (win) {
    const e = $('#screen-end');
    e.hidden = false;
    e.className = win ? 'win' : 'lose';
    $('#end-title').textContent = win ? '月光古树得救了！' : '古树陷落……';
    $('#end-sub').textContent = win ? '腐化巨魔王倒下，森林重归宁静。' : `你坚持到了第 ${S.wave} 波。重新规划地形，再试一次吧！`;
    $('#end-stats').innerHTML = `<div><b>${S.wave}</b>波次</div><div><b>${S.stats.kills}</b>击杀</div><div><b>${S.stats.built}</b>建塔</div><div><b>${S.lives}</b>剩余生命</div><div><b>${G.Hero.lvl}</b>露娜等级</div>`;
  };

  function cycleSpeed() {
    S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1;
    $('#btn-speed').textContent = '▶'.repeat(S.speed) + ' ' + S.speed + 'x';
  }
  function togglePause() {
    S.paused = !S.paused;
    $('#btn-pause').textContent = S.paused ? '▶' : '⏸';
    $('#paused').hidden = !S.paused;
  }
  function toggleHelp(v) {
    const h = $('#help');
    h.hidden = v === undefined ? !h.hidden : !v;
  }

  // ---------------- 鼠标 / 键盘 ----------------
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let mouseIn = false, painting = false, paintSet = null, panDrag = null;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // 拾取：先看是否点到塔，再从最高一层往下逐层求与水平面的交点（高地是高度图，不用逐面检测）
  function pick() {
    ray.setFromCamera(mouse, G.camera);
    const hit = ray.intersectObjects(S.towers.map(t => t.m.group), true)[0];
    let terr = null;
    const gp = new THREE.Vector3();
    for (let k = CFG.MAX_H; k >= 0; k--) {
      groundPlane.constant = -k * CFG.STEP;
      if (!ray.ray.intersectPlane(groundPlane, gp)) continue;
      const t = Wd.tileAt(gp.x, gp.z);
      if (t && (k === 0 || t.h >= k)) { terr = { tile: t, point: gp.clone(), tower: t.tower }; break; }
      if (k === 0) break;
    }
    groundPlane.constant = 0;
    if (hit && (!terr || hit.distance <= ray.ray.origin.distanceTo(terr.point) + 0.01)) {
      let o = hit.object;
      while (o && !o.userData.tower) o = o.parent;
      if (o) return { tile: o.userData.tower.tile, point: hit.point, tower: o.userData.tower };
    }
    return terr;
  }
  function groundPoint() {
    const h = pick();
    if (h) return h.point;
    ray.setFromCamera(mouse, G.camera);
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  }
  function bindInput() {
    const cv = G.renderer.domElement;
    const setMouse = e => {
      mouse.x = e.clientX / window.innerWidth * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      mouseIn = true;
      UI.mx = e.clientX; UI.my = e.clientY;
    };
    cv.addEventListener('mousemove', e => {
      setMouse(e);
      if (panDrag) {
        const k = G.cam.dist * 0.0016;
        G.cam.target.x -= (e.clientX - panDrag.x) * k;
        G.cam.target.z -= (e.clientY - panDrag.y) * k * 1.3;
        panDrag = { x: e.clientX, y: e.clientY };
      }
      if (painting) {
        const h = pick();
        if (h && !paintSet.has(h.tile)) {
          paintSet.add(h.tile);
          if (UI.tool === 'raise') G.act.raise(h.tile, true);
          else if (UI.tool === 'lower') G.act.lower(h.tile, true);
        }
      }
    });
    cv.addEventListener('mouseleave', () => { mouseIn = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      A.unlock();
      setMouse(e);
      if (e.button === 1) { panDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
      if (!['prep', 'combat'].includes(S.phase)) return;
      if (e.button === 2) {
        if (UI.tool) { UI.setTool(null); return; }
        const p = groundPoint();
        if (p) G.Hero.moveTo(p.x, p.z);
        return;
      }
      if (e.button !== 0) return;
      const h = pick();
      const t = UI.tool;
      if (t === 'raise' || t === 'lower') {
        painting = true; paintSet = new Set();
        if (h) { paintSet.add(h.tile); t === 'raise' ? G.act.raise(h.tile) : G.act.lower(h.tile); }
        return;
      }
      if (t && t.startsWith('tower:')) {
        if (h) {
          const tw = G.act.build(t.slice(6), h.tile);
          if (tw && !e.shiftKey) { UI.setTool(null); S.selected = tw; UI.refreshTower(); }
        }
        return;
      }
      if (t && t.startsWith('piece:')) {
        if (h && G.act.placePiece(+t.slice(6), h.tile, UI.rot)) UI.setTool(null);
        return;
      }
      if (t && t.startsWith('region:')) {
        if (h) {
          const rx = Math.floor(h.tile.x / CFG.RS), ry = Math.floor(h.tile.y / CFG.RS);
          if (G.act.expand(+t.slice(7), rx, ry, UI.rot)) { UI.setTool(null); $('#region-panel').hidden = S.expandTokens < 1; UI.refresh(); }
        }
        return;
      }
      if (t === 'cast:q') {
        const p = groundPoint();
        if (p && G.Hero.castStarfall(p)) UI.setTool(null);
        return;
      }
      S.selected = h && h.tower ? h.tower : null;
      if (S.selected) A.play('hit');
      UI.refresh();
    });
    window.addEventListener('mouseup', e => { painting = false; if (e.button === 1) panDrag = null; });
    cv.addEventListener('wheel', e => {
      G.cam.dist = Math.max(8, Math.min(42, G.cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (e.target.tagName === 'INPUT') return;
      UI.keys.add(k);
      if (S.phase === 'title') return;
      if (S.phase === 'blessing' && ['1', '2', '3'].includes(k)) { pickBless(+k - 1); return; }
      if (k === 'h' || k === 'f1') { toggleHelp(); e.preventDefault(); return; }
      if (k === 'p') { togglePause(); return; }
      if (k === 'f') { cycleSpeed(); return; }
      if (!['prep', 'combat'].includes(S.phase)) return;
      if (k === ' ') { e.preventDefault(); if (S.phase === 'prep') G.startWave(); return; }
      if (k === 'escape') { if (UI.tool) UI.setTool(null); else { S.selected = null; UI.refresh(); } toggleHelp(false); return; }
      if (k === 'z' && (e.ctrlKey || e.metaKey)) { G.act.undo(); e.preventDefault(); return; }
      if (k === 'z') { UI.setTool(UI.tool === 'raise' ? null : 'raise'); return; }
      if (k === 'x') { UI.setTool(UI.tool === 'lower' ? null : 'lower'); return; }
      for (const type in G.TOWERS) if (G.TOWERS[type].key === k) { UI.setTool(UI.tool === 'tower:' + type ? null : 'tower:' + type); return; }
      if (k === 'r' && UI.tool && (UI.tool.startsWith('piece:') || UI.tool.startsWith('region:'))) { UI.rot = (UI.rot + 1) % 4; UI.slotKey = null; A.play('hit'); UI.refresh(); return; }
      if (k === 'q') { skillQ(); return; }
      if (k === 'e') { G.Hero.castBloom(); return; }
      if (k === 'u' && S.selected) { G.act.upgrade(S.selected); return; }
      if ((k === 'delete' || k === 'backspace') && S.selected) { G.act.sell(S.selected); return; }
    });
    window.addEventListener('keyup', e => UI.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => UI.keys.clear());
  }

  function ghostTower(type) {
    if (!UI.ghostTowers[type]) {
      const m = M.tower(type, 0);
      m.group.traverse(o => { if (o.isMesh) { o.material = UI.ghostOk; o.castShadow = false; } });
      G.scene.add(m.group);
      UI.ghostTowers[type] = m.group;
    }
    return UI.ghostTowers[type];
  }
  function setGhostMat(g, ok) { g.traverse(o => { if (o.isMesh) o.material = ok ? UI.ghostOk : UI.ghostBad; }); }
  function showRange(x, z, r, minR, color) {
    UI.ring.visible = UI.ringFill.visible = true;
    UI.ring.position.set(x, 0.06, z); UI.ringFill.position.set(x, 0.05, z);
    UI.ring.scale.setScalar(r); UI.ringFill.scale.setScalar(r);
    UI.ring.material.color.copy(M.lin(color, 0.6)); UI.ringFill.material.color.copy(M.lin(color, 0.6));
    if (minR) { UI.minRing.visible = true; UI.minRing.position.set(x, 0.07, z); UI.minRing.scale.setScalar(minR); }
  }

  // ---------------- 每帧 ----------------
  const sp = {};
  UI.frame = function (dt) {
    // 镜头键盘平移
    const k = UI.keys, pan = G.cam.dist * 0.9 * dt;
    if (S.phase !== 'title') {
      if (k.has('w') || k.has('arrowup')) G.cam.target.z -= pan;
      if (k.has('s') || k.has('arrowdown')) G.cam.target.z += pan;
      if (k.has('a') || k.has('arrowleft')) G.cam.target.x -= pan;
      if (k.has('d') || k.has('arrowright')) G.cam.target.x += pan;
    }
    G.cam.target.x = Math.max(-CFG.W / 2, Math.min(CFG.W / 2, G.cam.target.x));
    G.cam.target.z = Math.max(-CFG.H / 2, Math.min(CFG.H / 2, G.cam.target.z));

    // 悬停预览
    UI.ring.visible = UI.ringFill.visible = UI.minRing.visible = false;
    UI.ghostBlock.visible = false;
    for (const g of UI.pieceGhosts) g.visible = false;
    for (const t in UI.ghostTowers) UI.ghostTowers[t].visible = false;
    const tip = $('#tooltip');
    let wtip = null;
    const h = mouseIn && ['prep', 'combat'].includes(S.phase) ? pick() : null;
    const tool = UI.tool;
    if (h && (tool === 'raise' || tool === 'lower')) {
      const t = h.tile;
      const err = tool === 'raise' ? Wd.canRaise(t) : Wd.canLower(t);
      const bad = err || S.phase !== 'prep' || S.ley < 1;
      const lvl = tool === 'raise' ? t.h + 1 : t.h;
      const s = 1.0 - lvl * 0.035 + 0.02;
      UI.ghostBlock.visible = true;
      UI.ghostBlock.material = bad ? UI.ghostBad : UI.ghostOk;
      UI.ghostBlock.scale.set(s, CFG.STEP + 0.02, s);
      UI.ghostBlock.position.set(t.wx, (Math.max(1, lvl) - 0.5) * CFG.STEP, t.wz);
      if (err) wtip = `<span class="bad">${err}</span>`;
      else if (S.phase !== 'prep') wtip = `<span class="bad">战斗中不能改变地形</span>`;
      else {
        let s2 = tool === 'raise' ? `隆起到 ${t.h + 1} 级` : `削低到 ${t.h - 1} 级`;
        // 路线长度变化预览
        if ((tool === 'raise' && t.h === 0) || (tool === 'lower' && t.h === 1)) {
          const f = Wd.field(new Map([[t, tool === 'raise' ? 1 : 0]]));
          const parts = Wd.portals.filter(p => p.openWave <= S.wave + 1).map(p => {
            const a = Wd.pathLen(p), b = f[p.y * CFG.W + p.x];
            const dlt = b - a;
            return `${fmt(a)} → <b class="${dlt > 0.01 ? 'good' : dlt < -0.01 ? 'bad' : ''}">${fmt(b)}</b>`;
          });
          s2 += `<br>敌人路线：${parts.join('　')} 格`;
        }
        if (tool === 'raise' && t.h >= 1) s2 += `<br>塔在 ${t.h + 1} 级高地：射程 +${fmt((CFG.HEIGHT_RANGE[t.h + 1] - 1) * S.mods.heightMul * 100)}%　伤害 +${fmt((CFG.HEIGHT_DMG[t.h + 1] - 1) * S.mods.heightMul * 100)}%`;
        wtip = s2 + `　<span class="dim">💠1</span>`;
      }
    } else if (h && tool && tool.startsWith('tower:')) {
      const type = tool.slice(6), t = h.tile;
      const err = G.act.canBuild(type, t);
      const g = ghostTower(type);
      g.visible = true;
      g.position.set(t.wx, Wd.top(t), t.wz);
      setGhostMat(g, !err);
      const st = G.towerStats(type, 0, Math.max(1, t.h), false);
      showRange(t.wx, t.wz, st.range, st.minRange, err ? 0xff8080 : 0xfff4c0);
      wtip = err ? `<span class="bad">${err}</span>` : `${G.TOWERS[type].name}　射程 ${st.range.toFixed(1)}　伤害 ${fmt(st.dmg)}${t.h >= 2 ? `<br><b class="good">高地加成 +${fmt((st.dM - 1) * 100)}% 伤害</b>` : ''}<br><span class="dim">Shift+点击 连续建造</span>`;
    } else if (h && tool && tool.startsWith('piece:')) {
      const id = S.hand[+tool.slice(6)];
      if (id) {
        const pc = G.PIECES[id];
        const cells = G.pieceCells(id, UI.rot, h.tile.x, h.tile.y);
        const { err, tiles } = Wd.checkPiece(cells, pc);
        cells.forEach(([x, y], i) => {
          const t = Wd.get(x, y), g = UI.pieceGhosts[i];
          if (!t || !g) return;
          const lvl = pc.dig ? t.h : Math.min(3, t.h + (pc.raise || 1));
          g.visible = true;
          g.material = err ? UI.ghostBad : UI.ghostOk;
          const sz = 0.96 - lvl * 0.03;
          const hh = pc.dig ? CFG.STEP : (pc.raise || 1) * CFG.STEP;
          g.scale.set(sz, hh + 0.02, sz);
          g.position.set(t.wx, Math.max(0, lvl * CFG.STEP - hh) + hh / 2, t.wz);
        });
        if (err) wtip = `<span class="bad">${err}</span>`;
        else {
          const ov = new Map(tiles.map(t => [t, pc.dig ? t.h - 1 : t.h + (pc.raise || 1)]));
          const f = Wd.field(ov);
          const parts = Wd.portals.filter(p => p.openWave <= S.wave + 1).map(p => {
            const a = Wd.pathLen(p), b = f[p.y * CFG.W + p.x], dlt = b - a;
            return `${fmt(a)} → <b class="${dlt > 0.01 ? 'good' : dlt < -0.01 ? 'bad' : ''}">${fmt(b)}</b>`;
          });
          wtip = `${pc.name}　敌人路线：${parts.join('　')} 格<br><span class="dim">R 旋转 · 右键取消</span>`;
        }
      }
    } else if (tool && tool.startsWith('region:')) {
      const offer = G.regionOffers()[+tool.slice(7)];
      const slots = Wd.slots();
      let hover = null;
      if (h) { const rx = Math.floor(h.tile.x / CFG.RS), ry = Math.floor(h.tile.y / CFG.RS); hover = slots.find(s2 => s2.rx === rx && s2.ry === ry) || null; }
      const key = (hover ? hover.rx + ',' + hover.ry : '-') + ':' + UI.rot + ':' + tool;
      if (UI.slotKey !== key) {
        UI.slotKey = key;
        const cells = offer && Wd.rotateCells(offer.cells, UI.rot);
        UI.slotErr = hover && cells ? Wd.checkExpand(hover.rx, hover.ry, cells) : null;
        G.Terrain.showSlots(slots, hover, cells, !!UI.slotErr);
      }
      if (hover) {
        const pushes = Wd.portals.filter(p => (p.axis === 'w' || p.axis === 'e') ? Math.floor(p.row / CFG.RS) === hover.ry && Math.abs(Math.floor(p.x / CFG.RS) - hover.rx) === 1 : Math.floor(p.col / CFG.RS) === hover.rx && Math.abs(Math.floor(p.y / CFG.RS) - hover.ry) === 1);
        wtip = UI.slotErr ? `<span class="bad">${UI.slotErr}</span>` : `放置「${G.REGIONS[offer.id].name}」${pushes.length ? `<br><b class="good">${pushes.map(p => p.name).join('、')}会后退，敌人路线变长！</b>` : ''}<br><span class="dim">R 旋转 · 右键取消</span>`;
      } else wtip = '把区域放到发光的空位上';
    } else if (tool === 'cast:q' && mouseIn) {
      const p = groundPoint();
      if (p) { showRange(p.x, p.z, G.HERO.skills.q.radius, 0, 0xfff27a); wtip = '左键释放 星落　右键取消'; }
    } else if (h && !tool) {
      if (h.tower && h.tower !== S.selected) {
        const st = h.tower.stats();
        showRange(h.tower.pos.x, h.tower.pos.z, st.range, st.minRange, 0xfff4c0);
      }
    }
    if (tool === 'cast:q' || (tool && tool.startsWith('tower:')) || tool === 'raise' || tool === 'lower') { /* 已处理 */ }
    if (S.selected) {
      const tw = S.selected, st = tw.stats();
      showRange(tw.pos.x, tw.pos.z, st.range, st.minRange, 0x9ff4ff);
      UI.selRing.visible = true;
      UI.selRing.position.set(tw.pos.x, Wd.top(tw.tile) + 0.03, tw.pos.z);
      UI.selRing.rotation.z += dt;
    } else UI.selRing.visible = false;
    if (wtip && !UI.domTip) {
      tip.innerHTML = wtip; tip.hidden = false; UI.worldTip = true;
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, UI.mx + 18) + 'px';
      tip.style.top = Math.max(8, UI.my - tip.offsetHeight - 12) + 'px';
    } else if (UI.worldTip && !UI.domTip) { tip.hidden = true; UI.worldTip = false; }

    // 血条
    for (const e of S.enemies) {
      if (e.dead) continue;
      const hy = e.fly ? 0.35 : (0.75 * e.scale + (e.def.boss ? 0.5 : 0));
      FX.toScreen(e.pos.clone().setY(e.pos.y + hy), sp);
      const show = e.def.boss || e.hp < e.maxHp || e.shield > 0;
      e.hb.style.display = show && sp.vis ? '' : 'none';
      if (show) {
        e.hb.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%,-50%)`;
        e.hpEl.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
        e.shEl.style.width = e.maxShield ? (e.shield / e.maxShield * 100) + '%' : '0';
      }
      // 伤害数字（每 0.3 秒合并显示一次）
      e.dmgT -= dt;
      if (e.dmgAcc > 0 && e.dmgT <= 0) {
        if (e.dmgAcc >= 1) FX.text(e.pos.clone().setY(e.pos.y + hy + 0.1), fmt(e.dmgAcc), 'dmg', 0.6);
        e.dmgAcc = 0; e.dmgT = 0.3;
      }
    }
    FX.updateTexts(dt);

    // 顶栏实时数据
    $('#r-gold').textContent = fmt(S.gold);
    $('#r-lives').textContent = S.lives;
    $('#r-lives').parentElement.classList.toggle('low', S.lives <= 5);
    if (S.phase === 'combat' && $('#wprog')) {
      const left = S.queue.length + S.enemies.length;
      $('#wprog').style.width = (1 - S.queue.length / Math.max(1, S.waveTotal)) * 100 + '%';
      $('#wleft').textContent = `剩余敌人 ${left}`;
    }
    // 英雄
    const Hh = G.Hero;
    $('#hero-lv').textContent = 'Lv' + Hh.lvl;
    const xl = G.HERO.xpLevels;
    $('#hero-xp').style.width = Hh.lvl >= xl.length ? '100%' : ((Hh.xp - xl[Hh.lvl - 1]) / (xl[Hh.lvl] - xl[Hh.lvl - 1]) * 100) + '%';
    for (const s of ['q', 'e']) {
      const el = $('#sk-' + s);
      const cd = Hh.skill[s], tot = G.HERO.skills[s].cd * G.Hero.cdMul();
      el.querySelector('.cdmask').style.height = cd > 0 ? (cd / tot * 100) + '%' : '0';
      el.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
      el.classList.toggle('ready', cd <= 0);
    }
    if (S.selected && UI.panelT === undefined) UI.panelT = 0;
    UI.panelT = (UI.panelT || 0) - dt;
    if (S.selected && UI.panelT <= 0) { UI.panelT = 0.5; updateUpBtn(); }
  };
  function updateUpBtn() {
    const b = $('#tp-up');
    if (!b || !S.selected || S.selected.level >= 2) return;
    b.classList.toggle('disabled', S.gold < G.towerCost(S.selected.type, S.selected.level + 1));
  }
})();
