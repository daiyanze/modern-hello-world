const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const execa = require('execa');
const { gzipSync } = require('zlib');
const { compress } = require('brotli');
const { targets: allTargets, fuzzyMatchTarget } = require('./utils');

const args = require('minimist')(process.argv.slice(2));
const targets = args._;
const formats = args.formats || args.f;
const noTypeCheck = args.noTypeCheck || args.ntc;
const devOnly = args.devOnly || args.d;
const prodOnly = !devOnly && (args.prodOnly || args.p);
const extractTypes = args.t || args.types;
const sourceMap = args.sourcemap || args.s;
const buildAllMatching = args.all || args.a;

run();

async function run() {
  await buildAll(
    !targets.length ? allTargets : fuzzyMatchTarget(targets, buildAllMatching)
  );

  /browser/.test(formats) &&
    checkAllSizes(
      !targets.length ? allTargets : fuzzyMatchTarget(targets, buildAllMatching)
    );
}

async function buildAll(targets) {
  !noTypeCheck && (await typeCheck());

  for (const target of targets) {
    await build(target);
    !!extractTypes && (await buildTypes(target));
  }
}

async function typeCheck() {
  await execa(
    'tsc',
    ['--noEmit', '--project', [path.resolve(__dirname, '../tsconfig.json')]],
    { stdio: 'inherit' }
  ).catch((e) => {
    console.log(
      chalk.bold(
        chalk.red(`Type Checking failed. Please fix the type issues above.\n`)
      )
    );
    process.exit(4);
  });
}

async function build(target) {
  const pkgDir = path.resolve(`packages/${target}`);

  // if building a specific format, do not remove dist.
  if (!formats) {
    await fs.remove(`${pkgDir}/dist`);
  }

  await execa(
    'rollup',
    [
      '-c',
      '--environment',
      [
        `NODE_ENV:production`,
        `TARGET:${target}`,
        formats ? `FORMATS:${formats}` : ``,
        prodOnly ? `PROD_ONLY:true` : ``,
        devOnly ? `DEV_ONLY:true` : ``,
        extractTypes ? `TYPES:true` : ``,
        sourceMap ? `SOURCE_MAP:true` : ``,
      ]
        .filter(Boolean)
        .join(','),
    ],
    { stdio: 'inherit' }
  );
}

async function buildTypes(target) {
  const pkgDir = path.resolve(`packages/${target}`);
  const pkgJson = require(`${pkgDir}/package.json`);

  if (!pkgJson.types) return;

  console.log();
  console.log(
    chalk.bold(chalk.yellow(`Rolling up type definitions for ${target}...`))
  );

  // build types
  const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor');

  const extractorConfigPath = path.resolve(pkgDir, `api-extractor.json`);
  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    extractorConfigPath
  );
  const extractorResult = Extractor.invoke(extractorConfig, {
    localBuild: true,
    showVerboseMessages: true,
  });

  if (extractorResult.succeeded) {
    // concat additional d.ts to rolled-up dts
    const typesDir = path.resolve(pkgDir, 'types');
    if (await fs.exists(typesDir)) {
      const dtsPath = path.resolve(pkgDir, pkgJson.types);
      const existing = await fs.readFile(dtsPath, 'utf-8');
      const typeFiles = await fs.readdir(typesDir);
      const toAdd = await Promise.all(
        typeFiles.map((file) => {
          return fs.readFile(path.resolve(typesDir, file), 'utf-8');
        })
      );
      await fs.writeFile(dtsPath, existing + '\n' + toAdd.join('\n'));
    }
    console.log(
      chalk.bold(chalk.green(`API Extractor completed successfully.`))
    );
  } else {
    console.error(
      `API Extractor completed with ${extractorResult.errorCount} errors` +
        ` and ${extractorResult.warningCount} warnings`
    );
    process.exitCode = 1;
  }

  await fs.remove(`${pkgDir}/dist/packages`);
  await fs.remove(`${pkgDir}/dist/index.js`);
}

function checkAllSizes(targets) {
  if (devOnly) {
    return;
  }
  console.log();
  for (const target of targets) {
    checkSize(target);
  }
  console.log();
}

function checkSize(target) {
  const pkgDir = path.resolve(`packages/${target}`);
  checkFileSize(`${pkgDir}/dist/${target}.modern.js`);
  checkFileSize(`${pkgDir}/dist/${target}.js`);
}

function checkFileSize(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const file = fs.readFileSync(filePath);
  const minSize = (file.length / 1024).toFixed(2) + 'kb';
  const gzipped = gzipSync(file);
  const gzippedSize = (gzipped.length / 1024).toFixed(2) + 'kb';
  const compressed = compress(file);
  const compressedSize = (compressed.length / 1024).toFixed(2) + 'kb';
  console.log(
    `${chalk.gray(
      chalk.bold(path.basename(filePath))
    )} min:${minSize} / gzip:${gzippedSize} / brotli:${compressedSize}`
  );
}
