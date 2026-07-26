// Parses a date substring already isolated by DATE_RE in parser.js (e.g.
// "12/25/2024", "Dec 25, 2024", "25 Dec 2024") into an ISO yyyy-mm-dd
// string, or null if it doesn't resolve to a real calendar date. Mirrors
// dateutil.parser.parse(fuzzy=True, dayfirst=False)'s behavior for the
// ambiguous-numeric-date case (month assumed first unless that reading is
// invalid, in which case day/month are swapped) since we only ever feed it
// an already-isolated candidate substring, not a whole line.

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function expandTwoDigitYear(year) {
  if (year >= 100) return year;
  return year + (year <= 68 ? 2000 : 1900);
}

function toIsoIfValid(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Catches invalid combinations like Feb 30 (JS Date auto-rolls them over
  // into the next month, so a mismatch here means it wasn't a real date).
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseNumericDate(str) {
  const parts = str.split(/[/\-.]/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map((p) => parseInt(p, 10));
  const lens = parts.map((p) => p.length);
  if ([a, b, c].some(Number.isNaN)) return null;

  let year;
  let month;
  let day;
  if (lens[0] === 4) {
    // yyyy-mm-dd style
    year = a; month = b; day = c;
  } else if (lens[2] === 4) {
    // mm/dd/yyyy style (dayfirst=False: first of the remaining two is the month)
    year = c; month = a; day = b;
  } else {
    // no 4-digit part — treat the last as a 2-digit year
    year = expandTwoDigitYear(c); month = a; day = b;
  }
  if (lens[0] !== 4) year = expandTwoDigitYear(year);

  // If the assumed month is out of range but swapping with day would fix
  // it, this wasn't month-first after all (e.g. "25/12/2024").
  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  }
  return toIsoIfValid(year, month, day);
}

function parseMonthNameFirst(str) {
  const match = str.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (!match) return null;
  const month = MONTH_NAMES[match[1].toLowerCase()];
  if (!month) return null;
  const day = parseInt(match[2], 10);
  const year = expandTwoDigitYear(parseInt(match[3], 10));
  return toIsoIfValid(year, month, day);
}

function parseDayMonthNameFirst(str) {
  const match = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTH_NAMES[match[2].toLowerCase()];
  if (!month) return null;
  const year = expandTwoDigitYear(parseInt(match[3], 10));
  return toIsoIfValid(year, month, day);
}

/** Parses an already-isolated date-like substring into an ISO date string,
 * or null if it can't be resolved to a real calendar date. */
export function parseDateFragment(fragment) {
  const trimmed = fragment.trim();
  return (
    parseNumericDate(trimmed) || parseMonthNameFirst(trimmed) || parseDayMonthNameFirst(trimmed) || null
  );
}
