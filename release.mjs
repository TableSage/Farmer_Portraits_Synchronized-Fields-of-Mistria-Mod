// Release tooling. Node builtins only, no dependencies, same as test_tool.mjs.
//
//   node release.mjs status
//   node release.mjs check
//   node release.mjs build
//   node release.mjs github            (safe: GitHub is the place to be wrong)
//   node release.mjs page              (copies the BBCode, opens the editor)
//   node release.mjs nexus             (dry run, prints every call it would make)
//   node release.mjs nexus --go        (the only command that changes Nexus)
//
// THE ORDER MATTERS AND IT IS THE WHOLE POINT. Ship to GitHub, install the zip,
// play the game, fix what broke, ship to GitHub again. Nexus is last and takes
// explicit approval, because a bad Nexus file is downloaded by strangers and a
// bad GitHub release is seen by nobody. `nexus --go` is the one door, it needs
// --tested-in-game as well, and it asks you to type the version by hand. If you
// find yourself adding a way to skip that, you are removing the feature.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(read('release.config.json'));

// What goes in the download, and where it lands once unzipped. Deliberately a
// list rather than a glob: NOTES.md and the PRD sit in this folder and must
// never ship, and a glob with exclusions gets that wrong eventually.
const PAYLOAD = [
  'FarmerPortraitsSync/gml/FarmerPortraitsSync.gml',
  'FarmerPortraitsSync/manifest.json',
  'LICENSE',
  'portrait_tool.html',
  'README.txt',
];

function needModId(){
  if (!CONFIG.mod_id)
    die('release.config.json has no mod_id. It is the number in your own mod\'s\n'
      + `  URL: https://www.nexusmods.com/${CONFIG.game_domain}/mods/<this>`);
}

function read(rel){ return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel){ return fs.existsSync(path.join(ROOT, rel)); }
function die(msg){ console.error(`\n  ${msg}\n`); process.exit(1); }
function say(msg){ console.log(msg); }

function run(cmd, args, opts = {}){
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
}

// ---------------------------------------------------------------- versions

