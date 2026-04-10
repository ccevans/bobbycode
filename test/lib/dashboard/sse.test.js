// test/lib/dashboard/sse.test.js
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { SSEHub } from '../../../lib/dashboard/sse.js';

function fakeRes() {
  const res = new EventEmitter();
  res.writeHead = jest.fn();
  res.write = jest.fn(() => true);
  res.end = jest.fn();
  return res;
}

describe('SSEHub', () => {
  test('connect writes SSE headers and priming comment', () => {
    const hub = new SSEHub();
    const res = fakeRes();
    hub.connect('ch', res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining(': connected'));
  });

  test('broadcast sends JSON data to all clients on a channel', () => {
    const hub = new SSEHub();
    const a = fakeRes();
    const b = fakeRes();
    hub.connect('ch', a);
    hub.connect('ch', b);
    hub.broadcast('ch', { hello: 'world' });
    const lastA = a.write.mock.calls[a.write.mock.calls.length - 1][0];
    const lastB = b.write.mock.calls[b.write.mock.calls.length - 1][0];
    expect(lastA).toContain('data: {"hello":"world"}');
    expect(lastB).toContain('data: {"hello":"world"}');
  });

  test('broadcast with event name includes event: line', () => {
    const hub = new SSEHub();
    const res = fakeRes();
    hub.connect('ch', res);
    hub.broadcast('ch', { x: 1 }, 'update');
    const last = res.write.mock.calls[res.write.mock.calls.length - 1][0];
    expect(last).toContain('event: update');
    expect(last).toContain('data: {"x":1}');
  });

  test('broadcast to empty channel is a no-op', () => {
    const hub = new SSEHub();
    expect(() => hub.broadcast('nobody', { x: 1 })).not.toThrow();
  });

  test('client cleanup on close removes them from the channel', () => {
    const hub = new SSEHub();
    const res = fakeRes();
    hub.connect('ch', res);
    res.emit('close');
    expect(hub.channels.has('ch')).toBe(false);
  });

  test('broadcast survives a client that throws on write', () => {
    const hub = new SSEHub();
    const good = fakeRes();
    const bad = fakeRes();
    bad.write = jest.fn(() => { throw new Error('broken pipe'); });
    hub.connect('ch', good);
    hub.connect('ch', bad);
    expect(() => hub.broadcast('ch', { x: 1 })).not.toThrow();
    const last = good.write.mock.calls[good.write.mock.calls.length - 1][0];
    expect(last).toContain('data: {"x":1}');
  });

  test('closeAll channel ends all connections in that channel', () => {
    const hub = new SSEHub();
    const a = fakeRes();
    const b = fakeRes();
    hub.connect('ch', a);
    hub.connect('other', b);
    hub.closeAll('ch');
    expect(a.end).toHaveBeenCalled();
    expect(b.end).not.toHaveBeenCalled();
    expect(hub.channels.has('ch')).toBe(false);
    expect(hub.channels.has('other')).toBe(true);
  });

  test('closeAll without channel closes everything', () => {
    const hub = new SSEHub();
    const a = fakeRes();
    const b = fakeRes();
    hub.connect('x', a);
    hub.connect('y', b);
    hub.closeAll();
    expect(a.end).toHaveBeenCalled();
    expect(b.end).toHaveBeenCalled();
    expect(hub.channels.size).toBe(0);
  });
});
