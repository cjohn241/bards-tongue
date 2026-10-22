// backup.js — the Satchel: carry your phrases between computer and phone.
//
// "Save backup" writes one file with every Quest Board phrase, its native
// clip, and all your takes and scores. "Restore" reads that file on the
// other device and MERGES it in: phrases and takes you already have are
// kept, and new ones are added. Nothing gets erased.
// (The Anki Library isn't included; it has its own file.)

const BACKUP_KIND = 'bards-tongue-backup';

/** Everything on the board, with audio turned into text so it fits in a JSON file. */
async function makeBackup() {
  const [sentences, recordings] = await Promise.all([db.getAll('sentences'), db.getAll('recordings')]);
  const pack = async (row, audioKey) => {
    const blob = row[audioKey];
    return { ...row, [audioKey]: await blobToBase64(blob), [`${audioKey}Type`]: blob.type };
  };
  return {
    kind: BACKUP_KIND,
    version: 1,
    savedAt: new Date().toISOString(),
    sentences: await Promise.all(sentences.map((s) => pack(s, 'clip'))),
    recordings: await Promise.all(recordings.map((r) => pack(r, 'blob'))),
  };
}

/** Turn a backup's text audio back into Blobs and merge it in. */
async function restoreBackup(data) {
  if (!data || data.kind !== BACKUP_KIND) throw new Error('not a backup file');
  const unpack = (row, audioKey) => {
    const { [`${audioKey}Type`]: type, ...rest } = row;
    return { ...rest, [audioKey]: base64ToBlob(row[audioKey], type || 'audio/mpeg') };
  };

  const have = new Set((await db.getAll('sentences')).map((s) => s.id));
  const haveTakes = new Set((await db.getAll('recordings')).map((r) => r.id));
  const sentences = data.sentences.map((s) => unpack(s, 'clip'));
  const recordings = data.recordings.map((r) => unpack(r, 'blob'));
  await db.putMany({ sentences, recordings });

  return {
    newPhrases: sentences.filter((s) => !have.has(s.id)).length,
    newTakes: recordings.filter((r) => !haveTakes.has(r.id)).length,
  };
}

async function renderBackup(main) {
  const [sentences, recordings] = await Promise.all([db.getAll('sentences'), db.getAll('recordings')]);
  const canShare = Boolean(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));

  main.innerHTML = `
    <section class="panel">
      <h2>Satchel</h2>
      <p class="muted">Carry your phrases between your computer and your phone.
        You have <b>${sentences.length}</b> phrase${sentences.length === 1 ? '' : 's'} and <b>${recordings.length}</b> take${recordings.length === 1 ? '' : 's'} here.</p>
    </section>

    <section class="panel">
      <h2>Save a backup</h2>
      <p class="muted">One file with every phrase, its native clip, and all your takes and scores.</p>
      <div class="btn-row spaced">
        <button type="button" class="btn big gold" data-action="save">Save backup file</button>
        ${canShare ? '<button type="button" class="btn big" data-action="share">Share backup…</button>' : ''}
      </div>
      <p class="status" id="save-status"></p>
    </section>

    <section class="panel">
      <h2>Restore from a backup</h2>
      <p class="muted">Adds the phrases and takes from a backup file. Anything already here is kept.</p>
      <div class="btn-row spaced">
        <label class="btn big file-btn">Choose backup file<input type="file" id="restore-file"></label>
      </div>
      <p class="status" id="restore-status"></p>
    </section>`;

  const $ = (sel) => main.querySelector(sel);
  const fileName = () => `bards-tongue-backup-${dateKey()}.json`;

  async function backupFile() {
    $('#save-status').textContent = 'Packing your satchel…';
    const json = JSON.stringify(await makeBackup());
    return new File([json], fileName(), { type: 'application/json' });
  }

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'save') {
      const file = await backupFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('#save-status').textContent = `Saved ${file.name} to your Downloads.`;
    }

    // On the phone: send the file straight to Google Drive, Quick Share, email...
    if (btn.dataset.action === 'share') {
      const file = await backupFile();
      try {
        await navigator.share({ files: [file], title: "The Bard's Tongue backup" });
        $('#save-status').textContent = 'Shared.';
      } catch (err) {
        $('#save-status').textContent = err.name === 'AbortError' ? '' : "Couldn't share. Try Save backup file instead.";
      }
    }
  };

  $('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('#restore-status').textContent = 'Unpacking…';
    try {
      const result = await restoreBackup(JSON.parse(await file.text()));
      toast(`Added ${result.newPhrases} phrases and ${result.newTakes} takes`);
      show(); // redraw with the new counts
    } catch (err) {
      console.error(err);
      $('#restore-status').textContent = "That file didn't load. Pick a bards-tongue-backup file.";
    }
  });
}
