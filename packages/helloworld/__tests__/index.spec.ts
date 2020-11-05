import { helloworld } from '../src';

describe('a fake test', () => {
  it('is a function', () => {
    expect(typeof helloworld).toBe('function');
  });
});
