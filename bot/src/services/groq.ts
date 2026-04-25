import Groq from 'groq-sdk';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createReadStream } from 'fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function transcreverAudio(buffer: Buffer, extensao = 'ogg'): Promise<string> {
  // Salva o buffer em arquivo temporário (Groq exige file stream)
  const tmpFile = join(tmpdir(), `audio-${Date.now()}.${extensao}`);
  writeFileSync(tmpFile, buffer);

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(tmpFile) as unknown as File,
      model: 'whisper-large-v3',
      language: 'pt',
      response_format: 'text',
    });
    return typeof transcription === 'string' ? transcription : (transcription as { text: string }).text;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignora erro ao deletar tmp */ }
  }
}
