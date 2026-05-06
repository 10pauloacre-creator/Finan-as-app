import OpenAI from 'openai';
import { getModelName, type AIProviderId } from '../aiModels';

interface OpenRouterInput {
  providerId: AIProviderId;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export async function runOpenRouterProvider(input: OpenRouterInput) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY não configurada');
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const modelName = getModelName(input.providerId);
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
    provider: input.providerId,
    model: modelName,
    content: result.choices?.[0]?.message?.content?.trim() || '',
    raw: result,
  };
}
