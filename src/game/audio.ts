const MUTE_STORAGE_KEY = 'bullion_stack_muted_v1';
const BGM_STORAGE_KEY = 'bullion_stack_bgm_v1';

// Bright pentatonic chime frequencies (C5, D5, E5, G5, A5, C6, D6, E6, G6)
const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

// Warm lounge / luxury atelier 16-step arpeggio & bass progression (Fmaj7 -> Em7 -> Dm7 -> Cmaj7)
const BGM_MELODY_HZ: (number | null)[] = [
  523.25, 659.25, 783.99, 659.25, // Fmaj7 shimmer
  493.88, 659.25, 783.99, 587.33, // Em7
  440.0, 523.25, 659.25, 523.25,  // Dm7
  392.0, 493.88, 587.33, 493.88,  // G6/Cmaj7 turnaround
];

const BGM_BASS_HZ: (number | null)[] = [
  174.61, null, null, null, // F3
  164.81, null, null, null, // E3
  146.83, null, null, null, // D3
  130.81, null, null, null, // C3
];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private bgmEnabled: boolean = true;
  private bgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
      const savedBgm = localStorage.getItem(BGM_STORAGE_KEY);
      this.bgmEnabled = savedBgm === null ? true : savedBgm === '1';
    } catch {
      this.muted = false;
      this.bgmEnabled = true;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
    if (next) {
      this.stopBgm();
    } else if (this.bgmEnabled && this.bgmPlaying) {
      this.startBgmLoop();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.unlock();
      this.playClick();
      if (this.bgmEnabled && this.bgmPlaying) {
        this.startBgmLoop();
      }
    }
    return this.muted;
  }

  public toggleBgm(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    try {
      localStorage.setItem(BGM_STORAGE_KEY, this.bgmEnabled ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
    if (!this.bgmEnabled) {
      this.stopBgmTimerOnly();
    } else if (!this.muted) {
      this.unlock();
      this.playClick();
      this.bgmPlaying = true;
      this.startBgmLoop();
    }
    return this.bgmEnabled;
  }

  public unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public startBgm(): void {
    this.bgmPlaying = true;
    if (!this.muted && this.bgmEnabled) {
      this.unlock();
      this.startBgmLoop();
    }
  }

  public pauseBgm(): void {
    this.bgmPlaying = false;
    this.stopBgmTimerOnly();
  }

  public stopBgm(): void {
    this.bgmPlaying = false;
    this.stopBgmTimerOnly();
  }

  private stopBgmTimerOnly(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private startBgmLoop(): void {
    if (this.bgmTimer !== null) return;
    this.playBgmStep();
    // Gentle 88 BPM eighth-note step (~340ms)
    this.bgmTimer = window.setInterval(() => {
      if (!this.bgmPlaying || this.muted || !this.bgmEnabled) {
        this.stopBgmTimerOnly();
        return;
      }
      this.playBgmStep();
    }, 340);
  }

  private playBgmStep(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const step = this.bgmStep % BGM_MELODY_HZ.length;
    this.bgmStep = (this.bgmStep + 1) % BGM_MELODY_HZ.length;

    const melodyFreq = BGM_MELODY_HZ[step];
    const bassFreq = BGM_BASS_HZ[step];

    if (melodyFreq) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(melodyFreq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.032, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    }

    if (bassFreq) {
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();

      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(bassFreq, now);

      bassGain.gain.setValueAtTime(0.001, now);
      bassGain.gain.linearRampToValueAtTime(0.045, now + 0.04);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 1.2);
    }
  }

  public playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.04);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playRelease(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);

    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playLand(combo: number, isPerfect: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Cute bouncy soft plop
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(190, now);
    thudOsc.frequency.exponentialRampToValueAtTime(280, now + 0.045);
    thudOsc.frequency.exponentialRampToValueAtTime(135, now + 0.12);
    thudGain.gain.setValueAtTime(0.16, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.15);

    // Gentle soft tap
    const pingOsc = ctx.createOscillator();
    const pingGain = ctx.createGain();
    pingOsc.type = 'triangle';
    pingOsc.frequency.setValueAtTime(520, now);
    pingOsc.frequency.exponentialRampToValueAtTime(340, now + 0.06);
    pingGain.gain.setValueAtTime(0.045, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    pingOsc.connect(pingGain);
    pingGain.connect(ctx.destination);
    pingOsc.start(now);
    pingOsc.stop(now + 0.08);

    if (isPerfect) {
      const noteIdx = Math.min(Math.max(combo - 1, 0), PENTATONIC_HZ.length - 1);
      const freq = PENTATONIC_HZ[noteIdx];

      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(freq, now);

      chimeGain.gain.setValueAtTime(0.14, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeOsc.start(now);
      chimeOsc.stop(now + 0.38);

      const overOsc = ctx.createOscillator();
      const overGain = ctx.createGain();
      overOsc.type = 'sine';
      overOsc.frequency.setValueAtTime(freq * 2, now + 0.015);
      overGain.gain.setValueAtTime(0.055, now + 0.015);
      overGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      overOsc.connect(overGain);
      overGain.connect(ctx.destination);
      overOsc.start(now + 0.015);
      overOsc.stop(now + 0.3);
    }
  }

  public playSlice(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const shearOsc = ctx.createOscillator();
    const shearGain = ctx.createGain();
    shearOsc.type = 'sawtooth';
    shearOsc.frequency.setValueAtTime(1650, now);
    shearOsc.frequency.exponentialRampToValueAtTime(620, now + 0.07);
    shearGain.gain.setValueAtTime(0.08, now);
    shearGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    shearOsc.connect(shearGain);
    shearGain.connect(ctx.destination);
    shearOsc.start(now);
    shearOsc.stop(now + 0.085);

    const bufferSize = Math.floor(ctx.sampleRate * 0.06);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(2.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playPowerUp(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [659.25, 880.0, 1174.66];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.11, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public playShieldSave(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  public playRestore(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  public playMiss(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [349.23, 277.18, 196.0];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, start + 0.16);
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }
}
