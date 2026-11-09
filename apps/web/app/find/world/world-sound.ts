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
