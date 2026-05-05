import Anthropic from '@anthropic-ai/sdk';
import { getModelName } from '../aiModels';

interface AnthropicInput {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export async function runAnthropicProvider(input: AnthropicInput) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelName = getModelName('anthropic');
  const result = await client.messages.create({
    model: modelName,
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    system: input.system,
    messages: [{ role: 'user', content: input.prompt }],
  });

  const content = result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim();

  return {
    provider: 'anthropic' as const,
    model: modelName,
    content,
    raw: result,
  };
}
