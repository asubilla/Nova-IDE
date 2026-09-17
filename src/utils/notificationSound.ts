type SoundType = 'success' | 'error' | 'warning' | 'info';

const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Audio not available
  }
}

const SOUND_MAP: Record<SoundType, () => void> = {
  success: () => {
    playTone(523, 0.12, 'sine', 0.25);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.25), 100);
    setTimeout(() => playTone(784, 0.18, 'sine', 0.25), 200);
  },
  error: () => {
    playTone(330, 0.2, 'square', 0.2);
    setTimeout(() => playTone(262, 0.3, 'square', 0.2), 180);
  },
  warning: () => {
    playTone(440, 0.15, 'triangle', 0.25);
    setTimeout(() => playTone(440, 0.15, 'triangle', 0.25), 200);
  },
  info: () => {
    playTone(660, 0.1, 'sine', 0.15);
  },
};

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  try {
    localStorage.setItem('nova-notifications-sound', enabled ? '1' : '0');
  } catch { /* ignore */ }
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function playNotificationSound(type: SoundType) {
  if (!soundEnabled) return;
  SOUND_MAP[type]?.();
}

export function initSoundSetting() {
  try {
    const stored = localStorage.getItem('nova-notifications-sound');
    if (stored === '0') soundEnabled = false;
  } catch { /* ignore */ }
}
