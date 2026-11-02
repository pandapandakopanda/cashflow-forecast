import { Router } from 'express'
import type { Storage } from '../storage'

export function createRecurringRulesRouter(storage: Storage) {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({ items: storage.getRecurringRules() })
  })

  router.post('/', (req, res) => {
    res.status(201).json(storage.createRecurringRule(req.body))
  })

  router.patch('/:id', (req, res) => {
    res.json(storage.updateRecurringRule(req.params.id, req.body))
  })

  router.delete('/:id', (req, res) => {
    storage.deleteRecurringRule(req.params.id)
    res.status(204).end()
  })

  router.put('/:id/exceptions/:month', (req, res) => {
    res.json(storage.setRecurringException(req.params.id, req.params.month, req.body))
  })

  router.delete('/:id/exceptions/:month', (req, res) => {
    storage.deleteRecurringException(req.params.id, req.params.month)
    res.status(204).end()
  })

  return router
}
