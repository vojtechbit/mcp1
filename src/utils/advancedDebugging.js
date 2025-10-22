import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const debugStorage = new AsyncLocalStorage();
const MAX_STRING_LENGTH = 200;
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'authorization', 'cookie'];
const TRUTHY_DEBUG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_DEBUG_VALUES = new Set(['0', 'false', 'no', 'off', 'quiet']);

function resolveBooleanFromEnv(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (TRUTHY_DEBUG_VALUES.has(normalized)) {
    return true;
  }

  if (FALSY_DEBUG_VALUES.has(normalized)) {
    return false;
  }

  return null;
}

function isAdvancedDebugEnabled() {
  const explicitSetting = resolveBooleanFromEnv(process.env.ADVANCED_DEBUG);

  if (process.env.NODE_ENV === 'test') {
    // Tests default to verbose tracing unless explicitly disabled.
    return explicitSetting !== false;
  }

  if (explicitSetting !== null) {
    return explicitSetting;
  }

  return false;
}

function maskValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_KEYS.some(key => value.toLowerCase().includes(key))) {
      return '[redacted]';
    }

    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}… (${value.length} chars)`;
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 10) {
      return `Array(${value.length})`; // do not expand giant arrays
    }

    return value.map(item => maskValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .slice(0, 15)
      .map(([key, val]) => [key, shouldMaskKey(key) ? '[redacted]' : maskValue(val)]);

    if (Object.keys(value).length > 15) {
      entries.push(['__extraKeys', Object.keys(value).length - 15]);
    }

    return Object.fromEntries(entries);
  }

  try {
    return JSON.stringify(value).slice(0, MAX_STRING_LENGTH);
  } catch (err) {
    return String(value);
  }
}

function shouldMaskKey(key) {
  if (!key) return false;
  return SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive));
}

function formatArgs(args) {
  if (!Array.isArray(args)) {
    return args;
  }

  return args.map((arg, index) => {
    if (index > 4) {
      return '[additional arguments truncated]';
    }

    return maskValue(arg);
  });
}

function formatResult(result) {
  if (result === undefined) {
    return undefined;
  }

  if (typeof result === 'object' && result !== null) {
    if (typeof result.then === 'function') {
      return '[Promise]';
    }
  }

  return maskValue(result);
}

function getTimestamp() {
  return new Date().toISOString();
}

function createTraceId() {
  return crypto.randomUUID();
}

function log(level, message, payload = {}) {
  if (!isAdvancedDebugEnabled()) return;

  const formattedPayload = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, maskValue(value)])
  );

  const prefix = `${getTimestamp()} [${level}]`;

  if (Object.keys(formattedPayload).length === 0) {
    console.log(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`, formattedPayload);
  }
}

function createTraceContext(label, args, parentContext) {
  const traceId = createTraceId();
  const startTime = Date.now();

  return {
    id: traceId,
    label,
    args: formatArgs(args),
    steps: [],
    startTime,
    parentId: parentContext?.id ?? null,
    depth: parentContext ? parentContext.depth + 1 : 0,
    metadata: {}
  };
}

function printStepHistory(context) {
  if (!context.steps.length) {
    log('TRACE', `No steps recorded for ${context.label}`);
    return;
  }

  const history = context.steps.map((step, index) => ({
    order: index + 1,
    atMs: step.at,
    description: step.description,
    details: step.metadata
  }));

  log('TRACE', `Step history for ${context.label}`, { history });
}

function captureErrorContext(context, error) {
  const durationMs = Date.now() - context.startTime;
  const lastStep = context.steps[context.steps.length - 1];

  log('ERROR', `❌ ${context.label} failed after ${durationMs}ms`, {
    traceId: context.id,
    parentId: context.parentId,
    depth: context.depth,
    lastStep: lastStep ? {
      description: lastStep.description,
      atMs: lastStep.at,
      metadata: lastStep.metadata
    } : null,
    error: maskValue(error)
  });

  printStepHistory(context);
}

