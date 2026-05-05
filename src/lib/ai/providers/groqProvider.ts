import OpenAI from 'openai';
import { getModelName } from '../aiModels';

interface GroqInput {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export async function runGroqProvider(input: GroqInput) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não configurada');
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const modelName = getModelName('groq');
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
    provider: 'groq' as const,
    model: modelName,
    content: result.choices?.[0]?.message?.content?.trim() || '',
    raw: result,
  };
}
