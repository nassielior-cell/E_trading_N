export function getTodayDateKey() {
  return getDateKey(new Date());
}

export function formatMonthLabel(date: Date, locale = 'en') {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const firstGridDay = new Date(firstDayOfMonth);
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;

  firstGridDay.setDate(firstDayOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);

    return {
      date,
      dateKey: getDateKey(date),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}
