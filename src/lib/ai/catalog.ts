import { AI_MODEL_OPTIONS, AIModelId, AITask, AIProviderId } from './aiModels';
import { getTaskProfile } from './taskProfiles';

export type { AIModelId, AIProviderId };

export type AITaskKind =
  | 'chat'
  | 'deep'
  | 'agents'
  | 'tips'
  | 'report'
  | 'receipt'
  | 'image'
  | 'pdf'
  | 'audio';

const LEGACY_TASK_MAP: Record<AITaskKind, AITask> = {
  chat: 'responder_pergunta_financeira',
  deep: 'analise_profunda',
  agents: 'agente_financeiro',
  tips: 'gerar_insights',
  report: 'resumo_mensal',
  receipt: 'analisar_recibo_futuramente',
  image: 'analisar_imagem_financeira',
  pdf: 'analisar_pdf_financeiro',
  audio: 'analisar_audio_financeiro',
};

export { AI_MODEL_OPTIONS };

export function mapLegacyTask(task: AITaskKind): AITask {
  return LEGACY_TASK_MAP[task];
}

export function getSupportedAIModels(task: AITaskKind) {
  const profile = getTaskProfile(mapLegacyTask(task));
  const supported = new Set<AIModelId>(['automatico', ...profile.preferredProviders]);
  return AI_MODEL_OPTIONS.filter((option) => {
    if (!supported.has(option.id)) return false;
    if (task !== 'deep' && option.id === 'openrouterPremium') return false;
    return true;
  });
}

export function resolveAIExecutionOrder(task: AITaskKind, preferred: AIModelId = 'automatico') {
  const profile = getTaskProfile(mapLegacyTask(task));
  if (preferred === 'automatico') return profile.preferredProviders;
  return [preferred, ...profile.preferredProviders.filter((item) => item !== preferred)];
}
