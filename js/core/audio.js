/**
 * Audio Controller for MT5 Sound Effects
 * Uses real MetaTrader 5 sound assets with Web Audio API fallback.
 */
class AudioManager {
  constructor() {
    this.enabled = true;
    this.sounds = {
      ok: new Audio('sounds/ok.wav'),
      alert: new Audio('sounds/alert.wav'),
      err: new Audio('sounds/err.wav')
    };
    this.audioCtx = null;
  }

  initWebAudio() {
    if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
  }

  play(name) {
    if (!this.enabled) return;
    this.initWebAudio();

    const audio = this.sounds[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Fallback beep if HTML5 Audio is blocked before user gesture
        this.fallbackBeep(name);
      });
    } else {
      this.fallbackBeep(name);
    }
  }

  fallbackBeep(type) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (type === 'ok') {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.08); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'err') {
        osc.frequency.setValueAtTime(220.0, now);
        osc.frequency.setValueAtTime(160.0, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else { // alert
        osc.frequency.setValueAtTime(740.0, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch (e) {
      // Ignore audio synthesis errors
    }
  }

  playOk() { this.play('ok'); }
  playAlert() { this.play('alert'); }
  playError() { this.play('err'); }
}

export const audioManager = new AudioManager();
