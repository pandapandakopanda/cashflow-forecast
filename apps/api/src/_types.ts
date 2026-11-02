export enum TransactionEnum {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export type TransactionTypeType = TransactionEnum;

export type Transaction = {
  id: string;
  title: string;
  type: TransactionTypeType;
  amountCents: number;
  date: string;
};

export type NewTransaction = Omit<Transaction, 'id'>;
