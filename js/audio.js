'use strict';
// 程序合成的小音效（无需音频文件）
(function () {
  const A = G.Audio = { muted: false, ctx: null, last: {} };
  function ctx() {
    if (!A.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      A.ctx = new C();
      A.master = A.ctx.createGain(); A.master.gain.value = 0.35; A.master.connect(A.ctx.destination);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  }
  function tone(f, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, freq = 800, delay = 0) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(A.master); s.start(t);
  }
  const SFX = {
    arrow: () => tone(1400, 0.06, 'triangle', 0.08, -600),
    bolt: () => tone(700, 0.18, 'sine', 0.12, 500),
    thorn: () => noise(0.12, 0.12, 1800),
    catapult: () => { tone(180, 0.15, 'triangle', 0.18, -90); },
    boom: () => { noise(0.3, 0.3, 600); tone(90, 0.3, 'sine', 0.25, -40); },
    hit: () => tone(320, 0.05, 'square', 0.04, -100),
    die: () => tone(520, 0.12, 'triangle', 0.1, -380),
    coin: () => { tone(1200, 0.06, 'sine', 0.06); tone(1600, 0.08, 'sine', 0.05, 0, 0.05); },
    build: () => { noise(0.08, 0.2, 900); tone(260, 0.12, 'triangle', 0.15, 80); },
    raise: () => { noise(0.25, 0.25, 300); tone(110, 0.25, 'sine', 0.2, 60); },
    lower: () => { noise(0.25, 0.25, 300); tone(170, 0.25, 'sine', 0.2, -70); },
    error: () => tone(160, 0.15, 'square', 0.08, -40),
    leak: () => { tone(140, 0.4, 'sawtooth', 0.15, -60); },
    wave: () => { [392, 494, 587].forEach((f, i) => tone(f, 0.6, 'triangle', 0.12, 0, i * 0.12)); },
    clear: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.45, 'sine', 0.12, 0, i * 0.09)); },
    bless: () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.6, 'sine', 0.1, 0, i * 0.07)); },
    star: () => { tone(1800, 0.5, 'sine', 0.1, -1500); noise(0.4, 0.25, 900, 0.45); tone(80, 0.4, 'sine', 0.3, -30, 0.45); },
    bloom: () => { [659, 830, 988, 1318].forEach((f, i) => tone(f, 0.5, 'sine', 0.08, 0, i * 0.05)); },
    hero: () => tone(1100, 0.08, 'sine', 0.05, 400),
    levelup: () => { [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.1, 0, i * 0.08)); },
    shield: () => tone(900, 0.2, 'square', 0.06, -600),
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.6, 'triangle', 0.15, 0, i * 0.25)); },
    omenCurse: () => { tone(98, 1.6, 'sawtooth', 0.1, -30); tone(147, 1.6, 'sawtooth', 0.07, -45, 0.15); noise(1.4, 0.14, 260); tone(1200, 0.9, 'sine', 0.03, -900, 0.1); },
    omenBoon: () => { [659, 880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.9, 'sine', 0.08, 0, i * 0.09)); noise(0.8, 0.05, 6000, 0.1); },
    omenTwist: () => { [440, 415, 554, 523].forEach((f, i) => tone(f, 0.7, 'triangle', 0.09, i % 2 ? -30 : 30, i * 0.14)); noise(1.0, 0.08, 500); },
    thunder: () => { noise(0.12, 0.6, 5000); noise(1.6, 0.45, 220, 0.04); tone(55, 1.2, 'sine', 0.35, -20, 0.02); },
    rumble: () => { noise(1.8, 0.12, 160); },
    portal: () => { tone(90, 1.2, 'sawtooth', 0.12, 60); noise(1.0, 0.15, 400); },
  };
  A.play = function (name, minGap = 0.045) {
    if (A.muted || !SFX[name]) return;
    const now = performance.now() / 1000;
    if (A.last[name] && now - A.last[name] < minGap) return;
    A.last[name] = now;
    try { SFX[name](); } catch (e) { /* 忽略 */ }
  };
  A.unlock = () => ctx();
})();
