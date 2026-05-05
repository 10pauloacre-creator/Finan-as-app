import { AIModelId } from './aiModels';
import { mapLegacyTask, AITaskKind } from './catalog';
import { runAI } from './aiService';

interface GenerateTextInput {
  task: AITaskKind;
  preferredModel?: AIModelId;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

interface GenerateTextResult {
  content: string;
  providerUsed: Exclude<AIModelId, 'automatico'>;
}

export async function generateTextWithFallback(input: GenerateTextInput): Promise<GenerateTextResult> {
  const result = await runAI({
    task: mapLegacyTask(input.task),
    input: {
      customPrompt: `${input.system}\n\n${input.user}`,
    },
    provider: input.preferredModel || 'automatico',
    mode: input.preferredModel && input.preferredModel !== 'automatico' ? 'manual' : 'auto',
    options: {
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    },
  });

  if (!result.success || !result.answer || !result.providerUsed) {
    throw new Error(result.error || 'Nenhum provedor de IA disponível.');
  }

  return {
    content: result.answer,
    providerUsed: result.providerUsed,
  };
}
