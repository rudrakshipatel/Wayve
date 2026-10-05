/** Error surfaced to UI code with a stable, user-presentable message. */
export class WaveApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = "WaveApiError";
    this.code = code;
    this.status = status;
  }
}

export const isWaveApiError = (e: unknown): e is WaveApiError => e instanceof WaveApiError;
