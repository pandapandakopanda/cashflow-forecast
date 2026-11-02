import { Router } from 'express'
import type { Storage } from '../../storage'

export function createMonthRouter(storage: Storage) {
  const router = Router()

  router.get('/:month', (req, res) => {
    res.json(storage.getMonthPlan(req.params.month))
  })

  router.put('/:month/opening-balance', (req, res) => {
    res.json(storage.setOpeningBalance(req.params.month, req.body))
  })

  router.post('/:month/apply-scenario', (req, res) => {
    res.json(storage.applyScenario(req.params.month, req.body))
  })

  return router
}
