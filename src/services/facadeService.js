/**
 * Facade Service - Business Façade Layer (BFF)
 * 
 * Orchestrates existing backend services into high-level macros
 * optimized for GPT consumption.
 */

import * as gmailService from './googleApiService.js';
import * as calendarService from './googleApiService.js';
import * as contactsService from './googleApiService.js';
import * as tasksService from './googleApiService.js';
import { parseRelativeTime, getPragueOffsetHours } from '../utils/helpers.js';
import { REFERENCE_TIMEZONE } from '../config/limits.js';
import { processAttachments } from '../utils/attachmentSecurity.js';
import { generateSignedAttachmentUrl } from '../utils/signedUrlGenerator.js';
import {
  createPendingConfirmation,
  getPendingConfirmation,
  confirmPendingConfirmation,
  completePendingConfirmation
} from '../utils/confirmationStore.js';

// ==================== INBOX MACROS ====================

/**
 * Inbox Overview - lightweight cards without snippets
 * Step 1: Search for message IDs
 * Step 2: Batch fetch metadata for all messages
 * Step 3: Return enriched items with sender, subject, etc.
 */
export async function inboxOverview(googleSub, params) {
  const { timeRange, maxItems = 50, filters = {} } = params;
  
  // Build Gmail search query
  let query = '';
  
  if (filters.from) {
    query += `from:${filters.from} `;
  }
  
  if (filters.hasAttachment) {
    query += 'has:attachment ';
  }
  
  // Handle Primary/Promotions/etc category labels
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
      query += `label:${labelId} `;
    }
  }
  
  if (filters.labelIds && filters.labelIds.length > 0) {
    query += filters.labelIds.map(id => `label:${id}`).join(' ');
  }
  
  // Add time range
  if (timeRange) {
    if (timeRange.relative) {
      const times = parseRelativeTime(timeRange.relative);
      if (times) {
        query += `after:${times.after} before:${times.before}`;
      }
    } else if (timeRange.start && timeRange.end) {
      const startSec = Math.floor(new Date(timeRange.start).getTime() / 1000);
      const endSec = Math.floor(new Date(timeRange.end).getTime() / 1000);
      query += `after:${startSec} before:${endSec}`;
    }
  }
  
  // Step 1: Search emails - returns message IDs
  const searchResults = await gmailService.searchEmails(googleSub, {
    q: query.trim(),
    maxResults: Math.min(maxItems, 200)
  });
  
  if (!searchResults.messages || searchResults.messages.length === 0) {
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
      gmailService.readEmail(googleSub, id, { format: 'metadata' })
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
    
    return {
      messageId: msg.id,
      senderName: fromName || null,
      senderAddress: fromEmail || fromHeader,
      subject: msg.subject || '(no subject)',
      receivedAt: msg.date || null,
      inboxCategory: msg.inboxCategory || 'other',
      snippet: msg.snippet || ''
    };
  });
  
  return {
    items,
    subset: (searchResults.resultSizeEstimate || 0) > maxItems,
    nextPageToken: searchResults.nextPageToken || null
  };
}

/**
 * Inbox Snippets - overview with snippets and attachment URLs
 */
export async function inboxSnippets(googleSub, params) {
  const { includeAttachments = true } = params;
  
  // Start with overview - already has metadata
  const overview = await inboxOverview(googleSub, params);
  
  // If overview already includes snippets, just add attachment URLs if needed
  if (!includeAttachments) {
    return {
      items: overview.items,
      subset: overview.subset,
      nextPageToken: overview.nextPageToken
    };
  }
  
  // Fetch attachments for each message (attachments not in metadata call)
  const batchSize = 10;
  const enriched = [];
  
  for (let i = 0; i < overview.items.length; i += batchSize) {
    const batch = overview.items.slice(i, i + batchSize);
    const attachmentPromises = batch.map(async (item) => {
      try {
        const message = await gmailService.readEmail(googleSub, item.messageId, { format: 'full' });
        
        const enrichedItem = {
          ...item,
          attachmentUrls: []
        };
        
        if (message.payload?.parts) {
          const attachments = extractAttachmentMetadata(message.payload);
          const processed = processAttachments(attachments, (att) => 
            generateSignedAttachmentUrl(item.messageId, att.body?.attachmentId)
          );
          
          enrichedItem.attachmentUrls = processed.attachments
            .filter(a => !a.blocked && a.url)
            .map(a => a.url);
        }
        
        return enrichedItem;
      } catch (error) {
        console.error(`Failed to fetch attachments for ${item.messageId}:`, error.message);
        return {
          ...item,
          attachmentUrls: []
        };
      }
    });
    
    const batchResults = await Promise.all(attachmentPromises);
    enriched.push(...batchResults);
  }
  
  return {
    items: enriched,
    subset: overview.subset,
    nextPageToken: overview.nextPageToken
  };
}

