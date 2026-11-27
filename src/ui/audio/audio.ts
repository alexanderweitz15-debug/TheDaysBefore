// Procedural sound with Web Audio (GDD 5 Audio): UI click, shots, explosions, horde carpet, ambient.
// Mixer: master, effects, ambient, ui, horde. Silent in a background tab when the setting is on.
import { effect } from '@preact/signals';
import type { SimView } from '../../core/types/app';
import { FX_TYPES } from '../../core/types/combat';
import { AUDIO } from '../../data/game';
import { cameraView } from '../../render/view-state';
import { settings } from '../settings/store';

const SHOT = FX_TYPES.indexOf('shot');
const EXPLOSION = FX_TYPES.indexOf('explosion');
const MINE = FX_TYPES.indexOf('mineBlast');

class Engine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private ambient!: GainNode;
  private ui!: GainNode;
  private horde!: GainNode;
  private hordeLevel!: GainNode;
  private ambientLevel!: GainNode;
  private noise!: AudioBuffer;
  private soundsThisSecond = 0;
  private windowStart = 0;

  /** Creates the context on the first user gesture (browser autoplay rules). */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.shouldMute()) void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const mk = (to: AudioNode): GainNode => {
      const g = ctx.createGain();
      g.connect(to);
      return g;
    };
    this.master = mk(ctx.destination);
    this.effects = mk(this.master);
    this.ambient = mk(this.master);
    this.ui = mk(this.master);
    this.horde = mk(this.master);
    // Shared noise buffer, 2 s.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.buildHorde();
    this.buildAmbient();
    this.applyMix();
    if (this.shouldMute()) void ctx.suspend();
  }

  private shouldMute(): boolean {
    return settings.muteInBackground.peek() && document.hidden;
  }

  private loop(filterType: BiquadFilterType, freq: number, q: number, to: AudioNode): GainNode {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(to);
    src.start();
    return g;
  }

  private buildHorde(): void {
    // Rumbling carpet plus a slow swell; level follows the visible zombie count.
    this.hordeLevel = this.loop('bandpass', 380, 0.7, this.horde);
    const ctx = this.ctx as AudioContext;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const depth = ctx.createGain();
    depth.gain.value = 0.15;
    lfo.connect(depth).connect(this.hordeLevel.gain);
    lfo.start();
  }

  private buildAmbient(): void {
    this.ambientLevel = this.loop('lowpass', 420, 0.5, this.ambient);
    const ctx = this.ctx as AudioContext;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const depth = ctx.createGain();
    depth.gain.value = 0.04;
    lfo.connect(depth).connect(this.ambientLevel.gain);
    lfo.start();
  }

  applyMix(): void {
    if (!this.ctx) return;
    const v = (p: number): number => (p / 100) ** 2;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v(settings.volMaster.peek()), t, 0.05);
    this.effects.gain.setTargetAtTime(v(settings.volEffects.peek()), t, 0.05);
    this.ambient.gain.setTargetAtTime(v(settings.volAmbient.peek()), t, 0.05);
    this.ui.gain.setTargetAtTime(v(settings.volUi.peek()), t, 0.05);
    this.horde.gain.setTargetAtTime(v(settings.volHorde.peek()), t, 0.05);
  }

  /** Horde carpet level from the number of zombies in view; ambient only before the outbreak. */
  setScene(visibleZombies: number, farmPhase: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { hordeMinCount: lo, hordeFullCount: hi } = AUDIO;
    const lvl = visibleZombies < lo ? 0 : Math.min(1, Math.log(visibleZombies / lo) / Math.log(hi / lo));
    this.hordeLevel.gain.setTargetAtTime(lvl * 0.5, t, 0.4);
    this.ambientLevel.gain.setTargetAtTime(farmPhase ? 0.18 : 0, t, 1.5);
  }

  private allowed(): boolean {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return false;
    const now = ctx.currentTime;
    if (now - this.windowStart > 1) {
      this.windowStart = now;
      this.soundsThisSecond = 0;
    }
    return ++this.soundsThisSecond <= AUDIO.maxSoundsPerSecond;
  }

  /** Output node with distance attenuation and pan for a world position; null when out of earshot. */
  private spatial(x: number, y: number, bus: GainNode): AudioNode | null {
    const ctx = this.ctx as AudioContext;
    const halfW = cameraView.width / 2 / cameraView.zoom;
    const range = Math.max(AUDIO.hearingRangeM, halfW * 2);
    const dx = x - cameraView.cx;
    const dist = Math.hypot(dx, y - cameraView.cy);
    if (dist > range) return null;
    const g = ctx.createGain();
    g.gain.value = (1 - dist / range) ** 1.5;
    let out: AudioNode = g;
    if (!settings.monoAudio.peek() && 'createStereoPanner' in ctx) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, dx / Math.max(1, halfW * 1.5)));
      g.connect(p);
      out = p;
    }
    out.connect(bus);
    return g;
  }

  private burst(dest: AudioNode, dur: number, freq0: number, freq1: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loopStart = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random(), dur + 0.05);
  }

  shot(x: number, y: number, gain = 0.5): void {
    if (!this.allowed()) return;
    const out = this.spatial(x, y, this.effects);
    if (out) this.burst(out, 0.07, 3800, 600, gain);
  }

  explosion(x: number, y: number, radius: number): void {
    if (!this.allowed()) return;
    const out = this.spatial(x, y, this.effects);
    if (!out) return;
    const dur = 0.5 + Math.min(1, radius / 30) * 0.7;
    this.burst(out, dur, 1400, 60, 1);
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur);
  }

  click(): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g).connect(this.ui);
    o.start(t);
    o.stop(t + 0.07);
  }

  /** Faint distant shot or siren during the farm phase. */
  distant(kind: 'shot' | 'siren'): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    if (kind === 'shot') {
      const g = ctx.createGain();
      g.gain.value = 0.25;
      g.connect(this.ambient);
      this.burst(g, 0.25, 700, 120, 0.6);
      return;
    }
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    for (let i = 0; i < 4; i++) {
      o.frequency.setValueAtTime(620, t + i * 1.2);
      o.frequency.linearRampToValueAtTime(880, t + i * 1.2 + 0.6);
      o.frequency.linearRampToValueAtTime(620, t + i * 1.2 + 1.2);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1);
    g.gain.linearRampToValueAtTime(0.0001, t + 4.8);
    o.connect(f).connect(g).connect(this.ambient);
    o.start(t);
    o.stop(t + 5);
  }

  onVisibility(): void {
    if (!this.ctx) return;
    if (this.shouldMute()) void this.ctx.suspend();
    else void this.ctx.resume();
  }
}

