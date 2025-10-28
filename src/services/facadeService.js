/**
 * Facade Service - Business Façade Layer (BFF)
 * 
 * Orchestrates existing backend services into high-level macros
 * optimized for GPT consumption.
 */
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


import * as gmailService from './googleApiService.js';
import * as calendarService from './googleApiService.js';
import * as contactsService from './contactsService.js';
import * as tasksService from './tasksService.js';
import { getUserByGoogleSub } from './databaseService.js';
import { classifyEmailCategory } from './googleApiService.js';
import {
  parseRelativeTime,
  getPragueOffsetHours,
  getPragueMidnightUtc,
  addPragueDays,
  getPragueDateParts,
  normalizeCalendarTime
} from '../utils/helpers.js';
import { REFERENCE_TIMEZONE } from '../config/limits.js';
import { processAttachments } from '../utils/attachmentSecurity.js';
import { generateSignedAttachmentUrl } from '../utils/signedUrlGenerator.js';
import {
  UNREPLIED_LABEL_NAME,
  UNREPLIED_LABEL_DEFAULTS,
  TRACKING_LABEL_NAME,
  TRACKING_LABEL_DEFAULTS
} from '../config/unrepliedLabels.js';
import {
  createPendingConfirmation,
  getPendingConfirmation,
  confirmPendingConfirmation,
  completePendingConfirmation
} from '../utils/confirmationStore.js';

export const EMAIL_QUICK_READ_FORMATS = Object.freeze([
  'snippet',
  'minimal',
  'metadata',
  'full'
]);

/**
 * Selects the Gmail service implementation for the current runtime.
 *
 * In production we always use the real service, but tests can provide
 * deterministic responses by attaching overrides to
 * `globalThis.__facadeMocks.gmailService`.
 */
function resolveGmailService() {
  const mocks = globalThis?.__facadeMocks;

  if (process.env.NODE_ENV === 'test' && mocks?.gmailService) {
    return Object.assign({}, gmailService, mocks.gmailService);
  }

  return gmailService;
}

/**
 * Returns the unanswered-thread collector that should be used.
 *
 * Unit tests can inject a deterministic implementation via
 * `globalThis.__facadeMocks.collectUnansweredThreads`.
 */
function resolveCollectUnansweredThreads() {
  const mocks = globalThis?.__facadeMocks;

  if (process.env.NODE_ENV === 'test' && typeof mocks?.collectUnansweredThreads === 'function') {
    return mocks.collectUnansweredThreads;
  }

  return collectUnansweredThreads;
}

/**
 * Returns the database service wrapper for the current environment.
 *
 * Tests can stub individual methods (for example `getUserByGoogleSub`)
 * by providing `globalThis.__facadeMocks.databaseService`.
 */
function resolveDatabaseService() {
  const mocks = globalThis?.__facadeMocks;

  if (process.env.NODE_ENV === 'test' && mocks?.databaseService) {
    return Object.assign({ getUserByGoogleSub }, mocks.databaseService);
  }

  return { getUserByGoogleSub };
}

function resolveCalendarService() {
  const mocks = globalThis?.__facadeMocks;

  if (process.env.NODE_ENV === 'test' && mocks?.calendarService) {
    return Object.assign({}, calendarService, mocks.calendarService);
  }

  return calendarService;
}

function resolveContactsService() {
  const mocks = globalThis?.__facadeMocks;

  if (process.env.NODE_ENV === 'test' && mocks?.contactsService) {
    return Object.assign({}, contactsService, mocks.contactsService);
  }

  return contactsService;
}

function resolveCreatePendingConfirmation() {
  const mocks = globalThis?.__facadeMocks;

  if (
    process.env.NODE_ENV === 'test' &&
    mocks?.confirmationStore?.createPendingConfirmation
  ) {
    return mocks.confirmationStore.createPendingConfirmation;
  }

  return createPendingConfirmation;
}

// ==================== INBOX MACROS ====================

/**
 * Inbox Overview - lightweight cards without snippets
 * Step 1: Search for message IDs
 * Step 2: Batch fetch metadata for all messages
 * Step 3: Return enriched items with sender, subject, etc.
 */
async function inboxOverview(googleSub, params = {}) {
  const {
    timeRange,
    maxItems = 50,
    filters = {},
    pageToken,
    query: rawQuery
  } = params;

  const gmail = resolveGmailService();

  const queryParts = [];
  let labelResolution = null;
  let requestedLabelCount = 0;

  if (typeof rawQuery === 'string' && rawQuery.trim()) {
    queryParts.push(rawQuery.trim());
  }

  if (filters.from) {
    const sanitizedFrom = filters.from.trim();
    if (sanitizedFrom) {
      const needsQuotes = /\s/.test(sanitizedFrom) && !/^".*"$/.test(sanitizedFrom);
      const value = needsQuotes ? `"${sanitizedFrom}"` : sanitizedFrom;
      queryParts.push(`from:${value}`);
    }
  }

  if (filters.hasAttachment) {
    queryParts.push('has:attachment');
  }

  if (filters.category) {
    const categoryMap = {
      'primary': 'CATEGORY_PERSONAL',
      'work': 'CATEGORY_PERSONAL',
      'promotions': 'CATEGORY_PROMOTIONS',
      'social': 'CATEGORY_SOCIAL',
      'updates': 'CATEGORY_UPDATES',
      'forums': 'CATEGORY_FORUMS'
    };

    const labelId = categoryMap[filters.category.toLowerCase()];
    if (labelId) {
      queryParts.push(`label:${labelId}`);
    }
  }

  if (filters.labelIds) {
    const requestedIdentifiers = Array.isArray(filters.labelIds)
      ? filters.labelIds
      : [filters.labelIds];

    const cleanedIdentifiers = requestedIdentifiers
      .map(value => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean);

    if (cleanedIdentifiers.length > 0) {
      requestedLabelCount = cleanedIdentifiers.length;
      labelResolution = await gmail.resolveLabelIdentifiers(googleSub, cleanedIdentifiers);

      const appliedIds = labelResolution.appliedLabelIds || [];
      appliedIds.forEach(id => {
        if (id) {
          queryParts.push(`label:${id}`);
        }
      });

      if (appliedIds.length === 0 && labelResolution.requiresConfirmation) {
        return {
          items: [],
          subset: false,
          nextPageToken: null,
          labelResolution: {
            ...labelResolution,
            requestedCount: requestedLabelCount,
            queryAppliedLabelIds: [],
            querySkipped: true
          }
        };
      }
    }
  }

  if (timeRange) {
    if (timeRange.relative) {
      const times = parseRelativeTime(timeRange.relative);
      if (times?.after && times?.before) {
        queryParts.push(`after:${times.after}`);
        queryParts.push(`before:${times.before}`);
      }
    } else if (timeRange.start && timeRange.end) {
      const startSec = Math.floor(new Date(timeRange.start).getTime() / 1000);
      const endSec = Math.floor(new Date(timeRange.end).getTime() / 1000);
      if (!Number.isNaN(startSec) && !Number.isNaN(endSec)) {
        queryParts.push(`after:${startSec}`);
        queryParts.push(`before:${endSec}`);
      }
    }
  }

  const builtQuery = queryParts.join(' ').trim();

  const searchResults = await gmail.searchEmails(googleSub, {
    query: builtQuery || undefined,
    maxResults: Math.min(maxItems, 200),
    pageToken
  });
  
  if (!searchResults?.messages || searchResults.messages.length === 0) {
    return {
      items: [],
      subset: false,
      nextPageToken: null
    };
  }
  
  // Step 2: Batch fetch metadata for ALL message IDs
  const messageIds = searchResults.messages.map(m => m.id);
  const batchSize = 10; // Fetch 10 at a time to avoid rate limiting
  const enrichedMessages = [];
  
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const metadataPromises = batch.map(id =>
      gmail.readEmail(googleSub, id, { format: 'metadata' })
        .catch(err => {
          console.error(`Failed to fetch metadata for ${id}:`, err.message);
          return null;
        })
    );
    
    const batchResults = await Promise.all(metadataPromises);
    enrichedMessages.push(...batchResults.filter(m => m !== null));
  }
  
  // Step 3: Map to standardized items
  const items = enrichedMessages.map(msg => {
    const fromHeader = msg.from || '';
    const fromEmail = extractEmail(fromHeader);
    const fromName = extractSenderName(fromHeader);
    const readState = buildReadStateFromLabels(msg.labelIds);

    return {
      messageId: msg.id,
      senderName: fromName || null,
      senderAddress: fromEmail || fromHeader,
      subject: msg.subject || '(no subject)',
      receivedAt: msg.date || null,
      inboxCategory: classifyEmailCategory(msg),
      snippet: msg.snippet || '',
      readState
    };
  });
  
  const hasMore = Boolean(searchResults.nextPageToken);

  const response = {
    items,
    subset: hasMore,
    nextPageToken: searchResults.nextPageToken || null
  };

  if (labelResolution) {
    response.labelResolution = {
      ...labelResolution,
      requestedCount: requestedLabelCount,
      queryAppliedLabelIds: labelResolution.appliedLabelIds || []
    };
  }

  return response;
}

/**
 * Inbox Snippets - overview with snippets and attachment URLs
 */
