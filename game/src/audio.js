// DAPUR SENJA — audio: tiny WebAudio synth, no files, no network.
// Chop thunk, stove sizzle tick, serve ding, order bell, burn buzz.
export function createAudio() {
  let ctx = null;
  let muted = false;
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, vol, when = 0) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    chop(perfect) {
      tone(perfect ? 520 : 300, 0.09, 'square', 0.12);
      tone(perfect ? 780 : 180, 0.12, 'triangle', 0.1, 0.02);
    },
    pickup() { tone(440, 0.07, 'sine', 0.08); },
    place() { tone(330, 0.08, 'triangle', 0.1); },
    serve() {
      tone(660, 0.12, 'sine', 0.14);
      tone(880, 0.18, 'sine', 0.14, 0.1);
      tone(1320, 0.22, 'sine', 0.1, 0.2);
    },
    bell() {
      tone(988, 0.15, 'sine', 0.1);
      tone(1319, 0.2, 'sine', 0.08, 0.12);
    },
    burn() { tone(140, 0.4, 'sawtooth', 0.12); },
    lose() { tone(220, 0.25, 'sawtooth', 0.1); tone(165, 0.35, 'sawtooth', 0.1, 0.15); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.12, i * 0.12));
    },
  };
}
