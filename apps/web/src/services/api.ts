import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import type { MonthPlan } from "../features/plan/_types"

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
  endpoints: (build) => ({
    getMonthPlan: build.query<MonthPlan, string>({
      query: (month) => `months/${month}`
    })
  })
})


export const { useGetMonthPlanQuery } = api