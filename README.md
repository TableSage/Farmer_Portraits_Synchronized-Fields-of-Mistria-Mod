# Farmer Portraits — Synchronized

Custom dialogue portraits for Fields of Mistria that also change your farmer's
outfit to match.

It is a companion to **Farmer Portraits** by DeUlo, which already swaps the
portrait. This adds two things: a browser tool that builds the mod folder for
you from your PNGs, and a small mod that keeps the mini-sprite's clothes in step
with whichever portrait is on screen.

> **Alpha.** Verified in game on Windows, by one person, on one install. Back up
> your save and expect rough edges.

## What's in here

| | |
|---|---|
| `portrait_tool.html` | the builder. Open it in a browser — no install, no server, no network |
| `FarmerPortraitsSync/` | the outfit mod. Goes in your mods folder once |
| `README.txt` | the instructions that ship with a release |
| `test_tool.mjs` | headless test suite, `node test_tool.mjs` |

## You need

- MOMI (the Mistria mod installer) and DeUlo's **Farmer Portraits** mod
- Your portraits as PNG with a transparent background (Picrew exports work
  as-is — the tool downsamples, mirrors and pads them for you)

## How it works

The grid has 8 slots, one per in-game outfit preset: the portrait in slot 3 goes
with preset 3. Each slot can hold several portraits with different triggers that
share one outfit — a winter coat covering `winter_rain`, `winter_sunny` and
`winter_thunder`.

A trigger is a season, a weather and one more condition (location, weekday, day
of month, indoor/outdoor, or a cutscene). Only the combinations DeUlo's mod
actually looks up are offered, and the test suite checks that list against the
mod's own GML rather than against its readme — a tag off that list fails
silently in game, which cannot be debugged from inside the game.

The mod takes the first matching trigger in its precedence order, so a portrait
can end up unreachable: cover winter indoors and winter outdoors and a plain
`winter` portrait has nothing left to appear in. The tool works that out and
warns before you export.

Export downloads one zip holding one correctly named mod folder. The `tag → slot`
table is generated *inside* that folder, so the clothes and the artwork are
installed together and cannot fall out of step.

## Credits

**Farmer Portraits** and **MOMI** are DeUlo's work; neither is included here.
This project is not affiliated with DeUlo or with NPC Studio.

MIT licensed, see `LICENSE`.
