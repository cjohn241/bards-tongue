// library.js — the Anki Library: every example sentence from your Anki
// deck, with its native audio. Search it, listen, and add the ones you
// want to the Quest Board.
//
// The library comes from anki-library.json, made by tools/export_anki.py.
// Loading it copies everything into the database, so you only do it once
// (and again whenever you re-run the export).

const PAGE = 30; // rows shown at a time

/** "Você está?" -> "voce esta?" so searching works without typing accents. */
function plain(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function renderLibrary(main) {
  const [library, sentences] = await Promise.all([db.getAll('library'), db.getAll('sentences')]);

  // Which library sentences are already on the board.
  const onBoard = new Set(sentences.map((s) => s.ankiId).filter(Boolean));

  const state = { query: '', shown: PAGE, preview: null };

  main.innerHTML = `
    <a class="back" href="#board">◀ Quest Board</a>
    <section class="panel">
      <div class="panel-head">
        <h2>Anki Library</h2>
        <span class="spacer"></span>
        <label class="btn small file-btn">
          ${library.length ? 'Reload file' : 'Load library file'}
          <input type="file" id="lib-file">
        </label>
      </div>
      ${library.length
        ? `<input type="search" id="lib-search" class="search" placeholder="Search Portuguese, English or a word" aria-label="Search the library">
           <p class="muted count" id="lib-count"></p>
           <ul class="library" id="lib-list"></ul>
           <div class="btn-row center"><button type="button" class="btn" id="lib-more">Show more</button></div>`
        : `<div class="empty">
             <p>No library yet.</p>
             <p class="muted">Run <b>tools/export_anki.py</b>, then load the <b>anki-library.json</b> file it makes.</p>
           </div>`}
      <p class="status" id="lib-status"></p>
    </section>`;

  const $ = (sel) => main.querySelector(sel);

  /* ---------- Loading the file ---------- */

  $('#lib-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('#lib-status').textContent = 'Reading the scroll… (this takes a few seconds)';
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.items)) throw new Error('not a library file');
      const rows = data.items.map((item) => ({
        id: item.id,
        word: item.word || '',
        meaning: item.meaning || '',
        text: item.text,
        english: item.english || '',
        audioName: item.audioName || '',
        audio: base64ToBlob(item.audio),
        search: plain(`${item.text} ${item.english} ${item.word}`),
      }));
      await db.replaceLibrary(rows);
      toast(`Loaded ${rows.length} sentences`);
      show(); // redraw this screen with the new library
    } catch (err) {
      console.error(err);
      $('#lib-status').textContent = "That file didn't load. Pick the anki-library.json made by the export script.";
    }
  });

  if (!library.length) return stopPreview;

  /* ---------- The list ---------- */

  function matches() {
    const q = plain(state.query.trim());
    return q ? library.filter((item) => item.search.includes(q)) : library;
  }

  function renderList() {
    const all = matches();
    const rows = all.slice(0, state.shown);
    $('#lib-count').textContent = state.query.trim()
      ? `${all.length} match${all.length === 1 ? '' : 'es'}`
      : `${library.length} sentences`;
    $('#lib-list').innerHTML = rows.map((item) => `
      <li class="lib-row">
        <button type="button" class="btn small" data-action="preview" data-id="${esc(item.id)}" aria-label="Listen">▶</button>
        <span class="grow">
          <span class="lib-text" lang="pt-BR">${esc(item.text)}</span>
          <span class="lib-detail">${esc(item.english)}</span>
          <span class="lib-word"><b lang="pt-BR">${esc(item.word)}</b> · ${esc(item.meaning)}</span>
        </span>
        ${onBoard.has(item.id)
          ? '<span class="tag">on board</span>'
          : `<button type="button" class="btn small gold" data-action="add" data-id="${esc(item.id)}">+ Add</button>`}
      </li>`).join('') || '<li class="muted">Nothing matches that.</li>';
    $('#lib-more').hidden = all.length <= state.shown;
  }

  /* ---------- Listening and adding ---------- */

  function stopPreview() {
    if (!state.preview) return;
    state.preview.audio.pause();
    URL.revokeObjectURL(state.preview.url);
    state.preview = null;
  }

  function playPreview(item) {
    stopPreview();
    const url = URL.createObjectURL(item.audio);
    const audio = new Audio(url);
    state.preview = { audio, url };
    audio.play().catch(() => {});
  }

  async function addToBoard(item) {
    const sentence = {
      id: uid(),
      text: item.text,
      english: item.english,
      clip: item.audio,
      clipName: item.audioName,
      ankiId: item.id,     // remembers where it came from
      tags: [],
      createdAt: Date.now(),
    };
    await db.put('sentences', sentence);
    onBoard.add(item.id);
    renderList();
    toast('Added to the Quest Board');
  }

  $('#lib-search').addEventListener('input', (e) => {
    state.query = e.target.value;
    state.shown = PAGE;
    renderList();
  });

  $('#lib-more').addEventListener('click', () => {
    state.shown += PAGE;
    renderList();
  });

  main.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const item = library.find((i) => i.id === btn.dataset.id);
    if (!item) return;
    if (btn.dataset.action === 'preview') playPreview(item);
    if (btn.dataset.action === 'add') addToBoard(item);
  };

  renderList();

  // Cleanup when you leave this screen.
  return stopPreview;
}