const rand = (r: readonly [number, number] | readonly number[]): number =>
  (r[0] as number) + Math.random() * ((r[1] as number) - (r[0] as number));

/** Installs the audio: gesture unlock, mix effect, FX listener, scene updates. Returns a cleanup. */
export function installAudio(sim: SimView): () => void {
  const engine = new Engine();
  const unlock = (): void => engine.start();
  const onClick = (e: Event): void => {
    engine.start();
    if (e.target instanceof Element && e.target.closest('button')) engine.click();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('click', onClick, true);
  const onVis = (): void => engine.onVisibility();
  document.addEventListener('visibilitychange', onVis);
  const stopMix = effect(() => {
    settings.volMaster.value;
    settings.volEffects.value;
    settings.volAmbient.value;
    settings.volUi.value;
    settings.volHorde.value;
    engine.applyMix();
  });
  const stopMute = effect(() => {
    settings.muteInBackground.value;
    engine.onVisibility();
  });
  const off = sim.onSnapshot((s) => {
    for (let i = 0; i < s.fxCount; i++) {
      const k = s.fx[i * 4] as number;
      const x = s.fx[i * 4 + 1] as number;
      const y = s.fx[i * 4 + 2] as number;
      if (k === SHOT) engine.shot(x, y);
      else if (k === EXPLOSION || k === MINE) engine.explosion(x, y, s.fx[i * 4 + 3] as number);
    }
  });
  let nextShot = performance.now() + rand(AUDIO.ambientDistantShotMs);
  let nextSiren = performance.now() + rand(AUDIO.ambientGustMs) * 4;
  const scene = window.setInterval(() => {
    const s = sim.curr;
    let visible = 0;
    if (s) {
      const hw = cameraView.width / 2 / cameraView.zoom;
      const hh = cameraView.height / 2 / cameraView.zoom;
      const z = s.zombies;
      for (let i = 0; i < z.count; i++) {
        const x = z.pos[i * 2] as number;
        const y = z.pos[i * 2 + 1] as number;
        if (Math.abs(x - cameraView.cx) < hw && Math.abs(y - cameraView.cy) < hh) visible++;
      }
    }
    const farm = sim.mission?.phase === 'farm';
    engine.setScene(visible, farm);
    const now = performance.now();
    if (farm && now > nextShot) {
      engine.distant('shot');
      nextShot = now + rand(AUDIO.ambientDistantShotMs);
    }
    if (farm && now > nextSiren) {
      engine.distant('siren');
      nextSiren = now + rand(AUDIO.ambientGustMs) * 6;
    }
  }, AUDIO.hordeUpdateMs);
  return () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('click', onClick, true);
    document.removeEventListener('visibilitychange', onVis);
    stopMix();
    stopMute();
    off();
    window.clearInterval(scene);
  };
}
