// shadow.js — the Training Grounds: the shadow-and-compare loop for one phrase.
//
//   1. Listen   play the native clip, loop it, slow it to 0.75x
//   2. Speak    record yourself (every take is saved). Chrome's speech
//               check listens at the same time and each take is scored
//               (see score.js)
//   3. Compare  hear native, then you, back to back, and see both
//               waveforms stacked on the same time scale
//
// renderTraining draws the screen and returns a cleanup function that
// app.js calls when you leave (stops sound, turns off the mic).

const NATIVE_COLOR = '#e6c36e'; // gold
const TAKE_COLOR = '#dda0e3';   // Christon's plum

async function renderTraining(main, id) {
  const sentence = await db.get('sentences', id);
  if (!sentence) {
    main.innerHTML = `<a class="back" href="#board">◀ Quest Board</a>
      <section class="panel"><p>That phrase is gone. It may have been deleted.</p></section>`;
    return;
  }

  // Everything this screen holds on to while it's open.
  const state = {
    native: null,      // { audio, buffer, bounds, url }
    takes: [],         // newest first: { row, buffer, bounds }
    chosenId: null,    // which take shows in the compare lane
    speed: 1,
    loop: false,
    playing: null,     // the player that's making sound now (see audio.js)
    recording: false,
    recStarted: 0,
    listener: null,    // Chrome's speech check while recording
    tester: null,      // the speech check running alone (Test speech check)
    checking: false,   // waiting for you to say the phrase again for the check
    deleteArmed: false,
    timers: [],
  };

  main.innerHTML = `
    <a class="back" href="#board">◀ Quest Board</a>

    <section class="panel phrase">
      <p class="label">Phrase</p>
      <p class="pt" lang="pt-BR">${esc(sentence.text)}</p>
      ${sentence.english ? `<p class="en muted">${esc(sentence.english)}</p>` : ''}
      <p class="mastery" id="mastery"></p>
    </section>

    <section class="panel">
      <h2>1 · Listen</h2>
      <div class="btn-row">
        <button type="button" class="btn big gold" data-action="play-native">▶ Play</button>
        <button type="button" class="btn big" data-action="loop" aria-pressed="false">Loop: off</button>
        <button type="button" class="btn big" data-action="speed" aria-pressed="false">Speed: 1x</button>
      </div>
    </section>

    <section class="panel">
      <h2>2 · Speak</h2>
      <div class="btn-row">
        <button type="button" class="btn big red" data-action="record">● Record</button>
      </div>
      <p class="status" id="rec-status">Press Record, say the phrase, then press Stop.</p>
      <div class="check" id="check"></div>
      <p class="test-row">
        <button type="button" class="btn small ghost" data-action="test-speech">Test speech check</button>
        <span class="muted" id="test-status">Runs the speech check alone, without recording.</span>
      </p>
    </section>

    <section class="panel">
      <h2>3 · Compare</h2>
      <div class="btn-row">
        <button type="button" class="btn big green" data-action="compare">▶▶ Native, then me</button>
      </div>
      <div class="waves">
        <div class="wave-row">
          <p class="wave-label"><span class="swatch native"></span>Native <span class="muted" id="len-native"></span></p>
          <div class="wave"><canvas id="wave-native"></canvas><i class="playhead" id="ph-native"></i></div>
        </div>
        <div class="wave-row">
          <p class="wave-label"><span class="swatch take"></span><span id="take-name">You</span> <span class="muted" id="len-take"></span></p>
          <div class="wave"><canvas id="wave-take"></canvas><i class="playhead" id="ph-take"></i></div>
        </div>
      </div>
      <p class="hint muted">Both lines start at the first sound and use the same scale. Grid lines are half a second apart.</p>
    </section>

    <section class="panel">
      <h2>Your takes</h2>
      <ol class="takes" id="takes"></ol>
    </section>

    <div class="btn-row end">
      <button type="button" class="btn danger" data-action="delete">Delete this phrase</button>
    </div>`;

  const $ = (sel) => main.querySelector(sel);

  /* ---------- Load the native clip and your saved takes ---------- */

  const nativeUrl = URL.createObjectURL(sentence.clip);
  const nativeAudio = new Audio(nativeUrl);
  nativeAudio.preservesPitch = true; // slow down without sounding deeper
  const nativeBuffer = await decodeBlob(sentence.clip);
  state.native = { audio: nativeAudio, buffer: nativeBuffer, bounds: speechBounds(nativeBuffer), url: nativeUrl };

  const rows = await db.recordingsFor(id);
  rows.sort((a, b) => b.createdAt - a.createdAt);
  for (const row of rows) {
    try {
      const buffer = await decodeBlob(row.blob);
      state.takes.push({ row, buffer, bounds: speechBounds(buffer) });
    } catch (err) {
      console.warn('Could not read a saved take', err);
    }
  }
  state.chosenId = state.takes.length ? state.takes[0].row.id : null;

  const chosenTake = () => state.takes.find((t) => t.row.id === state.chosenId) || null;

  /* ---------- Drawing ---------- */

  function drawWaves() {
    const take = chosenTake();
    const nativeLen = state.native.bounds.end - state.native.bounds.start;
    const takeLen = take ? take.bounds.end - take.bounds.start : 0;

    // One shared scale: the longer of the two fills the width.
    const width = $('#wave-native').clientWidth;
    const pxPerSec = width / Math.max(nativeLen, takeLen, 0.5);
    state.pxPerSec = pxPerSec;

    drawWave($('#wave-native'), state.native.buffer, state.native.bounds, pxPerSec, NATIVE_COLOR);
    drawWave($('#wave-take'), take && take.buffer, take && take.bounds, pxPerSec, TAKE_COLOR);

    $('#len-native').textContent = secs(nativeLen);
    if (take) {
      const diff = takeLen - nativeLen;
      const sign = diff >= 0 ? '+' : '−';
      $('#len-take').textContent = `${secs(takeLen)} (${sign}${secs(Math.abs(diff))})`;
      $('#take-name').textContent = `You · take ${takeNumber(take)}`;
    } else {
      $('#len-take').textContent = 'no take yet';
      $('#take-name').textContent = 'You';
    }
  }

  const takeNumber = (take) => state.takes.length - state.takes.indexOf(take);

  // "5/5 words · passed" for a take's line in the list.
  function scoreTags(score) {
    if (!score) return '';
    const words = score.wordsTotal == null ? '' : `<span class="tag ${score.wordsMatched === score.wordsTotal ? 'good' : ''}">${score.wordsMatched}/${score.wordsTotal} words</span>`;
    return words + (score.passed ? '<span class="tag gold">passed</span>' : '');
  }

  function renderTakes() {
    $('#takes').innerHTML = state.takes.length
      ? state.takes.map((t) => `
          <li class="take ${t.row.id === state.chosenId ? 'chosen' : ''}">
            <button type="button" class="btn small" data-action="play-take" data-id="${esc(t.row.id)}">▶</button>
            <span class="grow">
              <b>Take ${takeNumber(t)}</b> · ${secs(t.bounds.end - t.bounds.start)}
              <span class="muted">· ${esc(when(t.row.createdAt))}</span>
              ${scoreTags(t.row.score)}
            </span>
            <button type="button" class="btn small ghost" data-action="delete-take" data-id="${esc(t.row.id)}" aria-label="Delete take ${takeNumber(t)}">✕</button>
          </li>`).join('')
      : '<li class="muted">No takes yet. Your recordings will be saved here.</li>';
  }

  // What Chrome heard for the chosen take, next to the target, with missed words marked.
  function renderCheck() {
    const take = chosenTake();
    const box = $('#check');
    const score = take && take.row.score;
    if (!take || !score) { box.innerHTML = ''; return; }

    if (score.heard == null) {
      box.innerHTML = `<p class="muted">Speech check didn't run for take ${takeNumber(take)}. ${esc(take.row.speechError || '')}</p>`;
      return;
    }

    const words = compareWords(sentence.text, score.heard);
    const target = words.tokens.map((t) => (t.ok ? esc(t.show) : `<mark>${esc(t.show)}</mark>`)).join(' ');
    box.innerHTML = `
      <div class="check-grid">
        <p class="label">Target</p>
        <p class="pt-line" lang="pt-BR">${target}</p>
        <p class="label">Chrome heard</p>
        <p class="pt-line heard" lang="pt-BR">${score.heard ? esc(score.heard) : '<span class="muted">(nothing)</span>'}</p>
      </div>
      ${!score.heard && take.row.speechReason ? `<p class="muted why">${esc(take.row.speechReason)}</p>` : ''}
      ${take.row.checkedAgain ? '<p class="muted why">Words checked on your second try (this phone won\'t let the recorder and the speech check share the mic). Rhythm is from the recorded take.</p>' : ''}
      <div class="score-row">
        <span class="score ${words.matched === words.total ? 'good' : 'miss'}">Words ${words.matched} of ${words.total}</span>
        <span class="score ${score.rhythmOk ? 'good' : 'miss'}">Rhythm: ${rhythmText(score.ratio)}</span>
        ${score.passed
          ? '<span class="score pass">✓ Passed</span>'
          : `<span class="muted">To pass: every word heard, and length within ${Math.round(RHYTHM_TOLERANCE * 100)}%.</span>`}
      </div>`;
  }

  function renderMastery() {
    const m = masteryOf(state.takes.map((t) => t.row));
    const passedToday = state.takes.some((t) => t.row.score && t.row.score.passed && dateKey(new Date(t.row.createdAt)) === dateKey());
    let note;
    if (m.mastered) note = 'Passed on three different days.';
    else if (passedToday) note = `Passed today. Come back another day: ${m.days} of ${MASTERY_DAYS} days.`;
    else if (m.days) note = `Passed on ${m.days} of ${MASTERY_DAYS} days so far.`;
    else note = `Pass it on ${MASTERY_DAYS} different days to master it.`;
    $('#mastery').innerHTML = `${masteryPips(m)} <span class="muted">${note}</span>`;
  }

  // Redraw everything that depends on the takes.
  function refreshTakes() {
    renderTakes();
    renderCheck();
    renderMastery();
    drawWaves();
  }

  // Button labels follow what's happening right now.
  function updateButtons() {
    const p = state.playing;
    $('[data-action="play-native"]').textContent = p && p.kind === 'native' ? '■ Stop' : '▶ Play';
    $('[data-action="compare"]').textContent = p && p.kind === 'compare' ? '■ Stop' : '▶▶ Native, then me';

    const loopBtn = $('[data-action="loop"]');
    loopBtn.textContent = `Loop: ${state.loop ? 'on' : 'off'}`;
    loopBtn.setAttribute('aria-pressed', String(state.loop));

    const speedBtn = $('[data-action="speed"]');
    speedBtn.textContent = `Speed: ${state.speed === 1 ? '1x' : '0.75x'}`;
    speedBtn.setAttribute('aria-pressed', String(state.speed !== 1));

    const recBtn = $('[data-action="record"]');
    recBtn.textContent = state.checking ? '🎙 Listening…' : state.recording ? '■ Stop' : '● Record';
    recBtn.classList.toggle('pulse', state.recording || state.checking);
    recBtn.disabled = state.checking;
  }

  /* ---------- Playback ---------- */

  // Start a player and remember it. `kind` is what the user pressed;
  // `lane` is which waveform the playhead moves across.
  function startPlaying(kind, lane, player) {
    player.kind = kind;
    player.lane = lane;
    state.playing = player;
    updateButtons();
    return player;
  }

  function stopPlaying() {
    if (state.playing) state.playing.stop();
    state.playing = null;
    updateButtons();
  }

  async function playNative() {
    if (state.playing && state.playing.kind === 'native') { stopPlaying(); return; }
    stopPlaying();
    nativeAudio.loop = state.loop;
    nativeAudio.playbackRate = state.speed;
    const player = startPlaying('native', 'native', playElement(nativeAudio));
    await player.done;
    if (state.playing === player) stopPlaying();
  }

  async function playTake(take) {
    stopPlaying();
    const player = startPlaying('take', 'take', playBuffer(take.buffer, take.bounds.start));
    await player.done;
    if (state.playing === player) stopPlaying();
  }

  // The main event: native clip, a short breath, then your take.
  async function compare() {
    if (state.playing && state.playing.kind === 'compare') { stopPlaying(); return; }
    const take = chosenTake();
    if (!take) { toast('Record a take first.'); return; }
    stopPlaying();

    nativeAudio.loop = false;
    nativeAudio.playbackRate = state.speed;
    const first = startPlaying('compare', 'native', playElement(nativeAudio));
    const finished = await first.done;
    if (!finished || state.playing !== first) return;

    await sleep(350);
    if (state.playing !== first) return; // stopped during the pause

    const second = startPlaying('compare', 'take', playBuffer(take.buffer, take.bounds.start));
    await second.done;
    if (state.playing === second) stopPlaying();
  }

  // Move the playhead line across the waveform that's playing.
  let frame = 0;
  function tick() {
    const p = state.playing;
    for (const lane of ['native', 'take']) {
      const line = $(`#ph-${lane}`);
      const bounds = lane === 'native' ? state.native.bounds : chosenTake() && chosenTake().bounds;
      if (p && p.lane === lane && bounds) {
        const x = (p.position() - bounds.start) * state.pxPerSec;
        line.style.transform = `translateX(${Math.max(0, Math.round(x))}px)`;
        line.style.display = 'block';
      } else {
        line.style.display = 'none';
      }
    }
    frame = requestAnimationFrame(tick);
  }

  /* ---------- Recording ---------- */

  async function toggleRecord() {
    if (state.checking) return; // wait for the say-it-again check to finish
    if (!state.recording) {
      stopPlaying();
      if (state.tester) { // finish any speech test first, so only one check listens
        state.tester.cancel();
        state.tester = null;
        $('[data-action="test-speech"]').textContent = 'Test speech check';
        $('#test-status').textContent = 'Runs the speech check alone, without recording.';
      }
      try {
        await startRecording();
      } catch (err) {
        toast('No microphone. Allow the mic in Chrome (icon in the address bar).');
        return;
      }
      state.listener = startListening(recordingTrack());
      state.recording = true;
      state.recStarted = Date.now();
      updateButtons();
      const timer = setInterval(() => {
        $('#rec-status').textContent = `Recording… ${secs((Date.now() - state.recStarted) / 1000)}`;
      }, 100);
      state.timers.push(timer);
      return;
    }

    state.timers.forEach(clearInterval);
    state.timers = [];
    state.recording = false;
    updateButtons();
    $('#rec-status').textContent = 'Checking what Chrome heard…';
    const [blob, speech] = await Promise.all([stopRecording(), state.listener.stop()]);
    state.listener = null;

    let buffer;
    try {
      buffer = await decodeBlob(blob);
    } catch (err) {
      $('#rec-status').textContent = 'That take was too short. Try again.';
      return;
    }

    const bounds = speechBounds(buffer);
    const nativeBounds = state.native.bounds;

    // Some phones (Pixels among them) won't let the recorder and the speech
    // check use the mic at the same time, so the check hears nothing. If the
    // take clearly has your voice in it, ask for the phrase once more and
    // run the check alone. Rhythm still comes from the recorded take.
    let heard = speech;
    let checkedAgain = false;
    const matched = (s) => (s.text ? compareWords(sentence.text, s.text).matched : 0);
    if (SpeechRecognition && bounds.end - bounds.start > 0.3 && matched(speech) === 0) {
      state.checking = true;
      updateButtons();
      $('#rec-status').textContent = "Chrome didn't catch that while recording. Say the phrase once more for the speech check…";
      state.listener = startListening(null, { single: true });
      const again = await state.listener.finish();
      state.listener = null;
      state.checking = false;
      updateButtons();
      if (again.text && matched(again) >= matched(speech)) {
        heard = again;
        checkedAgain = true;
      }
    }

    const row = {
      id: uid(),
      sentenceId: id,
      blob,
      createdAt: Date.now(),
      score: scoreTake(sentence.text, heard.text, bounds.end - bounds.start, nativeBounds.end - nativeBounds.start),
      speechError: heard.error || null,
      speechReason: heard.reason || null,
      checkedAgain,
    };
    await db.put('recordings', row);
    const wasMastered = masteryOf(state.takes.map((t) => t.row)).mastered;
    state.takes.unshift({ row, buffer, bounds });
    state.chosenId = row.id;
    $('#rec-status').textContent = 'Saved. Press "Native, then me" to compare.';
    refreshTakes();
    if (!wasMastered && masteryOf(state.takes.map((t) => t.row)).mastered) toast('★ Phrase mastered!');
  }

  // Run the speech check by itself (no recorder), to see whether it works on this device.
  // If it hears you here but not while recording, the recorder is keeping the mic to itself.
  async function testSpeech(btn) {
    if (state.recording) return;
    const status = $('#test-status');
    if (!state.tester) {
      stopPlaying();
      state.tester = startListening();
      btn.textContent = '■ Stop test';
      status.textContent = 'Listening… say the phrase, then tap Stop test.';
      return;
    }
    const tester = state.tester;
    state.tester = null;
    btn.textContent = 'Test speech check';
    status.textContent = 'Checking…';
    const result = await tester.stop();
    if (result.text) {
      const words = compareWords(sentence.text, result.text);
      status.textContent = `Heard "${result.text}" (${words.matched} of ${words.total} words). The speech check works here.`;
    } else {
      status.textContent = result.error || result.reason;
    }
  }

  /* ---------- Buttons ---------- */

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action !== 'delete' && state.deleteArmed) {
      state.deleteArmed = false;
      $('[data-action="delete"]').textContent = 'Delete this phrase';
    }

    if (action === 'play-native') playNative();
    if (action === 'compare') compare();
    if (action === 'record') toggleRecord();
    if (action === 'test-speech') testSpeech(btn);

    if (action === 'loop') {
      state.loop = !state.loop;
      nativeAudio.loop = state.loop && (!state.playing || state.playing.kind === 'native');
      updateButtons();
    }

    if (action === 'speed') {
      state.speed = state.speed === 1 ? 0.75 : 1;
      nativeAudio.playbackRate = state.speed;
      updateButtons();
    }

    if (action === 'play-take') {
      const take = state.takes.find((t) => t.row.id === btn.dataset.id);
      if (!take) return;
      state.chosenId = take.row.id; // playing a take also picks it for comparing
      refreshTakes();
      playTake(take);
    }

    if (action === 'delete-take') {
      const take = state.takes.find((t) => t.row.id === btn.dataset.id);
      if (!take) return;
      if (state.playing && state.playing.lane === 'take') stopPlaying();
      await db.remove('recordings', take.row.id);
      state.takes = state.takes.filter((t) => t !== take);
      if (state.chosenId === take.row.id) state.chosenId = state.takes.length ? state.takes[0].row.id : null;
      refreshTakes();
      toast('Take deleted');
    }

    // Two taps to delete, so a slip of the mouse can't erase a phrase.
    if (action === 'delete') {
      if (!state.deleteArmed) {
        state.deleteArmed = true;
        btn.textContent = 'Click again to delete phrase and all takes';
        return;
      }
      await db.removeSentence(id);
      toast('Phrase deleted');
      location.hash = '#board';
    }
  };

  const onResize = () => drawWaves();
  window.addEventListener('resize', onResize);

  refreshTakes();
  updateButtons();
  tick();

  // Cleanup when you leave this screen.
  return () => {
    stopPlaying();
    if (state.recording) cancelRecording();
    if (state.listener) state.listener.cancel();
    if (state.tester) state.tester.cancel();
    state.timers.forEach(clearInterval);
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
    URL.revokeObjectURL(nativeUrl);
    main.onclick = null;
  };
}
