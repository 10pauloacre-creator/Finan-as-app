import type { TransacaoExtraida } from './assistente-types';

export interface CsvFinanceiroResult {
  transacoes: TransacaoExtraida[];
  totalValor: number;
  bancaNome?: string;
  mesReferencia?: string;
  rawRows: Array<Record<string, string>>;
}

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
}

function detectDelimiter(content: string) {
  const sample = content.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates = [',', ';', '\t'];
  let best = ';';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const score = (sample.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findHeaderKey(headers: string[], aliases: string[]) {
  return headers.find((header) => aliases.includes(header));
}

function parseMoney(raw: string) {
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slash = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

  const dash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2]}-${dash[1]}`;

  return null;
}

function inferCategoria(descricao: string) {
  const text = descricao.toLowerCase();
  if (/(pagamento recebido|estorno|reembolso|chargeback)/.test(text)) return 'Outros';
  if (/(ifood|rappi|ubereats|delivery)/.test(text)) return 'Delivery';
  if (/(mercado|supermercado|atacadao|carrefour|extra)/.test(text)) return 'Mercado';
  if (/(uber|99|combustivel|posto|estacionamento)/.test(text)) return 'Transporte';
  if (/(farmacia|drogaria)/.test(text)) return 'Farmacia';
  if (/(netflix|spotify|prime|disney)/.test(text)) return 'Assinaturas';
  if (/(aluguel|condominio|imovel)/.test(text)) return 'Moradia';
  if (/(salario|pix recebido|deposito)/.test(text)) return 'Salario';
  return 'Outros';
}

function parseInstallmentsFromDescription(descricao: string) {
  const match = descricao.match(/parcela\s+(\d{1,2})\/(\d{1,2})/i);
  if (!match) return null;
  const total = Number(match[2]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function parseCsvFinanceiro(content: string): CsvFinanceiroResult {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { transacoes: [], totalValor: 0, rawRows: [] };
  }

  const delimiter = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { transacoes: [], totalValor: 0, rawRows: [] };
  }

  const headerRow = splitCsvLine(lines[0], delimiter).map(normalizeKey);
  const dateKey = findHeaderKey(headerRow, ['data', 'date', 'data_lancamento', 'data_compra', 'posted_date']);
  const descriptionKey = findHeaderKey(headerRow, ['descricao', 'descricao_transacao', 'historico', 'estabelecimento', 'titulo', 'title', 'memo', 'description']);
  const amountKey = findHeaderKey(headerRow, ['valor', 'amount', 'valor_rs', 'valor_total', 'price']);
  const debitKey = findHeaderKey(headerRow, ['debito', 'debit', 'saidas', 'valor_debito']);
  const creditKey = findHeaderKey(headerRow, ['credito', 'credit', 'entradas', 'valor_credito']);
  const typeKey = findHeaderKey(headerRow, ['tipo', 'type', 'natureza']);
  const categoryKey = findHeaderKey(headerRow, ['categoria', 'category']);
  const installmentsKey = findHeaderKey(headerRow, ['parcelas', 'installments', 'parcela']);

  const rawRows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headerRow.map((key, index) => [key, values[index] || '']));
  });

  const transacoes = rawRows.flatMap((row) => {
    const descricao = descriptionKey ? row[descriptionKey]?.trim() : '';
    const data = dateKey ? parseDate(row[dateKey] || '') : null;
    const tipoRaw = typeKey ? normalizeKey(row[typeKey] || '') : '';
    const categoria = categoryKey ? row[categoryKey]?.trim() || inferCategoria(descricao) : inferCategoria(descricao);
    const parcelas = installmentsKey ? parseMoney(row[installmentsKey] || '') : parseInstallmentsFromDescription(descricao);

    let valor: number | null = amountKey ? parseMoney(row[amountKey] || '') : null;
    if (valor === null && debitKey) valor = parseMoney(row[debitKey] || '');
    if (valor === null && creditKey) valor = parseMoney(row[creditKey] || '');
    if (valor === null || !descricao || !data) return [];

    let tipo: 'despesa' | 'receita' = 'despesa';
    if (
      tipoRaw.includes('receita') ||
      tipoRaw.includes('credito') ||
      tipoRaw.includes('entrada') ||
      /pagamento recebido|estorno|reembolso|chargeback/i.test(descricao)
    ) {
      tipo = 'receita';
    } else if (creditKey && !debitKey && valor > 0) {
      tipo = 'receita';
    } else if (valor < 0) {
      tipo = 'despesa';
      valor = Math.abs(valor);
    }

    if (tipo === 'receita' && valor < 0) {
      valor = Math.abs(valor);
    }

    return [{
      tipo,
      valor,
      descricao,
      categoria,
      data,
      hora: null,
      metodo_pagamento: 'credito',
      parcelas: parcelas && parcelas > 0 ? Math.trunc(parcelas) : null,
      local: null,
      banco: null,
    } satisfies TransacaoExtraida];
  });

  const totalValor = transacoes.reduce((sum, tx) => sum + (tx.tipo === 'despesa' ? tx.valor : 0), 0);
  return { transacoes, totalValor, rawRows };
}
