import OpenAI from 'openai';
import { getModelName, type AIProviderId } from '../aiModels';

interface OpenRouterAttachment {
  mimeType: string;
  data: string;
  fileName?: string;
}

interface OpenRouterInput {
  providerId: AIProviderId;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  attachments?: OpenRouterAttachment[];
}

function createClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY nao configurada.');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

function requireModel(envName: 'OPENROUTER_VISION_MODEL' | 'OPENROUTER_PDF_MODEL' | 'OPENROUTER_AUDIO_MODEL') {
  const model = process.env[envName]?.trim();
  if (!model) {
    throw new Error(`${envName} nao configurado.`);
  }

  return model;
}

function asDataUrl(mimeType: string, data: string) {
  return `data:${mimeType};base64,${data}`;
}

function detectAudioFormat(mimeType: string) {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'mp4';
}

interface OpenRouterContentPart {
  text?: string;
}

interface OpenRouterChatResult {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterContentPart[] | null;
    };
  }>;
}

function extractContent(result: OpenRouterChatResult) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
      .join('\n')
      .trim();
  }

  return '';
}

export async function callOpenRouterText(input: OpenRouterInput) {
  const client = createClient();
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
    content: extractContent(result),
    raw: result,
  };
}

export async function callOpenRouterVision(input: OpenRouterInput & { attachment: OpenRouterAttachment }) {
  const client = createClient();
  const modelName = requireModel('OPENROUTER_VISION_MODEL');
  const result = await client.chat.completions.create({
    model: modelName,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: input.prompt },
          {
            type: 'image_url',
            image_url: {
              url: asDataUrl(input.attachment.mimeType, input.attachment.data),
            },
          },
        ],
      },
    ],
  } as never);

  return {
    provider: input.providerId,
    model: modelName,
    content: extractContent(result),
    raw: result,
  };
}

export async function callOpenRouterPdf(input: OpenRouterInput & { attachment: OpenRouterAttachment }) {
  const modelName = requireModel('OPENROUTER_PDF_MODEL');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: false,
      plugins: [
        {
          id: 'file-parser',
          pdf: {
            engine: 'cloudflare-ai',
          },
        },
      ],
      messages: [
        { role: 'system', content: input.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            {
              type: 'file',
              file: {
                filename: input.attachment.fileName || 'documento.pdf',
                file_data: asDataUrl(input.attachment.mimeType, input.attachment.data),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText || 'Provider returned error'}`);
  }

  const result = await response.json() as OpenRouterChatResult;

  return {
    provider: input.providerId,
    model: modelName,
    content: extractContent(result),
    raw: result,
  };
}

export async function callOpenRouterAudio(input: OpenRouterInput & { attachment: OpenRouterAttachment }) {
  const modelName = requireModel('OPENROUTER_AUDIO_MODEL');
  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      input_audio: {
        data: input.attachment.data,
        format: detectAudioFormat(input.attachment.mimeType),
      },
      language: 'pt',
      temperature: input.temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText || 'Provider returned error'}`);
  }

  const result = await response.json() as { text?: string };

  return {
    provider: input.providerId,
    model: modelName,
    content: typeof result.text === 'string' ? result.text.trim() : '',
    raw: result,
  };
}

export async function runOpenRouterProvider(input: OpenRouterInput) {
  const attachment = input.attachments?.[0];
  if (!attachment) {
    return callOpenRouterText(input);
  }

  if (attachment.mimeType.startsWith('image/')) {
    return callOpenRouterVision({ ...input, attachment });
  }

  if (attachment.mimeType === 'application/pdf') {
    return callOpenRouterPdf({ ...input, attachment });
  }

  if (attachment.mimeType.startsWith('audio/')) {
    return callOpenRouterAudio({ ...input, attachment });
  }

  throw new Error(`Formato multimodal nao suportado no OpenRouter: ${attachment.mimeType}`);
}
