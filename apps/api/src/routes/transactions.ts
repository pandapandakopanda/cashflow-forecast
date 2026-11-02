import { Router } from 'express'
import type { Storage } from '../storage'

export function createTransactionsRouter(storage: Storage) {
  const router = Router()

  router.post('/', (req, res) => {
    res.status(201).json(storage.createTransaction(req.body))
  })

  router.patch('/:id', (req, res) => {
    res.json(storage.updateTransaction(req.params.id, req.body))
  })

  router.delete('/:id', (req, res) => {
    storage.deleteTransaction(req.params.id)
    res.status(204).end()
  })

  return router
}
