export interface VoiceMessageOptions {
  maxDuration?: number;
  silenceThreshold?: number;
  silenceTimeout?: number;
  sampleRate?: number;
}

interface RecordingState {
  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  stream: MediaStream | null;
  chunks: Blob[];
  startTime: number;
  animationFrame: number | null;
}

interface PlaybackState {
  isPlaying: boolean;
  audio: HTMLAudioElement | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaElementAudioSourceNode | null;
  animationFrame: number | null;
  playbackRate: number;
}

const DEFAULT_OPTIONS: Required<VoiceMessageOptions> = {
  maxDuration: 300,
  silenceThreshold: 0.01,
  silenceTimeout: 3,
  sampleRate: 44100,
};

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];

export class VoiceMessage {
  private options: Required<VoiceMessageOptions>;
  private recording: RecordingState;
  private playback: PlaybackState;
  private currentSpeedIndex = 1;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private recorderElement: HTMLElement | null = null;
  private onRecordComplete: ((blob: Blob, duration: number) => void) | null = null;

  constructor(options?: VoiceMessageOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.recording = {
      isRecording: false,
      mediaRecorder: null,
      audioContext: null,
      analyser: null,
      stream: null,
      chunks: [],
      startTime: 0,
      animationFrame: null,
    };
    this.playback = {
      isPlaying: false,
      audio: null,
      audioContext: null,
      analyser: null,
      source: null,
      animationFrame: null,
      playbackRate: 1,
    };
  }

  renderRecorder(onComplete: (blob: Blob, duration: number) => void): HTMLElement {
    this.onRecordComplete = onComplete;

    const container = document.createElement('div');
    container.className = 'voice-recorder';

    const micBtn = document.createElement('button');
    micBtn.className = 'voice-mic-btn';
    micBtn.innerHTML = '<span class="mic-icon">\ud83c\udf99</span>';

    const status = document.createElement('div');
    status.className = 'voice-recorder-status';
    status.style.display = 'none';

    const timer = document.createElement('span');
    timer.className = 'voice-timer';
    timer.textContent = '0:00';

    const waveform = document.createElement('canvas');
    waveform.className = 'voice-record-waveform';
    waveform.width = 200;
    waveform.height = 40;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'voice-cancel-btn';
    cancelBtn.textContent = 'Cancel';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'voice-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.style.display = 'none';

    status.append(timer, waveform);
    container.append(micBtn, status, cancelBtn, sendBtn);

    micBtn.addEventListener('click', async () => {
      if (this.recording.isRecording) {
        await this.stopRecording();
        sendBtn.style.display = 'inline-block';
      } else {
        await this.startRecording();
        status.style.display = 'flex';
        sendBtn.style.display = 'none';
      }
    });

    cancelBtn.addEventListener('click', () => {
      if (this.recording.isRecording) {
        this.cancelRecording();
      }
      status.style.display = 'none';
      sendBtn.style.display = 'none';
      timer.textContent = '0:00';
    });

    sendBtn.addEventListener('click', async () => {
      if (this.recording.chunks.length > 0) {
        const duration = (Date.now() - this.recording.startTime) / 1000;
        const blob = new Blob(this.recording.chunks, { type: 'audio/webm' });
        this.recording.chunks = [];
        status.style.display = 'none';
        sendBtn.style.display = 'none';
        timer.textContent = '0:00';
        this.onRecordComplete?.(blob, duration);
      }
    });

    this.recorderElement = container;
    return container;
  }

  renderPlayer(audioUrl: string, duration: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'voice-player';

    const playBtn = document.createElement('button');
    playBtn.className = 'voice-play-btn';
    playBtn.textContent = '\u25b6';

    const progressContainer = document.createElement('div');
    progressContainer.className = 'voice-progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'voice-progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = 'voice-progress-fill';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'voice-time';
    timeLabel.textContent = `0:00 / ${this.formatTime(duration)}`;

    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);

    const speedBtn = document.createElement('button');
    speedBtn.className = 'voice-speed-btn';
    speedBtn.textContent = '1x';

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'voice-volume';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '100';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'voice-download-btn';
    downloadBtn.textContent = '\u2193';

    const waveform = document.createElement('canvas');
    waveform.className = 'voice-playback-waveform';
    waveform.width = 300;
    waveform.height = 40;

