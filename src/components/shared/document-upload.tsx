'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

/**
 * Extracts text from a PDF/DOCX/TXT upload and hands it back to the caller.
 * Nothing is persisted here - the parent decides what to do with the text,
 * so re-uploading can never create a duplicate record.
 */
export function DocumentUpload({
  onExtracted,
  accept = '.pdf,.docx,.doc,.txt',
  label = 'Upload file',
  hint,
}: {
  onExtracted: (text: string, fileName: string) => void;
  accept?: string;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const result = await api.extractText(file);
      onExtracted(result.text, result.file_name);
      toast.success(`Extracted ${result.characters.toLocaleString()} characters from ${file.name}`);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not read that file'
      );
    } finally {
      setBusy(false);
      // Reset so selecting the same file again re-triggers onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
        {busy ? 'Reading...' : label}
      </Button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
