export enum Errors {
  INVALID_MONTH = 'INVALID_MONTH',
  INVALID_JSON = 'INVALID_JSON',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  REVISION_CONFLICT = 'REVISION_CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export type ErrorsKeyType = keyof typeof Errors;

import type { ErrorDefinitionType } from './_types';

export const ErrorsMap: Record<ErrorsKeyType, ErrorDefinitionType> = {
  [Errors.INVALID_MONTH]: { status: 400, message: 'Неверный сегмент месяца в URL' },
  [Errors.INVALID_JSON]: { status: 400, message: 'Не удалось разобрать тело JSON' },
  [Errors.VALIDATION_ERROR]: {
    status: 422,
    message: 'Некорректные поля, даты, суммы, ID/дубликаты внутри пакета',
  },
  [Errors.NOT_FOUND]: { status: 404, message: 'Не существует указанный ID операции/правила' },
  [Errors.REVISION_CONFLICT]: {
    status: 409,
    message: 'Финансовый план изменился. Обновите данные и создайте эксперимент заново.',
  },
  [Errors.INTERNAL_ERROR]: { status: 500, message: 'Непредвиденная ошибка' },
};
