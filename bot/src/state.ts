export interface TransacaoBot {
  valor: number;
  descricao: string;
  categoria: string;
  data: string;
  hora?: string;
  metodo_pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'nao_informado';
  parcelas?: number;
  local?: string;
  banco?: string;
  tipo: 'despesa' | 'receita';
  origem: 'whatsapp_texto' | 'whatsapp_audio' | 'whatsapp_imagem';
}

export type PendingValue = TransacaoBot | TransacaoBot[];

interface PendingEntry {
  value:   PendingValue;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingEntry>();
const EXPIRY_MS = 5 * 60 * 1000;

export function setPending(jid: string, value: PendingValue, onExpire: () => void): void {
  clearPending(jid);
  const timeout = setTimeout(() => {
    pending.delete(jid);
    onExpire();
  }, EXPIRY_MS);
  pending.set(jid, { value, timeout });
}

export function getPending(jid: string): PendingValue | null {
  return pending.get(jid)?.value ?? null;
}

export function clearPending(jid: string): void {
  const entry = pending.get(jid);
  if (entry) {
    clearTimeout(entry.timeout);
    pending.delete(jid);
  }
}
