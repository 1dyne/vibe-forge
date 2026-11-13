// 마을 소리: 녹음 파일 없이 브라우저에서 직접 합성한다(저작권 걱정 없음).
// 물결(호수 근처), 갈대 바람(늘), 장작 타는 소리(화덕·화톳불 근처), 처마 풍경(가끔), 풀벌레(밤), 북(정시), 도깨비불 방울(가까이 가면).

export type Ambience = { water: number; fire: number; wisp: number };

export function createVillageSound(night: boolean) {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };

  // 물결: 낮은 대역 소음을 천천히 출렁이게
  const water = ctx.createGain(); water.gain.value = 0;
  { const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17; const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(lp.frequency); n.connect(lp).connect(water).connect(master); n.start(); lfo.start(); }
  // 갈대 바람
  const wind = ctx.createGain(); wind.gain.value = 0.035;
  { const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.6; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 0.025; lfo.connect(lg).connect(wind.gain); n.connect(bp).connect(wind).connect(master); n.start(); lfo.start(); }
  // 풀벌레(밤)
  const crickets = ctx.createGain(); crickets.gain.value = 0;
  if (night) { const o = ctx.createOscillator(); o.frequency.value = 4300; const am = ctx.createGain(); am.gain.value = 0; const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); o.connect(am).connect(crickets).connect(master); crickets.gain.value = 0.012; o.start(); lfo.start(); }

  function burst(freq: number, dur: number, vol: number, type: BiquadFilterType = "highpass") {
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain();
    const t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + dur + 0.02);
  }
  function ping(freq: number, dur: number, vol: number, type: OscillatorType = "sine") {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; const g = ctx.createGain();
    const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function drum() { // 북 한 번
    const o = ctx.createOscillator(); o.frequency.value = 90; const g = ctx.createGain(); const t = ctx.currentTime;
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.6);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(master); o.start(t); o.stop(t + 1.2); burst(300, 0.08, 0.15, "lowpass");
  }

  let amb: Ambience = { water: 0, fire: 0, wisp: 0 };
  let lastHourDrum = -1;
  const timer = window.setInterval(() => {
    if (ctx.state !== "running") return;
    if (amb.fire > 0.05 && Math.random() < amb.fire * 0.9) burst(1800 + Math.random() * 2500, 0.02 + Math.random() * 0.04, 0.12 * amb.fire); // 장작 탁탁
    if (Math.random() < 0.012) { const f = [1568, 1760, 2093, 2349][Math.floor(Math.random() * 4)]; ping(f, 2.2, 0.035); } // 풍경
    if (amb.wisp > 0.3 && Math.random() < 0.05) ping(2600 + Math.random() * 600, 0.5, 0.03 * amb.wisp, "triangle"); // 도깨비불 방울
    const d = new Date();
    if (d.getMinutes() === 0 && d.getSeconds() < 5 && lastHourDrum !== d.getHours()) { lastHourDrum = d.getHours(); drum(); setTimeout(drum, 1400); setTimeout(drum, 2800); }
  }, 90);

  return {
    resume: () => ctx.resume(),
    setAmbience(a: Ambience) {
      amb = a;
      const t = ctx.currentTime;
      water.gain.setTargetAtTime(0.03 + a.water * 0.22, t, 0.5);
    },
    setMuted(m: boolean) { master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.2); },
    close() { clearInterval(timer); ctx.close().catch(() => {}); }
  };
}

