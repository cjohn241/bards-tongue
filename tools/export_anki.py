"""
export_anki.py: turn your Anki deck into one file the app can load.

It reads a COPY of your Anki collection (your real one is never touched),
pulls each card's example sentence and its native audio clip, and writes
anki-library.json next to index.html. Then, in the app, open the Anki
Library and click "Load library file".

Run it from a terminal:
    python tools/export_anki.py

Options:
    --deck "Portuguese Core 1.5k (Reversed)"   which deck to export
    --profile "User 1"                         your Anki profile name
    --out anki-library.json                    where to save the file

Run it again whenever your deck changes. Anki can stay open while it runs.
"""

import argparse
import base64
import html
import json
import os
import re
import shutil
import sqlite3
import tempfile

# Which note fields hold what. These match the "Rich Vocabulary Model"
# notes in Portuguese Core 1.5k. Change them if you use another deck.
FIELDS = {
    "word": "Word",
    "meaning": "Definitions",
    "text": "Example PT",        # the sentence you'll shadow
    "english": "Example EN",
    "audio": "Example Audio",    # the native clip for that sentence
}

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def clean(field):
    """Anki fields are HTML. Turn one into plain text."""
    text = re.sub(r"<(br|li|div)[^>]*>", " ", field)  # these break lines; keep a space
    text = re.sub(r"<[^>]+>", "", text)                # drop every other tag
    text = re.sub(r"\[sound:[^\]]+\]", "", text)        # and audio markers
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def open_copy(profile_dir):
    """Copy the collection to a temp folder and open the copy."""
    tmp = tempfile.mkdtemp(prefix="bards-tongue-")
    for name in ("collection.anki2", "collection.anki2-wal"):
        src = os.path.join(profile_dir, name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(tmp, name))
    con = sqlite3.connect(os.path.join(tmp, "collection.anki2"))
    # Anki sorts some columns with its own rule; SQLite needs to know it exists.
    con.create_collation("unicase", lambda a, b: (a.lower() > b.lower()) - (a.lower() < b.lower()))
    return con, tmp


def main():
    parser = argparse.ArgumentParser(description="Export an Anki deck for The Bard's Tongue.")
    parser.add_argument("--deck", default="Portuguese Core 1.5k (Reversed)")
    parser.add_argument("--profile", default="User 1")
    parser.add_argument("--out", default=os.path.join(APP_DIR, "anki-library.json"))
    args = parser.parse_args()

    profile_dir = os.path.join(os.environ["APPDATA"], "Anki2", args.profile)
    media_dir = os.path.join(profile_dir, "collection.media")
    if not os.path.exists(os.path.join(profile_dir, "collection.anki2")):
        raise SystemExit(f"No Anki collection found in {profile_dir}. Check --profile.")

    con, tmp = open_copy(profile_dir)
    try:
        # Decks are stored with \x1f between parent and child names.
        decks = {did: name.replace("\x1f", "::") for did, name in con.execute("SELECT id, name FROM decks")}
        deck_ids = [did for did, name in decks.items() if name == args.deck or name.startswith(args.deck + "::")]
        if not deck_ids:
            raise SystemExit(f'No deck named "{args.deck}". Your decks: {", ".join(sorted(decks.values()))}')

        # Field names per note type, so we can find "Example PT" by name.
        field_names = {}
        for ntid, ord_, name in con.execute("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"):
            field_names.setdefault(ntid, []).append(name)

        marks = ",".join("?" * len(deck_ids))
        notes = con.execute(
            f"SELECT DISTINCT n.id, n.mid, n.flds FROM notes n JOIN cards c ON c.nid = n.id WHERE c.did IN ({marks})",
            deck_ids,
        ).fetchall()
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

    items, skipped = [], 0
    for note_id, mid, flds in notes:
        values = dict(zip(field_names.get(mid, []), flds.split("\x1f")))
        sound = re.search(r"\[sound:([^\]]+)\]", values.get(FIELDS["audio"], ""))
        text = clean(values.get(FIELDS["text"], ""))
        path = sound and os.path.join(media_dir, sound.group(1))
        if not text or not path or not os.path.exists(path):
            skipped += 1
            continue
        with open(path, "rb") as f:
            audio = base64.b64encode(f.read()).decode("ascii")
        items.append({
            "id": f"anki-{note_id}",
            "word": clean(values.get(FIELDS["word"], "")),
            "meaning": clean(values.get(FIELDS["meaning"], "")),
            "text": text,
            "english": clean(values.get(FIELDS["english"], "")),
            "audioName": sound.group(1),
            "audio": audio,  # the mp3, as base64 text
        })

    items.sort(key=lambda i: int(i["id"].split("-")[1]))  # Anki's original order
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"source": "anki", "deck": args.deck, "items": items}, f, ensure_ascii=False)

    size = os.path.getsize(args.out) / 1024 / 1024
    print(f"Saved {len(items)} sentences ({size:.0f} MB) to {args.out}")
    if skipped:
        print(f"Skipped {skipped} notes with no example sentence or missing audio.")


if __name__ == "__main__":
    main()
