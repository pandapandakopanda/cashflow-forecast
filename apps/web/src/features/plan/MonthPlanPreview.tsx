import { useState, useCallback, type ChangeEvent, memo } from "react"
import { useGetMonthPlanQuery } from "../../services/api"

function MonthPlanPreview() {
  const [month, setMonth] = useState('2026-11')
  const { currentData, isError, isFetching, isLoading, refetch } = useGetMonthPlanQuery(month)

  const onInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value) {
      setMonth(event.target.value)
    }
  }, [])

  return (
    <div>
      <input value={month} type="month" onChange={onInputChange} id="month" />
      <p>Выбранный месяц {month}</p>
      {isLoading && (
        <p>
          Загружаем план…
        </p>
      )}
      {isFetching && !isLoading && (
        <p>
          Обновляем данные…
        </p>
      )}
      {isError && (
        <div role="alert">
          <p>
            Не удалось загрузить план.
          </p>

          <button
            type="button"
            disabled={isFetching}
            onClick={() => {
              void refetch()
            }}
          >
            Повторить
          </button>
        </div>
      )}

      {!isError && currentData && (
        <p>
          Количество операций: {currentData.operations.length}
        </p>
      )}
    </div>
  )
}

export default memo(MonthPlanPreview)