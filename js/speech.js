// speech.js — Chrome's speech-to-text, set to Brazilian Portuguese.
//
// It runs alongside the recorder: when you press Record, Chrome starts
// listening too, and when you press Stop we collect what it heard.
// Note: Chrome sends this audio to Google's speech service to turn it
// into text, so the check needs an internet connection. Your recordings
// themselves are still saved only on this computer.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// On Android, Chrome's "keep listening" mode repeats words in its results,
// so there we listen for one sentence at a time (plenty for a phrase).
const IS_ANDROID = /Android/i.test(navigator.userAgent);

/** Plain-English reasons for Chrome's speech error codes. */
const SPEECH_ERRORS = {
  unsupported: 'This browser has no speech check. Use Chrome.',
  'not-allowed': 'Chrome blocked the speech check. Allow the microphone for this site (the icon left of the address, then Permissions).',
  'service-not-allowed': "Chrome's speech service is turned off on this device. On Android, check that the Google app is installed and up to date.",
  network: 'The speech check needs an internet connection.',
  'audio-capture': 'The speech check could not use the microphone while recording. Your take is still saved.',
  'language-not-supported': 'Chrome has no Brazilian Portuguese speech check here.',
};

/** Why Chrome heard nothing, when it says so. */
const EMPTY_REASONS = {
  'no-speech': "Chrome's speech check didn't pick up any voice. If you did speak, the recorder may be keeping the mic to itself; try Test speech check.",
  aborted: 'The speech check was cut off.',
};

/**
 * Start listening. Returns an object with stop(), which resolves to
 *   { text: 'what it heard' }            ('' if it heard nothing; `reason` says why if Chrome told us)
 *   { text: null, error: 'reason' }      if the check couldn't run
 *
 * `track` is the recorder's microphone track. Newer Chrome can listen to
 * that same track, so the recorder and the speech check don't fight over
 * the mic. Older Chrome ignores it and opens the mic itself.
 *
 * `single: true` listens for one sentence and then stops by itself.
 */
function startListening(track = null, { single = false } = {}) {
  if (!SpeechRecognition) {
    const none = async () => ({ text: null, error: SPEECH_ERRORS.unsupported });
    return { stop: none, finish: none, cancel() {} };
  }

  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.continuous = !single && !IS_ANDROID; // keep listening until Stop, even through pauses
  rec.interimResults = false;  // only finished phrases
  rec.maxAlternatives = 1;     // Chrome's best guess only, so the check stays honest

  const parts = [];
  let errorCode = null;
  let finished;
  const ended = new Promise((resolve) => { finished = resolve; });

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) parts.push(e.results[i][0].transcript);
    }
  };
  rec.onerror = (e) => { errorCode = e.error; };
  rec.onend = () => finished();

  try {
    if (track) rec.start(track);
    else rec.start();
  } catch (err) {
    errorCode = 'start-failed';
    finished();
  }

  return {
    async stop() {
      try { rec.stop(); } catch (e) { /* already stopped */ }
      // The last words can take a moment to arrive after Stop.
      await Promise.race([ended, sleep(5000)]);
      const text = parts.join(' ').trim();
      if (!text && errorCode && !EMPTY_REASONS[errorCode]) {
        return { text: null, error: SPEECH_ERRORS[errorCode] || `The speech check failed (${errorCode}).` };
      }
      return text ? { text } : { text, reason: EMPTY_REASONS[errorCode] || "Chrome's speech check returned no words." };
    },
    /** Wait for Chrome to stop by itself after one sentence (at most `maxMs`), then collect the result. */
    async finish(maxMs = 10000) {
      await Promise.race([ended, sleep(maxMs)]);
      return this.stop();
    },
    cancel() {
      try { rec.abort(); } catch (e) { /* already stopped */ }
    },
  };
}
