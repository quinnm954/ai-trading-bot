import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const key = process.env.LOVABLE_API_KEY;
if (!key) throw new Error('LOVABLE_API_KEY not set');

const outDir = new URL('../public/voiceover', import.meta.url).pathname;
const manifestPath = new URL('../public/audio-manifest.json', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const main = [
  { id: 'vo-01', text: 'Crypto never sleeps. You do.' },
  { id: 'vo-02', text: 'Missed entries. Emotional exits. Fees eating the rest.' },
  { id: 'vo-03', text: 'TitanAI is one system, run by five AI agents.' },
  { id: 'vo-04', text: 'The watcher reads live prices. The analyst ranks every setup.' },
  { id: 'vo-05', text: 'The risk manager enforces the limits you set, and can veto any trade.' },
  { id: 'vo-06', text: 'Nothing executes unless it clears one point six to one, net of fees.' },
  { id: 'vo-07', text: 'It runs on our servers. Laptop closed.' },
  { id: 'vo-08', text: 'Manual and emotional, or automated and disciplined.' },
  { id: 'vo-09', text: 'TitanAI. Set it, and forget it.' },
  { id: 'vo-10', text: 'Start free in paper mode.' },
];

const ads = [
  { id: 'ad-01', text: 'Crypto never sleeps. You do.' },
  { id: 'ad-02', text: 'TitanAI trades for you. Five AI agents, your risk limits, running server side.' },
  { id: 'ad-03', text: 'Nothing executes unless it clears one point six to one, net of fees.' },
  { id: 'ad-04', text: 'Start free in paper mode.' },
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
        response_format: 'mp3',
        speed: 1.15,
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
