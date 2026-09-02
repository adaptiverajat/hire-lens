import { NextResponse } from 'next/server';
import { badRequest, withAuth } from '@/lib/api/handler';
import {
  extractDocumentText,
  MAX_UPLOAD_BYTES,
  UnsupportedDocumentError,
} from '@/lib/documents/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/documents/extract
 * Multipart upload -> plain text. Persists nothing; the caller decides what to
 * do with the text. Keeps file parsing out of the create/update endpoints.
 */
export const POST = withAuth(async (_ctx, request: Request) => {
  const form = await request.formData().catch(() => null);
  if (!form) throw badRequest('Expected a multipart/form-data body');

  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('No file provided under the "file" field');

  if (file.size === 0) throw badRequest('Uploaded file is empty');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit`);
  }

  try {
    const text = await extractDocumentText(await file.arrayBuffer(), file.type, file.name);

    if (!text.trim()) {
      throw badRequest(
        'No text could be extracted. The file may be a scanned image, which requires OCR.'
      );
    }

    return NextResponse.json({
      text,
      file_name: file.name,
      characters: text.length,
    });
  } catch (error) {
    if (error instanceof UnsupportedDocumentError) throw badRequest(error.message);
    throw error;
  }
});