// The version lives in three places and they drift silently: manifest.json is
// what MOMI reads, the GML string is what the in-game log prints, and the git
// tag is what everything else keys off. 1.2.0 sat in the first two for four
// days while releases went out as 1.1.x, and nothing noticed. test_tool.mjs
// pins the first two against each other; this pins all three.
function versions(){
  const manifest = JSON.parse(read('FarmerPortraitsSync/manifest.json')).version;
  const gml = (read('FarmerPortraitsSync/gml/FarmerPortraitsSync.gml')
    .match(/mmapi_mod_declare\([^,]+,\s*"([^"]+)"/) || [])[1];
  return { manifest, gml };
}

function agreedVersion(){
  const { manifest, gml } = versions();
  if (manifest !== gml)
    die(`version disagreement: manifest.json says ${manifest}, `
      + `FarmerPortraitsSync.gml says ${gml}. Fix both, then re-run.`);
  if (!manifest) die('no version found in manifest.json');
  if (!/^[a-zA-Z0-9.-]+$/.test(manifest))
    die(`Nexus will not accept the version "${manifest}": letters, digits, `
      + 'dots and hyphens only.');
  return manifest;
}

const zipName = v => `Farmer_Portraits_Synchronized_v${v}.zip`;

// ---------------------------------------------------------------- the zip

// A ZIP writer in sixty lines beats a dependency for five files. Deflate-raw
// plus the local header, central directory and end record, which is all a ZIP
// is. Mod managers and Explorer both read it; the existing v1.1.2 download was
// built this way.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf){
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d){
  return [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
          (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF];
}

function buildZip(outPath, entries){
  const locals = [], central = [];
  let offset = 0;

  for (const { name, data, mtime } of entries){
    const nameBuf = Buffer.from(name, 'utf8');
    const body = zlib.deflateRawSync(data, { level: 9 });
    const [time, date] = dosTime(mtime);
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 names
    local.writeUInt16LE(8, 8);             // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014B50, 0);
    dir.writeUInt16LE(20, 4);              // version made by
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(outPath, Buffer.concat([...locals, dirBuf, end]));
}

function build(version){
  const missing = PAYLOAD.filter(p => !exists(p));
  if (missing.length) die(`missing from the payload: ${missing.join(', ')}`);

  const entries = PAYLOAD.map(rel => {
    const full = path.join(ROOT, rel);
    return {
      name: `${CONFIG.zip_folder}/${rel}`,
      data: fs.readFileSync(full),
      mtime: fs.statSync(full).mtime,
    };
  });

  const out = path.join(ROOT, zipName(version));
  buildZip(out, entries);
  const size = fs.statSync(out).size;
  say(`  built ${zipName(version)}  (${size} bytes, ${entries.length} files)`);
  for (const e of entries) say(`    ${e.name}`);
  return out;
}

// ---------------------------------------------------------------- checks

function check(version){
  const problems = [];

  const dirty = run('git', ['status', '--porcelain']);
  if (dirty) problems.push(`working tree is not clean:\n${dirty.split('\n').map(l => '      ' + l).join('\n')}`);

  const ahead = run('git', ['log', '--oneline', '@{u}..HEAD']);
  if (ahead) problems.push(`not pushed:\n${ahead.split('\n').map(l => '      ' + l).join('\n')}`);

  try {
    run('node', ['test_tool.mjs'], { stdio: 'pipe' });
  } catch {
    problems.push('test_tool.mjs failed - run `node test_tool.mjs` and read it');
  }

  // Sage's rule: nothing a player reads may look machine-written, and the em
  // dash is the tell people actually look for. NOTES.md and the PRD are exempt,
  // nobody outside reads them.
  const publicFiles = ['README.md', 'README.txt', 'NEXUS_page.bbcode'];
  for (const f of publicFiles){
    if (!exists(f)) continue;
    const n = (read(f).match(/—/g) || []).length;
    if (n) problems.push(`${f} has ${n} em dash${n > 1 ? 'es' : ''}`);
  }

  if (problems.length){
    say(`\n  not ready to release ${version}:\n`);
    for (const p of problems) say(`    - ${p}`);
    say('');
    return false;
  }
  say(`  ${version} looks releasable: tree clean, pushed, tests pass, no em dashes`);
  return true;
}

// ---------------------------------------------------------------- GitHub

function gh(args, opts){ return run('gh', args, opts); }

function github(version){
  const tag = `v${version}`;
  const zip = build(version);

  let notesFile = path.join(ROOT, `RELEASE_NOTES_${version}.md`);
  const haveNotes = fs.existsSync(notesFile);

  let live = null;
  try { live = gh(['release', 'view', tag, '--json', 'body,isDraft,isPrerelease']); } catch {}

  if (live){
    say(`  ${tag} already exists, updating it`);
    // Release notes get edited on github.com, the same way the Nexus page does,
    // and pushing the local file over a hand edit loses it with no warning and
    // no undo. So say so and leave it: the live body is the one people read.
    if (haveNotes){
      const body = JSON.parse(live).body.replace(/\r\n/g, '\n').trim();
      if (body !== fs.readFileSync(notesFile, 'utf8').replace(/\r\n/g, '\n').trim()){
        if (!has('--overwrite-notes')){
          say(`  the live notes differ from RELEASE_NOTES_${version}.md, leaving them alone.`);
          say('    `gh release view ' + tag + ' --json body --jq .body` to see the live text,');
          say('    --overwrite-notes to push the local file over it.');
        } else {
          gh(['release', 'edit', tag, '--notes-file', notesFile]);
        }
      }
    }
    gh(['release', 'upload', tag, zip, '--clobber']);
  } else {
    if (!haveNotes)
      die(`no RELEASE_NOTES_${version}.md. Write the notes first: they are the `
        + 'changelog, and Nexus reads them back out of here.');
    say(`  creating ${tag}`);
    gh(['release', 'create', tag, zip,
        '--title', `${tag}: ${firstHeading(read(`RELEASE_NOTES_${version}.md`))}`,
        '--notes-file', notesFile, '--prerelease']);
  }
  say(`  ${gh(['release', 'view', tag, '--json', 'url', '--jq', '.url'])}`);
}

function firstHeading(md){
  const m = md.match(/^##\s+(.+)$/m);
  return m ? m[1] : 'release';
}

function releaseNotes(version){
  const local = path.join(ROOT, `RELEASE_NOTES_${version}.md`);
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  try { return gh(['release', 'view', `v${version}`, '--json', 'body', '--jq', '.body']); }
  catch { return null; }
}

// ---------------------------------------------------------------- the page

// There is no endpoint for this. The v3 API can edit a *collection's*
// description (PATCH /collections/{id}) and nothing else: the mod paths are
// getMod, getModFiles, the changelog append, and the file/upload endpoints.
// So the page stays hand-pasted, which is how Sage already works. All this does
// is put the text on the clipboard and open the right tab.
function page(){
  needModId();
  if (!exists('NEXUS_page.bbcode')) die('no NEXUS_page.bbcode');
  const text = read('NEXUS_page.bbcode');

  const dashes = (text.match(/—/g) || []).length;
  if (dashes) die(`NEXUS_page.bbcode has ${dashes} em dashes. Fix them first.`);

  try {
    execFileSync('clip', [], { input: text });
    say(`  ${text.length} characters of BBCode on the clipboard`);
  } catch {
    say('  could not reach `clip`, copy NEXUS_page.bbcode by hand');
  }

  const url = `https://www.nexusmods.com/${CONFIG.game_domain}/mods/edit/?id=${CONFIG.mod_id}&game_id=${CONFIG.game_id || ''}`;
  say(`  paste it into the description box at:\n    ${url}`);
  say('  then paste what you SAVED back into NEXUS_page.bbcode, because Nexus');
  say('  rewrites some markup and this file is a copy of the page, not its source');
}

// ---------------------------------------------------------------- Nexus

const API = 'https://api.nexusmods.com/v3';

async function api(method, endpoint, { body, key } = {}){
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      apikey: key,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok)
    die(`${method} ${endpoint} returned ${res.status}\n    ${text.slice(0, 600)}`);
  return text ? JSON.parse(text).data : null;
}

function ask(question){
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a.trim()); }));
}

