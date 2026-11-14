import { FileUp } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  accept: string;
  maxBytes: number;
  file: File | null;
  onFile: (f: File | null) => void;
  hint?: string;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Arrastrar y soltar o elegir archivo. Accesible con teclado (es un <label> de un input file). */
export function FileDropzone({ accept, maxBytes, file, onFile, hint }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (f.size > maxBytes) {
      setError(`El archivo pesa ${mb(f.size)}; el máximo es ${mb(maxBytes)}.`);
      onFile(null);
      return;
    }
    setError(null);
    onFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center text-sm transition-colors hover:border-primary/60',
          over && 'border-primary bg-primary/5',
        )}
      >
        <FileUp aria-hidden className="size-6 text-muted-foreground" />
        {file ? (
          <span>
            <strong>{file.name}</strong> · {mb(file.size)}
          </span>
        ) : (
          <span>
            Arrastre el archivo aquí o{' '}
            <span className="text-primary underline dark:text-primary-hover">elíjalo</span>
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
