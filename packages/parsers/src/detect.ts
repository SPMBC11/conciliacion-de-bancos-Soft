import { decodeText } from './text.js';

export type FileFormat = 'XLSX' | 'XLS' | 'CSV' | 'OFX' | 'CAMT053' | 'PDF';

/** Formatos con parser implementado y probado en v1. PDF se detecta para informar que aún no es compatible. */
export const SUPPORTED_FORMATS: FileFormat[] = ['XLSX', 'XLS', 'CSV', 'OFX', 'CAMT053'];

const startsWith = (buf: Uint8Array, bytes: number[]) => bytes.every((b, i) => buf[i] === b);

/** Detección por contenido (firma), nunca solo por la extensión. */
export function detectFormat(buf: Uint8Array, filename = ''): FileFormat | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'PDF'; // %PDF
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'XLSX'; // ZIP
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'XLS'; // OLE2
  if (buf.subarray(0, 8192).includes(0)) return null; // binario desconocido
  const head = decodeText(buf.subarray(0, 4096)).text.trimStart();
  if (/^OFXHEADER:|<OFX>/i.test(head) || /<OFX>/i.test(head)) return 'OFX';
  if (/^<\?xml/i.test(head) && /camt\.053/i.test(decodeText(buf.subarray(0, 8192)).text))
    return 'CAMT053';
  if (/\.(csv|txt|prn)$/i.test(filename) || /[;,\t|]/.test(head.split('\n')[0] ?? '')) return 'CSV';
  return null;
}