async function inboxSnippets(googleSub, params = {}) {
  const { includeAttachments = true } = params;

  const gmail = resolveGmailService();
  const overview = await inboxOverview(googleSub, params);

  if (overview.items.length === 0) {
    const emptyResponse = {
      items: [],
      subset: overview.subset,
      nextPageToken: overview.nextPageToken
    };

    if (overview.labelResolution) {
      emptyResponse.labelResolution = overview.labelResolution;
    }

    return emptyResponse;
  }

  const batchSize = 10;
  const enrichedItems = [];

  for (let i = 0; i < overview.items.length; i += batchSize) {
    const batch = overview.items.slice(i, i + batchSize);

    const detailPromises = batch.map(async (item) => {
      try {
        const preview = await gmail.getEmailPreview(googleSub, item.messageId, {
          maxBytes: 4096
        });

        const bodySnippet = buildBodySnippetFromPayload(preview.payload, item.snippet || preview.snippet);

        const enriched = {
          ...item,
          snippet: bodySnippet,
          readState: buildReadStateFromLabels(preview.labelIds),
          attachmentUrls: []
        };

        if (includeAttachments) {
          const attachments = extractAttachmentMetadata(preview.payload || {});
          const processed = processAttachments(attachments, (att) =>
            generateSignedAttachmentUrl(item.messageId, att.body?.attachmentId)
          );

          enriched.attachmentUrls = processed.attachments
            .filter(a => !a.blocked && a.url)
            .map(a => a.url);

          if (processed.securityWarnings.length > 0) {
            enriched.attachmentSecurityWarnings = processed.securityWarnings;
          }
        }

        return enriched;
      } catch (error) {
        if (error?.statusCode === 451) {
          throw error;
        }

        console.error(`Failed to build snippet for ${item.messageId}:`, error.message);
        return {
          ...item,
          snippet: buildFallbackSnippet(item.snippet),
          attachmentUrls: []
        };
      }
    });

    const batchResults = await Promise.all(detailPromises);
    enrichedItems.push(...batchResults);
  }

  const response = {
    items: enrichedItems,
    subset: overview.subset,
    nextPageToken: overview.nextPageToken
  };

  if (overview.labelResolution) {
    response.labelResolution = overview.labelResolution;
  }

  return response;
}

/**
 * Email Quick Read - single or batch read with attachments
 */
