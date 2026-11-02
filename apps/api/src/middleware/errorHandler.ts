import type { ErrorRequestHandler } from 'express';
import { ErrorsMap } from './errors.js';
import type { ErrorsKeyType } from './errors.js';
import type { DetailType, ErrorBodyType } from './_types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorCode(value: unknown): value is ErrorsKeyType {
  return typeof value === 'string' && Object.hasOwn(ErrorsMap, value);
}

function isDetail(value: unknown): value is DetailType {
  return isRecord(value) && typeof value.field === 'string' && typeof value.message === 'string';
}

// Известные ошибки передаются как { code: Errors.VALIDATION_ERROR, details: [...] }.
const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  let code: ErrorsKeyType = 'INTERNAL_ERROR';
  let details: DetailType[] = [];

  if (isRecord(err)) {
    if (err.type === 'entity.parse.failed' && err.status === 400) {
      code = 'INVALID_JSON';
    } else if (isErrorCode(err.code)) {
      code = err.code;
      if (code !== 'INTERNAL_ERROR' && Array.isArray(err.details)) {
        details = err.details.filter(isDetail).map(({ field, message }) => ({ field, message }));
      }
    }
  }

  const definition = ErrorsMap[code];
  const error: ErrorBodyType = { message: definition.message, details, code };
  res.status(definition.status).json({ error });
};

export default errorHandler;
