const crypto = require('crypto');

const secret = () => process.env.JWT_SECRET || process.env.AUTH_SECRET || 'bullrise-dev-secret';

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(payload, expiresInHours = 12) {
  const body = {
    ...payload,
    exp: Date.now() + expiresInHours * 60 * 60 * 1000
  };
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const content = base64url(body);
  const signature = crypto.createHmac('sha256', secret()).update(`${header}.${content}`).digest('base64url');
  return `${header}.${content}.${signature}`;
}

function verify(token) {
  const [header, content, signature] = String(token || '').split('.');
  if (!header || !content || !signature) throw new Error('Invalid token');
  const expected = crypto.createHmac('sha256', secret()).update(`${header}.${content}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(content, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Date.now()) throw new Error('Token expired');
  return payload;
}

module.exports = { sign, verify };
