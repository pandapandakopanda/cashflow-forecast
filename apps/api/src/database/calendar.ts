export function getDaysInMonth(month: string): number {

  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))

  const leapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

  const days = [
    31, leapYear ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31,
  ]
  return days[monthNumber - 1]!
}
