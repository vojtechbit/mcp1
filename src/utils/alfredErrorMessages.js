/**
 * Alfred-friendly Error Messages
 *
 * Transforms technical errors into actionable messages for Alfred (GPT assistant)
 * with clear hints on what to do next.
 */

import { wrapModuleFunctions } from './advancedDebugging.js';

/**
 * Error categories with user-friendly explanations
 */
const ERROR_CATALOG_ALFRED = {
  // Authentication & Authorization
  GOOGLE_UNAUTHORIZED: {
    title: 'Authentication Required',
    message: 'Your Google authentication has expired or lacks necessary permissions. You need to re-authenticate.',
    actionable: {
      suggestedAction: 'reauth',
      hint: 'User needs to re-authenticate via OAuth. NEVER ask for consent in chat. Direct user to OAuth URL.',
      alfredResponse: 'Nepodařilo se načíst seznam kontaktů — server vrátil chybu „Invalid Credentials". Znamená to, že potřebuji nové oprávnění k tvému účtu Google.\n\n👉 Prosím otevři tento odkaz a přihlas se znovu: [URL k přihlášení]\n\nPo přihlášení budu moct pokračovat.'
    },
    severity: 'high',
    requiresReauth: true,
    authUrl: '/auth/google'
  },

  TOKEN_REFRESH_FAILED: {
    title: 'Token Refresh Failed',
    message: 'Failed to refresh your access token. You need to re-authenticate.',
    actionable: {
      suggestedAction: 'reauth',
      hint: 'Google refused to refresh the token. User must complete OAuth flow again. NEVER ask for consent in chat.',
      alfredResponse: 'Nastal problém s obnovením tvého přihlášení. Potřebuji, abys se znovu autorizoval.\n\n👉 Prosím otevři tento odkaz a přihlas se: [URL k přihlášení]'
    },
    severity: 'high',
    requiresReauth: true,
    authUrl: '/auth/google'
  },

  AUTH_REQUIRED: {
    title: 'Authentication Required',
    message: 'You need to authenticate with Google first.',
    actionable: {
      suggestedAction: 'auth',
      hint: 'User is not logged in. Direct them to OAuth flow. NEVER ask for consent in chat.',
      alfredResponse: 'Než budu moct pokračovat, potřebuji přístup k tvému Google účtu.\n\n👉 Prosím otevři tento odkaz a přihlas se: [URL k přihlášení]\n\nPo přihlášení budu moct pokračovat.'
    },
    severity: 'high',
    authUrl: '/auth/google'
  },

  // Gmail API Errors
  EMAIL_SEND_FAILED: {
    title: 'Email Send Failed',
    message: 'Failed to send email via Gmail API.',
    actionable: {
      suggestedAction: 'retry_later',
      retryAfter: 60,
      hint: 'Gmail API vrátil chybu. Zkus to za chvíli znovu.',
      alfredResponse: 'Nepodařilo se mi odeslat ten email. Můžeš to zkusit znovu? Pokud problém přetrvává, zkontroluj, jestli máš správný email a předmět.'
    },
    severity: 'medium'
  },

  GMAIL_RATE_LIMIT: {
    title: 'Gmail Rate Limit Exceeded',
    message: 'Too many Gmail API requests. Please wait before retrying.',
    actionable: {
      suggestedAction: 'retry_later',
      retryAfter: 300,
      hint: 'Překročen limit Gmail API (typicky 100 req/s nebo 1M/den). Počkej 5 minut.',
      alfredResponse: 'Momentálně jsem přetížený požadavky na Gmail API. Zkus to prosím za 5 minut znovu.'
    },
    severity: 'medium',
    docs: 'https://developers.google.com/gmail/api/reference/quota'
  },

  EMAIL_TOO_LARGE: {
    title: 'Email Too Large',
    message: 'Email exceeds maximum size limit.',
    actionable: {
      suggestedAction: 'truncate_or_summary',
      hint: 'Email je větší než 100KB. Zobraz preview nebo shrnutí.',
      alfredResponse: 'Tento email je příliš velký na zobrazení celého obsahu. Můžu ti zobrazit shrnutí nebo jen hlavičky?'
    },
    severity: 'low'
  },

  ATTACHMENT_BLOCKED: {
    title: 'Attachment Blocked',
    message: 'Attachment was blocked due to security policy.',
    actionable: {
      suggestedAction: 'security_warning',
      hint: 'Příloha obsahuje potenciálně nebezpečný soubor (.exe, .bat, apod.).',
      alfredResponse: 'Tato příloha byla zablokována z bezpečnostních důvodů. Jedná se o potenciálně nebezpečný typ souboru.'
    },
    severity: 'high',
    securityAlert: true
  },

  DRAFT_SUBJECT_REQUIRED: {
    title: 'Draft Subject Required',
    message: 'Draft must have a subject line.',
    actionable: {
      suggestedAction: 'ask_for_subject',
      hint: 'Koncept emailu musí mít předmět.',
      alfredResponse: 'Koncept potřebuje předmět. Jaký předmět chceš pro tento email?'
    },
    severity: 'low'
  },

  // Calendar API Errors
  CALENDAR_EVENT_CREATE_FAILED: {
    title: 'Calendar Event Creation Failed',
    message: 'Failed to create calendar event.',
    actionable: {
      suggestedAction: 'retry_or_check_params',
      hint: 'Chyba při vytváření události. Zkontroluj čas, trvání, účastníky.',
      alfredResponse: 'Nepodařilo se mi vytvořit událost v kalendáři. Zkontroluj prosím, jestli jsou čas a datum správně.'
    },
    severity: 'medium'
  },

  CALENDAR_PROPOSALS_CONFLICT: {
    title: 'Calendar Conflict',
    message: 'Proposed time conflicts with existing events.',
    actionable: {
      suggestedAction: 'suggest_alternative',
      hint: 'Navržený čas koliduje s existující událostí.',
      alfredResponse: 'V navrhovaném čase už máš jinou schůzku. Chceš, abych navrhl jiný čas?'
    },
    severity: 'low',
    conflicts: [] // Will be populated with conflicting events
  },

  CALENDAR_RATE_LIMIT: {
    title: 'Calendar Rate Limit Exceeded',
    message: 'Too many Calendar API requests.',
    actionable: {
      suggestedAction: 'retry_later',
      retryAfter: 300,
      hint: 'Překročen limit Calendar API. Počkej 5 minut.',
      alfredResponse: 'Momentálně jsem přetížený požadavky na Calendar API. Zkus to za chvíli znovu.'
    },
    severity: 'medium'
  },

  // Database & Infrastructure
  DATABASE_CONNECTION_FAILED: {
    title: 'Database Connection Error',
    message: 'Failed to connect to database.',
    actionable: {
      suggestedAction: 'system_issue',
      hint: 'MongoDB nedostupná. Kontaktuj admina.',
      alfredResponse: 'Je mi líto, ale momentálně mám technické problémy. Zkus to prosím za chvíli znovu.'
    },
    severity: 'critical',
    internalError: true
  },

  TOKEN_ENCRYPTION_FAILED: {
    title: 'Token Encryption Failed',
    message: 'Failed to encrypt authentication token.',
    actionable: {
      suggestedAction: 'system_issue',
      hint: 'Kritická chyba v šifrování. Zkontroluj ENCRYPTION_KEY.',
      alfredResponse: 'Nastal vážný technický problém. Prosím kontaktuj podporu.'
    },
    severity: 'critical',
    internalError: true
  },

  // Generic Errors
  INVALID_PARAM: {
    title: 'Invalid Parameter',
    message: 'One or more parameters are invalid.',
    actionable: {
      suggestedAction: 'check_input',
      hint: 'Chyba ve vstupních parametrech. Zkontroluj formát.',
      alfredResponse: 'Něco v tvém požadavku není správně. Můžeš mi to říct jinak?'
    },
    severity: 'low'
  },

  INTERNAL_SERVER_ERROR: {
    title: 'Internal Server Error',
    message: 'An unexpected error occurred.',
    actionable: {
      suggestedAction: 'retry_later',
      retryAfter: 60,
      hint: 'Neznámá chyba. Zkus retry, pokud přetrvává, kontaktuj admina.',
      alfredResponse: 'Něco se pokazilo na mé straně. Zkus to prosím znovu, a pokud to nepomůže, dej mi vědět.'
    },
    severity: 'high',
    internalError: true
  }
};

