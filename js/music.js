'use strict';
// 背景音乐：一个小型步进音序器 + 一组合成乐器，实时合成每首曲子（不需要音频文件）。
//   曲目：title（标题）、forest / desert / snow（三张地图的游戏内配乐）
//   强度：0 备战（舒缓）· 1 战斗（加入鼓点、低音与主旋律）· 2 Boss（再加重鼓与更密的伴奏）
// 如果 assets/audio/bgm_<曲目>.mp3 存在，就改为播放该文件。
(function () {
  const A = G.Audio;
  const Mu = G.Music = { mode: 'title', muted: false, started: false, intensity: 0 };
  try { Mu.muted = localStorage.getItem('starleaf.musicMuted') === '1'; } catch (e) { /* 忽略 */ }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const chance = p => Math.random() < p;

  // ---------- 音乐文件（如果有） ----------
  const files = {};
  for (const k of ['title', 'forest', 'desert', 'snow']) {
    const el = new Audio();
    el.loop = true; el.preload = 'auto';
    el.addEventListener('canplaythrough', () => { files[k] = el; if (Mu.started) apply(); }, { once: true });
    el.addEventListener('error', () => { files[k] = null; }, { once: true });
    el.src = `assets/audio/bgm_${k}.mp3`;
  }

  // ---------- 混音台 ----------
  let ctx, out, padBus, leadBus, drumBus, noiseBuf;
  function build() {
    ctx = A.ctx;
    out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(out);
    const mk = (send, dry) => { const g = ctx.createGain(); const s = ctx.createGain(); s.gain.value = send; g.gain.value = dry; g.connect(out); g.connect(s); s.connect(verb); return g; };
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.4;
    padBus = ctx.createGain(); padBus.connect(lp); lp.connect(mk(1, 0.7));
    leadBus = mk(0.8, 0.75);
    drumBus = mk(0.18, 0.9);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  // ---------- 乐器 ----------
  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function panned(node, pan) {
    if (!pan || !ctx.createStereoPanner) return node;
    const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); return p;
  }
  function osc(dest, type, freq, t, dur, vol, { attack = 0.01, detune = 0, pan = 0, slideFrom = 0, slideTime = 0.06 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.detune.value = detune;
    if (slideFrom) { o.frequency.setValueAtTime(slideFrom, t); o.frequency.exponentialRampToValueAtTime(freq, t + slideTime); }
    else o.frequency.setValueAtTime(freq, t);
    env(g, t, vol, attack, dur);
    o.connect(g); panned(g, pan).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  const I = {
    // 柔和铺底和弦：每个音两层轻微失谐
    pad(notes, t, dur, vol = 0.04, type = 'triangle', attack = 1.2) {
      notes.forEach((m, i) => { for (const dt of [-7, 7]) osc(padBus, i % 2 ? 'sine' : type, mtof(m), t, dur, vol, { attack, detune: dt, pan: (i - 1.5) * 0.25 }); });
    },
    // 竖琴 / 钢片琴拨弦
    harp(m, t, vol = 0.06, pan = 0) {
      osc(leadBus, 'sine', mtof(m), t, 2, vol, { attack: 0.004, pan });
      osc(leadBus, 'triangle', mtof(m) * 2, t, 0.8, vol * 0.25, { attack: 0.004, pan });
    },
    // 铃音 / 钟琴：非整数倍泛音
    bell(m, t, vol = 0.05, decay = 3.2) {
      const f = mtof(m);
      [[1, 1], [2.76, 0.35], [5.4, 0.15]].forEach(([k, a]) => osc(leadBus, 'sine', f * k, t, decay / Math.sqrt(k), vol * a, { attack: 0.003, pan: (Math.random() - 0.5) * 0.6 }));
    },
    // 长笛 / 芦笛：正弦 + 颤音 + 一点气声，可从下方滑入
    flute(m, t, dur, vol = 0.05, slide = false, pan = 0) {
      const f = mtof(m);
      const o = osc(leadBus, 'sine', f, t, dur, vol, { attack: 0.07, pan, slideFrom: slide ? f * 0.94 : 0, slideTime: 0.09 });
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
      osc(leadBus, 'triangle', f * 2, t, dur * 0.8, vol * 0.12, { attack: 0.08, pan });
      noise(leadBus, t, 0.12, vol * 0.25, 'bandpass', f * 2, 2);
    },
    // 乌德琴：锯齿波 + 快速闭合的低通，起音略微偏高再落下
    oud(m, t, vol = 0.07, pan = 0) {
      const f = mtof(m), o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      flt.type = 'lowpass'; flt.Q.value = 3; flt.frequency.setValueAtTime(2600, t); flt.frequency.exponentialRampToValueAtTime(500, t + 0.35);
      env(g, t, vol, 0.004, 0.7);
      o.connect(flt); flt.connect(g); panned(g, pan).connect(leadBus);
      o.start(t); o.stop(t + 0.75);
    },
    // 弦乐固定音型：短促的锯齿波，低通后有一点"弓"的感觉
    strings(m, t, dur, vol = 0.05) {
      for (const dt of [-8, 8]) {
        const o = ctx.createOscillator(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
        flt.type = 'lowpass'; flt.frequency.value = 1100;
        env(g, t, vol, 0.02, dur);
        o.connect(flt); flt.connect(g); g.connect(padBus);
        o.start(t); o.stop(t + dur + 0.05);
      }
    },
    bass(m, t, dur, vol = 0.1) { osc(padBus, 'sine', mtof(m), t, dur, vol, { attack: 0.02 }); osc(padBus, 'triangle', mtof(m), t, dur * 0.5, vol * 0.3, { attack: 0.01 }); },
    // —— 打击乐 ——
    kick(t, vol = 0.5, from = 150, to = 48, dur = 0.35) {   // 低音鼓 / 达布卡"咚" / 太鼓
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
      env(g, t, vol, 0.003, dur); o.connect(g); g.connect(drumBus); o.start(t); o.stop(t + dur + 0.05);
      noise(drumBus, t, 0.03, vol * 0.25, 'lowpass', 900);
    },
    tek(t, vol = 0.18, freq = 3200) {                         // 达布卡"嗒"、框鼓边击
      noise(drumBus, t, 0.05, vol, 'bandpass', freq, 1.2);
      osc(drumBus, 'triangle', freq * 0.55, t, 0.04, vol * 0.4, { attack: 0.001 });
    },
    shaker(t, vol = 0.06) { noise(drumBus, t, 0.05, vol, 'highpass', 7000); },
    tamb(t, vol = 0.08) { noise(drumBus, t, 0.14, vol, 'highpass', 8500); osc(drumBus, 'square', 6200, t, 0.06, vol * 0.08, { attack: 0.001 }); },
    frame(t, vol = 0.32) { this.kick(t, vol, 120, 70, 0.22); },   // 凯尔特框鼓（Bodhrán）
    taiko(t, vol = 0.55) { this.kick(t, vol, 95, 42, 0.7); noise(drumBus, t, 0.25, vol * 0.3, 'lowpass', 400); },
    // 风声 / 冰晶闪烁的长噪声
    swell(t, dur, vol = 0.04, freq = 2500) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(padBus); s.start(t); s.stop(t + dur + 0.05);
    },
  };
  function noise(dest, t, dur, vol, type, freq, q = 0.7) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, vol, 0.002, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // 旋律：在音阶上随机游走，强拍尽量落在和弦音上
  function walker(scale) {
    let i = Math.floor(scale.length / 2);
    return (chordTones) => {
      i = Math.max(0, Math.min(scale.length - 1, i + rnd([-2, -1, -1, 1, 1, 2, 0])));
      if (chordTones && chance(0.6)) {
        let best = i, bd = 99;
        scale.forEach((m, j) => { if (chordTones.includes(m % 12) && Math.abs(j - i) < bd) { bd = Math.abs(j - i); best = j; } });
        i = best;
      }
      return scale[i];
    };
  }
  const pc = notes => notes.map(m => m % 12);

  // ---------- 曲目 ----------
  // 每首：bpm、每小节步数 spb、每步时值 beat（以四分音符为 1）、和声 bars，以及每一步调用的 play()
  const SONGS = {
    // 标题：梦幻、空灵
    title: {
      bpm: 70, spb: 8, beat: 0.5, vol: 0.9,
      bars: [
        { pad: [50, 57, 61, 66], bass: 38, arp: [62, 66, 69, 73, 74, 78] }, { pad: [47, 54, 57, 62], bass: 35, arp: [59, 62, 66, 69, 71, 74] },
        { pad: [43, 50, 54, 59], bass: 31, arp: [55, 59, 62, 66, 67, 71] }, { pad: [45, 50, 52, 57], bass: 33, arp: [57, 62, 64, 69, 74, 76] },
        { pad: [42, 50, 54, 57], bass: 42, arp: [62, 66, 69, 74, 78, 81] }, { pad: [40, 47, 50, 55], bass: 40, arp: [59, 62, 64, 67, 71, 74] },
        { pad: [43, 50, 54, 59], bass: 31, arp: [62, 66, 67, 71, 74, 78] }, { pad: [45, 52, 55, 61], bass: 33, arp: [61, 64, 69, 73, 76, 81] },
      ],
      play(t, s, bar, bi, St) {
        if (s === 0) {
          I.pad(bar.pad, t, St.barDur * 1.6, 0.045, 'triangle', 1.4);
          I.bass(bar.bass, t, St.barDur * 1.2, 0.09);
          if (bi % 2 === 0) I.bell(bar.arp[5] + 12, t, 0.05);
        }
        if (chance(s % 2 ? 0.55 : 0.85)) {
          St.ai = Math.max(0, Math.min(5, (St.ai || 2) + rnd([-2, -1, 1, 1, 2])));
          I.harp(bar.arp[St.ai], t + (Math.random() - 0.5) * 0.015, 0.06 + Math.random() * 0.03, (Math.random() - 0.5) * 0.8);
        }
      },
    },

    // 翠叶森林：凯尔特民谣，6/8 拍，竖琴 + 长笛 + 框鼓
    forest: {
      bpm: 66 * 3, spb: 6, beat: 1, vol: 0.85,   // 以八分音符计：每小节 6 个八分音符
      bars: [
        { pad: [52, 59, 64, 67], bass: 40 }, { pad: [50, 57, 62, 66], bass: 38 }, { pad: [48, 55, 60, 64], bass: 36 }, { pad: [50, 57, 62, 66], bass: 38 },
        { pad: [52, 59, 64, 67], bass: 40 }, { pad: [43, 50, 55, 59], bass: 43 }, { pad: [45, 52, 57, 60], bass: 33 }, { pad: [47, 54, 59, 63], bass: 35 },
      ],
      scale: [64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83],   // E 多利亚
      play(t, s, bar, bi, St, L) {
        const ch = bar.pad, step = St.stepDur;
        if (s === 0) I.pad(ch, t, St.barDur * 1.4, L === 0 ? 0.035 : 0.03);
        // 竖琴琶音：1-5-8-10-8-5
        const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12];
        if (L === 0 ? chance(0.75) : true) I.harp(arp[s], t, L === 0 ? 0.05 : 0.045, (s - 2.5) * 0.15);
        if (s === 0 || (L > 0 && s === 3)) I.bass(bar.bass, t, step * 2.6, L === 0 ? 0.08 : 0.11);
        if (L >= 1) {
          // 框鼓：1 拍重，4 拍次重，加一些轻击
          if (s === 0) I.frame(t, 0.34); else if (s === 3) I.frame(t, 0.24); else if (chance(0.35)) I.tek(t, 0.06, 1800);
          I.shaker(t, s % 3 === 0 ? 0.07 : 0.04);
          // 长笛主旋律：每两小节一句，长短交替
          St.mel = St.mel || walker(this.scale);
          const rhythm = bi % 2 === 0 ? [1, 0, 1, 1, 0, 1] : [1, 0, 0, 1, 0, 0];
          if (rhythm[s] && chance(0.85)) {
            const len = rhythm[s] && !rhythm[(s + 1) % 6] ? step * 1.9 : step * 0.95;
            I.flute(St.mel(pc(ch)), t, len, 0.045, chance(0.25), 0.1);
          }
        }
        if (L >= 2) { if (s === 0 || s === 3) I.kick(t, 0.45, 110, 45, 0.4); if (s === 5) I.frame(t, 0.2); }
      },
    },

    // 黄沙峡谷：中东风格，希贾兹音阶（D），乌德琴 + 芦笛 + 达布卡
    desert: {
      bpm: 96, spb: 16, beat: 0.25, vol: 0.85,   // 以十六分音符计
      bars: [
        { pad: [50, 54, 57], tone: 'D' }, { pad: [50, 54, 57], tone: 'D' }, { pad: [51, 55, 58], tone: 'Eb' }, { pad: [50, 54, 57], tone: 'D' },
        { pad: [43, 50, 55, 58], tone: 'Gm' }, { pad: [48, 51, 55], tone: 'Cm' }, { pad: [51, 55, 58], tone: 'Eb' }, { pad: [50, 54, 57], tone: 'D' },
      ],
      scale: [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79],      // D 希贾兹：D Eb F# G A Bb C
      riff: [50, 51, 54, 55, 57, 55, 54, 51],                   // 乌德琴固定音型
      play(t, s, bar, bi, St, L) {
        const step = St.stepDur;
        if (s === 0) {
          I.pad([38, 45], t, St.barDur * 1.3, 0.05, 'sawtooth', 0.8);   // 持续低音 D + A
          I.pad(bar.pad, t, St.barDur * 1.2, 0.025, 'triangle', 0.9);
        }
        if (L === 0) {
          // 备战：稀疏的乌德琴，带一点自由节奏
          if ([0, 6, 10].includes(s) && chance(0.85)) I.oud(rnd(this.scale.slice(0, 7)) - 12, t, 0.07, (Math.random() - 0.5) * 0.5);
          if (s === 8 && bi % 2 === 1) I.tamb(t, 0.04);
        } else {
          // 战斗：达布卡 Maqsum 节奏（咚 嗒 · 嗒 咚 · 嗒 ·），加轻击装饰
          const maq = { 0: 'D', 2: 'T', 6: 'T', 8: 'D', 12: 'T' };
          if (maq[s] === 'D') I.kick(t, 0.42, 140, 55, 0.3);
          else if (maq[s] === 'T') I.tek(t, 0.16, 3000);
          else if (s % 2 && chance(0.45)) I.tek(t, 0.05, 4200);
          if (s === 4 || s === 12) I.tamb(t, 0.07);
          // 乌德琴固定音型（八分音符）
          if (s % 2 === 0) I.oud(this.riff[(s / 2 + bi) % 8] + (bar.tone === 'Eb' ? 1 : 0), t, 0.06, -0.2);
          // 芦笛：带滑音的长句
          St.mel = St.mel || walker(this.scale);
          if ([0, 3, 6, 10, 12].includes(s) && chance(bi % 2 ? 0.55 : 0.8)) I.flute(St.mel(pc(bar.pad)), t, step * (s === 12 ? 4 : 2.6), 0.045, chance(0.5), 0.15);
          if (s === 0 || s === 8) I.bass(38, t, step * 6, 0.1);
        }
        if (L >= 2 && (s === 0 || s === 10)) I.kick(t, 0.5, 90, 40, 0.5);
      },
    },

    // 霜雪高原：冰晶空灵，E 小调，玻璃铺底 + 钟琴 + 弦乐 + 太鼓
    snow: {
      bpm: 84, spb: 8, beat: 0.5, vol: 0.8,   // 以八分音符计
      bars: [
        { pad: [52, 59, 64, 66], root: 40 }, { pad: [48, 55, 59, 64], root: 36 }, { pad: [43, 50, 55, 62], root: 43 }, { pad: [50, 55, 57, 62], root: 38 },
        { pad: [52, 59, 64, 66], root: 40 }, { pad: [45, 52, 55, 60], root: 33 }, { pad: [48, 55, 59, 64], root: 36 }, { pad: [47, 54, 57, 63], root: 35 },
      ],
      scale: [71, 74, 76, 78, 79, 81, 83, 86, 88, 90, 91],      // 高音区 E 小调
      play(t, s, bar, bi, St, L) {
        const step = St.stepDur;
        if (s === 0) {
          I.pad(bar.pad, t, St.barDur * 1.5, 0.035, 'sine', 1.6);           // 玻璃质感铺底
          I.pad(bar.pad.map(m => m + 24), t, St.barDur * 1.2, 0.008, 'sine', 2);
          if (bi % 4 === 0) I.swell(t, St.barDur * 2, 0.03, 2200);          // 冰原上的风
        }
        // 钟琴：备战时稀疏、战斗时更密
        St.mel = St.mel || walker(this.scale);
        if (chance(L === 0 ? (s % 2 ? 0.2 : 0.55) : (s % 2 ? 0.45 : 0.8))) I.bell(St.mel(pc(bar.pad)), t, L === 0 ? 0.035 : 0.04, 2.2);
        if (L === 0) {
          if (s === 0) I.bass(bar.root, t, St.barDur, 0.08);
        } else {
          // 弦乐固定音型：根音与五度交替的八分音符
          I.strings(s % 2 ? bar.root + 19 : bar.root + 12, t, step * 0.85, 0.035);
          if (s === 0 || s === 4) I.bass(bar.root, t, step * 3.5, 0.1);
          // 太鼓：1、2.5、3 拍
          if (s === 0) I.taiko(t, 0.5); else if (s === 3) I.taiko(t, 0.3); else if (s === 4) I.taiko(t, 0.4);
          if (s % 2 === 1) I.shaker(t, 0.035);   // 雪橇铃般的轻响
        }
        if (L >= 2) {
          if (s === 6 || s === 7) I.taiko(t, 0.45);
          I.strings(bar.root + 24 + (s % 2 ? 7 : 0), t, step * 0.8, 0.02);
        }
      },
    },
  };

  // ---------- 音序器 ----------
  let song = null, songKey = '', pending = null, step = 0, bi = 0, nextTime = 0, St = {};
  function setSongNow(key) {
    songKey = key; song = SONGS[key]; step = 0; bi = 0; St = {};
    St.stepDur = 60 / song.bpm * song.beat;
    St.barDur = St.stepDur * song.spb;
  }
  function tick() {
    if (!ctx || !song) return;
    while (nextTime < ctx.currentTime + 0.5) {
      const s = step % song.spb;
      if (s === 0 && pending) { setSongNow(pending); pending = null; apply(); }   // 只在小节线上换曲
      if (!Mu.muted && !files[songKey]) {
        try { song.play(nextTime, step % song.spb, song.bars[bi % song.bars.length], bi % song.bars.length, St, Mu.intensity); } catch (e) { /* 忽略单个音符的错误 */ }
      }
      step++;
      if (step % song.spb === 0) bi++;
      nextTime += St.stepDur;
    }
  }
  function wanted() { return Mu.mode === 'title' ? 'title' : (SONGS[G.biome] ? G.biome : 'forest'); }
  function apply() {
    if (!Mu.started) return;
    const key = pending || songKey;
    const f = files[key];
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(Mu.muted || f ? 0 : SONGS[key].vol, ctx.currentTime, 0.6);
    for (const k in files) {
      const el = files[k];
      if (!el) continue;
      if (k === key && !Mu.muted) { el.volume = 0.6; if (el.paused) el.play().catch(() => {}); }
      else el.pause();
    }
  }
  function cue() {
    const key = wanted();
    if (!Mu.started) return;
    if (!song) { setSongNow(key); apply(); return; }
    if (key !== songKey) { pending = key; apply(); }
  }

  // ---------- 控制接口 ----------
  // 浏览器要求用户先有一次点击 / 按键，音频才能开始
  Mu.start = function () {
    if (Mu.started) return;
    if (!A.unlock()) return;
    build();
    Mu.started = true;
    nextTime = ctx.currentTime + 0.1;
    cue();
    setInterval(tick, 100);
    tick();
  };
  Mu.setMode = function (mode) { Mu.mode = mode; if (mode === 'title') Mu.intensity = 0; cue(); };
  Mu.setIntensity = function (level) { Mu.intensity = level; };
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
    else { A.ctx.resume(); if (ctx) nextTime = Math.max(nextTime, ctx.currentTime + 0.05); apply(); }
  });
  Mu._songs = SONGS;   // 调试用
  // 调试：离线渲染某首曲子若干秒，返回音量（RMS）与峰值，用来检查各曲各强度是否正常发声、音量是否平衡
  Mu._render = async function (key, level, seconds = 8) {
    const saved = { ctx, out, padBus, leadBus, drumBus, noiseBuf, song, songKey, St, step, bi, nextTime, lvl: Mu.intensity, ac: A.ctx };
    const off = new OfflineAudioContext(2, 44100 * seconds, 44100);
    A.ctx = off; build(); out.gain.value = SONGS[key].vol;
    setSongNow(key); Mu.intensity = level;
    let errors = 0;
    for (let t = 0.05; t < seconds - 0.5; t += St.stepDur) {
      try { song.play(t, step % song.spb, song.bars[bi % song.bars.length], bi % song.bars.length, St, level); } catch (e) { errors++; }
      step++; if (step % song.spb === 0) bi++;
    }
    const buf = await off.startRendering();
    ({ ctx, out, padBus, leadBus, drumBus, noiseBuf, song, songKey, St, step, bi, nextTime } = saved);
    Mu.intensity = saved.lvl; A.ctx = saved.ac;
    const d = buf.getChannelData(0); let sum = 0, peak = 0;
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    return { rms: +Math.sqrt(sum / d.length).toFixed(3), peak: +peak.toFixed(2), errors };
  };
})();
