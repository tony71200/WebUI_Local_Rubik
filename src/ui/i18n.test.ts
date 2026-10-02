import { expect, it } from 'vitest';
import { DICTS, translate } from './i18n.ts';

it('has the same keys in every language, none empty', () => {
  const vi = Object.keys(DICTS.vi).sort();
  expect(Object.keys(DICTS.en).sort()).toEqual(vi);
  for (const dict of Object.values(DICTS)) for (const v of Object.values(dict)) expect(v.trim()).not.toBe('');
});

it('fills variables and falls back to the key', () => {
  expect(translate({ a: 'Xoay lớp {name}' }, 'a', { name: 'U' })).toBe('Xoay lớp U');
  expect(translate({ a: 'x {missing}' }, 'a')).toBe('x {missing}');
  expect(translate({}, 'no.such.key')).toBe('no.such.key');
});
