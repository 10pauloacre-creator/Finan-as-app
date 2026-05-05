'use client';

import { Brain } from 'lucide-react';
import { AIModelId, AITaskKind, getSupportedAIModels } from '@/lib/ai/catalog';

interface AIModelSelectProps {
  task: AITaskKind;
  value: AIModelId;
  onChange: (value: AIModelId) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function AIModelSelect({
  task,
  value,
  onChange,
  disabled,
  compact = false,
}: AIModelSelectProps) {
  const options = getSupportedAIModels(task);

  return (
    <label className={`flex items-center gap-2 ${compact ? '' : 'w-full'}`}>
      <Brain size={compact ? 14 : 15} className="text-purple-400 flex-shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AIModelId)}
        disabled={disabled}
        className={`bg-slate-800 border border-slate-700 text-slate-200 rounded-xl outline-none focus:border-purple-500 disabled:opacity-50 ${
          compact ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3 py-2 w-full'
        }`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
