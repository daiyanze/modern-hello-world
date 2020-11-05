const execa = require('execa');
const { fuzzyMatchTarget } = require('./utils');
const args = require('minimist')(process.argv.slice(2));
const target = args._.length ? fuzzyMatchTarget(args._)[0] : 'falcon';
const formats = args.formats || args.f;
const sourceMap = args.sourcemap || args.s;

execa(
  'rollup',
  [
    '-wc',
    '--environment',
    [
      `NODE_ENV:development`,
      `TARGET:${target}`,
      formats ? `FORMATS:${formats}` : ``,
      sourceMap ? `SOURCE_MAP:true` : ``,
    ]
      .filter(Boolean)
      .join(','),
  ],
  {
    stdio: 'inherit',
  }
);
