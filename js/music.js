'use strict';
// 背景音乐：优先播放 assets/audio/ 里的音乐文件；没有文件时，用 WebAudio 实时合成一段梦幻风格的配乐
//  - title：和弦铺底 + 竖琴般的琶音 + 铃音（标题画面）
//  - game ：只保留铺底和稀疏的铃音，音量更低（游戏中）
(function () {
  const A = G.Audio;
  const Mu = G.Music = { mode: 'title', muted: false, started: false };
  const FILES = { title: 'assets/audio/bgm_title.mp3', game: 'assets/audio/bgm_game.mp3' };
  const VOL = { title: 0.55, game: 0.32 };
  try { Mu.muted = localStorage.getItem('starleaf.musicMuted') === '1'; } catch (e) { /* 忽略 */ }

  // ---------- 音乐文件（如果有） ----------
  const files = {};
  for (const k in FILES) {
    const el = new Audio();
    el.loop = true; el.preload = 'auto'; el.volume = 0;
    el.addEventListener('canplaythrough', () => { files[k] = el; if (Mu.started) apply(); }, { once: true });
    el.addEventListener('error', () => { files[k] = null; }, { once: true });
    el.src = FILES[k];
  }

  // ---------- 合成器 ----------
  let ctx, out, pad, lead, bus, verb, step = 0, nextTime = 0;
  const BPM = 70, EIGHTH = 60 / BPM / 2;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // 8 小节循环：D – Bm – G – A(sus) – D/F# – Em – G – A
  const BARS = [
    { pad: [50, 57, 61, 66], bass: 38, arp: [62, 66, 69, 73, 74, 78] },
    { pad: [47, 54, 57, 62], bass: 35, arp: [59, 62, 66, 69, 71, 74] },
    { pad: [43, 50, 54, 59], bass: 31, arp: [55, 59, 62, 66, 67, 71] },
    { pad: [45, 50, 52, 57], bass: 33, arp: [57, 62, 64, 69, 74, 76] },
    { pad: [42, 50, 54, 57], bass: 42, arp: [62, 66, 69, 74, 78, 81] },
    { pad: [40, 47, 50, 55], bass: 40, arp: [59, 62, 64, 67, 71, 74] },
    { pad: [43, 50, 54, 59], bass: 31, arp: [62, 66, 67, 71, 74, 78] },
    { pad: [45, 52, 55, 61], bass: 33, arp: [61, 64, 69, 73, 76, 81] },
  ];
  function build() {
    ctx = A.ctx;
    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    // 混响：用衰减的噪声生成冲激响应
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    verb.connect(wet); wet.connect(out);
    bus = ctx.createGain(); bus.gain.value = 0.7;
    bus.connect(out); bus.connect(verb);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.4;
    pad = ctx.createGain(); pad.gain.value = 0.5; pad.connect(lp); lp.connect(bus);
    lead = ctx.createGain(); lead.gain.value = 0.6; lead.connect(bus);
  }
  function voice(dest, freq, t, dur, { type = 'sine', vol = 0.1, attack = 0.01, detune = 0, pan = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g); node.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 竖琴 / 钢片琴：基音 + 一点泛音，迅速起音、缓慢衰减
  function pluck(m, t, vol, pan) {
    voice(lead, mtof(m), t, 2.2, { type: 'sine', vol, attack: 0.005, pan });
    voice(lead, mtof(m) * 2, t, 0.9, { type: 'triangle', vol: vol * 0.25, attack: 0.005, pan });
  }
  // 铃音：非整数倍的泛音
  function bell(m, t, vol) {
    const f = mtof(m);
    [[1, 1], [2.76, 0.35], [5.4, 0.15]].forEach(([k, a]) => voice(lead, f * k, t, 3.5 / Math.sqrt(k), { vol: vol * a, attack: 0.004, pan: (Math.random() - 0.5) * 0.6 }));
  }
  let arpNote = 2;
  function schedule(t) {
    const barIdx = Math.floor(step / 8) % BARS.length, inBar = step % 8;
    const bar = BARS[barIdx], title = Mu.mode === 'title';
    const barDur = EIGHTH * 8;
    if (inBar === 0) {
      // 铺底和弦：每个音两层轻微失谐的振荡器，柔和起音
      bar.pad.forEach((m, i) => {
        for (const dt of [-7, 7]) voice(pad, mtof(m), t, barDur * 1.6, { type: i % 2 ? 'sine' : 'triangle', vol: 0.045, attack: 1.4, detune: dt, pan: (i - 1.5) * 0.25 });
      });
      voice(pad, mtof(bar.bass), t, barDur * 1.2, { vol: title ? 0.09 : 0.07, attack: 0.3 });
      if (barIdx % 2 === 0) bell(bar.arp[bar.arp.length - 1] + 12, t + EIGHTH * (title ? 0 : 2), title ? 0.05 : 0.035);
    }
    if (title) {
      // 琶音：在和弦音上随机游走，偶尔休止
      if (Math.random() < (inBar % 2 ? 0.55 : 0.85)) {
        arpNote = Math.max(0, Math.min(bar.arp.length - 1, arpNote + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]));
        pluck(bar.arp[arpNote], t + (Math.random() - 0.5) * 0.015, 0.06 + Math.random() * 0.03, (Math.random() - 0.5) * 0.8);
      }
    } else if (inBar === 4 && Math.random() < 0.5) {
      pluck(bar.arp[Math.floor(Math.random() * bar.arp.length)], t, 0.035, (Math.random() - 0.5) * 0.8);
    }
    step++;
  }
  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.6) { schedule(nextTime); nextTime += EIGHTH; }
  }

  // ---------- 控制 ----------
  function fileFor(mode) { return files[mode] || null; }
  function apply() {
    if (!Mu.started) return;
    const now = ctx.currentTime;
    const f = fileFor(Mu.mode);
    // 合成器：没有对应文件时才发声
    const synthVol = Mu.muted || f ? 0 : VOL[Mu.mode];
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(synthVol, now, 0.8);
    for (const k in files) {
      const el = files[k];
      if (!el) continue;
      if (k === Mu.mode && !Mu.muted) { el.volume = VOL[k]; if (el.paused) el.play().catch(() => {}); }
      else el.pause();
    }
  }
  // 浏览器要求用户先有一次点击 / 按键，音频才能开始
  Mu.start = function () {
    if (Mu.started) return;
    if (!A.unlock()) return;
    build();
    Mu.started = true;
    nextTime = ctx.currentTime + 0.1;
    setInterval(tick, 120);
    tick();
    apply();
  };
  Mu.setMode = function (mode) { Mu.mode = mode; if (Mu.started) apply(); };
  Mu.toggle = function () {
    Mu.muted = !Mu.muted;
    try { localStorage.setItem('starleaf.musicMuted', Mu.muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (!Mu.started) Mu.start(); else apply();
    return Mu.muted;
  };
  const kick = () => { Mu.start(); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
  // 切到后台时暂停，回来再继续
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) { A.ctx.suspend(); for (const k in files) if (files[k]) files[k].pause(); }
    else { A.ctx.resume(); apply(); }
  });
})();
