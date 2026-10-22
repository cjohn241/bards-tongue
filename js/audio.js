// audio.js — everything that touches sound:
//   recording from the microphone, decoding audio files,
//   finding where the voice starts and stops, playing, and
//   drawing 16-bit style waveforms.

/* ---------- Web Audio ----------
   One shared AudioContext. Chrome only lets it make sound after you've
   clicked something, so we create it the first time it's needed.     */

let sharedContext = null;
function audioContext() {
  if (!sharedContext) sharedContext = new AudioContext();
  if (sharedContext.state === 'suspended') sharedContext.resume();
  return sharedContext;
}

/** Blob (mp3, wav, webm...) -> AudioBuffer (the raw samples). */
async function decodeBlob(blob) {
  return audioContext().decodeAudioData(await blob.arrayBuffer());
}

/* ---------- Microphone ---------- */

let recorder = null;
let recordedChunks = [];

/** Ask for the mic (Chrome asks you the first time) and start recording. */
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
  recorder.start();
}

/** Stop recording. Resolves with the recording as a Blob. */
function stopRecording() {
  return new Promise((resolve) => {
    const r = recorder;
    r.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop()); // turns the mic light off
      resolve(new Blob(recordedChunks, { type: r.mimeType }));
    };
    r.stop();
    recorder = null;
  });
}

/** Stop and throw the recording away (used when you leave mid-take). */
function cancelRecording() {
  if (!recorder) return;
  const r = recorder;
  r.onstop = () => r.stream.getTracks().forEach((t) => t.stop());
  r.stop();
  recorder = null;
}

/* ---------- Where does the voice start and stop? ----------
   Recordings usually have a bit of silence before you start talking.
   We skip it, so the native clip and your take line up at the first sound. */

function speechBounds(buffer) {
  const data = buffer.getChannelData(0);
  const win = Math.max(1, Math.floor(buffer.sampleRate * 0.01)); // 10 ms windows

  // Average loudness of each window.
  const levels = [];
  for (let i = 0; i < data.length; i += win) {
    let sum = 0;
    const end = Math.min(i + win, data.length);
    for (let j = i; j < end; j++) sum += Math.abs(data[j]);
    levels.push(sum / (end - i));
  }

  const loudest = Math.max(...levels);
  if (!loudest) return { start: 0, end: buffer.duration };

  // "Voice" = any window at least 10% as loud as the loudest one.
  const threshold = loudest * 0.1;
  const first = levels.findIndex((v) => v >= threshold);
  let last = levels.length - 1;
  while (last > first && levels[last] < threshold) last--;

  const pad = 0.08; // keep a sliver of air on each side
  return {
    start: Math.max(0, (first * win) / buffer.sampleRate - pad),
    end: Math.min(buffer.duration, ((last + 1) * win) / buffer.sampleRate + pad),
  };
}

/* ---------- Playing ----------
   Both players return the same shape so the screen can treat them alike:
     { done: Promise (true if it played to the end), position(), stop() } */

/** Play an <audio> element from the start. Used for the native clip,
    because <audio> can slow down without making the voice deeper. */
function playElement(audio) {
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  audio.currentTime = 0;
  audio.onended = () => finish(true);
  audio.play().catch(() => finish(false));
  return {
    done,
    position: () => audio.currentTime,
    stop() { audio.pause(); finish(false); },
  };
}

/** Play a decoded AudioBuffer from `from` seconds. Used for your takes,
    so playback can start right where your voice starts. */
function playBuffer(buffer, from = 0) {
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let finish;
  let stopped = false;
  const done = new Promise((resolve) => { finish = resolve; });
  source.onended = () => finish(!stopped);

  // Time it with the page clock: the audio clock can jump when sound starts.
  const startedAt = performance.now();
  source.start(0, from);
  return {
    done,
    position: () => from + (performance.now() - startedAt) / 1000,
    stop() {
      stopped = true;
      try { source.stop(); } catch (e) { /* already stopped */ }
      finish(false);
    },
  };
}

/* ---------- Waveforms ----------
   Drawn as chunky pixel bars. Every wave on a screen shares one scale
   (pixels per second), so a longer take really does look longer.     */

const BAR = 4;   // bar width in px
const GAP = 2;   // space between bars
const STEP = 2;  // bar heights snap to this, for the blocky look

/**
 * Draw one voice on a <canvas>.
 *   buffer     the AudioBuffer (or null for an empty lane)
 *   bounds     { start, end } in seconds: the part to draw
 *   pxPerSec   shared scale
 *   color      bar color
 */
function drawWave(canvas, buffer, bounds, pxPerSec, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // Faint grid: one line every half second, and a midline.
  g.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let t = 0.5; t * pxPerSec < w; t += 0.5) g.fillRect(Math.round(t * pxPerSec), 0, 1, h);
  g.fillRect(0, Math.round(h / 2), w, 1);

  if (!buffer) return;

  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const colSecs = (BAR + GAP) / pxPerSec;
  const cols = Math.floor((bounds.end - bounds.start) / colSecs);

  // Loudest point in each column.
  const peaks = [];
  for (let c = 0; c < cols; c++) {
    const from = Math.floor((bounds.start + c * colSecs) * rate);
    const to = Math.min(data.length, Math.floor((bounds.start + (c + 1) * colSecs) * rate));
    let max = 0;
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(data[i]));
    peaks.push(max);
  }

  // Each voice is scaled to its own loudest point, so a quiet mic still shows clearly.
  const loudest = Math.max(...peaks, 0.0001);
  const room = h - 8;
  g.fillStyle = color;
  peaks.forEach((p, c) => {
    const barH = Math.max(STEP, Math.round(((p / loudest) * room) / STEP) * STEP);
    const y = Math.round((h - barH) / 2 / STEP) * STEP;
    g.fillRect(c * (BAR + GAP), y, BAR, barH);
  });
}
