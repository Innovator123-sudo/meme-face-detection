/* Parity test: the browser tagger (onlineClient.js) must classify exactly like
   the server tagger (memeIndex.js). No network — pure logic.
   Usage: node scripts/test-online-client.mjs (exit non-zero on failure) */
import { classifyMeme as clientClassify, shapeOnline } from '../src/lib/onlineClient.js';
import { classifyMeme as serverClassify } from '../memeIndex.js';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`);
  else { failures++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const titles = [
  'Drake laughing meme compilation',
  'crying baby sad shayari status',
  'gussa angry man shouting fight',
  'OMG shocked reaction what is this',
  'horror bhoot scare waiting alone',
  'chi chi bakwas wahiyat scene',
  'movie dialogue scene interview entry',
  'hasna rona laugh cry mix',
  'dance party masti vibing song',
  'nepali meme nepal funny',
  'mr bean template reaction',
  'troll face green screen template',
  'dil tuta bewafa dhoka sad story',
  'yeh kya hai arre bhai',
  'khush khushi celebration enjoy',
  'random xyz qwerty',
  '',
];

let mismatches = 0;
for (const t of titles) {
  const a = JSON.stringify(serverClassify(t));
  const b = JSON.stringify(clientClassify(t));
  if (a !== b) {
    mismatches++;
    console.log(`MISMATCH ${JSON.stringify(t)}\n  server: ${a}\n  client: ${b}`);
  }
}
check('client tagger matches server tagger', mismatches === 0, `${titles.length} titles, ${mismatches} mismatches`);

// shapeOnline contract: the fields rankMemes + the UI rely on.
{
  const m = shapeOnline({ title: 'Laughing dance party', url: 'https://i.imgflip.com/abc.jpg', media: 'image', pack: 'classics' });
  const keys = ['id', 'file', 'title', 'url', 'emotion', 'secondary', 'emotionScores', 'actor', 'tags', 'energy', 'size', 'media', 'source'];
  check('shaped meme has all fields', keys.every((k) => k in m), keys.filter((k) => !(k in m)).join(',') || 'all present');
  check('imgflip classic reads happy', m.emotion === 'happy', `got ${m.emotion}`);
  check('shaped meme tagged online+classics', m.tags.includes('online') && m.tags.includes('classics'), m.tags.join(','));
  check('shaped meme source online', m.source === 'online' && m.media === 'image');
}

if (failures) { console.log(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log('\nAll online-client checks passed.');