function captureSuccessContext(context, result) {
  const durationMs = Date.now() - context.startTime;

  log('DEBUG', `✅ ${context.label} completed in ${durationMs}ms`, {
    traceId: context.id,
    parentId: context.parentId,
    depth: context.depth,
    result: formatResult(result)
  });
}

function captureStartContext(context) {
  log('DEBUG', `▶️  ${context.label} called`, {
    traceId: context.id,
    parentId: context.parentId,
    depth: context.depth,
    args: context.args
  });
}

function debugStep(description, metadata = {}) {
  if (!isAdvancedDebugEnabled()) return;

  const context = debugStorage.getStore();
  if (!context) {
    log('TRACE', `Step outside of trace: ${description}`, { metadata });
    return;
  }

  const at = Date.now() - context.startTime;
  const sanitizedMetadata = maskValue(metadata);

  context.steps.push({ description, metadata: sanitizedMetadata, at });

  log('TRACE', `🔍 Step ${context.steps.length} for ${context.label}: ${description}`, {
    traceId: context.id,
    atMs: at,
    metadata: sanitizedMetadata
  });
}

function annotateTrace(metadata = {}) {
  const context = debugStorage.getStore();
  if (!context) return;

  context.metadata = { ...context.metadata, ...maskValue(metadata) };
}

function runWithTrace(fn, context, thisArg, args) {
  captureStartContext(context);
  context.steps.push({
    description: 'Function start',
    metadata: { argsPreview: context.args },
    at: 0
  });

  const execute = () => {
    try {
      const result = fn.apply(thisArg, args);

      if (result && typeof result.then === 'function') {
        return result
          .then(value => {
            context.steps.push({
              description: 'Function completed',
              metadata: { result: formatResult(value) },
              at: Date.now() - context.startTime
            });
            captureSuccessContext(context, value);
            return value;
          })
          .catch(error => {
            context.steps.push({
              description: 'Error thrown',
              metadata: maskValue(error),
              at: Date.now() - context.startTime
            });
            captureErrorContext(context, error);
            throw error;
          });
      }

      context.steps.push({
        description: 'Function completed',
        metadata: { result: formatResult(result) },
        at: Date.now() - context.startTime
      });
      captureSuccessContext(context, result);
      return result;
    } catch (error) {
      context.steps.push({
        description: 'Error thrown',
        metadata: maskValue(error),
        at: Date.now() - context.startTime
      });
      captureErrorContext(context, error);
      throw error;
    }
  };

  return debugStorage.run(context, execute);
}

function withAdvancedDebugging(label, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('withAdvancedDebugging expects a function');
  }

  const wrapped = function wrappedWithDebugging(...args) {
    if (!isAdvancedDebugEnabled()) {
      return fn.apply(this, args);
    }

    const parentContext = debugStorage.getStore();
    const context = createTraceContext(label, args, parentContext);
    return runWithTrace(fn, context, this, args);
  };

  Object.defineProperty(wrapped, 'name', {
    value: fn.name || 'debuggedFunction',
    configurable: true
  });

  return wrapped;
}

function createNamespaceTracer(namespace) {
  return {
    trace(name, fn) {
      const label = namespace ? `${namespace}.${name}` : name;
      return withAdvancedDebugging(label, fn);
    },
    step: debugStep,
    annotate: annotateTrace
  };
}

function wrapModuleFunctions(namespace, functions) {
  const tracer = createNamespaceTracer(namespace);

  return Object.fromEntries(
    Object.entries(functions).map(([name, value]) => {
      if (typeof value === 'function') {
        return [name, tracer.trace(name, value)];
      }

      return [name, value];
    })
  );
}

export {
  withAdvancedDebugging,
  debugStep,
  annotateTrace,
  createNamespaceTracer,
  wrapModuleFunctions,
  isAdvancedDebugEnabled
};