/**
 * Enrich error with Alfred-friendly message
 */
function enrichErrorForAlfred(error, context = {}) {
  const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
  const errorInfo = ERROR_CATALOG_ALFRED[errorCode];

  if (!errorInfo) {
    // Fallback for unknown errors
    return {
      ...error,
      alfred: {
        title: 'Unexpected Error',
        message: error.message || 'An unexpected error occurred.',
        actionable: {
          suggestedAction: 'retry_later',
          hint: 'Neznámá chyba.',
          alfredResponse: 'Něco se pokazilo. Zkus to prosím znovu.'
        },
        severity: 'medium'
      }
    };
  }

  return {
    ...error,
    alfred: {
      title: errorInfo.title,
      message: errorInfo.message,
      actionable: {
        ...errorInfo.actionable,
        ...context.actionable // Allow context override
      },
      severity: errorInfo.severity,
      requiresReauth: errorInfo.requiresReauth || false,
      securityAlert: errorInfo.securityAlert || false,
      internalError: errorInfo.internalError || false,
      docs: errorInfo.docs,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Generate Alfred response message based on error
 */
function getAlfredResponse(error) {
  const enriched = enrichErrorForAlfred(error);
  return enriched.alfred.actionable.alfredResponse;
}

/**
 * Check if error requires re-authentication
 */
function requiresReauth(error) {
  const errorCode = error.code || '';
  const reauthCodes = [
    'GOOGLE_UNAUTHORIZED',
    'TOKEN_REFRESH_FAILED',
    'AUTH_REQUIRED'
  ];

  return reauthCodes.includes(errorCode) || error.requiresReauth === true;
}

/**
 * Get retry suggestion in seconds
 */
function getRetryAfter(error) {
  const errorCode = error.code || '';
  const errorInfo = ERROR_CATALOG_ALFRED[errorCode];

  if (errorInfo?.actionable?.retryAfter) {
    return errorInfo.actionable.retryAfter;
  }

  // Default retry suggestions based on status code
  if (error.statusCode === 429) return 300; // 5 minutes for rate limit
  if (error.statusCode >= 500) return 60;   // 1 minute for server errors
  if (error.statusCode === 503) return 120; // 2 minutes for service unavailable

  return null;
}

/**
 * Format error for Alfred's consumption
 */
function formatErrorForAlfred(error, options = {}) {
  const enriched = enrichErrorForAlfred(error, options.context);

  return {
    error: enriched.alfred.title,
    message: enriched.alfred.message,
    code: error.code || 'UNKNOWN_ERROR',
    severity: enriched.alfred.severity,
    actionable: {
      suggestion: enriched.alfred.actionable.suggestedAction,
      response: enriched.alfred.actionable.alfredResponse,
      retryAfter: getRetryAfter(error),
      requiresReauth: enriched.alfred.requiresReauth
    },
    ...(enriched.alfred.docs && { docs: enriched.alfred.docs }),
    ...(enriched.alfred.securityAlert && { securityAlert: true }),
    timestamp: enriched.alfred.timestamp,
    ...(options.includeDetails && { details: error.details })
  };
}

const traced = wrapModuleFunctions('utils.alfredErrorMessages', {
  enrichErrorForAlfred,
  getAlfredResponse,
  requiresReauth,
  getRetryAfter,
  formatErrorForAlfred
});

const {
  enrichErrorForAlfred: tracedEnrichErrorForAlfred,
  getAlfredResponse: tracedGetAlfredResponse,
  requiresReauth: tracedRequiresReauth,
  getRetryAfter: tracedGetRetryAfter,
  formatErrorForAlfred: tracedFormatErrorForAlfred
} = traced;

export {
  tracedEnrichErrorForAlfred as enrichErrorForAlfred,
  tracedGetAlfredResponse as getAlfredResponse,
  tracedRequiresReauth as requiresReauth,
  tracedGetRetryAfter as getRetryAfter,
  tracedFormatErrorForAlfred as formatErrorForAlfred,
  ERROR_CATALOG_ALFRED
};
