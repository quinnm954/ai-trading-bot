import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });

process.env.REMOTION_CHROME_PATH = "/bin/chromium";
process.env.REMOTION_FFMPEG_PATH = "/bin/ffmpeg";
process.env.REMOTION_FFPROBE_PATH = "/bin/ffprobe";
process.env.REMOTION_LOG_LEVEL = "verbose";


const cmd = [
  "bunx",
  "remotion",
  "render",
  "src/index.ts",
  "TitanAIPromo",
  "out/titanai-promo.mp4",
  "--codec=h264",
  "--browser-executable=/bin/chromium",
  "--log=verbose",
].join(" ");


console.log("Rendering:", cmd);
execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
console.log("Done.", join(outDir, "titanai-promo.mp4"));
