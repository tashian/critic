/** Generate the background music bed with Lyria via OpenRouter. Writes public/music.<ext>. */
import { streamAudio } from "./openrouter";
import { join } from "node:path";

const PROMPT =
  "Instrumental only, no vocals. Exactly 2 minutes 10 seconds long. Calm, warm, modern ambient electronic background for a software product demo video. Soft analog synth pads, a gentle plucked arpeggio, light brushed percussion that enters after 10 seconds. 96 BPM. Optimistic but unobtrusive; it sits under a voiceover. A slow fade at the end.";
const { audio, text } = await streamAudio({
  model: process.env.MUSIC_MODEL ?? "google/lyria-3-pro-preview",
  modalities: ["audio", "text"],
  messages: [{ role: "user", content: PROMPT }],
});
const magic = audio.subarray(0, 4).toString("latin1");
const ext = magic === "RIFF" ? "wav" : magic.startsWith("ID3") || audio[0] === 0xff ? "mp3" : "bin";
const out = join(import.meta.dir, "..", "public", `music.${ext}`);
await Bun.write(out, audio);
console.log(`${out} ${audio.length} bytes. ${text.slice(0, 200)}`);
