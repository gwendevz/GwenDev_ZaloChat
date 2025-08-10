// author @GwenDev
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  'Core',
  'Handlers',
  'App',
  'Api',
  'Utils',
  'Routes',
  'Database',
  'Auto',
  'Anti',
  '.',
];

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules', 'Data', 'Temp', '.git', '.vscode', 'public', 'views'
]);

function isJsFile(filePath) {
  return filePath.endsWith('.js');
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      if (isJsFile(full)) yield full;
    }
  }
}

function stripComments(js) {
  let out = js.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = out.split(/\r?\n/);
  const kept = [];
  for (let line of lines) {
    if (/^\s*\/\/\s*author\s*@GwenDev\s*$/i.test(line)) {
      continue;
    }
    if (/^\s*\/\//.test(line)) {
      continue;
    }
    kept.push(line);
  }
  out = kept.join('\n').trimStart();
  out = `// author @GwenDev\n` + out;
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

function processFile(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const result = stripComments(src);
    if (result !== src) {
      fs.writeFileSync(file, result, 'utf8');
      console.log('updated', path.relative(ROOT, file));
    }
  } catch (e) {
    console.error('failed', file, e.message);
  }
}

function main() {
  const targets = new Set();
  for (const d of TARGET_DIRS) {
    const abs = path.resolve(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      if (isJsFile(abs)) targets.add(abs);
      continue;
    }
    for (const f of walk(abs)) targets.add(f);
  }
  for (const f of targets) processFile(f);
}

main();


