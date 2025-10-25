import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const instructionsPath = path.resolve(__dirname, '..', 'instructionsalfred.md');
const instructionsContent = fs.readFileSync(instructionsPath, 'utf8');

const envDefaults = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  PROXY_TOKEN_SECRET: 'test-secret',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  REDIRECT_URI: 'http://localhost/callback',
  ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

for (const [key, value] of Object.entries(envDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const { default: router } = await import('../src/routes/facadeRoutes.js');

const aliasMap = new Map([
  [
    '/macros/confirm/:confirmToken',
    ['/macros/confirm/:confirmToken', '/macros/confirm/{confirmToken}'],
  ],
  [
    '/macros/confirm/:confirmToken/cancel',
    [
      '/macros/confirm/:confirmToken/cancel',
      '/macros/confirm/{confirmToken}/cancel',
    ],
  ],
]);

function collectMacroRoutes(currentRouter) {
  const macroRoutes = new Set();

  for (const layer of currentRouter.stack ?? []) {
    if (layer.route?.path) {
      const routePaths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];

      for (const routePath of routePaths) {
        if (typeof routePath === 'string' && routePath.startsWith('/macros/')) {
          macroRoutes.add(routePath);
        }
      }
    }
  }

  return [...macroRoutes].sort();
}

test('instructions cover every /macros endpoint in facadeRoutes.js', () => {
  assert.ok(
    instructionsContent.trim().length > 0,
    'instructionsalfred.md nesmí být prázdný soubor.'
  );

  const macroRoutes = collectMacroRoutes(router);
  assert.ok(
    macroRoutes.length > 0,
    'V routeru musí existovat alespoň jeden endpoint začínající na /macros/.'
  );

  const missing = [];

  for (const routePath of macroRoutes) {
    const candidates = aliasMap.get(routePath) ?? [routePath];
    const isDocumented = candidates.some((candidate) =>
      instructionsContent.includes(candidate)
    );

    if (!isDocumented) {
      missing.push({ routePath, candidates });
    }
  }

  assert.strictEqual(
    missing.length,
    0,
    [
      'Následující /macros endpointy chybí v instructionsalfred.md. Doplněte dokumentaci, aby byl tutoriál aktuální:',
      ...missing.map(
        ({ routePath, candidates }) =>
          ` - ${routePath} (hledáno: ${candidates.join(', ')})`
      ),
    ].join('\n')
  );
});
