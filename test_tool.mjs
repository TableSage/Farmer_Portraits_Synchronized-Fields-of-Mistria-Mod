/* Headless test for portrait_tool.html.
 *
 *   node test_tool.mjs
 *
 * Runs the page's script against a minimal DOM shim, drives the UI the way a
 * user would, and checks the things that are expensive to discover in a browser
 * or impossible to see until you are in game: that every slot renders, that the
 * tag list still matches the mod's own GML, that several portraits can share one
 * outfit slot, that the pixel pipeline is exact, and that the generated
 * companion mod and installer are well formed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(new URL('./portrait_tool.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* ------------------------------------------------------------- DOM shim */

let lastPutImageData = null;
let srcData = null;                      // what every fake canvas reads back

class El {
  constructor(tag){
    this.tagName = tag; this.children = []; this.options = [];
    this._html = ''; this._q = new Map(); this.style = {}; this.dataset = {};
    this.disabled = false; this.checked = false; this._value = '';
    this._cls = new Set();
    this.classList = {
      add: c => this._cls.add(c), remove: c => this._cls.delete(c),
      toggle: (c,on) => on ? this._cls.add(c) : this._cls.delete(c),
      contains: c => this._cls.has(c),
    };
  }
  get className(){ return [...this._cls].join(' '); }
  set className(v){ this._cls = new Set(v.split(/\s+/).filter(Boolean)); }
  get innerHTML(){ return this._html; }
  set innerHTML(v){
    this._html = v;
    if (v === ''){ this.children = []; this.options = []; this._value = ''; }
  }
  get textContent(){ return this._text || ''; }
  set textContent(v){ this._text = v; }
  get value(){ return this._value; }
  set value(v){
    // A real <select> refuses values that aren't among its options.
    if (this.tagName === 'select' && v !== '' && !this.options.some(o => o.value === v)){
      this._value = ''; return;
    }
    this._value = v;
  }
  append(...kids){
    for (const k of kids){
      this.children.push(k);
      if (k.__isOption) this.options.push(k);
    }
    if (this.tagName === 'select' && this.options.length && this._value === '')
      this._value = this.options[0].value;
  }
  querySelector(sel){
    if (!this._q.has(sel)) this._q.set(sel, new El('div'));
    return this._q.get(sel);
  }
  addEventListener(){}
  click(){ this.__clicked = true; }
  getContext(){
    const self = this;
    return {
      // A canvas that has been drawn into reads back what was put there; a
      // fresh one reads the fixture. That is what lets toNative() and finish()
      // be driven back to back the way the page drives them.
      drawImage(src){ if (src && src.__out) self.__out = src.__out; },
      getImageData(){ return self.__out || srcData; },
      createImageData(w,h){
        return {width:w, height:h, data:new Uint8ClampedArray(w*h*4)};
      },
      putImageData(d){ lastPutImageData = d; self.__out = d; },
    };
  }
  toBlob(cb){ cb(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])])); }
  toDataURL(){ return 'data:image/png;base64,AAAA'; }
}

const byId = new Map();
for (const id of ['grid','flip','export','status','afterExport','picker',
                  'slotHead','cards','addCard','wrap','reset','spoilers'])
  byId.set(id, new El('div'));

// Enough of a localStorage to prove the round trip, and a switch to make it
// throw the way a full or locked-down browser does.
const store = new Map();
let storageBroken = false;
globalThis.localStorage = {
  getItem: k => (storageBroken ? (() => { throw new Error('denied'); })() :
                 store.has(k) ? store.get(k) : null),
  setItem: (k,v) => { if (storageBroken) throw new Error('quota'); store.set(k, v); },
  removeItem: k => store.delete(k),
};
let confirmAnswer = true;
globalThis.confirm = () => confirmAnswer;

globalThis.document = {
  getElementById: id => byId.get(id) || new El('div'),
  createElement: tag => new El(tag),
  addEventListener(){},
};
globalThis.Option = function(label, value){
  return {__isOption:true, label, value: value === undefined ? label : value};
};
globalThis.Image = class {
  set src(v){ this._src = v; if (this.onload) this.onload(); }
  get src(){ return this._src; }
};
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};

