import { ImageResponse } from 'next/og';

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const size = slug.includes('512') ? 512 : 192;
  const r    = Math.round(size * 0.22);
  const fs   = Math.round(size * 0.38);
  const fs2  = Math.round(size * 0.18);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: r,
          color: 'white',
        }}
      >
        <span style={{ fontSize: fs, fontWeight: 900, lineHeight: 1 }}>FI</span>
        <span style={{ fontSize: fs2, fontWeight: 500, opacity: 0.7, letterSpacing: 2 }}>AI</span>
      </div>
    ),
    { width: size, height: size },
  );
}
