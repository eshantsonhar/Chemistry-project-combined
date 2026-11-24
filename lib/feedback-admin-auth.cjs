const { createHash, timingSafeEqual } = require('node:crypto');

function authorizeFeedbackAdmin(req, env = process.env) {
  const expectedToken = env.FEEDBACK_ADMIN_TOKEN;
  if (typeof expectedToken !== 'string' || expectedToken.length < 32) {
    return { configured: false, authorized: false };
  }

  const authorization = req.headers?.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  const suppliedToken = match?.[1]?.trim();
  if (!suppliedToken) {
    return { configured: true, authorized: false };
  }

  const expectedDigest = createHash('sha256').update(expectedToken).digest();
  const suppliedDigest = createHash('sha256').update(suppliedToken).digest();
  return {
    configured: true,
    authorized: timingSafeEqual(expectedDigest, suppliedDigest)
  };
}

exports.authorizeFeedbackAdmin = authorizeFeedbackAdmin;