async function emailQuickRead(googleSub, params = {}) {
  const { ids, searchQuery, format, pageToken } = params;

  const resolvedFormat = format ?? 'full';

  // Validate format parameter
  if (resolvedFormat && !EMAIL_QUICK_READ_FORMATS.includes(resolvedFormat)) {
    const error = new Error(`Invalid format: ${resolvedFormat}. Must be one of: ${EMAIL_QUICK_READ_FORMATS.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const gmail = resolveGmailService();
  let messageIds = ids;
  let nextPageToken = null;
  let subset = false;

  // If searchQuery provided, get IDs first
  if (!messageIds && searchQuery) {
    const searchResults = await gmail.searchEmails(googleSub, {
      query: searchQuery,
      maxResults: 50,
      pageToken
    });
    messageIds = searchResults?.messages?.map(m => m.id) || [];
    nextPageToken = searchResults?.nextPageToken || null;
    subset = Boolean(nextPageToken);
  }

  if (!messageIds || messageIds.length === 0) {
    throw new Error('No message IDs provided or found');
  }

  // Decide single vs batch
  if (messageIds.length === 1) {
    const message = await gmail.readEmail(googleSub, messageIds[0], { format: resolvedFormat });
    const enriched = enrichEmailWithAttachments(message, messageIds[0]);

    return {
      mode: 'single',
      item: enriched,
      subset,
      nextPageToken
    };
  } else {
    const messages = await Promise.all(
      messageIds.map(id => gmail.readEmail(googleSub, id, { format: resolvedFormat }))
    );

    const enriched = messages.map((msg, idx) =>
      enrichEmailWithAttachments(msg, messageIds[idx])
    );

    return {
      mode: 'batch',
      items: enriched,
      subset,
      nextPageToken
    };
  }
}

async function inboxUserUnansweredRequests(googleSub, params = {}) {
  const {
    includeUnread = true,
    includeRead = true,
    maxItems = 20,
    timeRange = null,
    strictNoReply = true,
    unreadPageToken,
    readPageToken,
    labelName = UNREPLIED_LABEL_NAME,
    labelColor,
    query: additionalQuery,
    primaryOnly = true
  } = params;

  const includeUnreadFinal = includeUnread !== false;
  const includeReadFinal = includeRead !== false;
  const limit = Math.max(1, Math.min(Number(maxItems) || 20, 100));

  const normalizedLabelName = typeof labelName === 'string' && labelName.trim().length > 0
    ? labelName.trim()
    : UNREPLIED_LABEL_NAME;

  let effectiveTimeRange = timeRange;
  let usingDefaultTimeRange = false;
  if (!effectiveTimeRange) {
    effectiveTimeRange = { relative: 'today' };
    usingDefaultTimeRange = true;
  }

  const timeFilters = buildTimeFilterClauses(effectiveTimeRange);
  const timeWindow = describeTimeFilters(timeFilters);
  const primaryOnlyFinal = primaryOnly !== false;

  const baseQueryParts = ['in:inbox', '-from:me'];
  if (primaryOnlyFinal) {
    baseQueryParts.push('category:primary');
  }
  if (timeFilters.after) {
    baseQueryParts.push(`after:${timeFilters.after}`);
  }
  if (timeFilters.before) {
    baseQueryParts.push(`before:${timeFilters.before}`);
  }
  if (typeof additionalQuery === 'string' && additionalQuery.trim().length > 0) {
    baseQueryParts.push(additionalQuery.trim());
  }

  const baseQuery = baseQueryParts.join(' ').trim();

  const gmail = resolveGmailService();
  const database = resolveDatabaseService();

  const [labels, userRecord, userAddressesRaw] = await Promise.all([
    gmail.listLabels(googleSub),
    database.getUserByGoogleSub(googleSub).catch(() => null),
    gmail.getUserAddresses(googleSub).catch(() => [])
  ]);

  const trackingLabelRecommendation = buildLabelRecommendation(
    labels,
    TRACKING_LABEL_NAME,
    TRACKING_LABEL_DEFAULTS.color
  );

  const baseLabelRecommendation = buildLabelRecommendation(
    labels,
    normalizedLabelName,
    labelColor || UNREPLIED_LABEL_DEFAULTS.color,
    {
      extraLabelIds: trackingLabelRecommendation.existingLabel
        ? [trackingLabelRecommendation.existingLabel.id]
        : []
    }
  );

  const labelRecommendation = {
    ...baseLabelRecommendation,
    missingLabel: !baseLabelRecommendation.existingLabel
  };

  const labelMatch = labelRecommendation.existingLabel
    ? labels.find(label => label.id === labelRecommendation.existingLabel.id)
    : null;

  const trackingLabelMatch = trackingLabelRecommendation.existingLabel
    ? labels.find(label => label.id === trackingLabelRecommendation.existingLabel.id)
    : null;

  const userAddressSet = new Set(
    (userAddressesRaw || [])
      .concat(userRecord?.email ? [userRecord.email] : [])
      .map(value => (typeof value === 'string' ? value.toLowerCase() : ''))
      .filter(Boolean)
  );

  const searchOptions = {
    googleSub,
    baseQuery,
    limit,
    userAddresses: Array.from(userAddressSet),
    strictNoReply: strictNoReply !== false,
    labelMatch,
    trackingLabelMatch
  };

  // Resolve at call time so unit tests can swap in deterministic collectors.
  const collectThreads = resolveCollectUnansweredThreads();

  const unreadResult = includeUnreadFinal
    ? await collectThreads({ ...searchOptions, querySuffix: 'is:unread', pageToken: unreadPageToken })
    : createEmptyUnansweredBucket();

  const readResult = includeReadFinal
    ? await collectThreads({ ...searchOptions, querySuffix: '-is:unread', pageToken: readPageToken })
    : createEmptyUnansweredBucket();

  const labelAppliedCount = unreadResult.items.filter(item => item.labelApplied).length
    + readResult.items.filter(item => item.labelApplied).length;
  const trackingLabelAppliedCount = unreadResult.items.filter(item => item.trackingLabelApplied).length
    + readResult.items.filter(item => item.trackingLabelApplied).length;
  const skippedMetaSeen = (unreadResult.skippedReasons.trackingLabelPresent || 0)
    + (readResult.skippedReasons.trackingLabelPresent || 0);

  const summary = {
    totalAwaiting: unreadResult.items.length + readResult.items.length,
    unreadCount: unreadResult.items.length,
    readCount: readResult.items.length,
    strictMode: strictNoReply !== false,
    timeRangeApplied: Boolean(timeFilters.after || timeFilters.before),
    timeRangeSource: usingDefaultTimeRange ? 'default_today' : null,
    timeWindow,
    primaryOnly: primaryOnlyFinal,
    scannedMessages: unreadResult.scanned + readResult.scanned,
    overflowCount: unreadResult.overflowCount + readResult.overflowCount,
    strictFilteredCount:
      (unreadResult.skippedReasons.userReplyPresent || 0)
      + (readResult.skippedReasons.userReplyPresent || 0),
    labelAlreadyApplied: labelAppliedCount,
    missingLabel: !labelRecommendation.existingLabel,
    trackingLabelAlreadyApplied: trackingLabelAppliedCount,
    trackingLabelMissing: !trackingLabelRecommendation.existingLabel,
    trackingLabelSkipped: skippedMetaSeen
  };

  return {
    summary,
    unread: unreadResult,
    read: readResult,
    labelRecommendation,
    trackingLabel: {
      ...trackingLabelRecommendation,
      role: 'watchlist_tracking',
      skipReason: 'trackingLabelPresent'
    }
  };
}

// ==================== CALENDAR MACROS ====================

/**
 * Calendar Plan - daily/weekly view with status
 */
async function calendarPlan(googleSub, params) {
  const {
    scope,
    date,
    includePast = false,
    pastTreatment = 'minimal',
    calendarId = 'primary'
  } = params;
  
  // Validate scope parameter
  const validScopes = ['daily', 'weekly'];
  if (!validScopes.includes(scope)) {
    const error = new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  
  // Parse date and calculate range using Prague timezone
  const anchorDate = new Date(date);
  const pragueDate = getPragueDateParts(anchorDate);
  let start, end;

  if (scope === 'daily') {
    start = getPragueMidnightUtc(pragueDate);
    end = getPragueMidnightUtc(addPragueDays(pragueDate, 1));
  } else if (scope === 'weekly') {
    const dayOfWeek = new Date(pragueDate.year, pragueDate.month - 1, pragueDate.day).getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = addPragueDays(pragueDate, daysToMonday);
    start = getPragueMidnightUtc(monday);
    end = getPragueMidnightUtc(addPragueDays(monday, 7));
  }
  
  // Fetch events
  const calendarApi = resolveCalendarService();

  const events = await calendarApi.listCalendarEvents(googleSub, {
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    orderBy: 'startTime',
    singleEvents: true
  });
  
  // Compute status for each event
  const now = new Date();
  const items = events.items.map(event => {
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    
    let status;
    if (now > eventEnd) {
      status = 'past';
    } else if (now >= eventStart && now <= eventEnd) {
      status = 'ongoing';
    } else {
      status = 'upcoming';
    }
    
    // Filter based on pastTreatment
    if (status === 'past' && !includePast) {
      return null;
    }
    
    const item = {
      eventId: event.id,
      title: event.summary || '(No title)',
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      status,
      locationText: event.location || null,
      mapUrl: event.location ? generateMapsUrl(event.location) : null,
      attendees: (event.attendees || []).map(a => ({
        name: a.displayName || null,
        email: a.email
      }))
    };
    
    // Minimal treatment for past events
    if (status === 'past' && pastTreatment === 'minimal') {
      return {
        eventId: item.eventId,
        title: item.title,
        start: item.start,
        end: item.end,
        status: item.status
      };
    }
    
    return item;
  }).filter(Boolean);
  
  return {
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      tz: 'Europe/Prague'
    },
    items
  };
}

async function calendarListCalendars(googleSub) {
  const calendars = await calendarService.listCalendars(googleSub);
  return calendars;
}

/**
 * Calendar Schedule - create event with optional contact enrichment
 * 
 * WORKFLOW FOR enrichFromContacts='ask':
 * 1. Check if contact exists for first attendee
 * 2. If found → return confirmToken + suggested fields
 * 3. User confirms with /api/macros/confirm endpoint
 * 4. Complete operation with enriched data
 */
async function calendarSchedule(googleSub, params) {
  const {
    title,
    when,
    attendees = [],
    enrichFromContacts = 'ask',
    conference = 'none',
    location,
    notes,
    reminders = [],
    privacy = 'default',
    calendarId = 'primary'
  } = params;

  const calendarApi = resolveCalendarService();
  const contactsApi = resolveContactsService();
  const createPendingConfirmationFn = resolveCreatePendingConfirmation();

  // Validate attendees parameter
  if (attendees && attendees.length > 20) {
    const error = new Error('Too many attendees. Maximum 20 allowed.');
    error.statusCode = 400;
    throw error;
  }

  // Validate reminders parameter
  if (reminders && reminders.length > 0) {
    if (reminders.length > 5) {
      const error = new Error('Too many reminders. Maximum 5 allowed.');
      error.statusCode = 400;
      throw error;
    }
    
    for (const reminder of reminders) {
      const value = parseInt(reminder);
      if (isNaN(value) || value < 1 || value > 1440) {
        const error = new Error(`Invalid reminder value: ${reminder}. Must be between 1-1440 minutes.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // ========== STEP 0: Handle proposals with conflict checking ==========
  
  let timeSlot;
  let availableProposals = [];
  
  if (when.fixed) {
    timeSlot = when.fixed;
  } else if (when.proposals && when.proposals.length > 0) {
    // Check each proposal for conflicts
    const conflictResults = await Promise.all(
      when.proposals.map(async (proposal) => {
        try {
          const conflicts = await calendarApi.checkConflicts(googleSub, {
            calendarId,
            start: proposal.start,
            end: proposal.end
          });
          
          return {
            proposal,
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts
          };
        } catch (error) {
          console.warn('Error checking conflicts for proposal:', error.message);
          return {
            proposal,
            hasConflicts: false,
            conflicts: []
          };
        }
      })
    );
    
    // Get proposals without conflicts
    availableProposals = conflictResults
      .filter(r => !r.hasConflicts)
      .map(r => r.proposal);
    
    // If all proposals have conflicts, return 409 with alternatives
    if (availableProposals.length === 0) {
      const error = new Error('All proposed times conflict with existing events');
      error.statusCode = 409;
      error.alternatives = conflictResults.map(r => ({
        proposal: r.proposal,
        conflicts: r.conflicts
      }));
      throw error;
    }
    
    // Use first available proposal
    timeSlot = availableProposals[0];
  } else {
    const invalidWhenError = new Error('Invalid when: must provide fixed or proposals');
    invalidWhenError.statusCode = 400;
    throw invalidWhenError;
  }

  // ========== STEP 1: Check for enrichment opportunities ==========
  
  let enrichmentSuggestions = null;
  let confirmToken = null;
  let pendingSuggestedFields = null;

  if (enrichFromContacts !== 'off' && attendees.length > 0) {
    // Get first attendee (primary contact to enrich from)
    const primaryAttendee = attendees[0];

    try {
      // Search for contact in Google Contacts
      const contactsResult = await contactsApi.searchContacts(
        googleSub,
        primaryAttendee.email
      );

      if (contactsResult && contactsResult.connections && contactsResult.connections.length > 0) {
        const contact = contactsResult.connections[0];
        
        // Extract enrichable fields
        enrichmentSuggestions = extractContactFields(contact);

        // ========== STEP 2: Handle enrichFromContacts strategy ==========

        if (enrichFromContacts === 'ask') {
          // Create pending confirmation
          const suggestedFieldsSnapshot = { ...enrichmentSuggestions };

          const confirmation = await createPendingConfirmationFn(
            googleSub,
            'enrichment',
            {
              operation: 'calendar.schedule',
              eventData: {
                title,
                when: timeSlot,
                attendees,
                conference,
                location,
                notes,
                reminders,
                privacy,
                calendarId
              },
              contactId: contact.resourceName,
              suggestedFields: suggestedFieldsSnapshot
            }
          );

          confirmToken = confirmation.confirmToken;
          pendingSuggestedFields = suggestedFieldsSnapshot;
          enrichmentSuggestions = null; // Don't use yet, wait for confirmation
        }
        // If enrichFromContacts='auto', enrichmentSuggestions will be used below
      }
    } catch (error) {
      console.warn(
        `❌ Contact enrichment search failed for ${primaryAttendee.email}:`,
        error.message
      );
      // Silently fail - continue without enrichment
      enrichmentSuggestions = null;
    }
  }

  // ========== STEP 3: If confirmToken needed, return early ==========

  if (confirmToken) {
    return {
      event: null, // Don't create event yet
      confirmToken,
      warnings: [
        `Found contact for ${attendees[0].email}`,
        pendingSuggestedFields
          ? 'Suggested enrichment: ' + Object.keys(pendingSuggestedFields).join(', ')
          : 'Suggested enrichment data is ready',
        'Call /api/macros/confirm with confirmToken to proceed'
      ]
    };
  }

  // ========== STEP 4: Create event (with or without enrichment) ==========

  const slotTimeZone = typeof timeSlot.timeZone === 'string' && timeSlot.timeZone.trim()
    ? timeSlot.timeZone.trim()
    : REFERENCE_TIMEZONE;

  const normalizedStart = normalizeCalendarTime(timeSlot.start, slotTimeZone);
  const normalizedEnd = normalizeCalendarTime(timeSlot.end, slotTimeZone);

  if (!normalizedStart || !normalizedEnd) {
    const invalidTimeError = new Error('Invalid time slot provided');
    invalidTimeError.statusCode = 400;
    throw invalidTimeError;
  }

  const eventData = {
    summary: title,
    start: normalizedStart,
    end: normalizedEnd,
    attendees: attendees.map(a => {
      const attendeeObj = { email: a.email };
      if (a.name) attendeeObj.displayName = a.name;
      return attendeeObj;
    }),
    location: location || undefined,
    description: notes || undefined,
    reminders: {
      useDefault: reminders.length === 0,
      overrides:
        reminders.length > 0
          ? reminders.map(r => ({
              method: 'popup',
              minutes: parseInt(r)
            }))
          : undefined
    }
  };

  // Add enriched fields if available (auto mode)
  if (enrichmentSuggestions) {
    if (enrichmentSuggestions.phone && !eventData.description) {
      eventData.description = `Phone: ${enrichmentSuggestions.phone}`;
    } else if (enrichmentSuggestions.phone) {
      eventData.description += `\nPhone: ${enrichmentSuggestions.phone}`;
    }
  }

  // Add conference if requested
  if (conference === 'meet') {
    eventData.conferenceData = {
      createRequest: {
        requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    };
  } else if (conference === 'zoom') {
    // Zoom requires external integration - add as location instead
    if (!eventData.location) {
      eventData.location = 'Zoom Meeting (link to be added manually)';
    }
    if (!eventData.description) {
      eventData.description = 'Zoom meeting link will be added by organizer.';
    } else {
      eventData.description += '\n\nZoom meeting link will be added by organizer.';
    }
  }

  // Create event in calendar
  const event = await calendarApi.createCalendarEvent(googleSub, eventData, {
    calendarId,
    conferenceDataVersion: conference === 'meet' ? 1 : 0
  });

  return {
    event: {
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      htmlLink: event.htmlLink || null,
      status: 'upcoming',
      locationText: event.location || null,
      mapUrl: event.location ? generateMapsUrl(event.location) : null,
      attendees: (event.attendees || []).map(a => ({
        name: a.displayName || null,
        email: a.email
      }))
    },
    confirmToken: null,
    warnings: enrichmentSuggestions
      ? ['Event created with auto-filled contact details']
      : []
  };
}

/**
 * Complete enriched calendar schedule (after user confirms via confirmToken)
 */
async function completeCalendarScheduleEnrichment(
  googleSub,
  confirmToken,
  action
) {
  const confirmation = await getPendingConfirmation(confirmToken);

  if (!confirmation) {
    throw { statusCode: 400, message: 'Confirmation expired or not found' };
  }

  if (confirmation.type !== 'enrichment') {
    throw new Error('Invalid confirmation type');
  }

  await confirmPendingConfirmation(confirmToken, action);

  const { eventData, suggestedFields } = confirmation.data;

  // Rebuild event with enrichment
  let updatedEventData = { ...eventData };

  if (action === 'auto-fill' && suggestedFields) {
    let description = eventData.notes || '';

    if (suggestedFields.phone) {
      description += `\n📞 Phone: ${suggestedFields.phone}`;
    }
    if (suggestedFields.address) {
      description += `\n📍 Address: ${suggestedFields.address}`;
    }

    updatedEventData = {
      ...updatedEventData,
      description: description.trim()
    };
  }

  // Create event
  const confirmTimeZone = typeof updatedEventData.when?.timeZone === 'string'
    && updatedEventData.when.timeZone.trim().length > 0
      ? updatedEventData.when.timeZone.trim()
      : REFERENCE_TIMEZONE;

  const normalizedStart = normalizeCalendarTime(updatedEventData.when.start, confirmTimeZone);
  const normalizedEnd = normalizeCalendarTime(updatedEventData.when.end, confirmTimeZone);

  if (!normalizedStart || !normalizedEnd) {
    const invalidTimeError = new Error('Invalid time slot provided');
    invalidTimeError.statusCode = 400;
    throw invalidTimeError;
  }

  const event = await calendarService.createCalendarEvent(googleSub, {
    summary: updatedEventData.title,
    start: normalizedStart,
    end: normalizedEnd,
    attendees: (updatedEventData.attendees || []).map(a => ({
      email: a.email,
      displayName: a.name
    })),
    location: updatedEventData.location,
    description: updatedEventData.description,
    reminders: {
      useDefault: (updatedEventData.reminders || []).length === 0,
      overrides:
        (updatedEventData.reminders || []).length > 0
          ? updatedEventData.reminders.map(r => ({
              method: 'popup',
              minutes: parseInt(r)
            }))
          : undefined
    }
  }, {
    calendarId: updatedEventData.calendarId || 'primary',
    conferenceDataVersion: updatedEventData.conference === 'meet' ? 1 : 0
  });

  await completePendingConfirmation(confirmToken);

  return {
    event: {
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      htmlLink: event.htmlLink || null,
      status: 'upcoming',
      attendees: (event.attendees || []).map(a => ({
        name: a.displayName || null,
        email: a.email
      }))
    }
  };
}

// ==================== CONTACTS MACROS ====================

/**
 * Safe Add Contacts - with deduplication detection
 * 
 * WORKFLOW:
 * 1. Get all existing contacts from Google Contacts Sheet
 * 2. For each new entry, check for duplicates by email/name/phone
 * 3. If duplicates found AND dedupeStrategy='ask' → return confirmToken for user decision
 * 4. Otherwise → add according to strategy (keepBoth/skip/merge)
 * 
 * dedupeStrategy options:
 * - 'ask' (default): Return duplicates for user confirmation
 * - 'keepBoth': Always add (may create duplicates)
 * - 'skip': Skip entries with duplicates
 * - 'merge': Auto-merge into existing contacts (>70% match)
 */
async function contactsSafeAdd(googleSub, params) {
  const { entries, dedupeStrategy = 'ask' } = params;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    const error = new Error('entries parameter required: array of {name, email, phone?, notes?, realestate?}');
    error.statusCode = 400;
    throw error;
  }

  const normalizedStrategy = normalizeDedupeStrategy(dedupeStrategy);

  // ========== STEP 1: Get all existing contacts from Sheet ==========
  
  let existingContacts = [];
  try {
    existingContacts = await contactsService.listAllContacts(googleSub) || [];
  } catch (error) {
    console.warn('⚠️ Failed to list existing contacts:', error.message);
    existingContacts = [];
  }

  // ========== STEP 2: Find duplicates for each entry ==========

  const duplicateFindings = [];

  for (const entry of entries) {
    const entryEmail = (entry.email || '').toLowerCase().trim();
    const entryName = (entry.name || '').toLowerCase().trim();
    const entryPhone = (entry.phone || '').replace(/\D/g, '');

    // Find duplicates in existing contacts
    const candidates = existingContacts.filter(contact => {
      const contactEmail = (contact.email || '').toLowerCase().trim();
      const contactName = (contact.name || '').toLowerCase().trim();
      const contactPhone = (contact.phone || '').replace(/\D/g, '');

      // Match by email (highest confidence)
      if (entryEmail && contactEmail && entryEmail === contactEmail) {
        return true;
      }

      // Match by phone (high confidence)
      if (entryPhone && contactPhone && entryPhone === contactPhone && entryPhone.length > 5) {
        return true;
      }

      // Match by name (lower confidence)
      if (entryName && contactName && entryName === contactName) {
        return true;
      }

      // Partial name match (first + last name in common)
      if (entryName && contactName) {
        const entryParts = entryName.split(/\s+/).filter(p => p.length > 2);
        const contactParts = contactName.split(/\s+/).filter(p => p.length > 2);
        const commonParts = entryParts.filter(p => contactParts.includes(p));
        if (commonParts.length > 0 && Math.max(entryParts.length, contactParts.length) > 1) {
          return true;
        }
      }

      return false;
    });

    duplicateFindings.push({
      entry,
      candidates: candidates.map(c => ({
        ...c,
        rowIndex: c.rowIndex
      }))
    });
  }

  // ========== STEP 3: Check if any duplicates found ==========

  const hasAnyDuplicates = duplicateFindings.some(f => f.candidates.length > 0);

  // ========== STEP 4: Handle dedupeStrategy ==========

  if (hasAnyDuplicates && normalizedStrategy === 'ask') {
    // Return pending confirmation for user to decide
    const confirmation = await createPendingConfirmation(
      googleSub,
      'deduplication',
      {
        operation: 'contacts.safeAdd',
        entriesToAdd: entries,
        duplicateFindings
      }
    );

    return {
      created: [],
      merged: [],
      skipped: duplicateFindings
        .filter(f => f.candidates.length > 0)
        .map(f => ({
          email: f.entry.email,
          name: f.entry.name,
          reason: `Found ${f.candidates.length} existing contact(s)`,
          existing: f.candidates
        })),
      confirmToken: confirmation.confirmToken,
      warnings: [
        `Found potential duplicates for ${duplicateFindings.filter(f => f.candidates.length > 0).length}/${entries.length} contact(s)`,
        "Call /api/macros/confirm with confirmToken and action: 'keepBoth' (add all), 'skip' (skip duplicates), or 'merge' (merge)"
      ]
    };
  }

  // ========== STEP 5: Perform bulk operation based on strategy ==========

  return await performContactsBulkAdd(
    googleSub,
    entries,
    duplicateFindings,
    normalizedStrategy
  );
}

/**
 * Complete deduplication workflow (after user confirms via confirmToken)
 */
async function completeContactsDeduplication(
  googleSub,
  confirmToken,
  action // 'keepBoth', 'skip', or 'merge'
) {
  const confirmation = await getPendingConfirmation(confirmToken);

  if (!confirmation) {
    const error = new Error('Confirmation expired or not found');
    error.statusCode = 400;
    throw error;
  }

  if (confirmation.type !== 'deduplication') {
    throw new Error('Invalid confirmation type');
  }

  const { entriesToAdd, duplicateFindings } = confirmation.data;
  
  const result = await performContactsBulkAdd(
    googleSub,
    entriesToAdd,
    duplicateFindings,
    normalizeDedupeStrategy(action)
  );

  await completePendingConfirmation(confirmToken);

  return result;
}

// ==================== TASKS MACROS ====================

/**
 * Tasks Overview - grouped by section
 */
async function tasksOverview(googleSub, params) {
  const { scope, includeCompleted = false, project, labelIds = [] } = params;
  
  // Validate scope parameter
  const validScopes = ['daily', 'weekly'];
  if (!validScopes.includes(scope)) {
    const error = new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  
  // Calculate date range based on scope
  const now = new Date();
  let start, end;
  
  if (scope === 'daily') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (scope === 'weekly') {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start = new Date(now);
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  }
  
  // Fetch tasks
  const tasks = await tasksService.listTasks(googleSub, {
    showCompleted: includeCompleted,
    dueMin: start.toISOString(),
    dueMax: end.toISOString()
  });
  
  // Group tasks by section
  const sections = {
    today: [],
    thisWeek: [],
    overdue: [],
    completed: []
  };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (const task of tasks.items || []) {
    if (task.completed && includeCompleted) {
      sections.completed.push(task);
    } else if (task.due) {
      const due = new Date(task.due);
      if (due < today) {
        sections.overdue.push(task);
      } else if (due < start) {
        sections.today.push(task);
      } else {
        sections.thisWeek.push(task);
      }
    } else {
      sections.thisWeek.push(task);
    }
  }
  
  return { sections };
}

/**
 * Format ISO datetime range to human-readable Czech format
 * @param {string} startIso - Start time ISO 8601 string
 * @param {string} endIso - End time ISO 8601 string
 * @returns {string} Formatted time range like "15:00-16:00 21.10 2025"
 */
function formatTimeRangeForEmail(startIso, endIso) {
  if (!startIso || !endIso) return '';
  try {
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    
    // Formátování času (HH:MM)
    const startTime = startDate.toLocaleString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Prague'
    });
    
    const endTime = endDate.toLocaleString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Prague'
    });
    
    // Formátování data (DD.MM YYYY)
    const dateStr = startDate.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Prague'
    });
    
    return `${startTime}-${endTime} ${dateStr}`;
  } catch (e) {
    console.warn('Failed to format time range:', startIso, endIso, e.message);
    return `${startIso} - ${endIso}`;
  }
}

