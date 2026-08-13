# Farmer Portraits — Synchronized

An 8-slot builder for the Farmer Portraits mod. Drop in Picrew exports, pick when
each one should appear, export a ready-to-install mod folder.

Grid position **is** the in-game preset slot: the portrait in slot 3 goes with
outfit preset 3. The generated companion mod uses that mapping to swap the
mini-sprite's clothes to match the portrait on screen.

**A slot holds more than one portrait.** The 8 caps *outfits*, not art — several
triggers can share one in-game outfit, which is what you want when the same
winter coat should cover `winter_rain`, `winter_sunny` and `winter_thunder`.
Select a slot, then **+ Add another portrait to this slot**; each card gets its
own trigger and its own delete button, and a slot always keeps at least one.
Tags must be unique across the whole build; slot numbers need not be.

Design rationale, verified engine facts and the outfit-swapping half live in
`PORTRAIT_TOOL_PRD.md` (untracked — local working notes, not part of the mod).
Read it before changing anything here.

## Use it

Open `portrait_tool.html` in any browser. No install, no server, no network.

Your work is saved in the browser as you go, so closing the tab or reloading
costs nothing. **Start over** in the top card is the way back to an empty board.
What gets saved is the *downsampled* art — a few KB per portrait rather than the
tens of KB a Picrew export weighs — which is the only reason eight portraits fit
in browser storage at all.

1. Drag PNGs onto the grid — a drop on the background spreads across empty
   slots, a drop on one tile fills that slot and adds cards for the extras
2. Per portrait, build the trigger: season / weather / then one more condition.
   Exactly one portrait in the whole build gets **use as default?**
3. **Finish and export to game** downloads `FarmerPortraitsExample.zip`, holding
   `FarmerPortraitsExample\` (sprites), `FarmerPortraitsSync\` (the outfit mod)
   and `INSTALL.bat`
4. In your MOMI mods folder: **delete the whole `FarmerPortraitsExample` folder**,
   then **Extract Here** the zip
5. Open MOMI, enable **both** new mods, and hit Install — art is baked in at
   install time, so this is required after every art change
6. In game, build outfit presets 1–8 to match the slots

`INSTALL.bat` in the zip automates step 4 for both folders. Windows blocks scripts downloaded
through a browser, so right-click it → Properties → tick **Unblock** before it
will run. Replacing the folder by hand is equally safe and is the documented
path; the script only saves the delete.

### Keep exactly one mods folder

MOMI asks for **one** mods folder at startup and bakes the enabled mods straight
into `<game>\assets.zip` (`assets.bak.zip` is its vanilla backup). It does *not*
copy anything into `<game>\mods\` — that path is only special because it is a
common thing to point MOMI at. This is DeUlo's instruction verbatim: *"Put the
mods into your mods folder and install through MOMI."*

So **do not keep two mods folders.** Installing from the wrong one produces no
error at all — you get your previous art back and conclude the export failed.
This cost an hour on 2026-08-12.

Two ways to check, when something looks stale:

```
# which folder is MOMI actually reading? the one holding this file
dir /s /b momi_profiles.json

