import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { getSupabaseServer } from '@/lib/supabase-server';
import type { BackupSnapshot } from '@/lib/storage';

const BUCKET = 'financeiro-backups';
const DIR = path.join(process.cwd(), 'backups');

type BackupAction = 'create' | 'restore-local' | 'restore-cloud' | 'status';

function criarNomeArquivo(date = new Date()) {
  return `backup-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function garantirPastaLocal() {
  await mkdir(DIR, { recursive: true });
}

async function listarArquivosLocais() {
  await garantirPastaLocal();
  const arquivos = (await readdir(DIR))
    .filter((nome) => nome.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a));
  return arquivos;
}

async function manterUltimos10Locais() {
  const arquivos = await listarArquivosLocais();
  await Promise.all(arquivos.slice(10).map((nome) => rm(path.join(DIR, nome), { force: true })));
}

async function garantirBucket() {
  const supabase = getSupabaseServer();
  const buckets = await supabase.storage.listBuckets();
  if (buckets.error) throw buckets.error;
  const existe = buckets.data?.some((bucket) => bucket.name === BUCKET);
  if (existe) return;

  const created = await supabase.storage.createBucket(BUCKET, { public: false });
  if (created.error && !created.error.message.toLowerCase().includes('already')) {
    throw created.error;
  }
}

async function listarArquivosNuvem() {
  await garantirBucket();
  const supabase = getSupabaseServer();
  const result = await supabase.storage.from(BUCKET).list('', {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (result.error) throw result.error;
  return (result.data || []).filter((item) => item.name.endsWith('.json'));
}

async function manterUltimos10Nuvem() {
  const arquivos = await listarArquivosNuvem();
  const extras = arquivos.slice(10).map((item) => item.name);
  if (!extras.length) return;

  const supabase = getSupabaseServer();
  const removed = await supabase.storage.from(BUCKET).remove(extras);
  if (removed.error) throw removed.error;
}

async function criarBackup(snapshot: BackupSnapshot) {
  const nome = criarNomeArquivo();
  const conteudo = JSON.stringify(snapshot, null, 2);

  await garantirPastaLocal();
  await writeFile(path.join(DIR, nome), conteudo, 'utf8');
  await manterUltimos10Locais();

  await garantirBucket();
  const supabase = getSupabaseServer();
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(nome, new Blob([conteudo], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });
  if (upload.error) throw upload.error;
  await manterUltimos10Nuvem();

  return { nome, localPath: path.join(DIR, nome) };
}

async function carregarUltimoBackupLocal() {
  const arquivos = await listarArquivosLocais();
  const nome = arquivos[0];
  if (!nome) return null;
  const conteudo = await readFile(path.join(DIR, nome), 'utf8');
  return { nome, snapshot: JSON.parse(conteudo) as BackupSnapshot };
}

async function carregarUltimoBackupNuvem() {
  const arquivos = await listarArquivosNuvem();
  const nome = arquivos[0]?.name;
  if (!nome) return null;

  const supabase = getSupabaseServer();
  const download = await supabase.storage.from(BUCKET).download(nome);
  if (download.error) throw download.error;
  const conteudo = await download.data.text();
  return { nome, snapshot: JSON.parse(conteudo) as BackupSnapshot };
}

async function statusBackups() {
  const [local, cloud] = await Promise.all([
    carregarUltimoBackupLocal(),
    carregarUltimoBackupNuvem(),
  ]);

  return {
    local: local ? { nome: local.nome, exportado_em: local.snapshot.exportado_em } : null,
    cloud: cloud ? { nome: cloud.nome, exportado_em: cloud.snapshot.exportado_em } : null,
  };
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await statusBackups()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Erro ao listar backups.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: BackupAction; snapshot?: BackupSnapshot };
    const action = body.action || 'status';

    if (action === 'create') {
      if (!body.snapshot) {
        return NextResponse.json({ ok: false, error: 'Snapshot ausente.' }, { status: 400 });
      }
      const resultado = await criarBackup(body.snapshot);
      return NextResponse.json({ ok: true, ...resultado, ...(await statusBackups()) });
    }

    if (action === 'restore-local') {
      const backup = await carregarUltimoBackupLocal();
      if (!backup) {
        return NextResponse.json({ ok: false, error: 'Nenhum backup local encontrado.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, nome: backup.nome, snapshot: backup.snapshot });
    }

    if (action === 'restore-cloud') {
      const backup = await carregarUltimoBackupNuvem();
      if (!backup) {
        return NextResponse.json({ ok: false, error: 'Nenhum backup na nuvem encontrado.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, nome: backup.nome, snapshot: backup.snapshot });
    }

    return NextResponse.json({ ok: true, ...(await statusBackups()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Erro ao processar backup.' }, { status: 500 });
  }
}