/**
 * Format ISO datetime to human-readable Czech format
 * @param {string} isoString - ISO 8601 datetime string
 * @returns {string} Formatted time like "21.10.2025 15:00"
 */
function formatTimeForEmail(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Prague'
    });
  } catch (e) {
    console.warn('Failed to format time:', isoString, e.message);
    return isoString;
  }
}

/**
 * Reminder Drafts - bulk email reminders for today's events
 */
async function calendarReminderDrafts(googleSub, params) {
  const {
    window = 'today',
    hours,
    template,
    includeLocation = true,
    createDrafts = true,
    perAttendee = 'separate',
    calendarId = 'primary'
  } = params;

  // Validate window parameter
  const validWindows = ['today', 'nextHours'];
  if (!validWindows.includes(window)) {
    const error = new Error(`Invalid window: ${window}. Must be one of: ${validWindows.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const validPerAttendeeModes = ['separate', 'combined'];
  if (!validPerAttendeeModes.includes(perAttendee)) {
    const error = new Error(
      `Invalid perAttendee mode: ${perAttendee}. Must be one of: ${validPerAttendeeModes.join(', ')}`
    );
    error.statusCode = 400;
    throw error;
  }
  
  // Validate hours parameter when window='nextHours'
  if (window === 'nextHours') {
    if (!hours || typeof hours !== 'number' || hours < 1 || hours > 24) {
      const error = new Error('hours parameter must be between 1-24 when window=nextHours');
      error.statusCode = 400;
      throw error;
    }
  }
  
  // Calculate time window
  const now = new Date();
  let start, end;
  
  if (window === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (window === 'nextHours') {
    start = now;
    end = new Date(now.getTime() + (hours || 4) * 60 * 60 * 1000);
  }
  
  // Fetch upcoming events with attendees
  const events = await calendarService.listCalendarEvents(googleSub, {
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    orderBy: 'startTime',
    singleEvents: true
  });
  
  const upcomingEvents = events.items.filter(e => {
    const eventStart = new Date(e.start.dateTime || e.start.date);
    return eventStart > now && e.attendees && e.attendees.length > 0;
  });
  
  // Generate drafts
  const drafts = [];
  
  for (const event of upcomingEvents) {
    const attendeesList = (event.attendees || []).filter(a => a && a.email);
    if (attendeesList.length === 0) {
      continue;
    }

    const subject = `Reminder: ${event.summary}`;
    const locationText = includeLocation && event.location ? `\nLocation: ${event.location}` : '';
    const timeRange = formatTimeRangeForEmail(
      event.start.dateTime || event.start.date,
      event.end.dateTime || event.end.date
    );

    if (perAttendee === 'combined') {
      const recipientEmails = attendeesList.map(a => a.email).join(', ');
      const recipientLabel = attendeesList
        .map(a => a.displayName || a.email)
        .filter(Boolean)
        .join(', ') || 'všichni';

      const body = buildReminderBody({
        event,
        template,
        locationText,
        timeRange,
        recipientLabel,
        isGroup: true
      });

      const draftId = await createReminderDraft(googleSub, createDrafts, {
        to: recipientEmails,
        subject,
        body,
        logLabel: recipientEmails
      });

      drafts.push({
        draftId,
        to: recipientEmails,
        subject,
        preview: body.substring(0, 200),
        eventId: event.id
      });

      continue;
    }

    for (const attendee of attendeesList) {
      const recipientLabel = attendee.displayName || attendee.email;
      const body = buildReminderBody({
        event,
        template,
        locationText,
        timeRange,
        recipientLabel,
        isGroup: false
      });

      const draftId = await createReminderDraft(googleSub, createDrafts, {
        to: attendee.email,
        subject,
        body,
        logLabel: attendee.email
      });

      drafts.push({
        draftId,
        to: attendee.email,
        subject,
        preview: body.substring(0, 200),
        eventId: event.id
      });
    }
  }
  
  return {
    drafts,
    subset: false
  };
}

function buildReminderBody({
  event,
  template,
  recipientLabel,
  timeRange,
  locationText,
  isGroup
}) {
  const safeSummary = event.summary || '';
  const greetingName = recipientLabel ? ` ${recipientLabel}` : '';
  const closing = isGroup ? 'Těšíme se!' : 'Těším se!';

  if (template) {
    return template
      .replace(/{title}/g, safeSummary)
      .replace(/{start}/g, event.start.dateTime || event.start.date || '')
      .replace(/{end}/g, event.end.dateTime || event.end.date || '')
      .replace(/{location}/g, event.location || '')
      .replace(/{recipientName}/g, recipientLabel || (isGroup ? 'všichni' : ''));
  }

  return `Ahoj${greetingName},\n\njen připomínám, že s tebou počítám na akci "${safeSummary}"\nČas: ${timeRange}${locationText}\n\n${closing}`;
}

async function createReminderDraft(googleSub, shouldCreate, { to, subject, body, logLabel }) {
  if (!shouldCreate) {
    return null;
  }

  try {
    const draft = await gmailService.createDraft(googleSub, {
      to,
      subject,
      body
    });

    if (!draft) {
      console.error(`❌ [DRAFT_VALIDATION] Draft object is null/undefined for ${logLabel}`);
      throw new Error('Gmail API returned null draft');
    }

    if (!draft.id) {
      console.error(`❌ [DRAFT_VALIDATION] Draft ID is missing for ${logLabel}`);
      console.error('Draft object keys:', Object.keys(draft));
      console.error('Full draft:', JSON.stringify(draft, null, 2));
      throw new Error('Draft created but missing ID field');
    }

    if (typeof draft.id !== 'string') {
      console.error(
        `⚠️ [DRAFT_VALIDATION] Draft ID type is ${typeof draft.id}, expected string: ${draft.id}`
      );
      throw new Error(`Invalid draft ID type: ${typeof draft.id}`);
    }

    console.log(`✅ [DRAFT_SUCCESS] Draft created with ID: ${draft.id} for ${logLabel}`);
    return draft.id;
  } catch (error) {
    console.error(`❌ [DRAFT_ERROR] Failed to create draft for ${logLabel}:`, error.message);
    if (error && error.stack) {
      console.error('Stack:', error.stack);
    }
    return null;
  }
}

// ==================== HELPER FUNCTIONS ====================

function decodePayloadData(data) {
  if (!data) return '';

  try {
    return Buffer.from(data, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Failed to decode payload data:', error.message);
    return '';
  }
}

function stripHtmlTags(html = '') {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function extractBodyText(payload = {}, limit = Infinity) {
  if (!payload) return '';

  const queue = [payload];
  let plainText = '';
  let htmlText = '';

  while (queue.length > 0 && (plainText.length < limit || htmlText.length < limit)) {
    const part = queue.shift();

    if (part.body?.data) {
      const decoded = decodePayloadData(part.body.data);

      if (part.mimeType?.startsWith('text/plain')) {
        if (plainText.length < limit) {
          const remaining = limit - plainText.length;
          plainText += remaining >= decoded.length ? decoded : decoded.slice(0, remaining);
        }
      } else if (part.mimeType?.startsWith('text/html')) {
          if (htmlText.length < limit) {
            const remaining = limit - htmlText.length;
            htmlText += remaining >= decoded.length ? decoded : decoded.slice(0, remaining);
          }
      }
    }

    if (Array.isArray(part.parts)) {
      queue.push(...part.parts);
    }
  }

  const normalizedPlain = normalizeWhitespace(plainText);
  if (normalizedPlain) {
    return normalizedPlain;
  }

  if (htmlText) {
    const stripped = stripHtmlTags(htmlText);
    return normalizeWhitespace(stripped);
  }

  return '';
}

function buildBodySnippetFromPayload(payload, fallbackSnippet = '') {
  const MIN_LENGTH = 200;
  const MAX_LENGTH = 300;

  const text = extractBodyText(payload, MAX_LENGTH + 200);
  const source = text || normalizeWhitespace(fallbackSnippet);

  if (!source) {
    return '';
  }

  if (source.length <= MAX_LENGTH) {
    return source;
  }

  const candidate = source.slice(0, MAX_LENGTH + 1);

  let cutoff = candidate.lastIndexOf('. ');
  if (cutoff < MIN_LENGTH) {
    cutoff = candidate.lastIndexOf(' ');
  }
  if (cutoff < MIN_LENGTH) {
    cutoff = MAX_LENGTH;
  }

  const snippet = candidate.slice(0, cutoff).trim();
  return snippet.length ? `${snippet}…` : source.slice(0, MAX_LENGTH).trim();
}

function buildFallbackSnippet(snippet = '') {
  const normalized = normalizeWhitespace(snippet);
  if (!normalized) {
    return 'Náhled zprávy není k dispozici.';
  }

  if (normalized.length <= 200) {
    return normalized;
  }

  return `${normalized.slice(0, 200)}…`;
}

function categorizeEmail(message) {
  const labels = message.labelIds || [];
  
  if (labels.includes('CATEGORY_SOCIAL')) return 'social';
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'newsletters';
  if (labels.includes('CATEGORY_UPDATES')) return 'updates';
  if (labels.includes('CATEGORY_FORUMS')) return 'forums';
  if (labels.includes('IMPORTANT')) return 'alerts';
  if (labels.includes('INBOX')) return 'primary';
  
  return 'other';
}

function extractAttachmentMetadata(payload) {
  const attachments = [];
  
  function traverse(part) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size,
        body: { attachmentId: part.body.attachmentId }
      });
    }
    
    if (part.parts) {
      part.parts.forEach(traverse);
    }
  }
  
  traverse(payload);
  return attachments;
}

function enrichEmailWithAttachments(message, messageId) {
  const base = {
    messageId,
    senderName: extractSenderName(message.from),
    senderAddress: extractEmail(message.from),
    subject: message.subject || '(no subject)',
    receivedAt: message.internalDate ? new Date(parseInt(message.internalDate)).toISOString() : null,
    inboxCategory: categorizeEmail(message),
    label: message.labelIds?.[0] || null,
    readState: buildReadStateFromLabels(message.labelIds),
    headers: {},
    body: message.snippet || message.body || null,
    truncated: Boolean(message.truncated),
    links: message.links || (message.threadId ? buildGmailLinks(message.threadId, messageId) : null)
  };

  // Process attachments
  if (message.payload?.parts) {
    const rawAttachments = extractAttachmentMetadata(message.payload);
    const processed = processAttachments(rawAttachments, (att) =>
      generateSignedAttachmentUrl(messageId, att.body?.attachmentId)
    );
    base.attachments = processed.attachments;
  } else {
    base.attachments = [];
  }

  if (message.contentMetadata) {
    base.contentMetadata = message.contentMetadata;
  }

  if (message.truncationInfo) {
    base.truncationInfo = message.truncationInfo;
  }

  return base;
}

function createEmptyUnansweredBucket() {
  return {
    items: [],
    subset: false,
    nextPageToken: null,
    scanned: 0,
    overflowCount: 0,
    skippedReasons: {}
  };
}

function buildTimeFilterClauses(timeRange) {
  if (!timeRange) {
    return {};
  }

  if (typeof timeRange.relative === 'string' && timeRange.relative.trim().length > 0) {
    const parsed = parseRelativeTime(timeRange.relative.trim());
    return parsed || {};
  }

  const result = {};
  if (timeRange.start) {
    const startDate = new Date(timeRange.start);
    if (!Number.isNaN(startDate.getTime())) {
      result.after = Math.floor(startDate.getTime() / 1000);
    }
  }
  if (timeRange.end) {
    const endDate = new Date(timeRange.end);
    if (!Number.isNaN(endDate.getTime())) {
      result.before = Math.floor(endDate.getTime() / 1000);
    }
  }
  return result;
}

function describeTimeFilters(filters = {}) {
  if (!filters || (!filters.after && !filters.before)) {
    return null;
  }

  const start = filters.after ? toPragueIso(filters.after * 1000) : null;
  const end = filters.before ? toPragueIso(filters.before * 1000) : null;

  return {
    start,
    end,
    timezone: REFERENCE_TIMEZONE
  };
}

async function collectUnansweredThreads({
  googleSub,
  baseQuery,
  querySuffix,
  pageToken,
  limit,
  userAddresses,
  strictNoReply,
  labelMatch,
  trackingLabelMatch
}) {
  const combinedQuery = [baseQuery, querySuffix].filter(Boolean).join(' ').trim();
  const effectiveLimit = Math.max(1, Math.min(limit || 20, 100));

  const items = [];
  const seenThreads = new Set();
  const skippedReasons = {};

  let nextPageToken = pageToken || null;
  let currentToken = pageToken || undefined;
  let subset = false;
  let scanned = 0;
  let overflowCount = 0;
  let iterations = 0;

  const normalizedAddresses = new Set(
    (userAddresses || []).map(email => (typeof email === 'string' ? email.toLowerCase() : '')).filter(Boolean)
  );

  while (iterations < 5 && items.length < effectiveLimit) {
    iterations += 1;

    const searchResult = await gmailService.searchEmails(googleSub, {
      query: combinedQuery || undefined,
      maxResults: Math.min(200, Math.max(effectiveLimit * 2, 20)),
      pageToken: currentToken
    });

    const messages = searchResult?.messages || [];
    scanned += messages.length;

    if (messages.length === 0) {
      nextPageToken = searchResult?.nextPageToken || null;
      subset = false;
      break;
    }

    for (const message of messages) {
      if (!message.threadId) {
        continue;
      }
      if (seenThreads.has(message.threadId)) {
        continue;
      }
      seenThreads.add(message.threadId);

      const thread = await gmailService.getThread(googleSub, message.threadId);
      if (!thread || !Array.isArray(thread.messages) || thread.messages.length === 0) {
        continue;
      }

      const evaluation = evaluateThreadForUnanswered(thread, {
        normalizedAddresses,
        strictNoReply,
        labelMatch,
        trackingLabelMatch
      });

      if (!evaluation.awaiting) {
        if (evaluation.reason) {
          skippedReasons[evaluation.reason] = (skippedReasons[evaluation.reason] || 0) + 1;
        }
        continue;
      }

      if (items.length < effectiveLimit) {
        items.push(evaluation.item);
      } else {
        overflowCount += 1;
      }
    }

    if (items.length >= effectiveLimit) {
      subset = overflowCount > 0 || Boolean(searchResult.nextPageToken);
      nextPageToken = searchResult.nextPageToken || null;
      break;
    }

    if (!searchResult.nextPageToken) {
      nextPageToken = null;
      subset = overflowCount > 0;
      break;
    }

    currentToken = searchResult.nextPageToken;
    nextPageToken = searchResult.nextPageToken;
    subset = true;
  }

  if (!subset) {
    nextPageToken = null;
  }

  return {
    items,
    subset,
    nextPageToken,
    scanned,
    overflowCount,
    skippedReasons
  };
}

function evaluateThreadForUnanswered(thread, { normalizedAddresses, strictNoReply, labelMatch, trackingLabelMatch }) {
  const messages = Array.isArray(thread.messages) ? [...thread.messages] : [];
  messages.sort((a, b) => {
    const aTime = typeof a.internalDate === 'number' ? a.internalDate : (typeof a.internalDate === 'string' ? parseInt(a.internalDate, 10) : 0);
    const bTime = typeof b.internalDate === 'number' ? b.internalDate : (typeof b.internalDate === 'string' ? parseInt(b.internalDate, 10) : 0);
    return aTime - bTime;
  });

  if (messages.length === 0) {
    return { awaiting: false, reason: 'noMessages' };
  }

  const trackingLabelApplied = trackingLabelMatch
    ? (Array.isArray(thread.labelIds) && thread.labelIds.includes(trackingLabelMatch.id))
      || messages.some(msg => Array.isArray(msg.labelIds) && msg.labelIds.includes(trackingLabelMatch.id))
    : false;

  if (trackingLabelApplied) {
    return { awaiting: false, reason: 'trackingLabelPresent' };
  }

  const decorated = messages.map(msg => {
    const timestamp = typeof msg.internalDate === 'number'
      ? msg.internalDate
      : (typeof msg.internalDate === 'string' ? parseInt(msg.internalDate, 10) : null);
    const fromEmail = typeof msg.from?.email === 'string' ? msg.from.email.toLowerCase() : null;
    const isUser = fromEmail ? normalizedAddresses.has(fromEmail) : false;
    return {
      raw: msg,
      timestamp,
      isUser
    };
  });

  const lastEntry = decorated[decorated.length - 1];
  if (!lastEntry) {
    return { awaiting: false, reason: 'noMessages' };
  }

  if (lastEntry.isUser) {
    return { awaiting: false, reason: 'lastMessageFromUser' };
  }

  const incomingEntries = decorated.filter(entry => !entry.isUser);
  if (incomingEntries.length === 0) {
    return { awaiting: false, reason: 'noIncomingMessages' };
  }

  const lastIncoming = incomingEntries[incomingEntries.length - 1];
  const userReplies = decorated.filter(entry => entry.isUser);
  const hasUserReply = userReplies.length > 0;

  if (strictNoReply && hasUserReply) {
    return { awaiting: false, reason: 'userReplyPresent' };
  }

  const lastUserReply = userReplies[userReplies.length - 1] || null;
  const waitingMinutes = lastIncoming.timestamp
    ? Math.max(0, Math.round((Date.now() - lastIncoming.timestamp) / 60000))
    : null;

  const sinceLastUserReplyMinutes = lastUserReply?.timestamp && lastIncoming.timestamp
    ? Math.max(0, Math.round((lastIncoming.timestamp - lastUserReply.timestamp) / 60000))
    : null;

  const labelApplied = labelMatch ? Array.isArray(thread.labelIds) && thread.labelIds.includes(labelMatch.id) : false;
  const readSourceLabels = lastIncoming.raw.labelIds?.length ? lastIncoming.raw.labelIds : thread.labelIds || [];
  const readState = buildReadStateFromLabels(readSourceLabels);

  const item = {
    threadId: thread.threadId,
    messageId: lastIncoming.raw.id,
    subject: lastIncoming.raw.subject || '(bez předmětu)',
    sender: {
      name: lastIncoming.raw.from?.name || null,
      email: lastIncoming.raw.from?.email || null
    },
    receivedAt: toPragueIso(lastIncoming.timestamp),
    receivedInternal: lastIncoming.timestamp || null,
    snippet: lastIncoming.raw.snippet || '',
    gmailLinks: buildGmailLinks(thread.threadId, lastIncoming.raw.id),
    messageCount: thread.count || messages.length,
    readState,
    hasUserReply,
    lastUserReplyAt: lastUserReply?.timestamp ? toPragueIso(lastUserReply.timestamp) : null,
    lastUserReplyInternal: lastUserReply?.timestamp || null,
    waitingMinutes,
    waitingHoursApprox: typeof waitingMinutes === 'number' ? Number((waitingMinutes / 60).toFixed(1)) : null,
    sinceLastUserReplyMinutes,
    participants: Array.isArray(thread.participants)
      ? thread.participants.map(participant => ({
          email: participant.email,
          name: participant.name || null
        }))
      : [],
    label: labelMatch
      ? {
          suggestedId: labelMatch.id,
          suggestedName: labelMatch.name,
          alreadyApplied: labelApplied
        }
      : null,
    labelApplied,
    trackingLabelApplied,
    strictFiltered: hasUserReply
  };

  return {
    awaiting: true,
    item
  };
}

function toPragueIso(timestamp) {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const offsetHours = getPragueOffsetHours(date);
  const pragueDate = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  const sign = offsetHours >= 0 ? '+' : '-';
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
  return pragueDate.toISOString().replace('Z', offset);
}

function stripDiacritics(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeLabelNameCandidate(value = '') {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findLabelByName(labels = [], targetName) {
  if (!targetName) {
    return null;
  }
  const normalizedTarget = normalizeLabelNameCandidate(targetName);
  return labels.find(label => normalizeLabelNameCandidate(label.name || '') === normalizedTarget) || null;
}

function buildLabelRecommendation(labels = [], targetName, preferredColor, options = {}) {
  const existing = findLabelByName(labels, targetName);

  let backgroundColor = '#d93025';
  let textColor = '#ffffff';

  if (typeof preferredColor === 'string' && preferredColor.trim().startsWith('#')) {
    backgroundColor = preferredColor.trim();
  } else if (preferredColor && typeof preferredColor === 'object') {
    if (typeof preferredColor.backgroundColor === 'string' && preferredColor.backgroundColor.trim().startsWith('#')) {
      backgroundColor = preferredColor.backgroundColor.trim();
    }
    if (typeof preferredColor.textColor === 'string' && preferredColor.textColor.trim().length > 0) {
      textColor = preferredColor.textColor.trim();
    }
  }

  const extraLabelIds = Array.isArray(options.extraLabelIds)
    ? options.extraLabelIds.filter(value => typeof value === 'string' && value.length > 0)
    : [];

  const applyLabelIds = existing
    ? Array.from(new Set([existing.id, ...extraLabelIds]))
    : [];

  return {
    suggestedName: targetName,
    suggestedColor: backgroundColor,
    textColor,
    existingLabel: existing
      ? { id: existing.id, name: existing.name, color: existing.color || null }
      : null,
    canCreate: !existing,
    createRequest: !existing
      ? {
          op: 'labels',
          params: {
            create: {
              name: targetName,
              color: {
                backgroundColor,
                textColor
              }
            }
          }
        }
      : null,
    applyRequestTemplate: existing
      ? {
          op: 'labels',
          params: {
            modify: {
              messageId: '<messageId>',
              add: applyLabelIds,
              remove: []
            }
          }
        }
      : null
  };
}

function generateMapsUrl(locationText) {
  const encoded = encodeURIComponent(locationText);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function buildReadStateFromLabels(labelIds = []) {
  const labels = Array.isArray(labelIds) ? labelIds : [];
  const normalized = labels.map(label => label.toUpperCase());
  const isUnread = normalized.includes('UNREAD');

  return {
    isUnread,
    isRead: !isUnread
  };
}

function buildGmailLinks(threadId, messageId) {
  if (!threadId) {
    return null;
  }

  const threadLink = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
  return {
    thread: threadLink,
    message: messageId ? `${threadLink}?projector=1&messageId=${messageId}` : null
  };
}

/**
 * Extract enrichable fields from Google Contact
 */
function extractContactFields(contact) {
  const fields = {};

  // Phone
  if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
    fields.phone = contact.phoneNumbers[0].value;
  }

  // Address
  if (contact.addresses && contact.addresses.length > 0) {
    const addr = contact.addresses[0];
    fields.address = [
      addr.streetAddress,
      addr.city,
      addr.postalCode,
      addr.countryRegion
    ]
      .filter(Boolean)
      .join(', ');
  }

  // Email (already have from search)
  if (contact.emailAddresses && contact.emailAddresses.length > 1) {
    fields.alternateEmails = contact.emailAddresses
      .slice(1)
      .map(e => e.value);
  }

  return fields;
}

/**
 * Perform bulk contact add/merge with specified strategy
 * Strategy:
 * - 'keepBoth': Always add new contact (may duplicate)
 * - 'skip': Skip entries that have duplicates
 * - 'merge': Merge into existing contact
 */
async function performContactsBulkAdd(accessToken, entries, duplicateFindings, strategy) {
  const result = {
    created: [],
    merged: [],
    skipped: []
  };

  for (let i = 0; i < entries.length; i++) {
    const rawEntry = entries[i] || {};
    const entry = normalizeContactEntry(rawEntry);
    const finding = duplicateFindings[i] || { candidates: [] };
    const candidates = Array.isArray(finding.candidates) ? finding.candidates : [];
    const hasDuplicates = candidates.length > 0;

    if (!hasDuplicates || strategy === 'keepBoth') {
      try {
        await contactsService.addContact(accessToken, entry);
        result.created.push({
          name: entry.name,
          email: entry.email
        });
      } catch (error) {
        console.error(`❌ Failed to create contact ${entry.name}:`, error.message);
        result.skipped.push({
          email: entry.email,
          name: entry.name,
          reason: `Add failed: ${error.message}`
        });
      }
      continue;
    }

    if (strategy === 'skip') {
      result.skipped.push({
        email: entry.email,
        name: entry.name,
        reason: `Skipped: ${candidates.length} duplicate(s) found`,
        existing: candidates
      });
      continue;
    }

    if (strategy === 'merge') {
      const existingContact = candidates[0];

      if (!existingContact) {
        result.skipped.push({
          email: entry.email,
          name: entry.name,
          reason: 'Merge requested but no duplicate candidates found'
        });
        continue;
      }

      try {
        const { payload: mergedContact, changeSummaries } = mergeContactRecords(
          existingContact,
          entry
        );

        await contactsService.updateContact(accessToken, {
          ...mergedContact,
          rowIndex: existingContact.rowIndex
        });

        result.merged.push({
          merged_into: existingContact.email,
          from: entry.email || entry.name,
          fields_updated: changeSummaries.length > 0
            ? changeSummaries
            : ['No changes needed (duplicate already up to date)']
        });
      } catch (error) {
        console.error(`❌ Failed to merge contact ${entry.name}:`, error.message);
        result.skipped.push({
          email: entry.email,
          name: entry.name,
          reason: `Merge failed: ${error.message}`
        });
      }
      continue;
    }

    const unsupportedError = new Error(`Unsupported dedupe strategy: ${strategy}`);
    console.error(unsupportedError.message);
    throw unsupportedError;
  }

  return result;
}

function normalizeDedupeStrategy(strategy) {
  const allowedStrategies = ['ask', 'keepBoth', 'skip', 'merge'];
  const candidate =
    strategy === undefined || strategy === null || strategy === '' ? 'ask' : strategy;
  const normalized =
    typeof candidate === 'string' ? candidate.trim() : String(candidate).trim();

  if (!normalized) {
    return 'ask';
  }

  if (normalized === 'create') {
    return 'keepBoth';
  }

  if (!allowedStrategies.includes(normalized)) {
    const error = new Error(
      `Invalid dedupe strategy: ${strategy}. Must be one of: ${allowedStrategies.join(', ')}`
    );
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function normalizeContactEntry(entry = {}) {
  return {
    name: cleanValue(entry.name),
    email: cleanValue(entry.email),
    phone: cleanValue(entry.phone),
    realEstate: cleanValue(entry.realEstate ?? entry.realestate),
    notes: cleanValue(entry.notes)
  };
}

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mergeContactRecords(existingContact = {}, incomingEntry = {}) {
  const existing = {
    name: cleanValue(existingContact.name),
    email: cleanValue(existingContact.email),
    phone: cleanValue(existingContact.phone),
    realEstate: cleanValue(existingContact.realEstate ?? existingContact.realestate),
    notes: cleanValue(existingContact.notes)
  };

  const incoming = {
    name: cleanValue(incomingEntry.name),
    email: cleanValue(incomingEntry.email),
    phone: cleanValue(incomingEntry.phone),
    realEstate: cleanValue(incomingEntry.realEstate ?? incomingEntry.realestate),
    notes: cleanValue(incomingEntry.notes)
  };

  const summaries = [];

  const nameMerge = mergeTextField(existing.name, incoming.name, {
    separator: ' / ',
    label: 'name'
  });

  const phoneMerge = mergePhoneField(existing.phone, incoming.phone);
  const realEstateMerge = mergeTextField(existing.realEstate, incoming.realEstate, {
    separator: '\n',
    label: 'realEstate'
  });

  const notesMerge = mergeNotesField(existing.notes, incoming.notes);

  let mergedNotes = notesMerge.value;
  summaries.push(...notesMerge.changes);

  const primaryEmail = existing.email || incoming.email;
  if (!existing.email && incoming.email) {
    summaries.push(`email: set to ${incoming.email}`);
  } else if (
    existing.email &&
    incoming.email &&
    !equalsIgnoreCase(existing.email, incoming.email)
  ) {
    const altEmailLine = `Další e-mail: ${incoming.email}`;
    if (!containsCaseInsensitive(mergedNotes, incoming.email)) {
      mergedNotes = appendParagraph(mergedNotes, altEmailLine);
      summaries.push(`notes: added alternate email ${incoming.email}`);
    }
  }

  const mergedContact = {
    name: nameMerge.value,
    email: primaryEmail,
    phone: phoneMerge.value,
    realEstate: realEstateMerge.value,
    notes: mergedNotes
  };

  [nameMerge, phoneMerge, realEstateMerge].forEach(change => {
    if (change.updated && change.description) {
      summaries.push(change.description);
    }
  });

  return {
    payload: mergedContact,
    changeSummaries: summaries
  };
}

function mergeTextField(existing, incoming, { separator, label }) {
  const base = cleanValue(existing);
  const addition = cleanValue(incoming);

  if (!addition) {
    return { value: base, updated: false };
  }

  if (!base) {
    return {
      value: addition,
      updated: true,
      description: `${label}: added ${addition}`
    };
  }

  if (equalsIgnoreCase(base, addition) || containsCaseInsensitive(base, addition)) {
    return { value: base, updated: false };
  }

  const combined = `${base}${separator}${addition}`;
  return {
    value: combined,
    updated: true,
    description: `${label}: appended ${addition}`
  };
}

function mergePhoneField(existing, incoming) {
  const base = cleanValue(existing);
  const addition = cleanValue(incoming);

  if (!addition) {
    return { value: base, updated: false };
  }

  const baseNumbers = extractPhoneVariants(base);
  const additionNumber = normalizePhone(addition);

  if (!additionNumber) {
    return { value: base, updated: false };
  }

  if (baseNumbers.has(additionNumber)) {
    return { value: base, updated: false };
  }

  if (!base) {
    return {
      value: addition,
      updated: true,
      description: `phone: added ${addition}`
    };
  }

  return {
    value: `${base}, ${addition}`,
    updated: true,
    description: `phone: appended ${addition}`
  };
}

function mergeNotesField(existing, incoming) {
  const base = cleanValue(existing);
  const addition = cleanValue(incoming);
  const changes = [];

  if (!addition) {
    return { value: base, changes };
  }

  if (containsCaseInsensitive(base, addition)) {
    return { value: base, changes };
  }

  const value = appendParagraph(base, addition);
  changes.push('notes: appended from new entry');
  return { value, changes };
}

function appendParagraph(base, addition) {
  if (!base) return addition;
  if (!addition) return base;
  return `${base}\n\n${addition}`;
}

function equalsIgnoreCase(a, b) {
  return cleanValue(a).localeCompare(cleanValue(b), undefined, {
    sensitivity: 'accent',
    usage: 'search'
  }) === 0;
}

function containsCaseInsensitive(haystack, needle) {
  const base = cleanValue(haystack).toLowerCase();
  const target = cleanValue(needle).toLowerCase();
  if (!base || !target) return false;
  return base.includes(target);
}

function normalizePhone(value) {
  return cleanValue(value).replace(/\D/g, '');
}

function extractPhoneVariants(value) {
  const normalized = cleanValue(value);
  if (!normalized) {
    return new Set();
  }

  const parts = normalized
    .split(/[;,\n]/)
    .map(segment => normalizePhone(segment))
    .filter(segment => segment.length > 0);

  return new Set(parts);
}



/**
 * Helper: Extract email from "Name <email@example.com>" format
 */
function extractEmail(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/<(.+?)>/);
  return match ? match[1] : fromHeader.trim();
}

/**
 * Helper: Extract name from "Name <email@example.com>" format
 */
function extractSenderName(fromHeader) {
  if (!fromHeader) return '';
  const match = fromHeader.match(/^(.+?)\s*<(.+?)>/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '');
    return name || null;
  }
  // If no angle brackets, return as-is (or null if it looks like email)
  return fromHeader.includes('@') ? null : fromHeader.trim();
}

const traced = wrapModuleFunctions('services.facadeService', {
  inboxOverview,
  inboxSnippets,
  emailQuickRead,
  inboxUserUnansweredRequests,
  calendarPlan,
  calendarSchedule,
  completeCalendarScheduleEnrichment,
  contactsSafeAdd,
  completeContactsDeduplication,
  tasksOverview,
  calendarReminderDrafts,
  calendarListCalendars,
});

const {
  inboxOverview: tracedInboxOverview,
  inboxSnippets: tracedInboxSnippets,
  emailQuickRead: tracedEmailQuickRead,
  inboxUserUnansweredRequests: tracedInboxUserUnansweredRequests,
  calendarPlan: tracedCalendarPlan,
  calendarSchedule: tracedCalendarSchedule,
  completeCalendarScheduleEnrichment: tracedCompleteCalendarScheduleEnrichment,
  contactsSafeAdd: tracedContactsSafeAdd,
  completeContactsDeduplication: tracedCompleteContactsDeduplication,
  tasksOverview: tracedTasksOverview,
  calendarReminderDrafts: tracedCalendarReminderDrafts,
  calendarListCalendars: tracedCalendarListCalendars,
} = traced;

export {
  tracedInboxOverview as inboxOverview,
  tracedInboxSnippets as inboxSnippets,
  tracedEmailQuickRead as emailQuickRead,
  tracedInboxUserUnansweredRequests as inboxUserUnansweredRequests,
  tracedCalendarPlan as calendarPlan,
  tracedCalendarSchedule as calendarSchedule,
  tracedCompleteCalendarScheduleEnrichment as completeCalendarScheduleEnrichment,
  tracedContactsSafeAdd as contactsSafeAdd,
  tracedCompleteContactsDeduplication as completeContactsDeduplication,
  tracedTasksOverview as tasksOverview,
  tracedCalendarReminderDrafts as calendarReminderDrafts,
  tracedCalendarListCalendars as calendarListCalendars,
};

export const __facadeTestUtils = {
  resolveGmailService,
  resolveCalendarService,
  resolveContactsService,
  resolveCreatePendingConfirmation,
};
