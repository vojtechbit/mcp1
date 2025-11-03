import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { errorCatalog } from '../src/utils/errorCatalog.js';

function walkJavaScriptFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJavaScriptFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectReferencedCodes() {
  const searchRoots = ['src', 'test'];
  const files = searchRoots.flatMap(walkJavaScriptFiles);
  const codePattern = /\b(?:code|errorCode|defaultCode)\b[^\n'"`]*['"`]([A-Z0-9_]{3,})['"`]/g;
  const codes = new Set();

  for (const file of files) {
    const contents = readFileSync(file, 'utf8');
    let match;
    while ((match = codePattern.exec(contents))) {
      codes.add(match[1]);
    }
  }

  return codes;
}

const catalogCodes = new Set(Object.keys(errorCatalog));

const referencedCodes = collectReferencedCodes();

test('every referenced error code is defined in the catalog', () => {
  for (const code of referencedCodes) {
    assert.ok(
      catalogCodes.has(code),
      `Error code ${code} is referenced in source but missing from errorCatalog.`
    );
  }
});

test('catalog entries declare status and description', () => {
  for (const [code, metadata] of Object.entries(errorCatalog)) {
    assert.equal(typeof metadata, 'object', `${code} metadata should be an object`);
    assert.equal(typeof metadata.status, 'number', `${code} status must be a number`);
    assert.ok(
      metadata.status >= 100 && metadata.status <= 599,
      `${code} status must be a valid HTTP status code`
    );
    assert.equal(typeof metadata.description, 'string', `${code} description must be a string`);
    assert.ok(metadata.description.trim().length > 0, `${code} description must not be empty`);
  }
});