# what did it actually install?
python -c "import zipfile; print([n for n in zipfile.ZipFile(r'<game>\assets.zip').namelist() if 'farmer_portrait' in n])"
```

### Why step 4 says delete, not overwrite

The export replaces DeUlo's example sprite mod, exactly as the readme's
walkthrough describes ("open the example's art folder" and swap the images).
Two silent failure modes come with doing that by hand:

- **Stale sprites outrank new ones.** Extracting *over* the mod folder adds files
  but never removes them. A leftover `winter_sunny.png` from an older export
  beats a new `beach.png` every time, because `season_weather` sits above
  `location` in the precedence list — so the new portraits appear not to work,
  with no error anywhere. Deleting the folder first makes this impossible.
- **Explorer's wrapper folder.** "Extract to `FarmerPortraitsExample\`" nests the
  mod one level too deep, `manifest.json` ends up where MOMI does not look, and
  MOMI simply does not list the mod. Use **Extract Here**.

`INSTALL.bat` exists to do both correctly. MOMI does not record its library path
anywhere on disk, so the script asks for it and validates it by looking for the
`Farmer Portraits` base mod inside — which has to be there anyway, so a wrong
folder and a missing dependency produce one clear error instead of two confusing
ones. It confirms before deleting anything.

It is a convenience, not a requirement, and it is deliberately not the primary
instruction: a `.bat` that arrived inside a browser download carries Windows'
Mark-of-the-Web and is blocked until unblocked by hand, which is a worse first
experience than deleting a folder.

### Naming: do not rename the mod

MOMI keys mods by an id derived from the manifest's author and name — DeUlo's
example resolves to `deulo.farmer_portraits_sprites_example`, and that string is
what `momi_profiles.json` stores in `enabledMods`. Changing `name` or `author`
in the generated `manifest.json` produces a *different* id, so MOMI treats it as
a new mod that is disabled by default, while the old one stays enabled and both
supply `spr_farmer_portrait_*`. Keep the manifest as DeUlo wrote it.

## What it does to the images

All of it runs in the browser, on canvas pixel data. The first step runs the
moment a file lands, the rest at export:

- detect the nearest-neighbour upscale factor (Picrew exports 540×960 = 6× of
  90×160) and take one pixel per block. Detection is deliberately a separate
  function from the rest and runs **once per upload** — feeding an
  already-native image back through it could in principle read it as an upscale
  of something smaller
- mirror horizontally — Picrew faces right, the farmer sits on the right of the
  dialogue box and must face inwards. The mod's own "Face right" toggle reads
  backwards relative to this; leave it off
- pad to exactly **90×180** with the padding on **top**, because the sprite
  origin is top-left and the character sits flush to the bottom of the Picrew
  frame. 180 is `DEULO_FP_VANILLA_PORTRAIT_H`, so the mod's fit factor is 1.0 and
  nothing is resampled

Every step is an exact pixel operation. Export from Picrew with the transparent
background option — the tool warns if an image has no transparency, but it will
not try to remove a background.

## Checks

One command, no dependencies beyond node — the tool ships as a single HTML file
and the tests deliberately need nothing the user would not already have:

```
node test_tool.mjs
```

It runs the page against a small DOM shim and covers the grid, the tag rules,
multiple portraits per slot, the pixel pipeline, saving and restoring, the export
mapping, the generated companion mod, the installer, and the zip writer. It
writes `test_zip.zip` as a side effect, which is ignored by git.

The check worth understanding is **PATTERNS vs the GML**. The tool only accepts
tags whose shape appears in the mod's 19-entry precedence list, and a tag that
is not on that list is never looked up in game — it fails silently, which cannot
be debugged from inside the game. So the test parses
`deulo_farmer_portraits_keys()` out of `FarmerPortraits.gml` and asserts the two
lists are identical, in order. It reads the mod from
`..\SageMistriaMods\mods\` or the Steam install; if it finds neither it
**fails rather than skips**, because a correctness check that quietly disappears
is worse than no check at all.

## The outfit half

Every export also generates **`FarmerPortraitsSync\`**, a companion mod that
swaps the farmer's outfit preset to match the portrait. The `tag -> slot` table
is compiled into the GML as a literal, so there is no file to read at runtime and
the table cannot drift from the sprites it shipped with. Both mods must be
enabled in MOMI.

It is a companion, not a fork: `deulo_farmer_portraits_context()` and
`deulo_farmer_portraits_keys()` are global functions, so it walks *the same key
array in the same order* as the portrait lookup. The first key with a slot is the
same key that won the sprite, which is why the clothes can never disagree with
the face on screen.

### When it re-dresses you

Two moments, and they answer different questions.

- **The trigger changed.** Walking indoors, the weather turning, a new day, a new
  season — the same events that change which portrait would be drawn. This is
  what makes the inn outfit appear when you enter the inn, rather than when you
  next talk to someone in it.
- **A conversation opened.** The portrait is now on screen, so the clothes have
  to agree with it even if nothing about the world moved.

**In between, the wardrobe is yours.** Cycling presets by hand sticks until the
world moves on or someone talks to you — the mod re-asserts on *changes*, not
every frame, so it never fights you mid-outfit-change.

Cost: five number comparisons per frame (season, weekday, day of month, weather,
location — everything `deulo_farmer_portraits_context()` reads; `inout` is
derived from the location). The expensive part — building the context struct and
up to nineteen key strings — only runs on frames where the answer could differ.

A change that arrives at a bad moment is **deferred, not dropped**: it stays
pending and retries until the frame is safe, so a season that turns while you
sleep lands as soon as you are on your feet. Unsafe means mid-cutscene
(`MIST.is_running()` — the FSM routes preset changes through animations), the
end-of-day sequence (`ARI.end_of_day_status`), or the customization menu being
open, which *is* the wardrobe and must never be fought.

### If a portrait maps to an outfit slot you never built

A new farmer starts with **one** preset, and presets can be deleted, so a slot in
the table may simply not exist. The mod leaves the outfit alone rather than
dressing you in something that disagrees with the portrait, and logs once through
`mmapi_log_warn` naming the tag and the slot — the only way to notice from inside
the game.

Presets are created in order, so mapping slot 6 means building six presets even
if 2–5 are unused. The tool warns about exactly that gap before you export, and
the export's next-steps panel tells you how many presets the build needs.
