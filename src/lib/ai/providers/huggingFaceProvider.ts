import OpenAI from 'openai';
import { getModelName } from '../aiModels';

interface HuggingFaceInput {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export async function runHuggingFaceProvider(input: HuggingFaceInput) {
  if (!process.env.HF_TOKEN) {
    throw new Error('HF_TOKEN não configurada');
  }

  const client = new OpenAI({
    baseURL: 'https://router.huggingface.co/v1',
    apiKey: process.env.HF_TOKEN,
  });
  const modelName = getModelName('gemma4');
  const result = await client.chat.completions.create({
    model: modelName,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
  });

  return {
    provider: 'gemma4' as const,
    model: modelName,
    content: result.choices?.[0]?.message?.content?.trim() || '',
    raw: result,
  };
}
