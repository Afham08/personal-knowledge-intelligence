export type Passage = { id: string; text: string };
export type AnalysisInput = { title: string; goal: string; passages: Passage[] };
export type AiModel = { name: string; revision: string };

export type AnalysisRetry = 'evidence' | 'format';

export interface AiProvider {
  id: string;
  listModels(signal?: AbortSignal): Promise<AiModel[]>;
  generate(model: AiModel, input: AnalysisInput, signal: AbortSignal, retry?: AnalysisRetry): Promise<unknown>;
}

type AiErrorCode = 'connection' | 'timeout' | 'cancelled' | 'model' | 'invalid' | 'evidence' | 'busy' | 'permission';

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AiError';
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AiError('cancelled', 'Analysis cancelled.');
}
