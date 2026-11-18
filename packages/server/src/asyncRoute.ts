import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express route handler so a rejection reaches Express's
 * error handling (jsonErrorHandler below) instead of hanging the request.
 * Express 4 doesn't do this itself: an async handler's rejected promise
 * becomes an unhandled rejection, which crashes the whole Node process —
 * every game's live sockets with it. Every async route must use this.
 */
export function asyncRoute<Req extends Request = Request>(handler: (req: Req, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req as Req, res, next).catch(next);
  };
}

/** Mounted last in createApp — answers any route error with this codebase's usual `{ ok: false, error }` JSON shape. */
export const jsonErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  console.error(`[http] ${req.method} ${req.originalUrl} failed:`, error);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
