import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

// Express 4 recognizes 4-arg functions as error handlers — the `_next` is required.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, detail: err.detail });
    return;
  }
  // Prisma "not found" maps to 404
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
    res.status(404).json({ error: 'not found' });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'internal' });
}
