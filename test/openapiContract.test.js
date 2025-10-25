import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
let Ajv;

try {
  ({ default: Ajv } = await import('ajv'));
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    ({ default: Ajv } = await import('ajv/node_modules/ajv/dist/ajv.js'));
  } else {
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function toStrictSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map((item) => toStrictSchema(item));
  }

  const clone = { ...schema };

  if (clone.properties && typeof clone.properties === 'object') {
    clone.properties = Object.fromEntries(
      Object.entries(clone.properties).map(([key, value]) => [key, toStrictSchema(value)])
    );
  }

  if (clone.items) {
    clone.items = toStrictSchema(clone.items);
  }

  const typeList = Array.isArray(clone.type) ? clone.type : clone.type ? [clone.type] : [];
  if ((clone.properties && typeList.length === 0) || typeList.includes('object')) {
    if (typeof clone.additionalProperties === 'undefined') {
      clone.additionalProperties = false;
    }
  }

  return clone;
}

test('inbox overview response matches fixture', async () => {
  const openapiPath = join(__dirname, '..', 'openapi-facade-final.json');
  const openapiRaw = await readFile(openapiPath, 'utf8');
  const openapiSpec = JSON.parse(openapiRaw);

  const schema = openapiSpec
    ?.paths?.['/macros/inbox/overview']
    ?.post?.responses?.['200']
    ?.content?.['application/json']?.schema;

  assert.ok(schema, 'Expected schema for inbox overview response to exist');

  const strictSchema = toStrictSchema(schema);
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(strictSchema);

  const fixture = {
    items: [
      {
        messageId: '18c7f9c1d4e5a6b7',
        senderName: 'Alice Example',
        senderAddress: 'alice@example.com',
        subject: 'Project status update',
        receivedAt: '2025-10-24T09:15:00Z',
        inboxCategory: 'primary',
        snippet: 'Latest updates on the Q4 project goals...',
        readState: {
          isUnread: false,
          isRead: true
        }
      },
      {
        messageId: '18c7f9c1d4e5a6c8',
        senderName: null,
        senderAddress: 'notifications@service.example',
        subject: 'Security alert summary',
        receivedAt: null,
        inboxCategory: 'updates',
        snippet: 'We noticed a new login to your account...',
        readState: {
          isUnread: true,
          isRead: false
        }
      }
    ],
    subset: false,
    nextPageToken: null,
    labelResolution: {
      requested: ['important'],
      appliedLabels: [
        {
          id: 'Label_123',
          name: 'Important',
          type: 'system',
          color: null
        }
      ],
      appliedLabelIds: ['Label_123'],
      queryAppliedLabelIds: ['Label_123'],
      requestedCount: 1,
      requiresConfirmation: false,
      querySkipped: false,
      resolved: [
        {
          input: 'important',
          label: {
            id: 'Label_123',
            name: 'Important',
            type: 'system',
            color: null
          },
          confidence: 0.98,
          reason: 'Exact label match'
        }
      ],
      ambiguous: [],
      unmatched: []
    }
  };

  const valid = validate(fixture);
  const formattedErrors = validate.errors ? JSON.stringify(validate.errors, null, 2) : '';

  assert.equal(valid, true, `Fixture does not satisfy schema: ${formattedErrors}`);
});
