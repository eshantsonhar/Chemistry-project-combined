import assert from 'node:assert/strict';
import test from 'node:test';
import { getFeedbackDatabaseConfig } from '../lib/feedback-database.cjs';
import { authorizeFeedbackAdmin } from '../lib/feedback-admin-auth.cjs';
import clearFeedback from '../api/clear-feedback.js';
import getFeedback from '../api/get-feedback.js';
import submitFeedback from '../api/submit-feedback.js';

test('new Supabase secret keys are not sent as bearer JWTs', () => {
  const config = getFeedbackDatabaseConfig({
    SUPABASE_URL: 'https://project.supabase.co/',
    SUPABASE_SECRET_KEY: 'sb_secret_test'
  });

  assert.equal(config.supabaseUrl, 'https://project.supabase.co');
  assert.equal(config.headers.apikey, 'sb_secret_test');
  assert.equal(config.headers.Authorization, undefined);
});

test('legacy service-role environment variables remain supported', () => {
  const config = getFeedbackDatabaseConfig({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-jwt'
  });

  assert.equal(config.headers.apikey, 'legacy-service-role-jwt');
  assert.equal(config.headers.Authorization, 'Bearer legacy-service-role-jwt');
});

test('feedback admin authorization fails closed and compares configured tokens', () => {
  const token = 'chemistryx-admin-test-token-that-is-long-enough';

  assert.deepEqual(authorizeFeedbackAdmin({ headers: {} }, {}), {
    configured: false,
    authorized: false
  });
  assert.deepEqual(authorizeFeedbackAdmin({ headers: {} }, { FEEDBACK_ADMIN_TOKEN: token }), {
    configured: true,
    authorized: false
  });
  assert.deepEqual(
    authorizeFeedbackAdmin({ headers: { authorization: `Bearer ${token}` } }, { FEEDBACK_ADMIN_TOKEN: token }),
    { configured: true, authorized: true }
  );
  assert.deepEqual(
    authorizeFeedbackAdmin({ headers: { authorization: 'Bearer wrong-token' } }, { FEEDBACK_ADMIN_TOKEN: token }),
    { configured: true, authorized: false }
  );
  assert.deepEqual(
    authorizeFeedbackAdmin({ headers: { authorization: `Bearer ${token}` } }, { FEEDBACK_ADMIN_TOKEN: 'short' }),
    { configured: false, authorized: false }
  );
});

test('all feedback API handlers load and enforce their HTTP methods', async () => {
  for (const [handler, method] of [[submitFeedback, 'GET'], [getFeedback, 'POST'], [clearFeedback, 'POST']]) {
    const result = {};
    const res = {
      status(code) {
        result.status = code;
        return this;
      },
      json(body) {
        result.body = body;
        return body;
      }
    };

    await handler({ method }, res);
    assert.equal(result.status, 405);
  }
});

test('feedback admin endpoints reject unauthenticated requests before accessing the database', async () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FEEDBACK_ADMIN_TOKEN: process.env.FEEDBACK_ADMIN_TOKEN
  };
  const originalFetch = globalThis.fetch;
  let databaseRequests = 0;
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.FEEDBACK_ADMIN_TOKEN = 'chemistryx-admin-test-token-that-is-long-enough';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async () => {
    databaseRequests += 1;
    return { ok: true, json: async () => [], text: async () => '' };
  };

  try {
    for (const [handler, method] of [[getFeedback, 'GET'], [clearFeedback, 'DELETE']]) {
      const result = {};
      const res = {
        status(code) {
          result.status = code;
          return this;
        },
        json(body) {
          result.body = body;
          return body;
        }
      };

      await handler({ method, headers: {} }, res);
      assert.equal(result.status, 401);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(databaseRequests, 0);
});

test('feedback admin endpoints accept only the configured bearer token', async () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FEEDBACK_ADMIN_TOKEN: process.env.FEEDBACK_ADMIN_TOKEN
  };
  const originalFetch = globalThis.fetch;
  const token = 'chemistryx-admin-test-token-that-is-long-enough';
  const requests = [];
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.FEEDBACK_ADMIN_TOKEN = token;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => [], text: async () => '' };
  };

  const callHandler = async (handler, method) => {
    const result = {};
    const res = {
      status(code) {
        result.status = code;
        return this;
      },
      json(body) {
        result.body = body;
        return body;
      }
    };
    await handler({ method, headers: { authorization: `Bearer ${token}` } }, res);
    return result;
  };

  let getResult;
  let clearResult;
  try {
    getResult = await callHandler(getFeedback, 'GET');
    clearResult = await callHandler(clearFeedback, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(getResult.status, 200);
  assert.equal(clearResult.status, 200);
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    '/rest/v1/feedback',
    '/rest/v1/feedback'
  ]);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[1].options.method, 'DELETE');
});

test('feedback admin endpoints report missing token configuration without touching the database', async () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FEEDBACK_ADMIN_TOKEN: process.env.FEEDBACK_ADMIN_TOKEN
  };
  const originalFetch = globalThis.fetch;
  let databaseRequests = 0;
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.FEEDBACK_ADMIN_TOKEN;
  globalThis.fetch = async () => {
    databaseRequests += 1;
    return { ok: true, json: async () => [], text: async () => '' };
  };

  const result = {};
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return body;
    }
  };

  try {
    await getFeedback({ method: 'GET', headers: {} }, res);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.status, 503);
  assert.equal(databaseRequests, 0);
});

test('feedback submission uses normalized new-key headers and trims feedback', async () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const originalFetch = globalThis.fetch;
  let request;

  process.env.SUPABASE_URL = 'https://project.supabase.co/';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };

  const result = {};
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return body;
    }
  };

  try {
    await submitFeedback({ method: 'POST', body: { feedback: '  Test feedback  ' } }, res);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.status, 200);
  assert.equal(request.url, 'https://project.supabase.co/rest/v1/feedback');
  assert.equal(request.options.headers.apikey, 'sb_secret_test');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(JSON.parse(request.options.body).feedback, 'Test feedback');
});

test('feedback submission reports an unreachable database as a service outage', async () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  const result = {};
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return body;
    }
  };

  try {
    await submitFeedback({ method: 'POST', body: { feedback: 'Test feedback' } }, res);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.status, 503);
  assert.match(result.body.error, /SUPABASE_URL/);
});
