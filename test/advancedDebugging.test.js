import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdvancedDebugState, isAdvancedDebugEnabled } from '../src/utils/advancedDebugging.js';

function withEnv(overrides, fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ADVANCED_DEBUG: process.env.ADVANCED_DEBUG
  };

  const restore = () => {
    if (typeof previous.NODE_ENV === 'undefined') {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous.NODE_ENV;
    }

    if (typeof previous.ADVANCED_DEBUG === 'undefined') {
      delete process.env.ADVANCED_DEBUG;
    } else {
      process.env.ADVANCED_DEBUG = previous.ADVANCED_DEBUG;
    }
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'NODE_ENV')) {
    const value = overrides.NODE_ENV;
    if (typeof value === 'undefined' || value === null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'ADVANCED_DEBUG')) {
    const value = overrides.ADVANCED_DEBUG;
    if (typeof value === 'undefined' || value === null) {
      delete process.env.ADVANCED_DEBUG;
    } else {
      process.env.ADVANCED_DEBUG = value;
    }
  }

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('advanced debug defaults to enabled in test environment', () => {
  withEnv({ NODE_ENV: 'test', ADVANCED_DEBUG: undefined }, () => {
    const state = getAdvancedDebugState();
    assert.equal(state.enabled, true);
    assert.equal(state.source, 'test-default');
    assert.equal(state.nodeEnv, 'test');
    assert.equal(state.rawValue, null);
    assert.equal(state.enabled, isAdvancedDebugEnabled());
  });
});

test('explicit disable overrides test default', () => {
  withEnv({ NODE_ENV: 'test', ADVANCED_DEBUG: '0' }, () => {
    const state = getAdvancedDebugState();
    assert.equal(state.enabled, false);
    assert.equal(state.source, 'explicit-disable');
    assert.equal(state.explicitSetting, false);
    assert.equal(state.rawValue, '0');
    assert.equal(state.enabled, isAdvancedDebugEnabled());
  });
});

test('production defaults to disabled when unset', () => {
  withEnv({ NODE_ENV: 'production', ADVANCED_DEBUG: undefined }, () => {
    const state = getAdvancedDebugState();
    assert.equal(state.enabled, false);
    assert.equal(state.source, 'default-off');
    assert.equal(state.explicitSetting, null);
    assert.equal(state.rawValue, null);
    assert.equal(state.enabled, isAdvancedDebugEnabled());
  });
});

test('explicit enable is respected in production', () => {
  withEnv({ NODE_ENV: 'production', ADVANCED_DEBUG: 'yes' }, () => {
    const state = getAdvancedDebugState();
    assert.equal(state.enabled, true);
    assert.equal(state.source, 'explicit-enable');
    assert.equal(state.explicitSetting, true);
    assert.equal(state.rawValue, 'yes');
    assert.equal(state.enabled, isAdvancedDebugEnabled());
  });
});
