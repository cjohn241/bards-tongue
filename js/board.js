// board.js — the Quest Board (your list of phrases) and the
// "New phrase" screen where you add a sentence and its native clip.

/* ---------- Quest Board ---------- */

async function renderBoard(main) {
  const [sentences, recordings] = await Promise.all([db.getAll('sentences'), db.getAll('recordings')]);
  // Each phrase's takes, and whether it's mastered (see score.js).
  const takesBy = {};
  for (const r of recordings) (takesBy[r.sentenceId] = takesBy[r.sentenceId] || []).push(r);
  const mastery = {};
  for (const s of sentences) mastery[s.id] = masteryOf(takesBy[s.id] || []);

  // Phrases you're still working on first (newest on top), mastered ones below.
  sentences.sort((a, b) => (mastery[a.id].mastered - mastery[b.id].mastered) || (b.createdAt - a.createdAt));

  const list = sentences.map((s) => {
    const takes = takesBy[s.id] || [];
    const last = Math.max(...takes.map((r) => r.createdAt));
    const detail = takes.length ? `${takes.length} take${takes.length === 1 ? '' : 's'} · last ${when(last)}` : 'Not practiced yet';
    return `
      <li>
        <a class="quest ${mastery[s.id].mastered ? 'is-mastered' : ''}" href="#train/${esc(s.id)}">
          <span class="quest-text" lang="pt-BR">${esc(s.text)}</span>
          <span class="quest-detail">${masteryPips(mastery[s.id])} ${esc(detail)}</span>
        </a>
      </li>`;
  }).join('');

  main.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h2>Quest Board</h2>
        <span class="spacer"></span>
        <a class="btn" href="#new">+ New phrase</a>
      </div>
      ${sentences.length
        ? `<ul class="quests">${list}</ul>`
        : `<div class="empty">
             <p>The board is empty, bard.</p>
             <p class="muted">Pick phrases from your Anki deck, or add your own with a native audio clip.</p>
             <div class="btn-row center">
               <a class="btn big gold" href="#library">Open the Anki Library</a>
               <a class="btn big" href="#new">+ Add my own</a>
             </div>
           </div>`}
    </section>`;
}

/* ---------- New phrase ---------- */

async function renderNewPhrase(main) {
  main.innerHTML = `
    <a class="back" href="#board">◀ Quest Board</a>
    <section class="panel">
      <h2>New phrase</h2>
      <form id="new-form" class="form">
        <label class="field">
          <span>The sentence, in Portuguese</span>
          <textarea id="f-text" rows="2" lang="pt-BR" placeholder="Ex: Eu moro no Brasil há dois anos." required></textarea>
        </label>
        <div class="field">
          <span>Native audio clip (mp3 or wav)</span>
          <label class="btn file-btn">
            <span id="f-file-name">Choose a file…</span>
            <input type="file" id="f-file" accept="audio/*,.mp3,.wav,.m4a,.ogg">
          </label>
        </div>
        <button class="btn big gold" type="submit">Save phrase</button>
      </form>
    </section>`;

  const fileInput = main.querySelector('#f-file');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    main.querySelector('#f-file-name').textContent = file ? file.name : 'Choose a file…';
  });

  main.querySelector('#new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = main.querySelector('#f-text').value.trim();
    const file = fileInput.files[0];
    if (!text) { toast('Type the sentence first.'); return; }
    if (!file) { toast('Choose the native audio clip.'); return; }

    // Make sure Chrome can actually play this file before saving it.
    try {
      await decodeBlob(file);
    } catch (err) {
      toast("Chrome can't read that file. Try an mp3 or wav.");
      return;
    }

    const sentence = {
      id: uid(),
      text,
      clip: file,          // the audio itself, saved in the database
      clipName: file.name,
      tags: [],            // sound focus tags (added in a later step)
      createdAt: Date.now(),
    };
    await db.put('sentences', sentence);
    location.hash = `#train/${sentence.id}`;
  });
}
