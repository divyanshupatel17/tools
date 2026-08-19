import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { decryptObjectData, recoverFileKey } from '@/lib/pdf/pdf_crypto';
import { transformDocumentStrings } from '@/lib/pdf/pdf_object_crypt';

export interface UnlockPdfOptions {
  password?: string;
}

function requiredBytes(dict: PDFDict, key: string): Uint8Array {
  const value = dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString);
  if (!value)
    throw new ProcessorError(
      'unsupported_encryption',
      "This file's encryption entries are incomplete.",
    );
  return value.asBytes();
}

/**
 * Removes a password from a PDF the caller already knows the password to — never an unknown
 * one; see the tool description for why that boundary exists. Only the Standard Security
 * Handler revision 6 (AES-256) is supported, the same one Protect PDF writes; an older
 * RC4/AES-128 file (revisions 2-4) is rejected with a clear message rather than silently
 * mishandled. The output has no `/Encrypt` entry at all — a genuinely plain PDF, not a
 * remembered password, so it never needs one again.
 */
const unlockPdf: ToolProcessor<UnlockPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to unlock.');

  const password = input.options.password ?? '';

  context.on_progress?.({ ratio: 0.05, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new ProcessorError(
      'unreadable',
      "This file's internal structure could not be read — often because it uses a newer, compressed layout this tool does not support yet for encrypted files.",
    );
  }

  if (!pdfDoc.isEncrypted)
    throw new ProcessorError('not_protected', 'This PDF does not have a password.');

  const encryptRef = pdfDoc.context.trailerInfo.Encrypt;
  const encryptDict = pdfDoc.context.lookup(encryptRef, PDFDict);
  const filter = encryptDict.lookup(PDFName.of('Filter'), PDFName);
  const v = encryptDict.lookupMaybe(PDFName.of('V'), PDFNumber)?.asNumber();
  const r = encryptDict.lookupMaybe(PDFName.of('R'), PDFNumber)?.asNumber();

  if (filter !== PDFName.of('Standard') || v !== 5 || r !== 6) {
    throw new ProcessorError(
      'unsupported_encryption',
      'This file uses an older encryption scheme (not AES-256 / revision 6) that this tool does not support yet.',
    );
  }

  const entries = {
    u: requiredBytes(encryptDict, 'U'),
    ue: requiredBytes(encryptDict, 'UE'),
    o: requiredBytes(encryptDict, 'O'),
    oe: requiredBytes(encryptDict, 'OE'),
  };

  context.on_progress?.({ ratio: 0.2, label: 'Checking the password' });
  let fileKey: Uint8Array;
  try {
    fileKey = await recoverFileKey(password, entries);
  } catch {
    throw new ProcessorError('wrong_password', 'That password is not correct for this file.');
  }

  // The /Encrypt dictionary's own O/U/OE/UE/Perms entries are raw key-wrapping material, not
  // object-content ciphertext — walking it too would try to AES-CBC-decrypt bytes that were
  // never encrypted that way, reliably throwing a padding error. It has to come out of the
  // object graph before the walk runs, not just be unlinked from the trailer afterwards
  // (`enumerateIndirectObjects()` doesn't consult the trailer either way).
  pdfDoc.context.trailerInfo.Encrypt = undefined;
  if (encryptRef instanceof PDFRef) pdfDoc.context.delete(encryptRef);

  context.on_progress?.({ ratio: 0.4, label: 'Decrypting the document' });
  await transformDocumentStrings(pdfDoc.context, (data) => decryptObjectData(fileKey, data));

  context.on_progress?.({ ratio: 0.9, label: 'Saving' });
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-unlocked.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default unlockPdf;
