import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { followRedirects, redirectOf } from './redirect.js';

const live = new Set(['dashboards/overview', 'dashboards/funnel', 'archive/cashflow', 'Big Folder/app']);
const exists = (path: string) => live.has(path);

describe('redirectOf', () => {
  test('a folder moves everything under it', () => {
    assert.equal(
      redirectOf({ 'reports/': 'dashboards/' }, 'reports/overview', exists),
      'dashboards/overview',
    );
  });

  test('an exact rule wins over its folder', () => {
    const redirects = { 'reports/': 'dashboards/', 'reports/cashflow': 'archive/cashflow' };
    assert.equal(redirectOf(redirects, 'reports/cashflow', exists), 'archive/cashflow');
    assert.equal(redirectOf(redirects, 'reports/funnel', exists), 'dashboards/funnel');
  });

  test('the longest folder wins', () => {
    const redirects = { 'old/': 'nowhere/', 'old/reports/': 'dashboards/' };
    assert.equal(redirectOf(redirects, 'old/reports/overview', exists), 'dashboards/overview');
  });

  test('a folder rule is a whole segment: reports/ is not reports-2/', () => {
    assert.equal(redirectOf({ 'reports/': 'dashboards/' }, 'reports-2/overview', exists), undefined);
  });

  test('chains are followed', () => {
    const redirects = { 'a/': 'b/', 'b/': 'dashboards/', 'x/old': 'a/overview' };
    assert.equal(redirectOf(redirects, 'x/old', exists), 'dashboards/overview');
    assert.deepEqual(followRedirects(redirects, 'x/old', exists).chain, [
      'x/old',
      'a/overview',
      'b/overview',
      'dashboards/overview',
    ]);
  });

  test('a chain stops at the first path that exists', () => {
    const redirects = { 'a/x': 'dashboards/overview', 'dashboards/overview': 'dashboards/funnel' };
    assert.equal(redirectOf(redirects, 'a/x', exists), 'dashboards/overview');
  });

  test('a loop leads nowhere', () => {
    const redirects = { a: 'b', b: 'a' };
    assert.equal(redirectOf(redirects, 'a', exists), undefined);
    assert.equal(followRedirects(redirects, 'a', exists).loop, true);
    // A folder moved into itself never repeats a path, but never ends either.
    assert.equal(followRedirects({ 'a/': 'a/b/' }, 'a/x', exists).loop, true);
  });

  test('a path that ends nowhere is not redirected', () => {
    const followed = followRedirects({ 'reports/': 'dashboards/' }, 'reports/gone', exists);
    assert.deepEqual(followed, { chain: ['reports/gone', 'dashboards/gone'], loop: false });
  });

  test('no rule, no redirect; names on Object.prototype are paths like any other', () => {
    assert.equal(redirectOf({}, 'constructor', exists), undefined);
    assert.equal(redirectOf({ 'reports/': 'dashboards/' }, 'toString', exists), undefined);
  });

  test('names with spaces', () => {
    assert.equal(redirectOf({ 'Fancy Demos/': 'Big Folder/' }, 'Fancy Demos/app', exists), 'Big Folder/app');
  });
});
