export type SoundName =
  | 'messageSent'
  | 'messageReceived'
  | 'notification'
  | 'reaction'
  | 'typing'
  | 'userJoin'
  | 'userLeave'
  | 'error'
  | 'success';

export interface SoundEffectsConfig {
  volume?: number;
  muted?: boolean;
  sounds?: Partial<Record<SoundName, string>>;
}

interface SynthConfig {
  frequency: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  envelope?: { attack?: number; decay?: number; sustain?: number; release?: number };
}

interface ADSREnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const SYNTH_PRESETS: Record<SoundName, SynthConfig> = {
  messageSent: { frequency: 880, type: 'sine', duration: 0.12, gain: 0.3, envelope: { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.06 } },
  messageReceived: { frequency: 660, type: 'sine', duration: 0.18, gain: 0.25, envelope: { attack: 0.01, decay: 0.08, sustain: 0.4, release: 0.09 } },
  notification: { frequency: 1047, type: 'triangle', duration: 0.25, gain: 0.3, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.14 } },
  reaction: { frequency: 1319, type: 'sine', duration: 0.1, gain: 0.2, envelope: { attack: 0.005, decay: 0.04, sustain: 0.2, release: 0.05 } },
  typing: { frequency: 440, type: 'square', duration: 0.03, gain: 0.08, envelope: { attack: 0.001, decay: 0.01, sustain: 0.05, release: 0.02 } },
  userJoin: { frequency: 523, type: 'sine', duration: 0.3, gain: 0.25, envelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.18 } },
  userLeave: { frequency: 392, type: 'sine', duration: 0.3, gain: 0.2, envelope: { attack: 0.02, decay: 0.12, sustain: 0.3, release: 0.16 } },
  error: { frequency: 220, type: 'sawtooth', duration: 0.2, gain: 0.25, envelope: { attack: 0.01, decay: 0.08, sustain: 0.4, release: 0.11 } },
  success: { frequency: 659, type: 'sine', duration: 0.35, gain: 0.25, envelope: { attack: 0.02, decay: 0.12, sustain: 0.4, release: 0.21 } },
};

export class SoundEffects {
  private config: Required<SoundEffectsConfig>;
  private audioContext: AudioContext | null = null;
  private customSounds: Map<SoundName, string> = new Map();
  private preloadedBuffers: Map<SoundName, AudioBuffer> = new Map();

  constructor(config?: SoundEffectsConfig) {
    this.config = {
      volume: config?.volume ?? 0.5,
      muted: config?.muted ?? false,
      sounds: config?.sounds ?? {},
    };

    for (const [name, url] of Object.entries(this.config.sounds)) {
      if (url) this.customSounds.set(name as SoundName, url);
    }
  }

  play(soundName: SoundName): void {
    if (this.config.muted) return;

    const customUrl = this.customSounds.get(soundName);
    if (customUrl) {
      this.playUrl(customUrl);
      return;
    }

    const buffer = this.preloadedBuffers.get(soundName);
    if (buffer) {
      this.playBuffer(buffer);
      return;
    }

    this.playSynth(soundName);
  }

  setVolume(vol: number): void {
    this.config.volume = Math.max(0, Math.min(1, vol));
  }

  mute(): void {
    this.config.muted = true;
  }

  unmute(): void {
    this.config.muted = false;
  }

  toggleSound(): boolean {
    this.config.muted = !this.config.muted;
    return !this.config.muted;
  }

  preloadSounds(): void {
    const ctx = this.getContext();
    const names: SoundName[] = [
      'messageSent', 'messageReceived', 'notification', 'reaction',
      'typing', 'userJoin', 'userLeave', 'error', 'success',
    ];

    for (const name of names) {
      const preset = SYNTH_PRESETS[name];
      const sampleRate = ctx.sampleRate;
      const length = Math.ceil(sampleRate * preset.duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const channel = buffer.getChannelData(0);

      const env: ADSREnvelope = {
        attack: preset.envelope?.attack ?? 0.01,
        decay: preset.envelope?.decay ?? 0.05,
        sustain: preset.envelope?.sustain ?? 0.5,
        release: preset.envelope?.release ?? preset.duration * 0.3,
      };

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let envelope = 1;

        if (t < env.attack) {
          envelope = t / env.attack;
        } else if (t < env.attack + env.decay) {
          envelope = 1 - (1 - env.sustain) * ((t - env.attack) / env.decay);
        } else if (t > preset.duration - env.release) {
          envelope = env.sustain * (1 - (t - (preset.duration - env.release)) / env.release);
        } else {
          envelope = env.sustain;
        }

        const sample = Math.sin(2 * Math.PI * preset.frequency * t) * envelope * preset.gain;
        channel[i] = sample;
      }

      this.preloadedBuffers.set(name, buffer);
    }
  }

  setCustomSound(name: SoundName, url: string): void {
    this.customSounds.set(name, url);
    this.preloadedBuffers.delete(name);
  }

  setMuted(muted: boolean): void {
    this.config.muted = muted;
  }

  isMuted(): boolean {
    return this.config.muted;
  }

  getVolume(): number {
    return this.config.volume;
  }

  destroy(): void {
    this.customSounds.clear();
    this.preloadedBuffers.clear();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
  }

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playSynth(soundName: SoundName): void {
    const ctx = this.getContext();
    const preset = SYNTH_PRESETS[soundName];
    if (!preset) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = preset.type;
    osc.frequency.setValueAtTime(preset.frequency, ctx.currentTime);

    const vol = preset.gain * this.config.volume;
    const env: ADSREnvelope = {
      attack: preset.envelope?.attack ?? 0.01,
      decay: preset.envelope?.decay ?? 0.05,
      sustain: preset.envelope?.sustain ?? 0.5,
      release: preset.envelope?.release ?? preset.duration * 0.3,
    };

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + env.attack);
    gain.gain.linearRampToValueAtTime(vol * env.sustain, now + env.attack + env.decay);
    gain.gain.setValueAtTime(vol * env.sustain, now + preset.duration - env.release);
    gain.gain.linearRampToValueAtTime(0, now + preset.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + preset.duration);
  }

  private playBuffer(buffer: AudioBuffer): void {
    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    gain.gain.setValueAtTime(this.config.volume, ctx.currentTime);

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  private playUrl(url: string): void {
    const audio = new Audio(url);
    audio.volume = this.config.volume;
    audio.play().catch(() => {});
  }
}
