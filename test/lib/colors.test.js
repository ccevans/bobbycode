// test/lib/colors.test.js
import { jest } from '@jest/globals';
import { success, error, warn, info, bold, dim } from '../../lib/colors.js';

describe('colors', () => {
  test('success logs to console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    success('test message');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('test message');
    spy.mockRestore();
  });

  test('error logs to stderr', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    error('test error');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('test error');
    spy.mockRestore();
  });

  test('warn logs to console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warn('test warning');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('test warning');
    spy.mockRestore();
  });

  test('info logs to console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    info('test info');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('bold is a function', () => {
    expect(typeof bold).toBe('function');
    expect(bold('text')).toContain('text');
  });

  test('dim is a function', () => {
    expect(typeof dim).toBe('function');
    expect(dim('text')).toContain('text');
  });
});
