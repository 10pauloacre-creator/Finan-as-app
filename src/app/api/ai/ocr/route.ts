import { AIModelId } from '@/lib/ai/aiModels';
import { runOCR } from '@/lib/ai/aiService';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';

  try {
    if (!contentType.includes('multipart/form-data')) {
      return Response.json(
        { success: false, error: 'Envie a imagem como multipart/form-data.' },
        { status: 415 },
      );
    }

    const formData = await req.formData();
    const image = formData.get('image') as File | null;
    const provider = String(formData.get('provider') || 'automatico') as AIModelId;

    if (!image) {
      return Response.json({ success: false, error: 'Imagem obrigatória.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(image.type)) {
      return Response.json({ success: false, error: 'Tipo de arquivo não suportado.' }, { status: 415 });
    }

    if (image.size > MAX_FILE_SIZE) {
      return Response.json({ success: false, error: 'Arquivo muito grande. Máximo permitido: 10 MB.' }, { status: 413 });
    }

    const result = await runOCR({ file: image, provider });

    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }

    return Response.json({
      success: true,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      failedProvider: result.failedProvider,
      text: result.text,
    });
  } catch (error) {
    console.error('[api/ai/ocr]', error);
    return Response.json(
      { success: false, error: 'Não foi possível ler a imagem agora. Tente novamente em instantes.' },
      { status: 500 },
    );
  }
}
