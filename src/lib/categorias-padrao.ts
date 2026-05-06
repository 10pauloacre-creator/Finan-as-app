import { Categoria } from '@/types';

// Categorias padrão pré-configuradas
export const CATEGORIAS_PADRAO: Omit<Categoria, 'criado_em'>[] = [
  // === DESPESAS ===
  { id: 'alimentacao', nome: 'Alimentação', icone: '🍔', cor: '#F59E0B', tipo: 'despesa' },
  { id: 'mercado', nome: 'Mercado', icone: '🛒', cor: '#10B981', tipo: 'despesa' },
  { id: 'feira_mantimentos', nome: 'Feira de mantimentos', icone: '🧺', cor: '#22C55E', tipo: 'despesa' },
  { id: 'transporte', nome: 'Transporte', icone: '🚗', cor: '#3B82F6', tipo: 'despesa' },
  { id: 'saude', nome: 'Saúde', icone: '💊', cor: '#EF4444', tipo: 'despesa' },
  { id: 'educacao', nome: 'Educação', icone: '📚', cor: '#8B5CF6', tipo: 'despesa' },
  { id: 'lazer', nome: 'Lazer', icone: '🎮', cor: '#EC4899', tipo: 'despesa' },
  { id: 'roupas', nome: 'Roupas', icone: '👕', cor: '#F97316', tipo: 'despesa' },
  { id: 'moradia', nome: 'Moradia', icone: '🏠', cor: '#6B7280', tipo: 'despesa' },
  { id: 'assinaturas', nome: 'Assinaturas', icone: '📱', cor: '#7C3AED', tipo: 'despesa' },
  { id: 'conta_agua_luz', nome: 'Contas', icone: '💡', cor: '#EAB308', tipo: 'despesa' },
  { id: 'pet', nome: 'Pet', icone: '🐾', cor: '#84CC16', tipo: 'despesa' },
  { id: 'beleza', nome: 'Beleza', icone: '💇', cor: '#F472B6', tipo: 'despesa' },
  { id: 'presente', nome: 'Presentes', icone: '🎁', cor: '#E11D48', tipo: 'despesa' },
  { id: 'farmacia', nome: 'Farmácia', icone: '💊', cor: '#14B8A6', tipo: 'despesa' },
  { id: 'delivery', nome: 'Delivery', icone: '🛵', cor: '#F59E0B', tipo: 'despesa' },
  { id: 'outros_despesa', nome: 'Outros', icone: '📦', cor: '#9CA3AF', tipo: 'despesa' },

  // === RECEITAS ===
  { id: 'salario', nome: 'Salário', icone: '💼', cor: '#10B981', tipo: 'receita' },
  { id: 'freelance', nome: 'Freelance', icone: '💻', cor: '#3B82F6', tipo: 'receita' },
  { id: 'investimento_rend', nome: 'Rendimentos', icone: '📈', cor: '#8B5CF6', tipo: 'receita' },
  { id: 'presente_recebido', nome: 'Presente', icone: '🎁', cor: '#EC4899', tipo: 'receita' },
  { id: 'outros_receita', nome: 'Outros', icone: '💰', cor: '#9CA3AF', tipo: 'receita' },

  // === TRANSFERÊNCIAS ===
  { id: 'pix_enviado', nome: 'Pix Enviado', icone: '↗️', cor: '#6B7280', tipo: 'transferencia' },
  { id: 'pix_recebido', nome: 'Pix Recebido', icone: '↙️', cor: '#10B981', tipo: 'transferencia' },
  { id: 'ted_doc', nome: 'TED/DOC', icone: '🏦', cor: '#3B82F6', tipo: 'transferencia' },
];

// Mapa de palavras-chave para categorias (usado pela IA)
export const PALAVRAS_CHAVE_CATEGORIAS: Record<string, string> = {
  // Alimentação
  'ifood': 'delivery',
  'rappi': 'delivery',
  'ubereats': 'delivery',
  'mcdonalds': 'alimentacao',
  'burger king': 'alimentacao',
  'subway': 'alimentacao',
  'restaurante': 'alimentacao',
  'lanchonete': 'alimentacao',
  'padaria': 'alimentacao',
  'cafe': 'alimentacao',
  'pizza': 'alimentacao',
  'açaí': 'alimentacao',

  // Mercado
  'mercado': 'mercado',
  'supermercado': 'mercado',
  'atacado': 'mercado',
  'nota fiscal': 'feira_mantimentos',
  'cupom fiscal': 'feira_mantimentos',
  'mantimentos': 'feira_mantimentos',
  'hortaliça': 'feira_mantimentos',
  'fruta': 'feira_mantimentos',
  'verdura': 'feira_mantimentos',
  'assai': 'mercado',
  'carrefour': 'mercado',
  'extra': 'mercado',
  'pão de açúcar': 'mercado',
  'hortifruti': 'mercado',

  // Transporte
  'uber': 'transporte',
  '99': 'transporte',
  'indriver': 'transporte',
  'combustivel': 'transporte',
  'gasolina': 'transporte',
  'etanol': 'transporte',
  'estacionamento': 'transporte',
  'ônibus': 'transporte',
  'metrô': 'transporte',
  'passagem': 'transporte',

  // Saúde
  'farmácia': 'farmacia',
  'drogaria': 'farmacia',
  'droga raia': 'farmacia',
  'ultrafarma': 'farmacia',
  'médico': 'saude',
  'hospital': 'saude',
  'clinica': 'saude',
  'dentista': 'saude',
  'plano de saúde': 'saude',
  'unimed': 'saude',

  // Assinaturas
  'netflix': 'assinaturas',
  'spotify': 'assinaturas',
  'amazon prime': 'assinaturas',
  'disney': 'assinaturas',
  'hbo': 'assinaturas',
  'youtube': 'assinaturas',
  'apple': 'assinaturas',
  'google one': 'assinaturas',
  'icloud': 'assinaturas',

  // Moradia
  'aluguel': 'moradia',
  'condomínio': 'moradia',
  'iptu': 'moradia',

  // Contas
  'luz': 'conta_agua_luz',
  'água': 'conta_agua_luz',
  'internet': 'conta_agua_luz',
  'celular': 'conta_agua_luz',
  'telefone': 'conta_agua_luz',
  'energisa': 'conta_agua_luz',
  'vivo': 'conta_agua_luz',
  'claro': 'conta_agua_luz',
  'tim': 'conta_agua_luz',

  // Educação
  'curso': 'educacao',
  'livro': 'educacao',
  'escola': 'educacao',
  'faculdade': 'educacao',
  'mensalidade': 'educacao',
  'udemy': 'educacao',

  // Pix/Transferências
  'pix': 'pix_enviado',
  'transferência': 'ted_doc',
  'ted': 'ted_doc',
  'doc': 'ted_doc',
};