async function nexus(version, { go, tested }){
  needModId();
  const zip = path.join(ROOT, zipName(version));
  if (!fs.existsSync(zip)) die(`no ${zipName(version)}. Run \`node release.mjs build\` first.`);
  const size = fs.statSync(zip).size;
  if (size > 100 * 1024 * 1024)
    die('over 100 MiB, which needs the multipart upload flow this script does not implement');

  const notes = releaseNotes(version);
  const key = process.env.NEXUS_API_KEY;

  say(`\n  Nexus plan for ${version}\n`);
  say(`    mod          ${CONFIG.game_domain}/mods/${CONFIG.mod_id}`);
  say(`    file         ${CONFIG.file_name}  (category: ${CONFIG.file_category})`);
  say(`    upload       ${zipName(version)}, ${size} bytes`);
  say(`    sha256       ${crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex').slice(0, 16)}`);
  say(`    mod version  ${CONFIG.update_mod_version ? 'will be set to ' + version : 'left alone'}`);
  say(`    changelog    ${notes ? `${notes.length} chars from the GitHub notes` : 'none found, skipping'}`);
  say('');
  say('    POST /uploads  ->  PUT presigned_url  ->  POST /uploads/{id}/finalise');
  say(`    then a new version of the existing mod file, or a new mod file if none matches`);
  if (notes) say('    then POST /mods/{id}/changelogs  (APPEND ONLY - a re-run duplicates it)');
  say('');
  say('    the description page is NOT touched. There is no API for it.');
  say('    run `node release.mjs page` for that.');

  if (!go){
    say('\n  dry run. Nothing was sent. Add --go when the build is tested in game.\n');
    return;
  }

  // Three gates, on purpose. The flag is a decision, the key is access, and the
  // typed version is the one that catches releasing the wrong build - which is
  // the actual failure mode, not a stray keypress.
  if (!tested)
    die('--go needs --tested-in-game as well. Install the zip, load a save, and\n'
      + '  look at a portrait first. That is the whole reason GitHub goes first.');
  if (!key)
    die('NEXUS_API_KEY is not set. Get one from https://www.nexusmods.com/settings/api-keys');

  const typed = await ask(`  type ${version} to publish it to Nexus: `);
  if (typed !== version) die('no match, nothing sent');

  say('\n  creating the upload session');
  const upload = await api('POST', '/uploads', {
    key, body: { size_bytes: size, filename: zipName(version) },
  });

  say('  uploading');
  const put = await fetch(upload.presigned_url, {
    method: 'PUT',
    headers: { 'content-disposition': `attachment; filename="${zipName(version)}"` },
    body: fs.readFileSync(zip),
  });
  if (!put.ok) die(`the presigned PUT returned ${put.status}: ${await put.text()}`);

  say('  finalising');
  await api('POST', `/uploads/${upload.id}/finalise`, { key });

  for (let i = 0; i < 30; i++){
    const state = (await api('GET', `/uploads/${upload.id}`, { key })).state;
    if (state === 'available') break;
    if (i === 29) die(`upload stuck in state "${state}"`);
    await new Promise(r => setTimeout(r, 2000));
  }

  const mod = await api('GET', `/games/${CONFIG.game_domain}/mods/${CONFIG.mod_id}`, { key });
  const files = (await api('GET', `/mods/${mod.id}/files`, { key })).mod_files;
  const target = files.find(f => f.name === CONFIG.file_name);

  const shared = {
    upload_id: upload.id,
    name: CONFIG.file_name,
    version,
    file_category: CONFIG.file_category,
    update_mod_version: CONFIG.update_mod_version,
  };

  if (target){
    say(`  adding version ${version} to the existing file "${target.name}"`);
    await api('POST', `/mod-files/${target.id}/versions`, {
      key, body: { ...shared, archive_existing_file: CONFIG.archive_existing_file },
    });
  } else {
    say(`  creating a new mod file "${CONFIG.file_name}"`);
    await api('POST', '/mod-files', {
      key,
      body: { ...shared, mod_id: mod.id,
              primary_mod_manager_download: true,
              allow_mod_manager_download: true },
    });
  }

  if (notes){
    say('  appending the changelog');
    await api('POST', `/mods/${mod.id}/changelogs`, {
      key, body: { version, changelog: notes.slice(0, 65535) },
    });
  }

  say(`\n  ${version} is live: https://www.nexusmods.com/${CONFIG.game_domain}/mods/${CONFIG.mod_id}`);
  say('  the description page is unchanged. `node release.mjs page` if it needs to be.\n');
}

