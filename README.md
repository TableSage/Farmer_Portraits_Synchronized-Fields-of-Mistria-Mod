# Farmer Portraits — Synchronized

An 8-slot builder for the Farmer Portraits mod. Drop in Picrew exports, pick when
each one should appear, export a ready-to-install mod folder.

Grid position **is** the in-game preset slot: the portrait in slot 3 is meant to
go with outfit preset 3. That mapping is what the companion GML mod will use to
swap the mini-sprite's clothes to match the portrait on screen.

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

1. Drag PNGs onto the grid — a drop on the background spreads across empty
   slots, a drop on one tile fills that slot and adds cards for the extras
2. Per portrait, build the trigger: season / weather / then one more condition.
   Exactly one portrait in the whole build gets **use as default?**
3. **Finish and export to game** downloads `FarmerPortraitsExample.zip`
4. Extract the whole zip anywhere, then double-click **INSTALL.bat** and drag
   your MOMI mods folder onto the window
5. Open MOMI and hit Install — art is baked in at install time, so this is
   required after every art change
6. In game, build outfit presets 1–8 to match the slots

### Where things live (get this wrong and nothing works)

MOMI is the installer, and it owns two different folders:

| Folder | Who owns it | What it is |
|---|---|---|
| Your **mods library** — the folder MOMI asks for at startup | You | The source. One folder per mod, each with a `manifest.json` |
| `<game>\mods\` | **MOMI** | Its output. MOMI copies the library here and tracks profiles in `momi_profiles.json` |

Everything this tool produces goes in the **library**. Writing into the game
folder appears to work and is then silently reverted by MOMI's next install.
This matches DeUlo's own instruction — *"Put the mods into your mods folder and
install through MOMI"* — where "your mods folder" is the library.

### Why there is an installer

The export replaces DeUlo's example sprite mod, exactly as the readme's
walkthrough describes ("open the example's art folder" and swap the images).
Two silent failure modes come with doing that by hand, and the script fixes both:

- **Stale sprites outrank new ones.** Extracting over the mod folder adds files
  but never removes them. A leftover `winter_sunny.png` from an older export
  beats a new `beach.png` every time, because `season_weather` sits above
  `location` in the precedence list — so the new portraits appear not to work.
  The installer deletes `animations\FarmerPortraits\` before copying.
- **Explorer's wrapper folder.** "Extract to `FarmerPortraitsExample\`" nests the
  mod one level too deep, `manifest.json` ends up where MOMI does not look, and
  MOMI simply does not list the mod. The installer copies the folder itself, so
  where the zip was unpacked stops mattering.

MOMI does not record its library path anywhere on disk, so the script asks for
it and validates it by looking for the `Farmer Portraits` base mod inside — which
has to be there anyway, so a wrong folder and a missing dependency produce one
clear error instead of two confusing ones. It confirms before deleting anything.
A browser cannot delete files, which is the whole reason this is a script rather
than part of the export.

### Naming: do not rename the mod

MOMI keys mods by an id derived from the manifest's author and name — DeUlo's
example resolves to `deulo.farmer_portraits_sprites_example`, and that string is
what `momi_profiles.json` stores in `enabledMods`. Changing `name` or `author`
in the generated `manifest.json` produces a *different* id, so MOMI treats it as
a new mod that is disabled by default, while the old one stays enabled and both
supply `spr_farmer_portrait_*`. Keep the manifest as DeUlo wrote it.

## What it does to the images

All of it runs in the browser, on canvas pixel data:

- detect the nearest-neighbour upscale factor (Picrew exports 540×960 = 6× of
  90×160) and take one pixel per block
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
multiple portraits per slot, the pixel pipeline, the export mapping, the
generated installer, and the zip writer. It writes `test_zip.zip` as a side
effect, which is ignored by git.

The check worth understanding is **PATTERNS vs the GML**. The tool only accepts
tags whose shape appears in the mod's 19-entry precedence list, and a tag that
is not on that list is never looked up in game — it fails silently, which cannot
be debugged from inside the game. So the test parses
`deulo_farmer_portraits_keys()` out of `FarmerPortraits.gml` and asserts the two
lists are identical, in order. It reads the mod from
`..\SageMistriaMods\mods\` or the Steam install; if it finds neither it
**fails rather than skips**, because a correctness check that quietly disappears
is worse than no check at all.

## Not built yet

The companion GML mod that reads `outfit_slots.json` and calls
`obj_ari.change_preset(n)`. The tool already emits the sidecar (0-based indices).
See PRD §8 — the central rule is that the outfit is applied **once, on the rising
edge of dialogue**, so between conversations the player's wardrobe is entirely
their own. §8 and §11 also record the resolved design: a companion mod rather
than a fork, keyed off `ANCHOR.get_menu(Menu.Textbox)`.
