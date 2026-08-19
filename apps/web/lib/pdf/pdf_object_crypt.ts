import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFString,
  type PDFContext,
} from 'pdf-lib';
import { bytesToHex } from './pdf_crypto';

type Transform = (data: Uint8Array) => Promise<Uint8Array>;

/**
 * Walks a document's whole object graph and runs `transform` over every string and stream's
 * raw bytes — the shared traversal both Protect PDF (encrypt) and Unlock PDF (decrypt) drive
 * with opposite transforms. Only *direct* nested dicts/arrays are recursed into; a `PDFRef`
 * child is left alone, since it is a separate indirect object that `context.enumerateIndirectObjects()`
 * already visits on its own. Every transformed string is written back as a `PDFHexString`
 * regardless of its original encoding — ciphertext is arbitrary binary, and hex strings can
 * represent any byte sequence without the escaping a literal `PDFString` would need.
 */
export async function transformDocumentStrings(
  context: PDFContext,
  transform: Transform,
): Promise<void> {
  const visited = new Set<PDFObject>();

  async function walk(container: PDFDict | PDFArray): Promise<void> {
    if (visited.has(container)) return;
    visited.add(container);

    if (container instanceof PDFDict) {
      for (const [key, value] of container.entries()) {
        if (value instanceof PDFString || value instanceof PDFHexString) {
          const encrypted = await transform(value.asBytes());
          container.set(key, PDFHexString.of(bytesToHex(encrypted)));
        } else if (value instanceof PDFDict || value instanceof PDFArray) {
          await walk(value);
        }
      }
    } else {
      for (let i = 0; i < container.size(); i += 1) {
        const value = container.get(i);
        if (value instanceof PDFString || value instanceof PDFHexString) {
          const encrypted = await transform(value.asBytes());
          container.set(i, PDFHexString.of(bytesToHex(encrypted)));
        } else if (value instanceof PDFDict || value instanceof PDFArray) {
          await walk(value);
        }
      }
    }
  }

  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      const encrypted = await transform(object.getContents());
      object.dict.set(PDFName.of('Length'), PDFNumber.of(encrypted.length));
      context.assign(ref, PDFRawStream.of(object.dict, encrypted));
      await walk(object.dict);
    } else if (object instanceof PDFString || object instanceof PDFHexString) {
      const encrypted = await transform(object.asBytes());
      context.assign(ref, PDFHexString.of(bytesToHex(encrypted)));
    } else if (object instanceof PDFDict || object instanceof PDFArray) {
      await walk(object);
    }
  }
}
