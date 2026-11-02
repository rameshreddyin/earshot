// Rough sound level meter using the device microphone.
// Phone and laptop mics are not calibrated, so this is an approximation (about +/- 5 dB).
const OFFSET = 94; // maps full-scale RMS to dB SPL for typical device mics

export async function measure(seconds, onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const readings = [];
  const start = performance.now();

  return new Promise((resolve) => {
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = Math.max(20, 20 * Math.log10(rms || 1e-6) + OFFSET);
      readings.push(db);
      const t = (performance.now() - start) / 1000;
      onTick?.(db, Math.min(t / seconds, 1));
      if (t < seconds) {
        requestAnimationFrame(tick);
        return;
      }
      stream.getTracks().forEach((tr) => tr.stop());
      ctx.close();
      // energetic average (Leq) is what noise maps use
      const leq = 10 * Math.log10(readings.reduce((s, d) => s + 10 ** (d / 10), 0) / readings.length);
      resolve(Math.round(leq));
    };
    tick();
  });
}
