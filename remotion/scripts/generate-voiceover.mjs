import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const key = process.env.LOVABLE_API_KEY;
if (!key) throw new Error('LOVABLE_API_KEY not set');

const outDir = new URL('../public/voiceover', import.meta.url).pathname;
const manifestPath = new URL('../public/audio-manifest.json', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const scenes = [
  { id: 'scene-01', text: 'Nine out of ten retail traders lose money. Not to the market, to fees, emotion, and sloppy exits.' },
  { id: 'scene-02', text: 'Titan AI is a crypto trading system run by five specialist agents that talk to each other every thirty minutes.' },
  { id: 'scene-03', text: 'The Watcher reads live prices and classifies the market: trending, ranging, volatile, or dead.' },
  { id: 'scene-04', text: 'The Analyst ranks every setup, audits past trades, and scores conviction before a single dollar moves.' },
  { id: 'scene-05', text: 'The Risk Manager is the gatekeeper. Your position size, your leverage cap, your daily loss limit. It can veto any trade.' },
  { id: 'scene-06', text: 'The Trader executes only what clears one point six to one reward to risk, net of the zero point eight percent round-trip fee.' },
  { id: 'scene-07', text: 'And the Healer watches the system itself, learns from every error, and applies the fix automatically.' },
  { id: 'scene-08', text: 'It all runs on our servers. Hard stops at minus zero point eight percent, trailing exits, and a drawdown kill switch, whether your laptop is open or closed.' },
  { id: 'scene-09', text: 'Non-custodial. We never hold your funds. Your keys, your exchange, your capital.' },
  { id: 'scene-10', text: 'Start in paper mode with a hundred thousand dollars. Go live when you trust it. Twenty-nine dollars a month, cancel anytime.' },
];

const manifestScenes = [];

for (const scene of scenes) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: scene.text,
      voice: 'onyx',
      response_format: 'mp3',
      speed: 1.1,
    }),
  });
  if (!res.ok) {
    console.log('status', res.status);
    console.log(await res.text());
    throw new Error(`TTS failed for ${scene.id}`);
  }
  const buf = await res.arrayBuffer();
  const path = `${outDir}/${scene.id}.mp3`;
  writeFileSync(path, Buffer.from(buf));
  const dur = Number(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`).toString().trim()
  );
  manifestScenes.push({ id: scene.id, audio: `voiceover/${scene.id}.mp3`, durationSeconds: Number(dur.toFixed(3)) });
  console.log(`Wrote ${path} (${buf.byteLength} bytes, ${dur.toFixed(2)}s)`);
}

writeFileSync(
  manifestPath,
  JSON.stringify({ introSeconds: 0.6, outroSeconds: 1.6, gapSeconds: 0.45, scenes: manifestScenes }, null, 2)
);
console.log('Wrote manifest', manifestPath);
