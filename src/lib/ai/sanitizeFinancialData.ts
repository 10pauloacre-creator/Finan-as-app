export function sanitizeFinancialData(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? {});

  return text
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF_REMOVIDO]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/g, '[RG_REMOVIDO]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REMOVIDO]')
    .replace(/\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g, '[TELEFONE_REMOVIDO]')
    .replace(/ag[eê]ncia[:\s-]*[\w./-]+/gi, 'agência [REMOVIDA]')
    .replace(/conta[:\s-]*[\w./-]+/gi, 'conta [REMOVIDA]')
    .replace(/\b(?:bearer\s+)?(?:hf|sk|gsk|pk|rk|AIza)[A-Za-z0-9._:-]{8,}\b/gi, '[TOKEN_REMOVIDO]')
    .replace(/\bchave pix[:\s-]*[^\s,;]+/gi, 'chave pix [REMOVIDA]')
    .replace(/\b(?:cart[aã]o|numero do cart[aã]o)[:\s-]*\d{4,}\b/gi, 'cartão [REMOVIDO]')
    .slice(0, 8000);
}
