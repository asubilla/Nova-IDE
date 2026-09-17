import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatFileSize, formatDate, formatTokenCount, formatDuration } from '../../utils/format';
import { debounce, throttle } from '../../utils/debounce';

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('formats terabytes', () => {
    expect(formatFileSize(1099511627776)).toBe('1 TB');
  });
});

describe('formatDate', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = Date.now();
    expect(formatDate(now)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = Date.now() - 5 * 60000;
    expect(formatDate(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const threeHoursAgo = Date.now() - 3 * 3600000;
    expect(formatDate(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const twoDaysAgo = Date.now() - 2 * 86400000;
    expect(formatDate(twoDaysAgo)).toBe('2d ago');
  });
});

describe('formatTokenCount', () => {
  it('formats small numbers without suffix', () => {
    expect(formatTokenCount(500)).toBe('500');
  });

  it('formats thousands with K suffix', () => {
    expect(formatTokenCount(1500)).toBe('1.5K');
    expect(formatTokenCount(10000)).toBe('10.0K');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1.00M');
    expect(formatTokenCount(2500000)).toBe('2.50M');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets delay on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('limits function calls to once per limit period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes the last arguments when trailing call fires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('second');
    throttled('third');

    expect(fn).toHaveBeenCalledWith('first');
    expect(fn).not.toHaveBeenCalledWith('second');
    expect(fn).not.toHaveBeenCalledWith('third');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('third');
  });
});
