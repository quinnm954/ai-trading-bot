import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.LOVABLE_API_KEY;
if (!key) throw new Error('LOVABLE_API_KEY not set');

const outDir = new URL('../public/voiceover', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const scenes = [
  { id: 'scene-01', text: 'Most traders lose money to fees and emotion.' },
  { id: 'scene-02', text: 'Titan AI runs five agents: watcher, analyst, risk, trader, healer.' },
  { id: 'scene-03', text: 'Every trade clears 1.6 to 1 reward-to-risk, net of fees. Hard stops. Kill switch. Non-custodial.' },
  { id: 'scene-04', text: 'It trades server-side. No app open, no babysitting.' },
  { id: 'scene-05', text: 'Full access. Twenty-nine dollars a month. Cancel anytime.' },
];

for (const scene of scenes) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: scene.text,
      voice: 'alloy',
      response_format: 'mp3',
      speed: 1.15,
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
  console.log(`Wrote ${path} (${buf.byteLength} bytes)`);
}