/**
 * Email Quick Read - single or batch read with attachments
 */
export async function emailQuickRead(googleSub, params) {
  const { ids, searchQuery, format = 'minimal' } = params;
  
  // Validate format parameter
  const validFormats = ['snippet', 'minimal', 'metadata', 'full'];
  if (format && !validFormats.includes(format)) {
    const error = new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  
  let messageIds = ids;
  
  // If searchQuery provided, get IDs first
  if (!messageIds && searchQuery) {
    const searchResults = await gmailService.searchEmails(googleSub, {
      q: searchQuery,
      maxResults: 50
    });
    messageIds = searchResults.messages.map(m => m.id);
  }
  
  if (!messageIds || messageIds.length === 0) {
    throw new Error('No message IDs provided or found');
  }
  
  // Decide single vs batch
  if (messageIds.length === 1) {
    const message = await gmailService.readEmail(googleSub, messageIds[0], { format });
    const enriched = enrichEmailWithAttachments(message, messageIds[0]);
    
    return {
      mode: 'single',
      item: enriched
    };
  } else {
    const messages = await Promise.all(
      messageIds.map(id => gmailService.readEmail(googleSub, id, { format }))
    );
    
    const enriched = messages.map((msg, idx) => 
      enrichEmailWithAttachments(msg, messageIds[idx])
    );
    
    return {
      mode: 'batch',
      items: enriched
    };
  }
}

// ==================== CALENDAR MACROS ====================

/**
 * Calendar Plan - daily/weekly view with status
 */
export async function calendarPlan(googleSub, params) {
  const { scope, date, includePast = false, pastTreatment = 'minimal' } = params;
  
  // Validate scope parameter
  const validScopes = ['daily', 'weekly'];
  if (!validScopes.includes(scope)) {
    const error = new Error(`Invalid scope: ${scope}. Must be one of: ${validScopes.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  
  // Parse date and calculate range using Prague timezone
  const anchorDate = new Date(date);
  let start, end;
  
  if (scope === 'daily') {
    // Parse anchor date in Prague timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: REFERENCE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const parts = formatter.formatToParts(anchorDate);
    const pragueDate = {
      year: parseInt(parts.find(p => p.type === 'year').value),
      month: parseInt(parts.find(p => p.type === 'month').value),
      day: parseInt(parts.find(p => p.type === 'day').value)
    };
    
    // Create midnight Prague time in UTC
    const offsetHours = getPragueOffsetHours(anchorDate);
    const midnight = new Date(Date.UTC(pragueDate.year, pragueDate.month - 1, pragueDate.day, 0, 0, 0, 0));
    start = new Date(midnight.getTime() - (offsetHours * 60 * 60 * 1000));
    
    end = new Date(start.getTime() + (24 * 60 * 60 * 1000));
  } else if (scope === 'weekly') {
    // Find Monday of the week in Prague timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: REFERENCE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'narrow'
    });
    
    const parts = formatter.formatToParts(anchorDate);
    const pragueDate = {
      year: parseInt(parts.find(p => p.type === 'year').value),
      month: parseInt(parts.find(p => p.type === 'month').value),
      day: parseInt(parts.find(p => p.type === 'day').value)
    };
    
    const weekdayMap = { S: 0, M: 1, T: 2, W: 3, T: 4, F: 5, S: 6 }; // Simplified
    const dayOfWeek = new Date(pragueDate.year, pragueDate.month - 1, pragueDate.day).getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const mondayDate = new Date(pragueDate.year, pragueDate.month - 1, pragueDate.day + daysToMonday);
    
    // Create midnight Prague time for Monday
    const offsetHours = getPragueOffsetHours(anchorDate);
    const midnight = new Date(Date.UTC(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate(), 0, 0, 0, 0));
    start = new Date(midnight.getTime() - (offsetHours * 60 * 60 * 1000));
    
    end = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000));
  }
  
  // Fetch events
  const events = await calendarService.listEvents(googleSub, {
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

/**
 * Calendar Schedule - create event with optional contact enrichment
 * 
 * WORKFLOW FOR enrichFromContacts='ask':
 * 1. Check if contact exists for first attendee
 * 2. If found → return confirmToken + suggested fields
 * 3. User confirms with /api/macros/confirm endpoint
 * 4. Complete operation with enriched data
 */
export async function calendarSchedule(googleSub, params) {
  const {
    title,
    when,
    attendees = [],
    enrichFromContacts = 'ask',
    conference = 'none',
    location,
    notes,
    reminders = [],
    privacy = 'default'
  } = params;

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
          const conflicts = await calendarService.checkConflicts(googleSub, {
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
    throw new Error('Invalid when: must provide fixed or proposals', { statusCode: 400 });
  }

  // ========== STEP 1: Check for enrichment opportunities ==========
  
  let enrichmentSuggestions = null;
  let confirmToken = null;

  if (enrichFromContacts !== 'off' && attendees.length > 0) {
    // Get first attendee (primary contact to enrich from)
    const primaryAttendee = attendees[0];

    try {
      // Search for contact in Google Contacts
      const contactsResult = await contactsService.searchContacts(
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
          const confirmation = await createPendingConfirmation(
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
                privacy
              },
              contactId: contact.resourceName,
              suggestedFields: enrichmentSuggestions
            }
          );

          confirmToken = confirmation.confirmToken;
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
        'Suggested enrichment: ' + Object.keys(enrichmentSuggestions).join(', '),
        'Call /api/macros/confirm with confirmToken to proceed'
      ]
    };
  }

  // ========== STEP 4: Create event (with or without enrichment) ==========

  const eventData = {
    summary: title,
    start: {
      dateTime: timeSlot.start,
      timeZone: 'Europe/Prague'
    },
    end: {
      dateTime: timeSlot.end,
      timeZone: 'Europe/Prague'
    },
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
  const event = await calendarService.createEvent(googleSub, eventData, {
    conferenceDataVersion: conference === 'meet' ? 1 : 0
  });

  return {
    event: {
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
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
export async function completeCalendarScheduleEnrichment(
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
  const event = await calendarService.createEvent(googleSub, {
    summary: updatedEventData.title,
    start: {
      dateTime: updatedEventData.when.start,
      timeZone: 'Europe/Prague'
    },
    end: {
      dateTime: updatedEventData.when.end,
      timeZone: 'Europe/Prague'
    },
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
  });

  await completePendingConfirmation(confirmToken);

  return {
    event: {
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
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
 * Safe Add Contacts - with deduplication workflow
 * 
 * WORKFLOW FOR dedupeStrategy='ask':
 * 1. For each entry, search existing contacts for duplicates
 * 2. If duplicates found → return confirmToken + candidates
 * 3. User confirms with /api/macros/confirm endpoint
 * 4. Complete operation based on user choice
 */
export async function contactsSafeAdd(googleSub, params) {
  const { entries, dedupeStrategy = 'ask' } = params;

  if (!entries || entries.length === 0) {
    throw { statusCode: 400, message: 'No entries provided' };
  }

  // ========== STEP 1: Check for duplicates ==========

  const duplicateFindings = [];

  for (const entry of entries) {
    try {
      // Search for existing contacts with similar name/email
      const searchQuery = entry.email || entry.name;
      const searchResult = await contactsService.searchContacts(
        googleSub,
        searchQuery
      );

      const candidates = [];

      if (
        searchResult &&
        searchResult.connections &&
        searchResult.connections.length > 0
      ) {
        for (const connection of searchResult.connections) {
          const similarity = calculateSimilarity(entry, connection);

          if (similarity > 0.7) {
            candidates.push({
              id: connection.resourceName,
              name:
                connection.names && connection.names[0]
                  ? connection.names[0].displayName
                  : '',
              email:
                connection.emailAddresses &&
                connection.emailAddresses[0]
                  ? connection.emailAddresses[0].value
                  : '',
              phone:
                connection.phoneNumbers &&
                connection.phoneNumbers[0]
                  ? connection.phoneNumbers[0].value
                  : '',
              similarity: Math.round(similarity * 100)
            });
          }
        }
      }

      duplicateFindings.push({
        entry,
        candidates
      });
    } catch (error) {
      console.warn(
        `❌ Deduplication search failed for ${entry.email || entry.name}:`,
        error.message
      );
      duplicateFindings.push({
        entry,
        candidates: []
      });
    }
  }

  // ========== STEP 2: Check if any duplicates found ==========

  const hasAnyDuplicates = duplicateFindings.some(
    f => f.candidates.length > 0
  );

  // ========== STEP 3: Handle dedupeStrategy ==========

  if (hasAnyDuplicates && dedupeStrategy === 'ask') {
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
        .map(f => f.entry.email || f.entry.name),
      confirmToken: confirmation.confirmToken,
      warnings: [
        `Found potential duplicates for ${duplicateFindings.filter(f => f.candidates.length > 0).length} contact(s)`,
        'Call /api/macros/confirm with confirmToken to decide what to do'
      ]
    };
  }

  // ========== STEP 4: Perform bulk operation ==========

  if (hasAnyDuplicates && dedupeStrategy === 'merge') {
    return await performContactsUpsert(
      googleSub,
      entries,
      duplicateFindings,
      'merge'
    );
  } else if (hasAnyDuplicates && dedupeStrategy === 'keepBoth') {
    return await performContactsUpsert(
      googleSub,
      entries,
      duplicateFindings,
      'keepBoth'
    );
  } else {
    return await performContactsUpsert(
      googleSub,
      entries,
      duplicateFindings,
      'create'
    );
  }
}

/**
 * Complete deduplication workflow (after user confirms)
 */
export async function completeContactsDeduplication(
  googleSub,
  confirmToken,
  action
) {
  const confirmation = await getPendingConfirmation(confirmToken);

  if (!confirmation) {
    throw { statusCode: 400, message: 'Confirmation expired or not found' };
  }

  if (confirmation.type !== 'deduplication') {
    throw new Error('Invalid confirmation type');
  }

  await confirmPendingConfirmation(confirmToken, action);

  const { entriesToAdd, duplicateFindings } = confirmation.data;
  const result = await performContactsUpsert(
    googleSub,
    entriesToAdd,
    duplicateFindings,
    action
  );

  await completePendingConfirmation(confirmToken);

  return result;
}

// ==================== TASKS MACROS ====================

/**
 * Tasks Overview - grouped by section
 */
export async function tasksOverview(googleSub, params) {
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
 * Reminder Drafts - bulk email reminders for today's events
 */
export async function calendarReminderDrafts(googleSub, params) {
  const {
    window = 'today',
    hours,
    template,
    includeLocation = true,
    createDrafts = true,
    perAttendee = 'separate'
  } = params;
  
  // Validate window parameter
  const validWindows = ['today', 'nextHours'];
  if (!validWindows.includes(window)) {
    const error = new Error(`Invalid window: ${window}. Must be one of: ${validWindows.join(', ')}`);
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
  const events = await calendarService.listEvents(googleSub, {
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
    for (const attendee of event.attendees || []) {
      const subject = `Reminder: ${event.summary}`;
      const locationText = includeLocation && event.location ? `\nLocation: ${event.location}` : '';
      
      const body = template 
        ? template
            .replace(/{title}/g, event.summary || '')
            .replace(/{start}/g, event.start.dateTime || event.start.date)
            .replace(/{end}/g, event.end.dateTime || event.end.date)
            .replace(/{location}/g, event.location || '')
            .replace(/{recipientName}/g, attendee.displayName || attendee.email)
        : `Hi${attendee.displayName ? ' ' + attendee.displayName : ''},\n\nThis is a reminder about: ${event.summary}\nTime: ${event.start.dateTime || event.start.date}${locationText}\n\nSee you there!`;
      
      let draftId = null;
      if (createDrafts) {
        try {
          const draft = await gmailService.createDraft(googleSub, {
            to: attendee.email,
            subject,
            body
          });
          draftId = draft.id;
        } catch (error) {
          console.error(`Failed to create draft for ${attendee.email}:`, error.message);
        }
      }
      
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

// ==================== HELPER FUNCTIONS ====================

function extractSenderName(from) {
  if (!from) return '';
  const match = from.match(/^"?([^<"]+)"?\s*</);
  return match ? match[1].trim() : extractEmail(from);
}

function extractEmail(from) {
  if (!from) return '';
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
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
    headers: {},
    body: message.snippet || message.body || null
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
  
  return base;
}

function generateMapsUrl(locationText) {
  const encoded = encodeURIComponent(locationText);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
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
 * Perform bulk contact upsert with specified strategy
 */
async function performContactsUpsert(
  googleSub,
  entries,
  duplicateFindings,
  strategy
) {
  const result = {
    created: [],
    merged: [],
    skipped: []
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const finding = duplicateFindings[i];

    if (finding.candidates.length === 0 || strategy === 'keepBoth') {
      try {
        const created = await contactsService.addContact(googleSub, {
          name: entry.name,
          email: entry.email,
          phone: entry.phone,
          organization: entry.realestate,
          notes: entry.notes
        });

        result.created.push({
          contactId: created.resourceName || created.id,
          name: entry.name,
          email: entry.email
        });
      } catch (error) {
        console.error(`Failed to create contact ${entry.name}:`, error.message);
        result.skipped.push(entry.email || entry.name);
      }
    } else if (strategy === 'merge' && finding.candidates.length > 0) {
      const bestMatch = finding.candidates.reduce((a, b) =>
        a.similarity > b.similarity ? a : b
      );

      try {
        const merged = await contactsService.updateContact(googleSub, {
          id: bestMatch.id,
          name: entry.name,
          email: entry.email || bestMatch.email,
          phone: entry.phone || bestMatch.phone,
          organization: entry.realestate || bestMatch.company,
          notes: entry.notes
        });

        result.merged.push({
          into: bestMatch.id,
          from: entry.name,
          mergeScore: bestMatch.similarity
        });
      } catch (error) {
        console.error(`Failed to merge contact ${entry.name}:`, error.message);
        result.skipped.push(entry.email || entry.name);
      }
    } else if (strategy === 'skip') {
      result.skipped.push(entry.email || entry.name);
    }
  }

  return result;
}

/**
 * Calculate similarity between entry and existing contact (0-1)
 * Uses: name match + email match (weighted)
 */
function calculateSimilarity(entry, existingContact) {
  let score = 0;

  // Name similarity
  if (entry.name && existingContact.names && existingContact.names.length > 0) {
    const entryName = entry.name.toLowerCase();
    const existingName =
      existingContact.names[0].displayName.toLowerCase();

    if (entryName === existingName) {
      score += 0.6;
    } else if (
      entryName.includes(existingName) ||
      existingName.includes(entryName)
    ) {
      score += 0.3;
    }
  }

  // Email similarity (highest weight)
  if (
    entry.email &&
    existingContact.emailAddresses &&
    existingContact.emailAddresses.length > 0
  ) {
    const entryEmail = entry.email.toLowerCase();
    const existingEmail =
      existingContact.emailAddresses[0].value.toLowerCase();

    if (entryEmail === existingEmail) {
      score += 0.4;
    } else if (
      entryEmail.split('@')[0] === existingEmail.split('@')[0]
    ) {
      score += 0.1;
    }
  }

  // Phone similarity
  if (
    entry.phone &&
    existingContact.phoneNumbers &&
    existingContact.phoneNumbers.length > 0
  ) {
    const entryPhone = entry.phone.replace(/\D/g, '');
    const existingPhone =
      existingContact.phoneNumbers[0].value.replace(/\D/g, '');

    if (entryPhone === existingPhone) {
      score += 0.3;
    }
  }

  return Math.min(score, 1);
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
