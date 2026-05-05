import { InferenceClient } from '@huggingface/inference';
import type { InferenceProviderOrPolicy } from '@huggingface/inference';
import { AIProviderId, getModelName } from '../aiModels';

interface GlmOcrInput {
  image: Blob | ArrayBuffer | Uint8Array;
  providerId?: AIProviderId;
  modelOverride?: string;
  providerOverride?: string;
}

function normalizeGeneratedText(result: unknown) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'generated_text' in result) {
    return String((result as { generated_text?: unknown }).generated_text || '');
  }
  return String(result || '');
}

function toBlob(image: Blob | ArrayBuffer | Uint8Array) {
  if (image instanceof Blob) {
    return image;
  }

  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer]);
}

export async function extractTextFromImage(input: GlmOcrInput) {
  if (!process.env.HF_TOKEN) {
    throw new Error('HF_TOKEN não configurado.');
  }

  const client = new InferenceClient(process.env.HF_TOKEN);
  const providerId = input.providerId || 'glmOcr';
  const modelName = input.modelOverride || getModelName(providerId);
  const provider = (
    input.providerOverride || (providerId === 'glmOcr' ? process.env.GLM_OCR_PROVIDER || 'zai-org' : undefined)
  ) as InferenceProviderOrPolicy | undefined;

  const result = await client.imageToText({
    model: modelName,
    data: toBlob(input.image),
    provider,
  });

  return {
    provider: providerId,
    model: modelName,
    content: normalizeGeneratedText(result).trim(),
    raw: result,
  };
}
