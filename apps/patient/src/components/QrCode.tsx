import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR Code gerado no próprio aparelho (nada é enviado para fora). */
export function QrCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#060A17', light: '#FFFFFF' } }).then(setSrc);
  }, [text, size]);
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="rounded-2xl bg-white p-2" style={{ width: size + 16, height: size + 16 }}>
        {src && <img src={src} width={size} height={size} alt={`QR Code: ${label}`} />}
      </div>
      <figcaption className="text-center text-[0.8em] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </figcaption>
    </figure>
  );
}
