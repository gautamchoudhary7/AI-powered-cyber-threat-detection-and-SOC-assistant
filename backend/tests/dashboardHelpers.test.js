const { ALLOWED_RANGES, rangeStart, fillDailySeries, topCategories } = require('../src/utils/dashboardHelpers');

const NOW = new Date('2026-10-31T23:30:00Z'); // late in the day on purpose

describe('rangeStart', () => {
  it('counts today as one of the days', () => {
    expect(rangeStart(1, NOW).toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(rangeStart(7, NOW).toISOString()).toBe('2026-10-25T00:00:00.000Z');
  });
});

describe('fillDailySeries', () => {
  it('returns one entry per day, oldest first, with zeros for quiet days', () => {
    const series = fillDailySeries([{ _id: '2026-10-30', total: 4, high: 1 }, { _id: '2026-10-31', total: 2, high: 2 }], 3, NOW);
    expect(series).toEqual([
      { date: '2026-10-29', total: 0, high: 0 },
      { date: '2026-10-30', total: 4, high: 1 },
      { date: '2026-10-31', total: 2, high: 2 },
    ]);
  });

  it('ignores rows outside the window and handles no data at all', () => {
    expect(fillDailySeries([{ _id: '2026-01-01', total: 9, high: 9 }], 2, NOW)).toEqual([
      { date: '2026-10-30', total: 0, high: 0 },
      { date: '2026-10-31', total: 0, high: 0 },
    ]);
    expect(fillDailySeries(undefined, 7, NOW).length).toBe(7);
  });

  it('crosses month and year boundaries correctly', () => {
    const series = fillDailySeries([], 3, new Date('2027-01-01T05:00:00Z'));
    expect(series.map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('supports every allowed range', () => {
    for (const days of ALLOWED_RANGES) expect(fillDailySeries([], days, NOW).length).toBe(days);
  });
});

describe('topCategories', () => {
  it('sorts by count and keeps empty categories visible as Uncategorised', () => {
    const out = topCategories([{ _id: 'DoS', count: 5 }, { _id: null, count: 7 }, { _id: 'Worms', count: 1 }]);
    expect(out).toEqual([
      { category: 'Uncategorised', count: 7 },
      { category: 'DoS', count: 5 },
      { category: 'Worms', count: 1 },
    ]);
  });

  it('folds the long tail into Other without losing any counts', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({ _id: name, count: 10 - i }));
    const out = topCategories(rows, 3);
    expect(out.map((c) => c.category)).toEqual(['a', 'b', 'c', 'Other']);
    expect(out[3].count).toBe(7 + 6);
    expect(out.reduce((s, c) => s + c.count, 0)).toBe(10 + 9 + 8 + 7 + 6);
  });

  it('does not add Other when everything fits', () => {
    expect(topCategories([{ _id: 'a', count: 1 }], 3).length).toBe(1);
    expect(topCategories([], 3)).toEqual([]);
  });
});
