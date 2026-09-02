// Generates the tight 15s paid-ads voiceover + burned-in caption word timings.
// Each line has a hard budget (its beat length). If a take runs long we re-synth
// slightly faster until it fits, so the edit never drifts off the downbeats.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const key = process.env.LOVABLE_API_KEY;
if (!key) throw new Error('LOVABLE_API_KEY missing');

const outDir = path.resolve(__dirname, '../public/voiceover');
mkdirSync(outDir, { recursive: true });
const manifestPath = path.resolve(__dirname, '../public/audio-manifest.json');

const BASE_VOICE =
  'Voice: a confident male narrator for a premium fintech ad. Warm low-mid tone, ' +
  'crisp consonants, real dynamics — never flat or robotic. Vary pitch and pace ' +
  'between phrases, lean into the key words, and breathe naturally between sentences.';

// budget = seconds available inside the beat (leaves room for the cut)
const lines = [
  {
    id: 'a15-01',
    budget: 2.35,
    text: 'Crypto never sleeps. You do.',
    speed: 1.06,
    instructions: `${BASE_VOICE} Delivery: low, hushed, a little ominous, tiny beat before "You do."`,
  },
  {
    id: 'a15-02',
    budget: 4.3,
    text: 'Five AI agents trade for you, server side, all night.',
    speed: 1.1,
    instructions:
      `${BASE_VOICE} Delivery: it lifts — confident, energetic, building through the line. ` +
      'Punch "five AI agents", then land "all night" firmly.',
  },
  {
    id: 'a15-03',
    budget: 3.9,
    text: 'Every trade must clear one point six to one, net of fees.',
    speed: 1.08,
    instructions:
      `${BASE_VOICE} Delivery: firm, precise, almost clipped. Slow slightly on the numbers, ` +
      'end matter-of-fact, like a rule that is not up for debate.',
  },
  {
    id: 'a15-04',
    budget: 3.3,
    text: 'Start free. TitanAI Trader.',
    speed: 1.02,
    instructions:
      `${BASE_VOICE} Delivery: bright, warm, open — a genuine invitation. Confident lift on "free", ` +
      'then say the brand name proudly and clearly.',
  },
];

async function synthOnce(line, speed) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: line.text,
      voice: 'onyx',
      instructions: line.instructions,
      response_format: 'mp3',
      speed,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS failed for ${line.id}: ${res.status} ${body}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const p = `${outDir}/${line.id}.mp3`;
  writeFileSync(p, buf);
  const dur = Number(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${p}"`).toString().trim()
  );
  return dur;
}

// caption words with proportional timings (weighted by length so long words hold)
function words(text, duration) {
  const raw = text.split(/\s+/).filter(Boolean);
  const weights = raw.map((w) => Math.max(2, w.replace(/[^\w]/g, '').length) + (/[.,]$/.test(w) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0.06;
  const usable = Math.max(0.4, duration - 0.12);
  return raw.map((w, i) => {
    const d = (weights[i] / total) * usable;
    const item = { word: w, start: Number(cursor.toFixed(3)), end: Number((cursor + d).toFixed(3)) };
    cursor += d;
    return item;
  });
}

const clips = [];
for (const line of lines) {
  let speed = line.speed;
  let dur = await synthOnce(line, speed);
  let tries = 0;
  // a little bleed past the cut is fine (audio is continuous); only fix real overruns
  while (dur > line.budget + 0.3 && tries < 3 && speed < 1.2) {
    speed = Math.min(1.2, Number((speed * Math.min(1.12, dur / line.budget)).toFixed(3)));
    dur = await synthOnce(line, speed);
    tries += 1;
  }
  console.log(`${line.id}: ${dur.toFixed(2)}s (budget ${line.budget}s, speed ${speed})`);
  clips.push({
    id: line.id,
    audio: `voiceover/${line.id}.mp3`,
    text: line.text,
    durationSeconds: Number(dur.toFixed(3)),
    words: words(line.text, dur),
  });
}

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
manifest.ads15 = clips;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Wrote', manifestPath);
