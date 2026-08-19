import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  type PDFForm,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export interface PdfFormsOptions {
  /** Field name -> the value to set. Text fields take a string, checkboxes a boolean,
   * radio/dropdown/option-list a string or string[]. */
  values?: Record<string, string | string[] | boolean>;
  flatten?: boolean;
}

/** Fills existing AcroForm fields with pdf-lib's typed field API. Unknown field names in
 * `values` (a field the document does not have) are ignored rather than failing the whole
 * document — callers only ever send names read from this same file, but a stale client
 * state should not turn into a hard error. Shared between the real processor run and the
 * workspace's live preview so both fill fields the same way. */
export function fillFormFields(
  form: PDFForm,
  values: Record<string, string | string[] | boolean>,
): number {
  let filled = 0;
  for (const [name, value] of Object.entries(values)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      continue;
    }

    if (field instanceof PDFTextField) {
      field.setText(typeof value === 'string' ? value : String(value ?? ''));
      filled += 1;
    } else if (field instanceof PDFCheckBox) {
      if (value) field.check();
      else field.uncheck();
      filled += 1;
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string' && value) {
        field.select(value);
        filled += 1;
      }
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const selection = Array.isArray(value)
        ? value
        : typeof value === 'string' && value
          ? [value]
          : [];
      if (selection.length > 0) {
        field.select(selection);
        filled += 1;
      }
    }
  }
  return filled;
}

const pdfForms: ToolProcessor<PdfFormsOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF with form fields.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const source = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const pdfDoc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const form = pdfDoc.getForm();
  const values = input.options.values ?? {};

  context.on_progress?.({ ratio: 0.4, label: 'Filling fields' });
  const filled = fillFormFields(form, values);

  if (input.options.flatten) form.flatten();

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const stem = replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '');

  return {
    artifacts: [
      {
        file_name: `${stem}-filled.pdf`,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
    text: String(filled),
  };
};

export default pdfForms;
