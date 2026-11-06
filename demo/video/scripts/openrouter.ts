/** Streaming audio output from OpenRouter chat completions (gpt-audio, Lyria). Needs OPENROUTER_API_KEY. */
export async function streamAudio(body: Record<string, unknown>): Promise<{ audio: Buffer; transcript: string; text: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const dec = new TextDecoder();
  let buf = "";
  let transcript = "";
  let text = "";
  const chunks: Buffer[] = [];
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(part, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      let j: any;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      if (j.error) throw new Error(`OpenRouter stream error: ${JSON.stringify(j.error)}`);
      const delta = j.choices?.[0]?.delta ?? {};
      if (delta.audio?.data) chunks.push(Buffer.from(delta.audio.data, "base64"));
      if (delta.audio?.transcript) transcript += delta.audio.transcript;
      if (typeof delta.content === "string") text += delta.content;
    }
  }
  return { audio: Buffer.concat(chunks), transcript, text };
}

/** Wrap 24 kHz mono 16-bit PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
