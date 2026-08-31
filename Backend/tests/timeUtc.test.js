// audit-backend C3 — تستات وحدة لـ utils/time.js.
//
// كلها بتشتغل تحت منطقة زمنية مفروضة (process.env.TZ) عشان تفشل حتمياً لو حد
// رجّع أي مقارنة لتوقيت السيرفر المحلي. من غير فرض المنطقة الزمنية، التستات دي
// كانت هتعدّي على أي جهاز بتوقيت UTC وهي مش بتثبت حاجة.
import { describe, it, expect, afterEach } from 'vitest';
import { yearOfUTC, startOfTodayUTC, currentYearMonthUTC, utcDayRange } from '../utils/time.js';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => { process.env.TZ = ORIGINAL_TZ; });

describe('utils/time — yearOfUTC', () => {
  it('reads the year of a UTC-midnight date the same in every timezone', () => {
    // القيمة زي ما بتوصل من <input type="date"> بالظبط
    for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      // أول يناير — الحالة اللي بتتكسر على سيرفر بتوقيت سالب
      expect(yearOfUTC('2010-01-01'), `Jan 1 in ${tz}`).toBe(2010);
      // آخر ديسمبر — الحالة المقابلة على سيرفر بتوقيت موجب
      expect(yearOfUTC('2010-12-31'), `Dec 31 in ${tz}`).toBe(2010);
      // ونفس الكلام على كائن Date مش نص
      expect(yearOfUTC(new Date('2010-01-01T00:00:00.000Z')), `Date obj in ${tz}`).toBe(2010);
    }
  });
});

describe('utils/time — startOfTodayUTC', () => {
  it('lands on UTC midnight, not local midnight', () => {
    const at = new Date('2026-08-31T23:59:59.999Z');
    for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York']) {
      process.env.TZ = tz;
      expect(new Date(startOfTodayUTC(at)).toISOString(), tz).toBe('2026-08-31T00:00:00.000Z');
    }
  });
});

describe('utils/time — utcDayRange', () => {
  it('brackets the UTC day containing the date, half-open, in every timezone', () => {
    for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      const { start, end } = utcDayRange('2026-06-16T00:00:00.000Z');
      expect(start.toISOString(), tz).toBe('2026-06-16T00:00:00.000Z');
      expect(end.toISOString(), tz).toBe('2026-06-17T00:00:00.000Z');
      // النطاق نصف مفتوح: بداية اليوم جوّه، بداية اليوم اللي بعده برّه
      expect(start.getTime() <= Date.parse('2026-06-16T00:00:00.000Z')).toBe(true);
      expect(end.getTime() > Date.parse('2026-06-16T23:59:59.999Z')).toBe(true);
    }
  });

  it('keeps a UTC-midnight matchDate inside its own day at both edges of the day', () => {
    // ده اللي كان بيقع: matchDate منتصف ليل UTC + نافذة يوم محلي = آخر/أول ساعات
    // يوم المباراة الحقيقي بتخرج برّه النافذة بمقدار فرق التوقيت.
    const matchDate = '2026-06-16T00:00:00.000Z';
    for (const tz of ['Asia/Riyadh', 'America/New_York']) {
      process.env.TZ = tz;
      const { start, end } = utcDayRange(matchDate);
      for (const instant of ['2026-06-16T00:00:00.000Z', '2026-06-16T12:00:00.000Z', '2026-06-16T23:59:59.999Z']) {
        const t = Date.parse(instant);
        expect(t >= start.getTime() && t < end.getTime(), `${instant} in ${tz}`).toBe(true);
      }
      // وبرّه اليوم فعلاً برّه
      expect(Date.parse('2026-06-15T23:59:59.999Z') >= start.getTime(), tz).toBe(false);
      expect(Date.parse('2026-06-17T00:00:00.000Z') < end.getTime(), tz).toBe(false);
    }
  });
});

describe('utils/time — currentYearMonthUTC', () => {
  it('returns a 1-based month straight from UTC', () => {
    process.env.TZ = 'America/New_York';
    expect(currentYearMonthUTC(new Date('2026-09-01T00:00:00.000Z'))).toEqual({ year: 2026, month: 9 });
    process.env.TZ = 'Asia/Riyadh';
    expect(currentYearMonthUTC(new Date('2026-08-31T23:59:59.999Z'))).toEqual({ year: 2026, month: 8 });
  });
});
