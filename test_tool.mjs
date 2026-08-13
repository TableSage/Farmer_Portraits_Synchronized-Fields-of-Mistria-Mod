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
      drawImage(){},
      getImageData(){ return srcData; },
      createImageData(w,h){
        return {width:w, height:h, data:new Uint8ClampedArray(w*h*4)};
      },
      putImageData(d){ lastPutImageData = d; self.__out = d; },
    };
  }
  toBlob(cb){ cb(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])])); }
}

const byId = new Map();
for (const id of ['grid','flip','export','status','afterExport','picker',
                  'slotHead','cards','addCard','wrap'])
  byId.set(id, new El('div'));

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
};
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};

/* ------------------------------------------------------------------ run */

const T = {};
new Function('__T', script + `
  Object.assign(__T, {makeZip, crc32, processImage, buildFiles, statusOf, tagOf,
    validate, everyCard, slots, cells, render, select, buildCards, acceptFiles,
    PATTERNS, TARGET_H, $});
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
const GML_PATHS = [
  '../SageMistriaMods/mods/Farmer Portraits/gml/FarmerPortraits.gml',
  'D:/Steam/steamapps/common/Fields of Mistria/mods/Farmer Portraits/gml/FarmerPortraits.gml',
];
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

const gmlPath = GML_PATHS
  .map(p => new URL(p, import.meta.url))
  .find(u => fs.existsSync(u));
if (!gmlPath){
  console.log('  SKIP  PATTERNS vs GML — FarmerPortraits.gml not found');
  console.log('        (checked: ' + GML_PATHS.join(', ') + ')');
  fails++;      // a silently skipped correctness check is not a pass
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
ok('stacked badge appears only with art',
   !T.cells[0].querySelector('.tile').classList.contains('stacked'));
T.slots[0].cards[0].url = 'blob:fake'; T.render();
ok('stacked class set once a stacked slot has art',
   T.cells[0].querySelector('.tile').classList.contains('stacked'));
ok('count badge rendered',
   T.cells[0].querySelector('.tile').innerHTML.includes('class="count"'));
ok('stack draws two sheets behind the front one',
   (T.cells[0].querySelector('.tile').innerHTML.match(/class="lyr/g) || []).length === 2
   && T.cells[0].querySelector('.tile').innerHTML.includes('class="sheet"'));
ok('the sheets paint before the image in DOM order',
   T.cells[0].querySelector('.tile').innerHTML.indexOf('lyr back')
   < T.cells[0].querySelector('.tile').innerHTML.indexOf('sheet'));
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
  card.file = {name:`p${i}.png`};
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
T.slots[1].cards[0].file = null;
T.render();
// Un-defaulting a card also strips its trigger, so this raises three problems:
// missing image, invalid trigger, and no default anywhere.
ok('problems are one per line',
   (T.$('status').innerHTML.match(/class="line bad"/g) || []).length === 3,
   JSON.stringify(T.$('status').innerHTML));
T.slots[2].cards[0].isDefault = wasDefault;
T.slots[1].cards[0].file = {name:'p1.png'};
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
ok('mod files are rooted at a mod folder',
   files.filter(f => f.name !== 'INSTALL.bat')
        .every(f => f.name.startsWith('FarmerPortraitsExample/')
                 || f.name.startsWith('FarmerPortraitsSync/')));

/* the companion outfit mod */
const gml = new TextDecoder().decode(
  files.find(f => f.name.endsWith('FarmerPortraitsSync.gml')).data);
ok('sync mod ships gml + manifest',
   files.some(f => f.name === 'FarmerPortraitsSync/manifest.json') && !!gml);
ok('every tag is baked into the gml table',
   Object.keys(sidecar.slots).every(t => gml.includes(`_m[$ "${t}"] =`)),
   Object.keys(sidecar.slots).filter(t => !gml.includes(`_m[$ "${t}"] =`)).join(','));
ok('shared slots appear once per tag, not once per slot',
   (gml.match(/_m\[\$ "/g) || []).length === Object.keys(sidecar.slots).length);
ok('registers a tick and declares itself',
   gml.includes('mmapi_register(sage_fps_tick)') &&
   gml.includes('mmapi_mod_declare(SAGE_FPS_ID'));
// The rising-edge rule is the whole contract: act when a textbox appears, and
// never between conversations, or the mod fights the player's own wardrobe edits.
ok('acts only on the rising edge of a textbox',
   gml.includes('ANCHOR.get_menu(Menu.Textbox)') &&
   gml.includes('if (_rt.menu == _menu) return;') &&
   gml.includes('_rt.menu = undefined;'));
ok('skips cutscenes', gml.includes('deulo_farmer_portraits_cutscene_name() != undefined'));
ok('guards the preset count and no-ops when already correct',
   gml.includes('_slot >= _count') &&
   gml.includes('ARI.preset_index_selected == _slot'));
ok('walks the mod\'s own key list, not a private copy',
   gml.includes('deulo_farmer_portraits_keys(deulo_farmer_portraits_context())'));
ok('uses the game\'s own preset API',
   gml.includes('obj_ari.change_preset(_slot)') &&
   gml.includes('instance_exists(obj_ari)'));
ok('gml braces balance',
   (gml.match(/\{/g) || []).length === (gml.match(/\}/g) || []).length);

/* the installer script */
const bat = new TextDecoder().decode(
  files.find(f => f.name === 'INSTALL.bat').data);
ok('installer sits beside the mod folder, not inside it',
   files.some(f => f.name === 'INSTALL.bat'));
ok('installer uses CRLF for cmd.exe',
   bat.includes('\r\n') && !/[^\r]\n/.test(bat));
ok('installer deletes only the sprite folder',
   (bat.match(/rmdir/g) || []).length === 1 &&
   bat.includes('rmdir /s /q "%LIB%\\%MOD%\\%ART%"'));
// MOMI owns the game directory. Writing there is reverted by its next install,
// so the installer must never mention it.
ok('installer targets the MOMI library, never the game folder',
   !bat.includes('FieldsOfMistria.exe') && !/steamapps/i.test(bat));
ok('installer validates the folder by the base mod',
   bat.includes('if not exist "%LIB%\\%BASE%\\manifest.json"'));
ok('installer confirms before deleting',
   bat.indexOf('set /p OK=') < bat.indexOf('rmdir'));
ok('installer checks its own payload is present',
   bat.includes('%~dp0%MOD%\\manifest.json'));
ok('every for-loop paren is balanced',
   (bat.match(/\(/g) || []).length === (bat.match(/\)/g) || []).length,
   `${(bat.match(/\(/g)||[]).length} open vs ${(bat.match(/\)/g)||[]).length} close`);

/* 8. zip — written out for a real zip reader to open */
console.log('\nzip');
ok('crc32 of "123456789" is 0xCBF43926',
   T.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926);
const blob = T.makeZip(files);
fs.writeFileSync(new URL('./test_zip.zip', import.meta.url),
  Buffer.from(await blob.arrayBuffer()));
ok('zip written', fs.statSync(new URL('./test_zip.zip', import.meta.url)).size > 0);

console.log(fails ? `\n${fails} FAILED\n` : '\nall passed\n');
process.exit(fails ? 1 : 0);
