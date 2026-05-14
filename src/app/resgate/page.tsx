'use client';

import { useEffect, useState } from 'react';
import { CloudUpload, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { capturarBackupSnapshot } from '@/lib/storage';

function contarSnapshot() {
  const snapshot = capturarBackupSnapshot();
  return {
    snapshot,
    total:
      snapshot.transacoes.length +
      snapshot.categorias.length +
      snapshot.contas.length +
      snapshot.cartoes.length +
      snapshot.investimentos.length +
      snapshot.metas.length +
      snapshot.orcamentos.length +
      snapshot.reservas.length +
      1,
  };
}

export default function ResgatePage() {
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('Lendo dados locais do aparelho...');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    try {
      const { total: totalLocal } = contarSnapshot();
      setTotal(totalLocal);
      setStatus(totalLocal > 0 ? `${totalLocal} registros encontrados neste aparelho.` : 'Nenhum dado local encontrado neste aparelho.');
    } catch {
      setStatus('Não foi possível acessar os dados locais neste aparelho.');
    }
  }, []);

  async function enviarParaNuvem() {
    setCarregando(true);
    setStatus('Enviando os dados locais deste aparelho para a nuvem...');
    try {
      const { snapshot } = contarSnapshot();
      const resposta = await fetch('/api/resgate/nuvem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot }),
      });
      const data = await resposta.json();
      if (!resposta.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao enviar para a nuvem.');
      }
      setStatus(`Resgate concluído: ${data.total} registros enviados para a nuvem.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erro ao resgatar dados para a nuvem.');
    } finally {
      setCarregando(false);
    }
  }

  function exportarArquivo() {
    const { snapshot } = contarSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resgate-financeiro-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Arquivo de resgate exportado neste aparelho.');
  }

  return (
    <main className="min-h-screen bg-[#070b16] text-white px-5 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 flex gap-3">
          <ShieldAlert className="text-amber-300 mt-0.5" size={20} />
          <div>
            <h1 className="text-lg font-semibold text-amber-100">Resgate de dados locais</h1>
            <p className="text-sm text-amber-50/80">
              Use esta página no mesmo celular onde os lançamentos mais novos aparecem no app.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-3">
          <p className="text-sm text-slate-300">{status}</p>
          <p className="text-xs text-slate-500">Total local detectado: {total} registros</p>
        </div>

        <div className="grid gap-3">
          <button
            onClick={enviarParaNuvem}
            disabled={carregando}
            className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {carregando ? <RefreshCw size={16} className="animate-spin" /> : <CloudUpload size={16} />}
            Enviar dados locais para a nuvem
          </button>

          <button
            onClick={exportarArquivo}
            className="w-full rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-4 text-sm font-medium flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Exportar arquivo de resgate
          </button>
        </div>
      </div>
    </main>
  );
}
