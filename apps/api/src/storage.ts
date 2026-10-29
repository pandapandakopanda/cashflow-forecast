import {randomUUID} from 'node:crypto'
import {db} from './db.js'


import type { NewTransaction, Transaction } from './_types.js'


export function createTransaction(data:NewTransaction):Transaction{
  const transaction = {
    ...data,
    id:randomUUID()
  }

  const statment = db.prepare(`
    INSERT INTO transactions (id, title, type, amountCents, date)
    VALUES (@id, @title, @type, @amountCents, @date)
  `)

  statment.run(transaction)

  return transaction
}