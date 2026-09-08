import { useEffect, useRef, useState } from 'react';

/** Original synthesized ambience. No recordings, downloads or autoplay. */
export default function useTaxiAudio() {
  const context = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  function stop() {
    const current = context.current;
    context.current = null;
    setEnabled(false);
    if (current && current.state !== 'closed') current.close().catch(() => {});
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, []);
  async function toggle() {
    if (context.current) { stop(); return; }
    setError('');
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { setError('Audio is unavailable in this browser.'); return; }
    let audio;
    try {
      audio = new Audio();
      context.current = audio;
      await audio.resume();
      if (context.current !== audio || document.hidden) { if (context.current === audio) stop(); return; }
      if (audio.state !== 'running') throw new Error('Audio blocked');
      const master = audio.createGain();
      master.gain.setValueAtTime(0, audio.currentTime);
      master.gain.linearRampToValueAtTime(0.12, audio.currentTime + 1.2);
      master.connect(audio.destination);
      // Gentle engine fundamental and harmonics, no sudden revving.
      [55, 110, 165].forEach((frequency, i) => {
        const oscillator = audio.createOscillator();
        const level = audio.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        level.gain.value = [0.22, 0.1, 0.035][i];
        oscillator.connect(level).connect(master); oscillator.start();
      });
      // Smooth filtered noise gives the impression of tyres on a road.
      const buffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const road = audio.createBufferSource(); road.buffer = buffer; road.loop = true;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
      const level = audio.createGain(); level.gain.value = 0.3;
      road.connect(filter).connect(level).connect(master); road.start();
      setEnabled(true);
    } catch {
      if (context.current === audio) { stop(); setError('Sound could not start. Try again or leave it muted.'); }
    }
  }
  return { enabled, error, toggle, stop };
}