// ---------------------------------------------------------------- status

function status(){
  const { manifest, gml } = versions();
  say('');
  say(`  manifest.json          ${manifest}`);
  say(`  FarmerPortraitsSync    ${gml}${manifest === gml ? '' : '   <- disagrees'}`);

  const v = manifest;
  say(`  zip built              ${exists(zipName(v)) ? zipName(v) : 'no'}`);
  const notes = releaseNotes(v);
  say(`  release notes          ${exists(`RELEASE_NOTES_${v}.md`) ? `RELEASE_NOTES_${v}.md`
    : notes ? `${notes.length} chars, live on GitHub only` : 'not written'}`);

  let tags = '';
  try { tags = run('git', ['ls-remote', '--tags', 'origin', `v${v}`]); } catch {}
  say(`  git tag                ${tags ? `v${v} on origin` : 'not tagged'}`);

  try {
    const url = gh(['release', 'view', `v${v}`, '--json', 'url', '--jq', '.url']);
    say(`  GitHub release         ${url}`);
  } catch { say('  GitHub release         none'); }

  say(`  Nexus                  hand-checked. Nothing here reports it, on purpose:`);
  say(`                         a script saying "shipped" is not the same as you`);
  say(`                         having loaded a save and looked at a portrait.`);
  say('');
}

// ---------------------------------------------------------------- main

const [cmd, ...flags] = process.argv.slice(2);
const has = f => flags.includes(f);

switch (cmd){
  case 'status':  status(); break;
  case 'check':   process.exit(check(agreedVersion()) ? 0 : 1);
  case 'build':   build(agreedVersion()); break;
  case 'page':    page(); break;
  case 'github': {
    const v = agreedVersion();
    if (!check(v) && !has('--anyway')) die('fix the above, or --anyway if you mean it');
    github(v);
    break;
  }
  case 'nexus':
    await nexus(agreedVersion(), { go: has('--go'), tested: has('--tested-in-game') });
    break;
  default:
    say(read('release.mjs').split('\n').slice(0, 16).join('\n').replace(/^\/\/ ?/gm, ''));
}
