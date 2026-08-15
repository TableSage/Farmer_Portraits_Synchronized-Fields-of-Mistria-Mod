==============================================================
  FARMER PORTRAITS - SYNCHRONIZED
  Dialogue portraits that also change your farmer's outfit
==============================================================

  YOU NEED
    MOMI, the "Farmer Portraits" mod by DeUlo, and your
    portraits as PNG with a transparent background.

  IN HERE
    portrait_tool.html    The builder. Opens in any browser.
    FarmerPortraitsSync   The outfit mod. Install once.

    The builder pulls its look (NES.css, Press Start 2P)
    off the web the first time you open it. Offline it
    still works, it just looks plain. Your portraits never
    leave your machine either way.


  HOW IT MAPS
  -----------
    The grid has 8 slots. Slot 1 is outfit preset 1 in game,
    slot 2 is preset 2, and so on.

    You can assign several portraits to one slot, each with
    its own trigger. They all share that slot's outfit.

    Slot 3, for example:

        at the beach  \
        raining        > all show preset 3's outfit
        it's winter   /

    Three different pictures on screen, one set of clothes.

    One portrait can also answer to more than one trigger.
    Same picture, several tags, one upload - see step 2c.


  1. INSTALL THE OUTFIT MOD  (once, ever)
  ---------------------------------------
    Drag FarmerPortraitsSync into your game's mods folder,
    next to the "Farmer Portraits" folder already there:

        ...\steamapps\common\Fields of Mistria\mods\

    That's the folder for every step below, too.


  2. BUILD YOUR PORTRAITS
  -----------------------
    Open portrait_tool.html.

    a. Drag your PNGs onto the slots, or click a slot and use
       "Upload" in the panel below.
    b. Give each one a tag: season / weather / plus one more
       condition. Tick "Use as Default" on exactly one.

       A tag that works carries no mark. A tag that can
       never appear in game gets a red X, and that blocks
       the export until you fix it. Anything in between -
       a tag something else takes contexts from - is a
       line in the Conflicts panel rather than a symbol.
    c. "+ Add Another Portrait to This Slot" puts a different
       picture in the same slot. "+ Add a Tag" gives the SAME
       picture another tag - that is what you want when a
       higher-priority tag is covering it up (see e. below).
    d. Cutscene names, and the late-game and secret places,
       are hidden until you tick "Include Spoiler Options".
       The dropdown says so when that is what emptied it.
    e. "Conflicts", on the right of each portrait, lists only
       the tags that win before it and what each one costs
       you, with a button to add the tag that wins those
       contexts back. Empty means nothing is wrong.
    f. Click "Finish and Export".


  3. INSTALL YOUR PORTRAITS
  -------------------------
    a. Unzip. Drag the folder inside into your mods folder.

       *** If that folder is already there, DELETE it first.
       *** Merging leaves old portraits behind, and they can
       *** override your new ones.

    b. Open MOMI, tick both mods, hit Install.
    c. In game, build your outfit presets so preset 1 matches
       slot 1, preset 2 matches slot 2, and so on.

    To change portraits later, repeat 2 and 3. The tool
    remembers your work between visits.


  IF SOMETHING LOOKS WRONG
  ------------------------
    Nothing changed
      Artwork is baked in at install time. Open MOMI and hit
      Install again.

    An old portrait keeps showing up
      You may have merged instead of replacing. Delete the
      FarmerPortraitsExample folder from your mods folder,
      then unzip a fresh export into it.

    Portraits work, clothes don't
      You need as many outfit presets in game as the highest
      slot you used. A new farmer has only one - add more in
      the customization menu.

    One portrait never shows up
      The tool warns about this before you export: a more
      specific trigger always wins, so if you cover winter
      indoors and winter outdoors, a plain "winter" portrait
      has nothing left to appear in. Widen it or drop it.

    A portrait shows up, but not when you expected
      The mod picks the FIRST matching tag from a fixed
      priority list, and season beats location - so a "summer"
      portrait hides a "beach" one all summer long. The tag
      is listed in the Conflicts panel, which says so and
      offers to add "summer_beach" for you. That is one
      extra tag, not a second copy of the art, and it only
      takes one: spring, fall and winter at the beach were
      never in dispute.

      Some pairs cannot be resolved at all. A tag holds a
      season, a weather and ONE more condition, so there is no
      tag meaning "at the beach on a Saturday" - and weekday
      outranks location. The Conflicts panel says so plainly
      instead of offering a button that would not work.

    The tool looks like a plain unstyled web page
      It could not reach the web for NES.css. Everything
      still works and exports correctly - connect and
      reload if you want the pixel look back.

    Everything faces the wrong way
      Turn "Face right" OFF in the Farmer Portraits settings.
      The tool already mirrors for you.

==============================================================
