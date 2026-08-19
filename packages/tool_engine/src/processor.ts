export interface ProcessorInput<TOptions = Record<string, unknown>> {
  files: readonly File[];
  text?: string;
  options: TOptions;
}

export interface ProcessorArtifact {
  file_name: string;
  mime_type: string;
  blob: Blob;
}

export interface ProcessorOutput {
  artifacts: ProcessorArtifact[];
  text?: string;
}

export interface ProcessorProgress {
  /** 0 to 1, or undefined when the step cannot report a ratio. */
  ratio?: number;
  label?: string;
}

export interface ProcessorContext {
  signal: AbortSignal;
  on_progress?: (progress: ProcessorProgress) => void;
}

/**
 * The contract every tool implementation satisfies. Implementations live in
 * `apps/web/features/<category>/` and are loaded lazily by processor id.
 */
export type ToolProcessor<TOptions = Record<string, unknown>> = (
  input: ProcessorInput<TOptions>,
  context: ProcessorContext,
) => Promise<ProcessorOutput>;

export class ProcessorError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProcessorError';
    this.code = code;
  }
}
