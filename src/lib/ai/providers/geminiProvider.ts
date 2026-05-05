import { GoogleGenerativeAI } from '@google/generative-ai';
import { getModelName } from '../aiModels';

interface GeminiInput {
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  attachments?: Array<{ mimeType: string; data: string }>;
}

export async function runGeminiProvider(input: GeminiInput) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada');
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = getModelName('gemini');
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    },
  });

  const parts = [
    ...(input.attachments ?? []).map((attachment) => ({
      inlineData: { mimeType: attachment.mimeType, data: attachment.data },
    })),
    `${input.system}\n\n${input.prompt}`,
  ];

  const result = await model.generateContent(parts);
  const content = result.response.text().trim();

  return {
    provider: 'gemini' as const,
    model: modelName,
    content,
    raw: result,
  };
}
