import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildWechatUnionKey,
  exchangeWechatCode,
  getWechatConfig,
  WechatAuthError,
} from '../server/src/lib/wechatAuth';

const originalEnv = {
  enabled: process.env.WECHAT_LOGIN_ENABLED,
  appId: process.env.WECHAT_APP_ID,
  appSecret: process.env.WECHAT_APP_SECRET,
};

function setEnabledConfig() {
  process.env.WECHAT_LOGIN_ENABLED = 'true';
  process.env.WECHAT_APP_ID = 'wx_test_app';
  process.env.WECHAT_APP_SECRET = 'server-only-secret';
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function testSuccessfulExchange() {
  setEnabledConfig();
  const requestedUrls: URL[] = [];
  const responses = [
    jsonResponse({ access_token: 'temporary-access-token', openid: 'openid-1', unionid: 'union-1' }),
    jsonResponse({
      openid: 'openid-1',
      unionid: 'union-1',
      nickname: '  小象用户  ',
      headimgurl: 'http://thirdwx.qlogo.cn/avatar.jpg',
    }),
  ];
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrls.push(new URL(String(input)));
    const response = responses.shift();
    assert.ok(response, 'mock response should exist');
    return response;
  }) as typeof fetch;

  const profile = await exchangeWechatCode('one-time-code', mockFetch, 'https://wechat.test');
  assert.deepEqual(profile, {
    appId: 'wx_test_app',
    openId: 'openid-1',
    unionId: 'union-1',
    nickname: '小象用户',
    avatarUrl: 'https://thirdwx.qlogo.cn/avatar.jpg',
  });
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].pathname, '/sns/oauth2/access_token');
  assert.equal(requestedUrls[0].searchParams.get('secret'), 'server-only-secret');
  assert.equal(requestedUrls[1].pathname, '/sns/userinfo');
  assert.equal(requestedUrls[1].searchParams.get('access_token'), 'temporary-access-token');
}

async function testInvalidAndRejectedCodes() {
  setEnabledConfig();
  let calls = 0;
  const unusedFetch = (async () => {
    calls += 1;
    return jsonResponse({});
  }) as typeof fetch;
  await assert.rejects(() => exchangeWechatCode('', unusedFetch), WechatAuthError);
  assert.equal(calls, 0, 'empty code must fail before a network request');

  const rejectedFetch = (async () => jsonResponse({ errcode: 40029, errmsg: 'invalid code' })) as typeof fetch;
  await assert.rejects(
    () => exchangeWechatCode('expired-code', rejectedFetch, 'https://wechat.test'),
    (error: unknown) => error instanceof WechatAuthError && error.publicMessage.includes('失效'),
  );
}

async function testIdentityMismatch() {
  setEnabledConfig();
  const responses = [
    jsonResponse({ access_token: 'temporary-access-token', openid: 'openid-a' }),
    jsonResponse({ openid: 'openid-b', nickname: '错误用户' }),
  ];
  const mockFetch = (async () => responses.shift()!) as typeof fetch;
  await assert.rejects(
    () => exchangeWechatCode('one-time-code', mockFetch, 'https://wechat.test'),
    /does not match/,
  );
}

function testFeatureGateAndSourceGuards() {
  process.env.WECHAT_LOGIN_ENABLED = 'false';
  process.env.WECHAT_APP_ID = 'wx_test_app';
  process.env.WECHAT_APP_SECRET = 'server-only-secret';
  assert.equal(getWechatConfig().enabled, false);
  assert.equal(buildWechatUnionKey('union-1'), 'wechat:union-1');
  assert.equal(buildWechatUnionKey(''), null);

  const repoRoot = path.resolve(import.meta.dirname, '..');
  const routeSource = fs.readFileSync(path.join(repoRoot, 'server/src/routes/auth.ts'), 'utf8');
  const schemaSource = fs.readFileSync(path.join(repoRoot, 'server/prisma/schema.prisma'), 'utf8');
  const loginSource = fs.readFileSync(path.join(repoRoot, 'src/pages/Login.tsx'), 'utf8');
  assert.match(routeSource, /不能自动合并数据/);
  assert.match(routeSource, /先使用邮箱登录，再到个人信息绑定微信/);
  assert.match(routeSource, /tokenHash: hashOpaqueToken\(registrationToken\)/);
  assert.match(schemaSource, /@@unique\(\[provider, appId, openId\]\)/);
  assert.match(schemaSource, /@@unique\(\[userId, provider\]\)/);
  assert.match(loginSource, /wechatAuthService\.isAndroidNative\(\)/);
  assert.doesNotMatch(loginSource, /WECHAT_APP_SECRET/);
}

try {
  await testSuccessfulExchange();
  await testInvalidAndRejectedCodes();
  await testIdentityMismatch();
  testFeatureGateAndSourceGuards();
  console.log('wechat-auth tests passed');
} finally {
  if (originalEnv.enabled === undefined) delete process.env.WECHAT_LOGIN_ENABLED;
  else process.env.WECHAT_LOGIN_ENABLED = originalEnv.enabled;
  if (originalEnv.appId === undefined) delete process.env.WECHAT_APP_ID;
  else process.env.WECHAT_APP_ID = originalEnv.appId;
  if (originalEnv.appSecret === undefined) delete process.env.WECHAT_APP_SECRET;
  else process.env.WECHAT_APP_SECRET = originalEnv.appSecret;
}
