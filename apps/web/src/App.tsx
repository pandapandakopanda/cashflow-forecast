import MonthPlanPreview from './features/plan/MonthPlanPreview'

export default function App() {

  return (
    <div className="flex w-full h-dvh">
      <div className="text-h1 font-medium w-full h-full bg-page-bg text-text-main">
        <MonthPlanPreview />
      </div>
    </div>
  )
}