/** 대장간 안 소리: 화덕 장작 타닥(늘), 풀무 바람(몇 초마다), 가끔 가야금 같은 한 음(오음계). 마을 소리처럼 직접 합성 */
export function createForgeSound() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };
  // 화덕 웅웅 (낮은 불 소리)
  { const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; const g = ctx.createGain(); g.gain.value = 0.09; n.connect(lp).connect(g).connect(master); n.start(); }
  function burst(freq: number, dur: number, vol: number, type: BiquadFilterType = "highpass") {
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain();
    const t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + dur + 0.02);
  }
  function bellows() { // 풀무: 부풀었다 가라앉는 바람
    const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    n.connect(lp).connect(g).connect(master); n.start(t); n.stop(t + 1.5);
  }
  const SCALE = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33]; // 레 미 솔 라 시 레
  function pluck() { // 가야금처럼 튕기는 한 음: 빠른 어택, 긴 여운
    const f = SCALE[Math.floor(Math.random() * SCALE.length)];
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const g2 = ctx.createGain(); g2.gain.value = 0.3; o.connect(g); o2.connect(g2).connect(g); g.connect(master);
    o.frequency.setValueAtTime(f * 1.01, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15); // 살짝 농현
    o.start(t); o2.start(t); o.stop(t + 2.5); o2.stop(t + 2.5);
  }
  let next = 0, nextB = 2;
  const timer = window.setInterval(() => {
    if (ctx.state !== "running") return;
    if (Math.random() < 0.35) burst(1800 + Math.random() * 2500, 0.02 + Math.random() * 0.04, 0.09);
    const t = ctx.currentTime;
    if (t > nextB) { bellows(); nextB = t + 4 + Math.random() * 3; }
    if (t > next) { pluck(); if (Math.random() < 0.4) setTimeout(pluck, 260); next = t + 1.6 + Math.random() * 2.4; }
  }, 120);
  return {
    resume: () => ctx.resume(),
    setMuted(m: boolean) { master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.3); },
    close() { clearInterval(timer); ctx.close().catch(() => {}); }
  };
}

/** 소원 선착장 소리: 밤 호수 물결(늘), 느린 바람, 풀벌레, 가끔 대금처럼 숨이 섞인 긴 음(오음계)과 풍경. 직접 합성 */
export function createWishSound() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n; };
  // 물결: 선착장 기둥에 찰랑이는 낮은 물소리
  { const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380; const g = ctx.createGain(); g.gain.value = 0.11; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.21; const lg = ctx.createGain(); lg.gain.value = 0.06; lfo.connect(lg).connect(g.gain); n.connect(lp).connect(g).connect(master); n.start(); lfo.start(); }
  // 느린 바람
  { const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.5; const g = ctx.createGain(); g.gain.value = 0.025; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg).connect(g.gain); n.connect(bp).connect(g).connect(master); n.start(); lfo.start(); }
  // 풀벌레
  { const o = ctx.createOscillator(); o.frequency.value = 4100; const am = ctx.createGain(); am.gain.value = 0; const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 8; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); const g = ctx.createGain(); g.gain.value = 0.008; o.connect(am).connect(g).connect(master); o.start(); lfo.start(); }
  const SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33]; // 레 파 솔 라 도 레 (계면조 느낌)
  function flute(f: number, dur: number) { // 대금처럼: 사인파 + 천천히 깊어지는 떨림 + 숨소리
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6); vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.35); g.gain.setValueAtTime(0.05, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 2; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.012, t + 0.2); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); n.connect(bp).connect(ng).connect(master);
    o.start(t); vib.start(t); n.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }
  function chime() { const f = [1568, 1760, 2093][Math.floor(Math.random() * 3)]; const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5); o.connect(g).connect(master); o.start(t); o.stop(t + 2.6); }
  let nextPhrase = 1.5, nextChime = 4;
  const timer = window.setInterval(() => {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    if (t > nextPhrase) { // 두세 음짜리 느린 가락
      let i = Math.floor(Math.random() * 4), at = 0;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) { const f = SCALE[i], d = 1.6 + Math.random() * 1.4; setTimeout(() => flute(f, d), at * 1000); at += d * 0.85; i = Math.max(0, Math.min(SCALE.length - 1, i + (Math.random() < 0.5 ? -1 : 1))); }
      nextPhrase = t + at + 5 + Math.random() * 5;
    }
    if (t > nextChime) { chime(); nextChime = t + 6 + Math.random() * 8; }
  }, 200);
  return {
    resume: () => ctx.resume(),
    setMuted(m: boolean) { master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.3); },
    close() { clearInterval(timer); ctx.close().catch(() => {}); }
  };
}
