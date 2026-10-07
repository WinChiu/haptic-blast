/// <reference types="node" />
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RouteError, fetchRoute } from '../util/routing';

const from = { latitude: 59.346856, longitude: 18.072164 };
const to = { latitude: 59.347535, longitude: 18.073884 };
const realFetch = globalThis.fetch;

// Replace fetch for one test; `reply` returns a Response or throws
function mockFetch(reply: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (url: any) => reply(String(url))) as typeof fetch;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function failure(): Promise<RouteError> {
  try {
    await fetchRoute(from, to);
  } catch (e) {
    assert.ok(e instanceof RouteError, `not a RouteError: ${e}`);
    return e;
  }
  assert.fail('expected fetchRoute to throw');
}

test('success: flips [lng, lat] pairs into {latitude, longitude}', async () => {
  mockFetch(() =>
    json({ paths: [{ points: { coordinates: [[18.07, 59.34], [18.08, 59.35]] } }] })
  );
  assert.deepEqual(await fetchRoute(from, to), [
    { latitude: 59.34, longitude: 18.07 },
    { latitude: 59.35, longitude: 18.08 },
  ]);
});

test('asks for a foot route with both points and unencoded geometry', async () => {
  let requested = '';
  mockFetch((url) => {
    requested = url;
    return json({ paths: [{ points: { coordinates: [[18, 59]] } }] });
  });
  await fetchRoute(from, to);
  assert.ok(requested.includes('point=59.346856,18.072164'));
  assert.ok(requested.includes('point=59.347535,18.073884'));
  assert.ok(requested.includes('profile=foot'));
  assert.ok(requested.includes('points_encoded=false'));
});

test('a point outside the map is out-of-area and not retryable', async () => {
  mockFetch(() => json({ message: 'Point 1 is out of bounds: -1.3,36.8, the bounds are: ...' }, 400));
  const e = await failure();
  assert.equal(e.kind, 'out-of-area');
  assert.equal(e.retryable, false);
});

test('a point not near a path is no-path and not retryable', async () => {
  mockFetch(() => json({ message: 'Cannot find point 1: 59.6,18.95' }, 400));
  const e = await failure();
  assert.equal(e.kind, 'no-path');
  assert.equal(e.retryable, false);
});

test('"connection not found" is no-route', async () => {
  mockFetch(() => json({ message: 'Connection between locations not found' }, 400));
  assert.equal((await failure()).kind, 'no-route');
});

test('an empty answer is no-route', async () => {
  mockFetch(() => json({ paths: [] }));
  assert.equal((await failure()).kind, 'no-route');
});

test('network failure is server-unreachable and retryable', async () => {
  mockFetch(() => {
    throw new TypeError('Network request failed');
  });
  const e = await failure();
  assert.equal(e.kind, 'server-unreachable');
  assert.equal(e.retryable, true);
});

test('an offline tunnel (404 HTML page) is server-unreachable', async () => {
  mockFetch(() => new Response('<html>ERR_NGROK_3200</html>', { status: 404 }));
  assert.equal((await failure()).kind, 'server-unreachable');
});

test('an aborted request is a retryable timeout', async () => {
  mockFetch(() => {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  });
  const e = await failure();
  assert.equal(e.kind, 'timeout');
  assert.equal(e.retryable, true);
});

test('an unknown server message is bad-response and retryable', async () => {
  mockFetch(() => json({ message: 'something unexpected' }, 500));
  const e = await failure();
  assert.equal(e.kind, 'bad-response');
  assert.equal(e.retryable, true);
});

test('the service reaching its daily limit is rate-limited, with no retry', async () => {
  mockFetch(() => json({ message: 'The route service has reached its daily limit' }, 429));
  const e = await failure();
  assert.equal(e.kind, 'rate-limited');
  assert.equal(e.retryable, false);
});

test('too many requests in a minute is rate-limited too', async () => {
  mockFetch(() => json({ message: 'Too many route requests, wait a minute' }, 429));
  assert.equal((await failure()).kind, 'rate-limited');
});

test('a bare 429 with no message is rate-limited', async () => {
  mockFetch(() => new Response('', { status: 429 }));
  assert.equal((await failure()).kind, 'rate-limited');
});

test('a route that is too long is too-far, with a clear message and no retry', async () => {
  mockFetch(() => json({ message: 'Route is too long (more than 15 km)' }, 400));
  const e = await failure();
  assert.equal(e.kind, 'too-far');
  assert.equal(e.retryable, false);
  assert.match(e.message, /too far/);
});
