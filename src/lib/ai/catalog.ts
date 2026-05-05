export type AIModelId =
  | 'automatico'
  | 'gemini'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'gemma4';

export type AITaskKind =
  | 'chat'
  | 'agents'
  | 'tips'
  | 'report'
  | 'receipt'
  | 'image'
  | 'pdf'
  | 'audio';

export interface AIModelOption {
  id: AIModelId;
  label: string;
  description: string;
}

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  { id: 'automatico', label: 'Automático', description: 'O app escolhe a melhor IA e troca se uma falhar.' },
  { id: 'gemini', label: 'Gemini', description: 'Boa opção geral e multimodal.' },
  { id: 'anthropic', label: 'Claude', description: 'Boa para análise e explicações.' },
  { id: 'groq', label: 'Groq', description: 'Rápida para tarefas textuais.' },
  { id: 'deepseek', label: 'DeepSeek', description: 'Forte para raciocínio textual.' },
  { id: 'gemma4', label: 'Gemma 4', description: 'Modelo alternativo via Hugging Face.' },
];

const TASK_MODEL_SUPPORT: Record<AITaskKind, AIModelId[]> = {
  chat: ['automatico', 'gemini', 'anthropic', 'groq', 'deepseek', 'gemma4'],
  agents: ['automatico', 'gemini', 'anthropic', 'groq', 'deepseek', 'gemma4'],
  tips: ['automatico', 'gemini', 'anthropic', 'groq', 'deepseek', 'gemma4'],
  report: ['automatico', 'gemini', 'anthropic', 'groq', 'deepseek', 'gemma4'],
  receipt: ['automatico', 'gemini'],
  image: ['automatico', 'gemini'],
  pdf: ['automatico', 'gemini'],
  audio: ['automatico', 'gemini'],
};

const TASK_AUTOMATIC_ORDER: Record<AITaskKind, AIModelId[]> = {
  chat: ['deepseek', 'gemma4', 'gemini', 'anthropic', 'groq'],
  agents: ['gemini', 'anthropic', 'deepseek', 'gemma4', 'groq'],
  tips: ['gemini', 'deepseek', 'gemma4', 'anthropic', 'groq'],
  report: ['gemini', 'anthropic', 'deepseek', 'gemma4', 'groq'],
  receipt: ['gemini'],
  image: ['gemini'],
  pdf: ['gemini'],
  audio: ['gemini'],
};

export function getSupportedAIModels(task: AITaskKind): AIModelOption[] {
  const supported = new Set(TASK_MODEL_SUPPORT[task]);
  return AI_MODEL_OPTIONS.filter((option) => supported.has(option.id));
}

export function resolveAIExecutionOrder(task: AITaskKind, preferred: AIModelId = 'automatico'): AIModelId[] {
  const automatic = TASK_AUTOMATIC_ORDER[task];
  if (preferred === 'automatico') return automatic;
  if (!TASK_MODEL_SUPPORT[task].includes(preferred)) return automatic;
  return [preferred, ...automatic.filter((item) => item !== preferred)];
}

