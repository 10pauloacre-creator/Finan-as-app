'use client';

import { ScanText } from 'lucide-react';
import { AIModelId, OCR_MODEL_OPTIONS } from '@/lib/ai/aiModels';

interface OCRModelSelectProps {
  value: AIModelId;
  onChange: (value: AIModelId) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function OCRModelSelect({
  value,
  onChange,
  disabled,
  compact = false,
}: OCRModelSelectProps) {
  return (
    <label className={`flex items-center gap-2 ${compact ? '' : 'w-full'}`}>
      <ScanText size={compact ? 14 : 15} className="text-cyan-400 flex-shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AIModelId)}
        disabled={disabled}
        className={`bg-slate-800 border border-slate-700 text-slate-200 rounded-xl outline-none focus:border-cyan-500 disabled:opacity-50 ${
          compact ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3 py-2 w-full'
        }`}
      >
        {OCR_MODEL_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
