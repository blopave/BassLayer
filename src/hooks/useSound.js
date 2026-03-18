import { useRef, useCallback } from "react";

export function useSound() {
  const ctxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  }, []);

  // Deep sub-bass drone — warm, felt more than heard
  const playBass = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      // Sub oscillator (sine, 55Hz — A1)
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.6);

      // Second harmonic for warmth
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(110, now);
      osc2.frequency.exponentialRampToValueAtTime(90, now + 0.5);

      // Gain envelope — quick attack, slow decay
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.04, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain).connect(ctx.destination);
      osc2.connect(gain2).connect(ctx.destination);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.9);
      osc2.stop(now + 0.7);
    } catch {}
  }, [getCtx]);

  // Digital click — short, precise, synthetic
  const playLayer = useCallback(() => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;

      // Noise burst
      const bufferSize = ctx.sampleRate * 0.03;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Highpass to make it "digital"
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      noise.connect(hp).connect(gain).connect(ctx.destination);
      noise.start(now);

      // Tiny pitched click
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.03, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(g2).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }, [getCtx]);

  return { playBass, playLayer };
}