    playBtn.addEventListener('click', () => {
      if (this.playback.isPlaying) {
        this.pause();
        playBtn.textContent = '\u25b6';
      } else {
        this.play(audioUrl);
        playBtn.textContent = '\u23f8';
      }
    });

    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      this.seek(pct * duration);
    });

    speedBtn.addEventListener('click', () => {
      this.currentSpeedIndex = (this.currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
      const speed = PLAYBACK_SPEEDS[this.currentSpeedIndex];
      this.playback.playbackRate = speed;
      if (this.playback.audio) this.playback.audio.playbackRate = speed;
      speedBtn.textContent = `${speed}x`;
    });

    volumeSlider.addEventListener('input', () => {
      this.setVolume(parseInt(volumeSlider.value) / 100);
    });

    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = 'voice-message.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    const updateProgress = () => {
      if (this.playback.audio) {
        const current = this.playback.audio.currentTime;
        const pct = duration > 0 ? (current / duration) * 100 : 0;
        progressFill.style.width = `${pct}%`;
        timeLabel.textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;
      }
    };

    this.playback.audio?.addEventListener('timeupdate', updateProgress);
    this.playback.audio?.addEventListener('ended', () => {
      playBtn.textContent = '\u25b6';
      this.playback.isPlaying = false;
      progressFill.style.width = '0%';
    });

    container.append(playBtn, waveform, progressContainer, timeLabel, speedBtn, volumeSlider, downloadBtn);
    return container;
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      this.recording = {
        ...this.recording,
        isRecording: true,
        mediaRecorder,
        audioContext,
        analyser,
        stream,
        chunks,
        startTime: Date.now(),
      };

      mediaRecorder.start(100);
      this.startRecordingTimer();
      this.startSilenceDetection();
      this.startWaveformAnimation();
    } catch {
      throw new Error('Microphone access denied');
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recording.mediaRecorder) return;

    this.recording.mediaRecorder.stop();
    this.recording.stream?.getTracks().forEach((t) => t.stop());
    this.stopRecordingTimer();
    this.cancelSilenceDetection();
    this.stopWaveformAnimation();
    this.recording.audioContext?.close();

    this.recording.isRecording = false;
    this.recording.mediaRecorder = null;
    this.recording.audioContext = null;
    this.recording.analyser = null;
    this.recording.stream = null;
  }

  private cancelRecording(): void {
    this.recording.chunks = [];
    this.stopRecording();
  }

  play(url: string): void {
    if (this.playback.audio) {
      this.playback.audio.play();
      this.playback.isPlaying = true;
      return;
    }

    const audio = new Audio(url);
    audio.playbackRate = this.playback.playbackRate;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    this.playback = {
      ...this.playback,
      isPlaying: true,
      audio,
      audioContext,
      analyser,
      source,
    };

    audio.play();
    audio.addEventListener('ended', () => {
      this.playback.isPlaying = false;
    });
  }

  pause(): void {
    if (this.playback.audio) {
      this.playback.audio.pause();
      this.playback.isPlaying = false;
    }
  }

  seek(position: number): void {
    if (this.playback.audio) {
      this.playback.audio.currentTime = position;
    }
  }

  setVolume(vol: number): void {
    if (this.playback.audio) {
      this.playback.audio.volume = Math.max(0, Math.min(1, vol));
    }
  }

  getDuration(): number {
    return this.playback.audio?.duration ?? 0;
  }

  renderWaveform(audioBuffer: AudioBuffer, canvas: HTMLElement): void {
    const cvs = canvas as HTMLCanvasElement;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / cvs.width);
    const amp = cvs.height / 2;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#6b7280';

    for (let i = 0; i < cvs.width; i++) {
      let min = 1;
      let max = -1;
      const start = i * step;
      for (let j = 0; j < step; j++) {
        const datum = data[start + j] ?? 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, amp - max * amp, 1, h);
    }
  }

  async download(): Promise<void> {
    if (this.recording.chunks.length > 0) {
      const blob = new Blob(this.recording.chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'voice-message.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  destroy(): void {
    this.cancelRecording();
    if (this.playback.audio) {
      this.playback.audio.pause();
      this.playback.audio = null;
    }
    if (this.playback.animationFrame) {
      cancelAnimationFrame(this.playback.animationFrame);
    }
    this.playback.audioContext?.close();
  }

  private startRecordingTimer(): void {
    const update = () => {
      if (!this.recording.isRecording) return;
      const elapsed = (Date.now() - this.recording.startTime) / 1000;
      const timer = this.recorderElement?.querySelector('.voice-timer');
      if (timer) timer.textContent = this.formatTime(elapsed);
      this.maxDurationTimer = setTimeout(update, 100);
    };
    update();

    this.maxDurationTimer = setTimeout(() => {
      if (this.recording.isRecording) this.stopRecording();
    }, this.options.maxDuration * 1000);
  }

  private stopRecordingTimer(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private startSilenceDetection(): void {
    if (!this.recording.analyser) return;

    const bufferLength = this.recording.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const detect = () => {
      if (!this.recording.isRecording || !this.recording.analyser) return;

      this.recording.analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);

      if (rms < this.options.silenceThreshold) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            if (this.recording.isRecording) this.stopRecording();
          }, this.options.silenceTimeout * 1000);
        }
      } else {
        this.cancelSilenceDetection();
      }

      this.recording.animationFrame = requestAnimationFrame(detect);
    };

    detect();
  }

  private cancelSilenceDetection(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private startWaveformAnimation(): void {
    if (!this.recording.analyser) return;

    const canvas = this.recorderElement?.querySelector('.voice-record-waveform') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = this.recording.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      if (!this.recording.isRecording || !this.recording.analyser) return;

      this.recording.analyser.getFloatTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 2 + 0.5;
        const y = v * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      this.recording.animationFrame = requestAnimationFrame(draw);
    };

    draw();
  }

  private stopWaveformAnimation(): void {
    if (this.recording.animationFrame) {
      cancelAnimationFrame(this.recording.animationFrame);
      this.recording.animationFrame = null;
    }
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
