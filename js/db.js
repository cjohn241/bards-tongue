// db.js — the on-computer database (IndexedDB, built into Chrome).
//
// Think of it like SQL tables. Each "store" is a table, and each row is
// a JavaScript object. The keyPath is the primary key column. Audio is
// saved right in the rows as Blobs (raw file data).
//
//   sentences   key: id   a phrase on the Quest Board: text, native clip, sound tags
//   recordings  key: id   one of your takes, linked by sentenceId
//   library     key: id   sentences loaded from your Anki deck, to pick from
//   pairs       key: id   minimal pairs, like avó / avô        (later)
//   tests       key: id   a locked minimal-pair test            (later)
//   sessions    key: id   practice log: day and minutes         (later)
//   settings    key: key  one row per setting
//
// IndexedDB's own API is callback-based and wordy, so this file wraps it
// in a few small async functions: db.getAll, db.get, db.put, db.remove ...

const db = (() => {
  const DB_NAME = 'bards-tongue';
  const DB_VERSION = 2; // bump this only if the table list below changes (2: added library)

  const STORES = {
    sentences: 'id',
    recordings: 'id',
    library: 'id',
    pairs: 'id',
    tests: 'id',
    sessions: 'id',
    settings: 'key',
  };

  let dbPromise = null;

  /** Open the database once and reuse it. Creates the tables on first run. */
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const idb = req.result;
          for (const [name, keyPath] of Object.entries(STORES)) {
            if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, { keyPath });
          }
          // Lets us ask "all recordings for this sentence" quickly.
          const recordings = req.transaction.objectStore('recordings');
          if (!recordings.indexNames.contains('bySentence')) recordings.createIndex('bySentence', 'sentenceId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  // Turn one IndexedDB request into a promise we can await.
  function requestDone(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Wait for a whole transaction to finish (like COMMIT).
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    /** SELECT * FROM store */
    async getAll(store) {
      const idb = await open();
      return requestDone(idb.transaction(store).objectStore(store).getAll());
    },

    /** SELECT * FROM store WHERE key = ? (undefined if missing) */
    async get(store, key) {
      const idb = await open();
      return requestDone(idb.transaction(store).objectStore(store).get(key));
    },

    /** SELECT * FROM recordings WHERE sentenceId = ? */
    async recordingsFor(sentenceId) {
      const idb = await open();
      const index = idb.transaction('recordings').objectStore('recordings').index('bySentence');
      return requestDone(index.getAll(sentenceId));
    },

    /** INSERT OR REPLACE one row */
    async put(store, value) {
      const idb = await open();
      const tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      await transactionDone(tx);
      return value;
    },

    /** DELETE FROM store WHERE key = ? */
    async remove(store, key) {
      const idb = await open();
      const tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      await transactionDone(tx);
    },

    /** INSERT OR REPLACE many rows into several tables, in ONE transaction.
        rows = { sentences: [...], recordings: [...] } */
    async putMany(rows) {
      const idb = await open();
      const names = Object.keys(rows);
      const tx = idb.transaction(names, 'readwrite');
      for (const name of names) {
        const store = tx.objectStore(name);
        for (const row of rows[name]) store.put(row);
      }
      await transactionDone(tx);
    },

    /** Swap the whole Anki library for new rows, in ONE transaction.
        Your Quest Board phrases and takes are not touched. */
    async replaceLibrary(rows) {
      const idb = await open();
      const tx = idb.transaction('library', 'readwrite');
      const store = tx.objectStore('library');
      store.clear();
      for (const row of rows) store.put(row);
      await transactionDone(tx);
    },

    /** Delete a sentence and all its recordings in ONE transaction (all or nothing). */
    async removeSentence(id) {
      const idb = await open();
      const tx = idb.transaction(['sentences', 'recordings'], 'readwrite');
      tx.objectStore('sentences').delete(id);
      const recordings = tx.objectStore('recordings');
      const keys = await requestDone(recordings.index('bySentence').getAllKeys(id));
      for (const key of keys) recordings.delete(key);
      await transactionDone(tx);
    },
  };
})();
