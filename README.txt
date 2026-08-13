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
    b. Give each one a trigger: season / weather / plus one
       more condition. Tick "use as default" on exactly one.
    c. "+ Add another portrait to this slot" puts more in the
       same slot.
    d. Click "Finish and export".


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

    Everything faces the wrong way
      Turn "Face right" OFF in the Farmer Portraits settings.
      The tool already mirrors for you.

==============================================================
