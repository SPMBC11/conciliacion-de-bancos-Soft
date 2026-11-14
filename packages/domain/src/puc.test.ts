import { expect, it } from 'vitest';
import { defaultNature, pucLevel, pucParent } from './puc.js';

it('nivel según la longitud del código', () => {
  expect(['1', '11', '1110', '111005', '11100501'].map(pucLevel)).toEqual([1, 2, 3, 4, 5]);
  expect(() => pucLevel('111')).toThrow('Longitud');
  expect(() => pucLevel('11A0')).toThrow('inválido');
});

it('naturaleza por clase', () => {
  expect(defaultNature('111005')).toBe('DEBITO');
  expect(defaultNature('240805')).toBe('CREDITO');
  expect(defaultNature('421005')).toBe('CREDITO');
  expect(defaultNature('530515')).toBe('DEBITO');
});

it('padre inmediato', () => {
  expect(['1', '11', '1110', '111005', '11100501'].map(pucParent)).toEqual([
    null,
    '1',
    '11',
    '1110',
    '111005',
  ]);
});
