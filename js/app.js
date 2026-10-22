// app.js — starts the app and shows the screen named in the address:
//   #board        the Quest Board (your phrases)
//   #new          add a phrase
//   #library      pick phrases from your Anki deck
//   #backup       the Satchel: save or restore a backup file
//   #train/<id>   the Training Grounds for one phrase

// The app's version, shown small at the bottom of every screen.
// Keep it the same as CACHE_NAME in sw.js (bards-tongue-v4 -> 'v4').
const APP_VERSION = 'v4';

const main = document.getElementById('screen');
document.getElementById('app-version').textContent = `The Bard's Tongue ${APP_VERSION}`;
let leaveScreen = null; // cleanup from the screen we're on (stop sound, mic off)

async function show() {
  if (leaveScreen) { leaveScreen(); leaveScreen = null; }
  main.onclick = null;

  const [name, id] = location.hash.slice(1).split('/');

  // Light up the tab you're on (training and new phrase belong to the board).
  const tab = name === 'library' || name === 'backup' ? name : 'board';
  document.querySelectorAll('#tabs a').forEach((a) => {
    const active = a.dataset.screen === tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    if (name === 'new') leaveScreen = await renderNewPhrase(main);
    else if (name === 'library') leaveScreen = await renderLibrary(main);
    else if (name === 'backup') leaveScreen = await renderBackup(main);
    else if (name === 'train' && id) leaveScreen = await renderTraining(main, id);
    else leaveScreen = await renderBoard(main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<section class="panel"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p></section>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);

// Ask Chrome not to clear our data when the disk gets tight.
// Installed apps usually get this automatically.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Offline support. Only works over https (or localhost).
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
}

show();
