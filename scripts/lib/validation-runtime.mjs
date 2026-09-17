import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryRoot = resolve(tmpdir());
const output = mkdtempSync(join(temporaryRoot, 'stock-transactions-validation-'));
const cache = new Map();
const require = createRequire(join(root, 'package.json'));

function resolveInternal(specifier, parent) {
  const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(parent), specifier);
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts']) if (existsSync(base + suffix)) return base + suffix;
  throw new Error(`Unresolved validation import ${specifier}`);
}

function compile(file) {
  if (cache.has(file)) return cache.get(file);
  const target = join(output, relative(root, file).replace(/\.(tsx?|mjs|js)$/, '.mjs'));
  const url = pathToFileURL(target).href;
  cache.set(file, url);
  let source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }, fileName: file,
  }).outputText;
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((m) => m[2]);
  for (const specifier of new Set(imports)) {
    if (specifier.startsWith('node:')) continue;
    const dependency = specifier.startsWith('@/') || specifier.startsWith('.')
      ? compile(resolveInternal(specifier, file)) : pathToFileURL(require.resolve(specifier)).href;
    source = source.replaceAll(`'${specifier}'`, `'${dependency}'`).replaceAll(`"${specifier}"`, `"${dependency}"`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  return url;
}

export const load = (file) => import(compile(resolve(root, file)));
export function cleanup() {
  const target = resolve(output);
  if (!target.startsWith(temporaryRoot + sep) || !target.includes('stock-transactions-validation-')) throw new Error('Unsafe validation cleanup target');
  rmSync(target, { recursive: true, force: true });
}