/* ------------------------------------------------------------------ run */

const T = {};
new Function('__T', script + `
  Object.assign(__T, {makeZip, crc32, processImage, toNative, finish, buildFiles,
    statusOf, tagOf, validate, advisories, presetsNeeded, everyCard, slots, cells,
    shadowed, covered, regionOf, valuesFor, SPOILER_LOCATIONS, LOCATIONS, CUTSCENES,
    render, select, buildCards, acceptFiles, loadInto, restoreState, saveState,
    STORE, PATTERNS, TARGET_H, MOD_DIR, $});
`)(T);

let fails = 0;
const ok = (name, cond, extra='') => {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name} ${extra}`); fails++; }
};
const ctl = (slot, idx) => T.slots[slot].cards[idx]._els;
const set = (slot, idx, field, v) => {
  const c = ctl(slot, idx);
  if (field === 'isDefault') c.isDefault.checked = v; else c[field].value = v;
  c[field].onchange();
};

/* 1. every slot renders (the bug that shipped in the first build was one row) */
console.log('\nrender');
ok('8 cells built', T.cells.length === 8, `got ${T.cells.length}`);
ok('every cell has a caption',
   T.cells.every(c => c.querySelector('.cap').innerHTML !== ''));
ok('empty slots read as skipped',
   T.cells.every(c => c.querySelector('.cap').innerHTML.includes('no trigger set')));
ok('one card per slot to start', T.everyCard().length === 8);

/* 2. tag logic */
console.log('\ntags');
const tag = o => T.tagOf(Object.assign(
  {isDefault:false,season:'',weather:'',kind:'',value:''}, o));
const state = o => T.statusOf(Object.assign(
  {isDefault:false,season:'',weather:'',kind:'',value:''}, o)).state;
ok('season+weather', tag({season:'winter',weather:'rain'}) === 'winter_rain');
ok('cutscene alone', tag({kind:'cutscene',value:'wedding'}) === 'wedding');
ok('season+weather+location',
   tag({season:'fall',weather:'sunny',kind:'location',value:'beach'})
   === 'fall_sunny_beach');
ok('default ignores dropdowns', tag({isDefault:true,season:'fall'}) === 'default');
ok('weather+daynumber is rejected',
   state({weather:'rain',kind:'daynumber',value:'3'}) === 'bad');
ok('day alone is accepted', state({kind:'day',value:'saturday'}) === 'ok');
ok('missing value is rejected', state({kind:'location'}) === 'bad');
ok('19 patterns', T.PATTERNS.length === 19, `got ${T.PATTERNS.length}`);

/* 2b. PATTERNS vs the mod's own GML.
   The tool only accepts tags whose shape is on this list, and a tag that is not
   on it is never looked up in game - it fails silently, which cannot be
   debugged from inside the game. So the list is checked against the function
   that actually builds the keys, not against the readme's summary of it. */
// Wherever DeUlo's mod happens to live. FARMER_PORTRAITS_GML is the answer on a
// machine that keeps its games somewhere else - the rest are only guesses, and
// the earlier absolute entry here was one that could never match on a clone.
const REL = 'mods/Farmer Portraits/gml/FarmerPortraits.gml';
const GML_PATHS = [
  process.env.FARMER_PORTRAITS_GML,
  path.resolve(here, `../SageMistriaMods/${REL}`),
  ...['C:', 'D:', 'E:'].flatMap(d => [
    `${d}/Steam/steamapps/common/Fields of Mistria/${REL}`,
    `${d}/Program Files (x86)/Steam/steamapps/common/Fields of Mistria/${REL}`,
  ]),
].filter(Boolean);
const FIELDS = {season:'season', weather:'weather', cutscene:'cutscene',
  location:'location', inout:'inout', day:'day', dom:'daynumber'};

function patternsFromGml(text){
  const fn = text.match(/function deulo_farmer_portraits_keys[\s\S]*?\n\}/);
  if (!fn) throw new Error('deulo_farmer_portraits_keys() not found');
  const out = [];
  for (const line of fn[0].split('\n')){
    const push = line.match(/__deulo_farmer_portraits_push\(_keys, \[(.*?)\]\)/);
    if (push){
      const parts = push[1].split(',').map(p => p.trim().replace(/^_c\./, ''));
      const unknown = parts.filter(p => !FIELDS[p]);
      if (unknown.length) throw new Error('unknown context field: ' + unknown);
      out.push(parts.map(p => FIELDS[p]).join('_'));
      continue;
    }
    const lit = line.match(/array_push\(_keys, "(\w+)"\)/);
    if (lit) out.push(lit[1]);
  }
  return out;
}

const gmlPath = GML_PATHS.find(p => fs.existsSync(p));
if (!gmlPath){
  // Counts as a failure, not a skip: this is the check that catches a tag the
  // game will never look up, and one that quietly disappears is worse than none.
  console.log('  FAIL  PATTERNS vs GML — FarmerPortraits.gml not found');
  console.log('        Point at it with FARMER_PORTRAITS_GML=<path to '
    + 'FarmerPortraits.gml>');
  console.log('        (checked: ' + GML_PATHS.join(', ') + ')');
  fails++;
} else {
  const fromGml = patternsFromGml(fs.readFileSync(gmlPath, 'utf8'));
  ok('PATTERNS matches deulo_farmer_portraits_keys() exactly',
     JSON.stringify(fromGml) === JSON.stringify(T.PATTERNS),
     `\n        mod:  ${JSON.stringify(fromGml)}\n        tool: ${JSON.stringify(T.PATTERNS)}`);
}

/* 3. driving the card controls */
console.log('\ncard controls');
T.select(0);
set(0, 0, 'fSeason', 'winter');
set(0, 0, 'fWeather', 'rain');
ok('dropdowns write through', T.tagOf(T.slots[0].cards[0]) === 'winter_rain');
ok('tag line shows it', ctl(0,0).tagline.innerHTML.includes('winter_rain'));
set(0, 0, 'fKind', 'location');
ok('value list repopulates for the kind',
   ctl(0,0).fValue.options.some(o => o.value === 'beach'));
ok('incomplete trigger is called out',
   ctl(0,0).tagline.innerHTML.includes('pick a value'));
set(0, 0, 'fKind', '');
ok('clearing the kind restores the tag', T.tagOf(T.slots[0].cards[0]) === 'winter_rain');

/* 4. several portraits on one slot — the whole point of the overhaul */
console.log('\nmultiple portraits per slot');
T.$('addCard').onclick();
ok('a second card appears', T.slots[0].cards.length === 2);
ok('both cards are addressable', !!ctl(0,1).fSeason);
set(0, 1, 'fSeason', 'winter');
set(0, 1, 'fWeather', 'thunder');
ok('the two cards carry different tags',
   T.tagOf(T.slots[0].cards[0]) === 'winter_rain' &&
   T.tagOf(T.slots[0].cards[1]) === 'winter_thunder');
T.slots[0].cards[0].url = 'blob:fake'; T.render();
ok('count badge rendered',
   T.cells[0].querySelector('.tile').innerHTML.includes('class="count"'));
ok('the tile draws one image, not a stack',
   (T.cells[0].querySelector('.tile').innerHTML.match(/<img/g) || []).length === 1);
T.slots[0].cards[0].url = ''; T.render();
ok('tile caption lists both',
   T.cells[0].querySelector('.cap').innerHTML.includes('winter_rain') &&
   T.cells[0].querySelector('.cap').innerHTML.includes('winter_thunder'));
T.$('addCard').onclick();
ok('a third card appears', T.slots[0].cards.length === 3);
T.slots[0].cards[2]._els.preview.__removeProbe = true;
T.buildCards();
T.$('cards').children[2].children[0].onclick({stopPropagation(){}});
ok('delete removes exactly one card', T.slots[0].cards.length === 2);
ok('delete kept the right ones',
   T.tagOf(T.slots[0].cards[0]) === 'winter_rain' &&
   T.tagOf(T.slots[0].cards[1]) === 'winter_thunder');
T.select(1);
ok('a lone card has no delete button',
   T.$('cards').children[0].children[0].tagName !== 'button',
   T.$('cards').children[0].children[0].tagName);

/* 5. default is global, not per slot */
console.log('\nvalidation');
T.select(0);
set(0, 0, 'isDefault', true);
T.select(2);
set(2, 0, 'isDefault', true);
ok('only one default across all slots',
   T.everyCard().filter(x => x.card.isDefault).length === 1);
ok('the newest one won', T.slots[2].cards[0].isDefault === true);
ok('the old one was cleared', T.slots[0].cards[0].isDefault === false);

/* fill everything in, then check the guards. Season cycles faster than weather
   so every card lands on a distinct season_weather pair. */
const SEA = ['spring','summer','fall','winter'], WEA = ['sunny','rain','thunder'];
T.everyCard().forEach(({card}, i) => {
  card.name = `p${i}.png`; card.url = 'data:image/png;base64,AAAA'; card.img = {};
  if (!card.isDefault){
    card.season = SEA[i % 4];
    card.weather = WEA[Math.floor(i / 4) % 3];
    card.kind = ''; card.value = '';
  }
});
T.render();
ok('a complete board passes', T.validate().length === 0,
   JSON.stringify(T.validate()));
const dup = T.slots[3].cards[0], keep = {...dup};
dup.season = T.slots[4].cards[0].season;
dup.weather = T.slots[4].cards[0].weather;
ok('duplicate tags caught across slots',
   T.validate().some(p => p.includes('duplicate')));
dup.season = keep.season; dup.weather = keep.weather;
T.slots[2].cards[0].isDefault = false;
ok('a board with no default is rejected',
   T.validate().some(p => p.includes('default')));
T.slots[2].cards[0].isDefault = true;
T.render();
ok('back to valid', T.validate().length === 0);

/* non-PNG files are rejected out loud, but do not block export */
T.acceptFiles([{name:'photo.jpg'}, {name:'notes.txt'}]);
ok('non-PNG reported', T.$('status').innerHTML.includes('PNG only'),
   JSON.stringify(T.$('status').innerHTML));
ok('non-PNG does not block export', T.$('export').disabled === false);
T.acceptFiles([]);
ok('notice clears on the next drop',
   !T.$('status').innerHTML.includes('PNG only'));

/* each problem is its own line, so a long list stays scannable */
const wasDefault = T.slots[2].cards[0].isDefault;
T.slots[2].cards[0].isDefault = false;
T.slots[1].cards[0].url = '';
T.render();
// Un-defaulting a card also strips its trigger, so this raises three problems:
// missing image, invalid trigger, and no default anywhere.
ok('problems are one per line',
   (T.$('status').innerHTML.match(/class="line bad"/g) || []).length === 3,
   JSON.stringify(T.$('status').innerHTML));
T.slots[2].cards[0].isDefault = wasDefault;
T.slots[1].cards[0].url = 'data:image/png;base64,AAAA';
T.render();
ok('the ready line is a single line',
   (T.$('status').innerHTML.match(/class="line ok"/g) || []).length === 1);

/* the flip toggle is display-only */
T.$('flip').checked = true; T.$('flip').onchange();
ok('flip preview sets the class', T.$('wrap').classList.contains('flipped'));
T.$('flip').checked = false; T.$('flip').onchange();
ok('flip preview clears the class', !T.$('wrap').classList.contains('flipped'));

/* 6. pixel pipeline — a synthetic 4x upscale of a 6x8 image */
console.log('\npipeline');
const N = 4, NW = 6, NH = 8;
srcData = {width:NW*N, height:NH*N, data:new Uint8ClampedArray(NW*N*NH*N*4)};
for (let y = 0; y < NH*N; y++) for (let x = 0; x < NW*N; x++){
  const i = (y*NW*N + x)*4, bx = (x/N)|0, by = (y/N)|0;
  srcData.data[i] = bx*40; srcData.data[i+1] = by*30; srcData.data[i+2] = 7;
  srcData.data[i+3] = (bx === 0) ? 0 : 255;          // left column transparent
}
const fakeImg = {naturalWidth:srcData.width, naturalHeight:srcData.height};
const r = T.processImage(fakeImg);
ok('detected 4x upscale', r.scale === N, `got ${r.scale}`);
ok('output is 6x180', r.w === NW && r.h === 180, `got ${r.w}x${r.h}`);
ok('transparency detected', r.opaque === false);
const out = lastPutImageData;
const px = (x,y) => { const i = (y*NW + x)*4; return [...out.data.slice(i,i+4)]; };
ok('top row is padding', px(0,0)[3] === 0 && px(3,171)[3] === 0);
ok('character sits flush to the bottom', px(1,179)[1] === (NH-1)*30);
ok('mirrored: transparent column moved to the right',
   px(NW-1,179)[3] === 0 && px(0,179)[3] === 255);
ok('mirrored: leftmost pixel is the old rightmost',
   px(0,172)[0] === (NW-1)*40, `got ${px(0,172)[0]}`);

// The preview toggle must not reach the build path - if it did, turning it on
// would double-mirror the export and every portrait would face the wrong way.
T.$('flip').checked = true; T.$('flip').onchange();
const flipped = (T.processImage(fakeImg), lastPutImageData);
ok('export ignores the preview flip toggle',
   flipped.data.every((v,i) => v === out.data[i]));
T.$('flip').checked = false; T.$('flip').onchange();

/* 7. the export mapping — two tags, one slot */
console.log('\nexport mapping');
T.everyCard().forEach(({card}) => { card.img = fakeImg; });
const {files} = await T.buildFiles();
const sidecar = JSON.parse(new TextDecoder().decode(
  files.find(f => f.name.endsWith('outfit_slots.json')).data));
ok('a sprite pair per portrait',
   files.filter(f => f.name.endsWith('.png')).length === T.everyCard().length &&
   files.filter(f => f.name.endsWith('.meta.toml')).length === T.everyCard().length);
ok('manifest included', files.some(f => f.name.endsWith('manifest.json')));
ok('every tag is in the sidecar',
   Object.keys(sidecar.slots).length === T.everyCard().length,
   JSON.stringify(sidecar.slots));
ok('slot 0\'s two portraits both point at slot 0',
   sidecar.slots[T.tagOf(T.slots[0].cards[0])] === 0 &&
   sidecar.slots[T.tagOf(T.slots[0].cards[1])] === 0,
   JSON.stringify(sidecar.slots));
ok('indices are 0-based and within range',
   Object.values(sidecar.slots).every(v => v >= 0 && v < 8));
// One folder, already named the way it has to land. Anything else in the zip is
// another thing the user has to understand.
ok('the export is exactly one correctly-named mod folder',
   files.every(f => f.name.startsWith(T.MOD_DIR + '/')),
   files.filter(f => !f.name.startsWith(T.MOD_DIR + '/')).map(f => f.name).join(','));
ok('no installer script ships', !files.some(f => /\.bat$/i.test(f.name)));

/* the generated slot table, which rides along with the artwork it describes */
const table = new TextDecoder().decode(
  files.find(f => f.name.endsWith('FarmerPortraitsSlots.gml')).data);
ok('the table ships inside the sprite mod',
   files.some(f => f.name === `${T.MOD_DIR}/gml/FarmerPortraitsSlots.gml`));
ok('every tag is baked into the table',
   Object.keys(sidecar.slots).every(t => table.includes(`_m[$ "${t}"] =`)),
   Object.keys(sidecar.slots).filter(t => !table.includes(`_m[$ "${t}"] =`)).join(','));
ok('shared slots appear once per tag, not once per slot',
   (table.match(/_m\[\$ "/g) || []).length === Object.keys(sidecar.slots).length);
ok('the table publishes the global the outfit mod reads',
   table.includes('global.__sage_fps_table = __sage_fps_slot_table();'));
ok('table braces balance',
   (table.match(/\{/g) || []).length === (table.match(/\}/g) || []).length);

/* the outfit mod, which ships fixed beside the tool rather than generated */
const SYNC = new URL('./FarmerPortraitsSync/gml/FarmerPortraitsSync.gml',
                     import.meta.url);
ok('the outfit mod ships as a real folder, not a build artifact',
   fs.existsSync(SYNC) &&
   fs.existsSync(new URL('./FarmerPortraitsSync/manifest.json', import.meta.url)));
const gml = fs.readFileSync(SYNC, 'utf8');
ok('it reads the generated table instead of carrying one',
   gml.includes('global[$ "__sage_fps_table"]') && !gml.includes('_m[$ "'));
ok('it says so out loud when the table is missing',
   gml.includes('no portrait table found'));
ok('registers a tick and declares itself',
   gml.includes('mmapi_register(sage_fps_tick)') &&
   gml.includes('mmapi_mod_declare(SAGE_FPS_ID'));
// Two triggers, and both matter. The context edge is what makes the clothes
// change when you walk indoors rather than waiting for someone to talk to you;
// the textbox edge is what keeps them agreeing with the portrait once one is on
// screen. Between the two, manual preset cycling is left alone.
ok('re-dresses on a context change, not only in dialogue',
   gml.includes('__sage_fps_context_changed(_rt)') &&
   gml.includes('_rt.pending = true;'));
ok('re-dresses again when a conversation opens',
   gml.includes('ANCHOR.get_menu(Menu.Textbox)') &&
   gml.includes('__sage_fps_dialogue_started(_rt)'));
// The fingerprint has to cover every field the context struct reads, or a
// trigger silently stops firing. inout is derived from the location.
for (const probe of ['CALENDAR.season()', 'CALENDAR.day_type()', 'CALENDAR.day()',
                     'WEATHER[$ "weather"]', 'CURRENT_LOCATION_ID'])
  ok(`fingerprint covers ${probe}`, gml.includes(probe));
// Nineteen string concatenations per frame is the thing being avoided: the key
// walk lives in __sage_fps_apply, and the tick only reaches it once something
// actually changed.
const tickBody = gml.match(/function sage_fps_tick\(\)[\s\S]*?\n\}/)[0];
ok('the key walk is gated behind the fingerprint',
   tickBody.indexOf('if (!_rt.pending) return;') < tickBody.indexOf('__sage_fps_apply(_rt)')
   && !tickBody.includes('deulo_farmer_portraits_keys'));
ok('defers instead of dropping the change when the moment is unsafe',
   gml.includes('if (!__sage_fps_safe()) return;'));
ok('never swaps mid-cutscene, mid-sleep, or inside the wardrobe menu',
   gml.includes('MIST.is_running()') &&
   gml.includes('ARI[$ "end_of_day_status"] != undefined') &&
   gml.includes('ANCHOR.get_menu(Menu.Customization)'));
// A new farmer has ONE preset and presets can be deleted, so a mapped slot may
// not exist. Leaving the outfit alone is right; doing it silently is not.
ok('guards the preset count and no-ops when already correct',
   gml.includes('_slot >= _count') &&
   gml.includes('ARI.preset_index_selected == _slot'));
ok('reports a slot the player has not built yet',
   gml.includes('mmapi_log_warn(SAGE_FPS_ID') && gml.includes('_rt.warned'));
ok('walks the mod\'s own key list, not a private copy',
   gml.includes('deulo_farmer_portraits_keys(deulo_farmer_portraits_context())'));
ok('uses the game\'s own preset API',
   gml.includes('obj_ari.change_preset(_slot)') &&
   gml.includes('instance_exists(obj_ari)'));
ok('gml braces balance',
   (gml.match(/\{/g) || []).length === (gml.match(/\}/g) || []).length);

/* 8. zip — written out for a real zip reader to open */
console.log('\nzip');
ok('crc32 of "123456789" is 0xCBF43926',
   T.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926);
const blob = T.makeZip(files);
fs.writeFileSync(new URL('./test_zip.zip', import.meta.url),
  Buffer.from(await blob.arrayBuffer()));
ok('zip written', fs.statSync(new URL('./test_zip.zip', import.meta.url)).size > 0);

/* 9. persistence — half an hour of work must survive a reload */
console.log('\nsaved work');
ok('render saves', store.has(T.STORE));
const saved = JSON.parse(store.get(T.STORE));
ok('saved shape is versioned', saved.v === 1 && saved.slots.length === 8);
ok('triggers are saved',
   saved.slots[0].cards[0].season === T.slots[0].cards[0].season);
ok('the image is saved as a data url, not a blob url',
   saved.slots[0].cards[0].url.startsWith('data:'),
   saved.slots[0].cards[0].url.slice(0, 20));
// The whole point of storing native pixels: a Picrew original is tens of KB and
// eight of them would blow the ~5MB localStorage budget.
ok('a stacked slot saves every card',
   saved.slots[0].cards.length === T.slots[0].cards.length);

const before = JSON.stringify(T.slots.map(s => s.cards.map(c => c.season)));
T.slots[0].cards[0].season = 'spring';
T.slots[3].cards = [{...T.slots[3].cards[0]}];
T.restoreState();
ok('restore brings the board back',
   JSON.stringify(T.slots.map(s => s.cards.map(c => c.season))) === before);
ok('restored cards decode into images', T.everyCard().every(x => !!x.card.img));
ok('restore rejects a foreign payload', (() => {
  store.set(T.STORE, JSON.stringify({v:99, slots:[]}));
  const kept = T.slots[0].cards[0].season;
  T.restoreState();
  store.set(T.STORE, saved && JSON.stringify(saved));
  return T.slots[0].cards[0].season === kept;
})());
ok('restore survives junk', (() => {
  store.set(T.STORE, '{not json');
  T.restoreState();
  store.set(T.STORE, JSON.stringify(saved));
  return true;
})());

storageBroken = true;
T.render();
ok('a browser that refuses storage says so instead of failing quietly',
   T.$('status').innerHTML.includes('not being saved'));
storageBroken = false;
T.render();

/* 10. slot numbering advice — the fresh-farmer trap */
console.log('\npreset advice');
ok('needs as many presets as the highest slot used', T.presetsNeeded() === 8);
const stash = T.slots.map(s => s.cards);
T.slots.forEach((s, i) => { if (i > 0 && i < 7) s.cards = [Object.assign({}, s.cards[0],
  {season:'', weather:'', kind:'', value:'', isDefault:false})]; });
ok('a gap below the highest slot is called out',
   T.advisories().some(m => m.includes('unused')), JSON.stringify(T.advisories()));
T.slots.forEach((s, i) => { s.cards = stash[i]; });
T.render();
ok('no advice once the slots are contiguous', T.advisories().length === 0,
   JSON.stringify(T.advisories()));

/* 11. dead triggers — art that exports fine and can never be reached in game */
console.log('\ndead triggers');
const mkCard = o => Object.assign({name:'', url:'', img:null, isDefault:false,
  season:'', weather:'', kind:'', value:''}, o);
// One card per slot, empties left as they are so they drop out of the analysis.
const board = list => T.slots.forEach((s, i) => { s.cards = [mkCard(list[i] || {})]; });
const deadTags = () => [...T.shadowed().entries()].map(([c]) => T.tagOf(c));

board([{season:'winter'},
       {season:'winter', kind:'inout', value:'indoor'},
       {season:'winter', kind:'inout', value:'outdoor'}]);
ok('indoor + outdoor leave the plain season nothing',
   JSON.stringify(deadTags()) === '["winter"]', JSON.stringify(deadTags()));
ok('the covering tags are named, and only those',
   JSON.stringify(T.shadowed().get(T.slots[0].cards[0]).by.sort())
     === '["winter_indoor","winter_outdoor"]');
ok('it reads as a warning line, not a blocking problem',
   T.advisories().some(m => m.includes('never appears')) &&
   !T.validate().some(m => m.includes('never appears')));

board([{season:'winter'}, {season:'winter', kind:'inout', value:'indoor'}]);
ok('half a cover is not a cover', deadTags().length === 0, JSON.stringify(deadTags()));

board([{season:'winter'}, {season:'winter', weather:'rain'},
       {season:'winter', weather:'sunny'}, {season:'winter', weather:'thunder'},
       {season:'winter', weather:'special'}]);
ok('all four weathers do it too', JSON.stringify(deadTags()) === '["winter"]',
   JSON.stringify(deadTags()));

// season outranks location, so four seasons bury any location card under them.
board([{season:'spring'}, {season:'summer'}, {season:'fall'}, {season:'winter'},
       {kind:'location', value:'beach'}, {isDefault:true}]);
ok('a location under four seasons is unreachable',
   JSON.stringify(deadTags().sort()) === '["beach","default"]',
   JSON.stringify(deadTags()));

board([{kind:'location', value:'beach'}, {kind:'location', value:'farm'},
       {season:'winter', weather:'rain'}, {isDefault:true}]);
ok('an ordinary board reports nothing', deadTags().length === 0,
   JSON.stringify(deadTags()));
ok('naming a few of eighty locations covers nothing',
   T.covered({}, [{location:'beach'}, {location:'farm'}]) === false);

/* 12. spoiler options — names that give away story beats stay off until asked */
console.log('\nspoilers');
T.$('reset').onclick();
T.select(0);
const kinds = () => ctl(0,0).fKind.options.map(o => o.value);
const vals  = () => ctl(0,0).fValue.options.map(o => o.value).filter(Boolean);

const blank0 = () => ctl(0,0).fValue.options[0].label;

ok('the box is off to begin with', T.$('spoilers').checked !== true);
ok('cutscene is still offered as a condition', kinds().includes('cutscene'));
set(0, 0, 'fKind', 'cutscene');
ok('but it has nothing in it', vals().length === 0);
ok('and the blank row says why',
   blank0() === 'enable spoiler options to see', blank0());
set(0, 0, 'fKind', 'location');
ok('a partly filtered list counts what is missing instead',
   blank0() === `select... (${T.SPOILER_LOCATIONS.size} more with spoilers)`,
   blank0());
ok('everyday locations are there', vals().includes('farm') && vals().includes('town'));
ok('late-game and secret ones are not',
   !vals().includes('aldaria') && !vals().includes('void_seal')
   && !vals().includes('beach_secret'));
ok('and that is the whole difference',
   vals().length === T.LOCATIONS.length - T.SPOILER_LOCATIONS.size,
   `${vals().length} of ${T.LOCATIONS.length}`);

T.$('spoilers').checked = true;
T.$('spoilers').onchange();
ok('ticking it adds the locations back', vals().length === T.LOCATIONS.length);
ok('and the hint goes back to plain', blank0() === 'select...', blank0());
ok('and offers cutscenes', kinds().includes('cutscene'));
set(0, 0, 'fKind', 'cutscene');
ok('all 187 of them', vals().length === T.CUTSCENES.length,
   `${vals().length} of ${T.CUTSCENES.length}`);

// The one that would quietly break a build: unticking must not drop a trigger
// somebody already made, so the card's own value survives the filter.
set(0, 0, 'fValue', 'unlocking_the_mines_pt_1');
T.$('spoilers').checked = false;
T.$('spoilers').onchange();
ok('a spoiler trigger already built still holds',
   T.tagOf(T.slots[0].cards[0]) === 'unlocking_the_mines_pt_1' &&
   T.statusOf(T.slots[0].cards[0]).state === 'ok');
ok('its card keeps offering the kind and the value',
   kinds().includes('cutscene') && vals().includes('unlocking_the_mines_pt_1'));
ok('and does not nag about the rest once one is chosen',
   blank0() === `select... (${T.CUTSCENES.length - 1} more with spoilers)`,
   blank0());
ok('but nothing else spoilery comes back',
   T.valuesFor('cutscene', 'unlocking_the_mines_pt_1').length === 1);
ok('the lists themselves are never filtered',
   T.CUTSCENES.length === 187 && T.LOCATIONS.length === 78);

T.$('spoilers').checked = true; T.$('spoilers').onchange();
T.render();
T.restoreState();
ok('the choice survives a reload', T.$('spoilers').checked === true);

/* start over has to actually empty the board, or saved work is a trap */
T.$('reset').onclick();
ok('reset empties every slot',
   T.everyCard().length === 8 && T.everyCard().every(x => !x.card.url));
ok('reset clears the saved copy too', !store.has(T.STORE) ||
   JSON.parse(store.get(T.STORE)).slots.every(s => s.cards.every(c => !c.url)));

console.log(fails ? `\n${fails} FAILED\n` : '\nall passed\n');
process.exit(fails ? 1 : 0);
