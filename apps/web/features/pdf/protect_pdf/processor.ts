import { PDFDocument, PDFHexString } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import {
  PERMISSIONS_ALLOW_ALL,
  bytesToHex,
  computePasswordEntries,
  encryptObjectData,
  randomBytes,
} from '@/lib/pdf/pdf_crypto';
import { transformDocumentStrings } from '@/lib/pdf/pdf_object_crypt';

export interface ProtectPdfOptions {
  password?: string;
}

/**
 * Encrypts a plain PDF with a password using the Standard Security Handler revision 6
 * (AES-256) — see `lib/pdf/pdf_crypto.ts` for the algorithm and why it is implemented by hand
 * rather than via pdf-lib, which cannot write (or read) PDF encryption at all. The same
 * password is used as both the user and owner password; this tool does not distinguish
 * "can open" from "can also change permissions".
 *
 * Saved with `useObjectStreams: false` — Unlock PDF cannot yet see through a compressed
 * cross-reference/object stream while the file is still encrypted (decompressing one needs the
 * file key first, which needs the password, which is a chicken-and-egg pdf-lib's loader cannot
 * resolve on its own), so every file this tool produces sticks to the classic xref table that
 * both this tool and any standard-compliant reader can always parse.
 */
const protectPdf: ToolProcessor<ProtectPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to protect.');

  const password = input.options.password?.trim();
  if (!password) throw new ProcessorError('missing_password', 'Enter a password.');

  context.on_progress?.({ ratio: 0.05, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  if (pdfDoc.isEncrypted) {
    throw new ProcessorError(
      'already_protected',
      'This PDF already has a password — unlock it first.',
    );
  }

  const fileKey = randomBytes(32);

  context.on_progress?.({ ratio: 0.2, label: 'Encrypting the document' });
  await transformDocumentStrings(pdfDoc.context, (data) => encryptObjectData(fileKey, data));

  context.on_progress?.({ ratio: 0.75, label: 'Setting the password' });
  const entries = await computePasswordEntries(password, fileKey, PERMISSIONS_ALLOW_ALL);

  const encryptDict = pdfDoc.context.obj({
    Filter: 'Standard',
    V: 5,
    R: 6,
    Length: 256,
    CF: { StdCF: { CFM: 'AESV3', AuthEvent: 'DocOpen', Length: 32 } },
    StmF: 'StdCF',
    StrF: 'StdCF',
    O: PDFHexString.of(bytesToHex(entries.o)),
    U: PDFHexString.of(bytesToHex(entries.u)),
    OE: PDFHexString.of(bytesToHex(entries.oe)),
    UE: PDFHexString.of(bytesToHex(entries.ue)),
    P: PERMISSIONS_ALLOW_ALL,
    Perms: PDFHexString.of(bytesToHex(entries.perms)),
    EncryptMetadata: true,
  });
  pdfDoc.context.trailerInfo.Encrypt = pdfDoc.context.register(encryptDict);

  context.on_progress?.({ ratio: 0.95, label: 'Saving' });
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-protected.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default protectPdf;
