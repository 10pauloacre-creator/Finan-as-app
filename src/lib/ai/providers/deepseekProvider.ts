import OpenAI from 'openai';
import { getModelName } from '../aiModels';

interface DeepSeekInput {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export async function runDeepSeekProvider(input: DeepSeekInput) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY não configurada');
  }

  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  });
  const modelName = getModelName('deepseek');
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
    provider: 'deepseek' as const,
    model: modelName,
    content: result.choices?.[0]?.message?.content?.trim() || '',
    raw: result,
  };
}
