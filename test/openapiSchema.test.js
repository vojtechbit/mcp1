import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schemaPath = new URL('../openapi-facade-final.json', import.meta.url);

test('openapi schema is valid JSON', async (t) => {
  const raw = await readFile(schemaPath, 'utf8');

  let schema;
  assert.doesNotThrow(() => {
    schema = JSON.parse(raw);
  }, 'openapi-facade-final.json should be valid JSON');

  await t.test('top-level metadata required by Custom GPT is present', () => {
    assert.ok(schema && typeof schema === 'object', 'Schema should parse to an object');
    assert.equal(typeof schema.openapi, 'string', 'Schema must declare OpenAPI version as a string');

    assert.ok(schema.info && typeof schema.info === 'object', 'Schema must provide info block');
    assert.equal(typeof schema.info.title, 'string', 'info.title must be a string');
    assert.notEqual(schema.info.title.trim(), '', 'info.title must not be empty');
    assert.equal(typeof schema.info.version, 'string', 'info.version must be a string');
    assert.notEqual(schema.info.version.trim(), '', 'info.version must not be empty');
    assert.equal(typeof schema.info.description, 'string', 'info.description must be a string');
    assert.notEqual(schema.info.description.trim(), '', 'info.description must not be empty');

    assert.ok(Array.isArray(schema.servers), 'Schema must define servers array');
    assert.ok(schema.servers.length > 0, 'Schema must provide at least one server entry');
    for (const server of schema.servers) {
      assert.equal(typeof server.url, 'string', 'Each server must specify an URL');
      assert.ok(server.url.startsWith('https://'), 'Custom GPT requires HTTPS server URLs');
    }

    assert.ok(schema.paths && typeof schema.paths === 'object', 'Schema must define paths');
    const pathEntries = Object.entries(schema.paths);
    assert.ok(pathEntries.length > 0, 'Schema must contain at least one path');

    for (const [pathKey, methods] of pathEntries) {
      assert.equal(typeof methods, 'object', `Path ${pathKey} must describe at least one operation`);
      for (const [method, operation] of Object.entries(methods)) {
        if (!operation || typeof operation !== 'object') {
          continue;
        }
        assert.equal(
          typeof operation.operationId,
          'string',
          `Operation ${method.toUpperCase()} ${pathKey} must define operationId`
        );
        assert.notEqual(
          operation.operationId.trim(),
          '',
          `Operation ${method.toUpperCase()} ${pathKey} must have non-empty operationId`
        );
        assert.equal(
          typeof operation.summary,
          'string',
          `Operation ${method.toUpperCase()} ${pathKey} must define summary`
        );
        assert.notEqual(
          operation.summary.trim(),
          '',
          `Operation ${method.toUpperCase()} ${pathKey} must have non-empty summary`
        );
        if (typeof operation.description === 'string') {
          assert.ok(
            operation.description.length <= 300,
            `Operation ${method.toUpperCase()} ${pathKey} description must be 300 characters or fewer`
          );
        }
      }
    }
  });
});
