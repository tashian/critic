/** Generate one voiceover clip per scene with gpt-audio via OpenRouter. Writes public/vo/<id>.wav and src/vo.json. */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pcmToWav, streamAudio } from "./openrouter";
import { NARRATION } from "../src/narration";

const ROOT = join(import.meta.dir, "..");
const VOICE = process.env.VOICE ?? "ash";
mkdirSync(join(ROOT, "public", "vo"), { recursive: true });

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
function overlap(a: string, b: string) {
  const wa = norm(a), wb = new Set(norm(b));
  return wa.filter((w) => wb.has(w)).length / Math.max(1, wa.length);
}

const durations: Record<string, number> = {};
const only = process.argv.slice(2);
for (const { id, text } of NARRATION) {
  const file = join(ROOT, "public", "vo", `${id}.wav`);
  if (existsSync(file) && !only.includes(id)) {
    durations[id] = (Bun.file(file).size - 44) / 48000;
    continue;
  }
  for (let attempt = 1; ; attempt++) {
    const { audio, transcript } = await streamAudio({
      model: "openai/gpt-audio",
      modalities: ["text", "audio"],
      audio: { voice: VOICE, format: "pcm16" },
      messages: [
        {
          role: "system",
          content:
            "You are a text-to-speech engine for a product demo voiceover. You only ever speak the exact text inside <read> tags, word for word, then stop. Never reply, comment, or add words. Delivery: warm, confident, unhurried, like a polished product launch video. Natural pauses at commas and periods.",
        },
        { role: "user", content: `<read>${text}</read>` },
      ],
    });
    const score = overlap(text, transcript);
    console.log(`${id} try ${attempt}: ${(audio.length / 48000).toFixed(1)}s, match ${score.toFixed(2)} :: ${transcript.slice(0, 80)}`);
    if (score >= 0.9 && overlap(transcript, text) >= 0.85) {
      await Bun.write(file, pcmToWav(audio));
      durations[id] = audio.length / 48000;
      break;
    }
    if (attempt >= 4) throw new Error(`Could not get a clean read for ${id}`);
  }
}
await Bun.write(join(ROOT, "src", "vo.json"), JSON.stringify(durations, null, 1));
console.log(durations);
