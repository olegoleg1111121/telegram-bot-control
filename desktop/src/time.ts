export function isoDay(date: Date, zone: string): string {
  const p = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) => p.find((x) => x.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function midnight(day: string, zone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  const target = Date.UTC(year, month - 1, date);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(guess);
    const n = (type: string) => Number(p.find((x) => x.type === type)!.value);
    guess +=
      target - Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  }
  return guess / 1000;
}

export function periodWindow(range: string, from: string, to: string, zone: string) {
  const now = Date.now() / 1000;
  let since =
    range === 'today' ? midnight(isoDay(new Date(), zone), zone) : now - Number(range) * 86400;
  let until = now + 1;
  if (range === 'custom') {
    since = midnight(from, zone);
    const next = new Date(to + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    until = midnight(next.toISOString().slice(0, 10), zone);
  }
  return { since, until };
}
