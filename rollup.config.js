import ts from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import babel, { getBabelOutputPlugin } from '@rollup/plugin-babel';
import replace from '@rollup/plugin-replace';
import path from 'path';

if (!process.env.TARGET) {
  throw new Error('<TARGET> package must be specified via --environment flag.');
}

const isProd = process.env.NODE_ENV === 'production';
const prodOnly = !!process.env.PROD_ONLY;
const devOnly = !!process.env.DEV_ONLY;
const shouldBuildTypes = !!process.env.TYPES;
const shouldBuildSourceMaps = !!process.env.SOURCE_MAP;

const targetDir = path.resolve(
  path.resolve(__dirname, 'packages'),
  process.env.TARGET
);
const resolve = (p) => path.resolve(targetDir, p);
const packageJson = require(resolve('package.json'));
const buildOptions = packageJson.buildOptions || {};
const buildFormats = (process.env.FORMATS && process.env.FORMATS.split('/')) ||
  buildOptions.formats || ['cjs', 'esm', 'browser', 'browserModern'];
const filename = path.basename(targetDir);

const compileConfigs = {
  // api-extractor needs the `tsc` output to continue with declaration extracting
  // It is only run in PROD build for emitting declaration files
  _declarationOnly: {
    input: resolve('src/index.ts'),
    output: {
      // generates an index.js file which will be deleted after prod build
      dir: resolve(`dist/`),
      format: 'es',
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      ts({
        noEmit: true,
        emitDeclarationOnly: true,
        sourceMap: shouldBuildSourceMaps,
        declaration: shouldBuildTypes,
        declarationMap: shouldBuildTypes,
        ...(shouldBuildTypes ? { declarationDir: resolve(`dist/`) } : {}),
        exclude: ['**/__tests__'],
      }),
    ],
  },

  cjs: {
    input: resolve('src/index.ts'),
    output: {
      file: resolve(`dist/${filename}.cjs.js`),
      format: 'cjs',
    },
    treeshake: {
      moduleSideEffects: false,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      ts({
        sourceMap: shouldBuildSourceMaps,
        exclude: ['**/__tests__'],
      }),
      getBabelOutputPlugin({
        presets: ['@babel/env'],
      }),
    ],
  },

  esm: {
    input: resolve('src/index.ts'),
    output: {
      file: resolve(`dist/${filename}.esm.js`),
      format: 'es',
    },
    treeshake: {
      moduleSideEffects: false,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      ts({
        sourceMap: shouldBuildSourceMaps,
        exclude: ['**/__tests__'],
      }),
    ],
  },

  browser: {
    input: resolve(`dist/${filename}.esm.js`),
    output: {
      file: resolve(`dist/${filename}.js`),
      format: 'iife',
      name: buildOptions.name,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        sourceMaps: shouldBuildSourceMaps,
        exclude: [/node_modules/],
        presets: [
          [
            '@babel/env',
            {
              targets: {
                browsers:
                  packageJson.browserslist ||
                  '>= 1%, IE >= 10, not op_mini all, not dead',
              },
              corejs: 3,
              useBuiltIns: 'usage',
            },
          ],
        ],
      }),
    ],
  },

  browserModern: {
    input: resolve(`dist/${filename}.esm.js`),
    output: {
      file: resolve(`dist/${filename}.modern.js`),
      format: 'iife',
      name: buildOptions.name,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        sourceMaps: shouldBuildSourceMaps,
        exclude: [/node_modules/],
        presets: ['@babel/env'],
      }),
    ],
  },
};

let CONFIGS = [];

function createReplacePlugin(dev) {
  return replace({
    __DEV__: dev,
    __VERSION__: `'${packageJson.version}'`,
  });
}

buildFormats.forEach((format) => {
  if (!compileConfigs[format]) {
    throw new Error(`Invalid format: ${format}`);
  }

  if (/browser/.test(format)) {
    if (process.env.FORMATS && !/esm/.test(process.env.FORMATS)) {
      throw new Error(
        `Format of "browser(Modern)" needs to build together with "esm":\n$ yarn build esm/browser`
      );
    }
  }

  const prodConfig = {
    ...compileConfigs[format],
    plugins: [
      ...compileConfigs[format].plugins,
      /browser/.test(format) && terser({ output: { comments: false } }),
      !/browser/.test(format) && createReplacePlugin(!isProd),
    ],
  };

  const devConfig = {
    ...compileConfigs[format],
    input: /browser/.test(format)
      ? compileConfigs[format].input.replace(/\.js$/, '.dev.js')
      : compileConfigs[format].input,
    output: {
      ...compileConfigs[format].output,
      file: compileConfigs[format].output.file.replace(/\.js$/, '.dev.js'),
    },
    plugins: [
      ...compileConfigs[format].plugins,
      !/browser/.test(format) && createReplacePlugin(true),
    ],
  };

  if (isProd) {
    if (devOnly) {
      CONFIGS.push(devConfig);
      return;
    }

    if (prodOnly) {
      CONFIGS.push(prodConfig);
      return;
    }

    CONFIGS.push(devConfig, prodConfig);
  } else {
    CONFIGS.push(devConfig);
  }
});

if (isProd && shouldBuildTypes) {
  CONFIGS.push(compileConfigs._declarationOnly);
}

export default CONFIGS;
