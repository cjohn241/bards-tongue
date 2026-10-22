// score.js — how a take is scored, and when a phrase counts as mastered.
//
//   Words    what Chrome heard, lined up against the target sentence.
//            Every target word must be heard to pass.
//   Rhythm   your speaking length vs the native clip's (both measured
//            from first sound to last). Within 15% passes.
//   Passed   all words heard AND rhythm within 15%.
//   Mastered a passing take on 3 different days.

const RHYTHM_TOLERANCE = 0.15;
const MASTERY_DAYS = 3;

// Chrome sometimes writes numbers as digits ("2" for "dois").
const NUMBER_WORDS = {
  0: ['zero'], 1: ['um', 'uma'], 2: ['dois', 'duas'], 3: ['três'], 4: ['quatro'], 5: ['cinco'],
  6: ['seis'], 7: ['sete'], 8: ['oito'], 9: ['nove'], 10: ['dez'],
};

/** "Você vai?" -> ['você', 'vai']. Accents are kept: "é" and "e" are different words. */
function normalizeWords(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

function sameWord(a, b) {
  return a === b || (NUMBER_WORDS[a] || []).includes(b) || (NUMBER_WORDS[b] || []).includes(a);
}

/**
 * Line up the target sentence with what was heard, keeping the order
 * (the "longest common subsequence", like a diff between two files).
 *
 * Returns {
 *   tokens:  the target split on spaces, each { show: 'Você', ok: true },
 *   matched: how many target words were heard,
 *   total:   how many target words there are,
 * }
 */
function compareWords(targetText, heardText) {
  // Each display token can hold more than one word ("chama-se" -> chama, se).
  const tokens = targetText.split(/\s+/).filter(Boolean).map((show) => ({ show, parts: normalizeWords(show) }));
  const target = [];
  tokens.forEach((t, ti) => t.parts.forEach((w) => target.push({ w, ti, ok: false })));
  const heard = normalizeWords(heardText || '');

  // best[i][j] = most words matched using target from i and heard from j
  const n = target.length;
  const m = heard.length;
  const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      best[i][j] = sameWord(target[i].w, heard[j])
        ? best[i + 1][j + 1] + 1
        : Math.max(best[i + 1][j], best[i][j + 1]);
    }
  }

  // Walk the table to see which target words were matched.
  for (let i = 0, j = 0; i < n && j < m;) {
    if (sameWord(target[i].w, heard[j])) { target[i].ok = true; i++; j++; }
    else if (best[i + 1][j] >= best[i][j + 1]) i++;
    else j++;
  }

  return {
    tokens: tokens.map((t, ti) => ({ show: t.show, ok: target.filter((x) => x.ti === ti).every((x) => x.ok) })),
    matched: target.filter((x) => x.ok).length,
    total: n,
  };
}

/**
 * Score one take. Saved on the recording row, so the Quest Board can
 * show mastery without re-reading any audio.
 *   heard       text from the speech check (null if it couldn't run)
 *   takeSecs    your speaking length
 *   nativeSecs  the native clip's speaking length
 */
function scoreTake(sentenceText, heard, takeSecs, nativeSecs) {
  const ratio = takeSecs / nativeSecs;
  const rhythmOk = Math.abs(ratio - 1) <= RHYTHM_TOLERANCE;
  const words = heard == null ? null : compareWords(sentenceText, heard);
  return {
    heard,
    wordsMatched: words ? words.matched : null,
    wordsTotal: words ? words.total : null,
    ratio,
    rhythmOk,
    passed: Boolean(words) && words.total > 0 && words.matched === words.total && rhythmOk,
  };
}

/** "8% slower", "12% faster", "right on pace" */
function rhythmText(ratio) {
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct === 0) return 'right on pace';
  return `${pct}% ${ratio > 1 ? 'slower' : 'faster'}`;
}

/** From a phrase's recordings: how many days had a passing take, and is it mastered? */
function masteryOf(recordings) {
  const days = new Set(recordings.filter((r) => r.score && r.score.passed).map((r) => dateKey(new Date(r.createdAt))));
  return { days: days.size, mastered: days.size >= MASTERY_DAYS };
}

/** Little row of pips: filled for each passing day. */
function masteryPips(m) {
  const pips = Array.from({ length: MASTERY_DAYS }, (_, i) => `<i class="${i < m.days ? 'on' : ''}"></i>`).join('');
  return m.mastered
    ? '<span class="mastered">★ Mastered</span>'
    : `<span class="pips" title="Passing takes on ${m.days} of ${MASTERY_DAYS} days">${pips}</span>`;
}
