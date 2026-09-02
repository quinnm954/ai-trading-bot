import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const key = process.env.LOVABLE_API_KEY;
if (!key) throw new Error('LOVABLE_API_KEY not set');

const outDir = new URL('../public/voiceover', import.meta.url).pathname;
const manifestPath = new URL('../public/audio-manifest.json', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const BASE_VOICE =
  'You are the narrator of a high-energy crypto trading app commercial. Male, mid-30s, ' +
  'confident and cinematic, like a premium tech ad. Never monotone: vary pitch and volume ' +
  'inside every sentence, land the emphasis on the key word, and let short sentences punch. ' +
  'Speak to one person, close to the mic.';

const main = [
  {
    id: 'vo-01',
    text: 'Crypto never sleeps. You do.',
    speed: 1.0,
    instructions:
      `${BASE_VOICE} Delivery: low, hushed, slightly ominous. Slow the first sentence down. ` +
      'Take a real beat of silence before "You do," then say it quietly, almost accusing.',
  },
  {
    id: 'vo-02',
    text: 'Missed entries. Emotional exits. Fees eating the rest.',
    speed: 1.18,
    instructions:
      `${BASE_VOICE} Delivery: clipped, tense, frustrated. Three hard jabs with a snap between ` +
      'each fragment, pitch dropping a little each time, like listing everything that goes wrong.',
  },
  {
    id: 'vo-03',
    text: 'TitanAI is one system, run by five AI agents.',
    speed: 1.1,
    instructions:
      `${BASE_VOICE} Delivery: the turn of the ad. Bright, warm, confident relief, energy lifting. ` +
      'Hit "TitanAI" strongly and lean into "five AI agents" with a small smile in the voice.',
  },
  {
    id: 'vo-04',
    text: 'The watcher reads live prices. The analyst ranks every setup.',
    speed: 1.15,
    instructions:
      `${BASE_VOICE} Delivery: brisk and impressed, building momentum. Punch "watcher" and ` +
      '"analyst" as if introducing teammates, rising slightly into the second sentence.',
  },
  {
    id: 'vo-05',
    text: 'The risk manager enforces the limits you set, and can veto any trade.',
    speed: 1.18,
    instructions:
      `${BASE_VOICE} Delivery: firm, protective, authoritative. Weight on "limits you set", ` +
      'then a short pause and drop into "veto any trade" with real finality.',
  },
  {
    id: 'vo-06',
    text: 'Nothing executes unless it clears one point six to one, net of fees.',
    speed: 1.16,
    instructions:
      `${BASE_VOICE} Delivery: precise and serious, like stating a hard rule. Slow down clearly ` +
      'on the numbers "one point six to one", then finish "net of fees" crisp and matter-of-fact.',
  },
  {
    id: 'vo-07',
    text: 'It runs on our servers. Laptop closed.',
    speed: 1.1,
    instructions:
      `${BASE_VOICE} Delivery: dry, easy, a little smug. Relaxed on the first sentence, then a ` +
      'beat and toss off "Laptop closed." like a mic drop.',
  },
  {
    id: 'vo-08',
    text: 'Manual and emotional, or automated and disciplined.',
    speed: 1.08,
    instructions:
      `${BASE_VOICE} Delivery: a clear contrast. First half heavier and slightly disdainful, ` +
      'pause on "or", second half cleaner, brighter and more assured.',
  },
  {
    id: 'vo-09',
    text: 'TitanAI. Set it, and forget it.',
    speed: 1.0,
    instructions:
      `${BASE_VOICE} Delivery: the brand moment. Say "TitanAI" big and proud, hold a beat, then ` +
      '"Set it, and forget it." with a rising, confident lift and a smile.',
  },
  {
    id: 'vo-10',
    text: 'Start free in paper mode.',
    speed: 1.05,
    instructions:
      `${BASE_VOICE} Delivery: bright, energetic call to action. Warm and inviting, upward on ` +
      '"free", finishing strong and clean, not rushed.',
  },
];

const ads = [
  {
    id: 'ad-01',
    text: 'Crypto never sleeps. You do.',
    speed: 1.0,
    instructions:
      `${BASE_VOICE} Delivery: low, hushed, slightly ominous, with a real beat before "You do."`,
  },
  {
    id: 'ad-02',
    text: 'TitanAI trades for you. Five AI agents, your risk limits, running server side.',
    speed: 1.12,
    instructions:
      `${BASE_VOICE} Delivery: confident and energetic, building through the list. Punch ` +
      '"trades for you", then step up on "five AI agents" and land "server side" firmly.',
  },
  {
    id: 'ad-03',
    text: 'Nothing executes unless it clears one point six to one, net of fees.',
    speed: 1.0,
    instructions:
      `${BASE_VOICE} Delivery: firm and precise, slowing on the numbers, ending matter-of-fact.`,
  },
  {
    id: 'ad-04',
    text: 'Start free in paper mode.',
    speed: 1.05,
    instructions:
      `${BASE_VOICE} Delivery: bright, upbeat call to action with a confident lift on "free".`,
  },
];


async function synth(list) {
  const out = [];
  for (const scene of list) {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini-tts',
        input: scene.text,
        voice: 'onyx',
        instructions: scene.instructions,
        response_format: 'mp3',
        speed: scene.speed ?? 1.1,
      }),
    });
    if (!res.ok) {
      console.log('status', res.status, await res.text());
      throw new Error(`TTS failed for ${scene.id}`);
    }
    const buf = await res.arrayBuffer();
    const path = `${outDir}/${scene.id}.mp3`;
    writeFileSync(path, Buffer.from(buf));
    const dur = Number(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`).toString().trim()
    );
    out.push({ id: scene.id, audio: `voiceover/${scene.id}.mp3`, text: scene.text, durationSeconds: Number(dur.toFixed(3)) });
    console.log(`${scene.id}: ${dur.toFixed(2)}s`);
  }
  return out;
}

const manifest = { main: await synth(main), ads: await synth(ads) };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Wrote', manifestPath);
