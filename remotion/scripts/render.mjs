import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// usage: node scripts/render.mjs <compositionId> <outPath> [--still=frame]
const compId = process.argv[2] ?? "TitanAIReel";
const outPath = process.argv[3] ?? "/mnt/documents/titanai-reel.mp4";
const stillArg = process.argv.find((a) => a.startsWith("--still="));

const serveUrl = await bundle({
  entryPoint: path.resolve(root, "src/index.ts"),
  webpackOverride: (c) => c,
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({ serveUrl, id: compId, puppeteerInstance: browser });
console.log(`composition ${compId}: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(2)}s)`);

if (stillArg) {
  const frames = stillArg.split("=")[1].split(",").map(Number);
  for (const frame of frames) {
    const out = outPath.replace(/\.png$/, "") + `-${frame}.png`;
    await renderStill({ composition, serveUrl, output: out, frame, puppeteerInstance: browser });
    console.log("still", out);
  }
} else {
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 18,
    outputLocation: outPath,
    puppeteerInstance: browser,
    concurrency: 2,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 20 === 0) console.log(`${Math.round(progress * 100)}%`);
    },
  });
  console.log("rendered", outPath);
}

await browser.close({ silent: false });
