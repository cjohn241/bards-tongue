# The Bard's Tongue

Brazilian Portuguese pronunciation practice, in the Shawnee Home Hub's quest look.
Plain HTML, CSS and JavaScript. It installs on an Android phone and works offline.
No accounts: your phrases, audio and takes are saved on each device.

This folder holds **only the app's code**. Your Anki audio and your recordings
are never uploaded. You carry them to the phone yourself (Part 3).

---

## Part 1. Put the app on GitHub Pages (one time, about 10 minutes)

Same steps as the Pantry app. A phone app needs an `https://` address, and GitHub Pages gives you one for free.

1. Sign in at <https://github.com>. Click **+** at the top right, then **New repository**.
2. **Repository name:** `bards-tongue`. Choose **Public**. Leave "Add a README file" unticked. Click **Create repository**.
3. Click **uploading an existing file**. Open this folder on your computer, select **everything inside it** and drag it into the browser window:
   `index.html`, `manifest.webmanifest`, `sw.js`, `start.bat`, `README.md`, `.gitignore`, and the folders `css`, `js`, `icons` and `tools`.
   Drag the *contents*, not the folder itself. `index.html` has to end up at the top level.

   > **Don't upload `anki-library.json` or any `bards-tongue-backup-…json` file.** They hold your deck's audio and your recordings. The web uploader uploads whatever you drag in, so leave those two out.
4. Type `First upload` under "Commit changes" and click **Commit changes**.
5. Click **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, and click **Save**.
6. Wait 1 to 2 minutes and refresh. Your address appears at the top:
   `https://YOUR-USERNAME.github.io/bards-tongue/`

---

## Part 2. Install it on your phone

1. On the phone, open that address in **Chrome**.
2. Tap **⋮**, then **Add to home screen**, then **Install**. (If Chrome shows an **Install app** banner, tap that instead.)
3. Open **Bard's Tongue** from the home screen. It opens full screen.
4. The first time you tap **Record**, allow the microphone.
5. Check offline: open the app once while online, turn on airplane mode, close it and open it again. It should still work.

---

## Part 3. Get your phrases onto the phone

The phone has its own copy of everything, separate from the computer.
The **Satchel** tab moves your phrases between them.

**Easiest: carry the phrases you're working on.**

1. On the computer, add phrases to the Quest Board (from the Anki Library or your own).
2. **Satchel → Save backup file**. This saves `bards-tongue-backup-YYYY-MM-DD.json` to Downloads.
3. Send the file to your phone with Quick Share, Google Drive or email.
4. On the phone: **Satchel → Choose backup file**, and pick it.

It works the other way too. Back up on the phone (**Share backup…** sends it straight to Drive or Quick Share) and restore on the computer.
Restoring **adds**: phrases and takes already on the device are kept, so practice from both places adds up.

**Or: the whole Anki Library on the phone.** Copy `anki-library.json` (about 86 MB) to the phone,
then **Anki Library → Load library file**. It takes a little while to load on a phone.

---

## Part 4. Everyday use

1. **Pick a phrase** on the Quest Board.
2. **Listen.** Play the clip. Loop repeats it; Speed slows it to 0.75x.
3. **Speak.** Tap Record, say the phrase, tap Stop. Every take is saved.
4. **See the score.** Chrome writes down what it heard next to the target; missed words are underlined.
5. **Compare.** "Native, then me" plays both back to back over the two waveforms.

**Scoring.** A take **passes** when every word is heard and your length is within 15% of the native clip.
A phrase is **mastered** after passing takes on **3 different days**. The numbers are at the top of `js/score.js`.

**Offline.** Everything works except the speech check, which needs internet because
Chrome sends the audio to Google's speech service to turn it into text. Offline takes
still save and still get a rhythm score. Your recordings themselves stay on the device.

The speech check tells you whether you were *understood*, not whether you sound native.
Your ear and the waveforms are still the judge of accent.

---

## Part 5. Phrases from your Anki deck (on the computer)

1. In a terminal, in this folder, run:
   ```
   python tools/export_anki.py
   ```
   It reads a copy of your Anki collection (the real one is never changed) and saves every
   example sentence and its audio to `anki-library.json`.
2. In the app: **Anki Library → Load library file**, and pick `anki-library.json`.
3. Search, tap ▶ to listen, and **+ Add** the sentences you want.

Run the export again whenever your deck changes, then **Reload file**.

---

## Part 6. Using it on the computer

Double-click **start.bat**. It opens the app in Chrome at `http://localhost:8765`.
Keep the black window open while you practice.
You can also just open your GitHub address in Chrome on the computer. Each address keeps its own
phrases, so pick one and stick with it (or move phrases with the Satchel).

---

## Part 7. Changing the app later

1. Edit the file(s) on your computer.
2. Open `sw.js` and change `CACHE_NAME` from `bards-tongue-v1` to `bards-tongue-v2` (then v3, and so on).
   **This step matters.** The phone keeps its offline copy until `CACHE_NAME` changes.
3. On GitHub, open the repository, click **Add file → Upload files**, and drag in the changed files, keeping their folders. Commit.
4. Open the app on the phone while online, close it, and open it again. The second launch runs the new version. Your phrases aren't touched.

---

## How the code is organized

```
index.html             page shell: header, tabs, and an empty <main> each screen draws into
manifest.webmanifest   app name, icons, full-screen mode (lets Android install it)
sw.js                  service worker: saves the app files for offline use
start.bat              runs the app on the computer at http://localhost:8765
css/styles.css         the Home Hub look (colors and fonts at the top)
js/db.js               the on-device database (IndexedDB), explained as SQL-style tables
js/ui.js               small helpers: escaping, ids, dates, base64, the toast
js/audio.js            recording, playback, waveforms
js/speech.js           Chrome's speech-to-text (pt-BR)
js/score.js            word matching, take scores, mastery rules
js/sprite.js           Christon the Cleric, the pixel hero from the Home Hub
js/board.js            Quest Board and New phrase
js/library.js          Anki Library: search and add sentences from your deck
js/shadow.js           Training Grounds: the shadow and compare loop
js/backup.js           Satchel: save and restore backup files
js/app.js              starts the app and shows the screen for #board, #library, ...
icons/                 home-screen icons
tools/export_anki.py   makes anki-library.json from your Anki deck
tools/make_icons.py    draws the icons from the sprite
```

### Troubleshooting
- **No "Install" option:** make sure the address starts with `https://` and ends with `/bards-tongue/`. Wait a few minutes after turning on Pages.
- **Blank page:** `index.html` probably ended up inside a subfolder. It has to be at the top level of the repository.
- **Old version keeps showing:** bump `CACHE_NAME` in `sw.js`.
- **"The speech check could not use the microphone":** some phones won't let the recorder and the speech check share the mic. Your take still saves and gets a rhythm score. Tell Claude, and it can add a separate "say it for the check" button.
- **Phrases disappeared:** restore your latest backup from the Satchel.
