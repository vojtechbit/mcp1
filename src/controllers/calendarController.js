import * as calendarService from '../services/googleApiService.js';
import { heavyLimiter } from '../server.js';
import { computeETag, checkETagMatch } from '../utils/helpers.js';
import { createSnapshot, getSnapshot } from '../utils/snapshotStore.js';
import { handleControllerError } from '../utils/errors.js';
import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  AGGREGATE_CAP_CAL
} from '../config/limits.js';
import { debugStep, wrapModuleFunctions } from '../utils/advancedDebugging.js';

/**
 * Create a calendar event
 * POST /api/calendar/events
 * Body: { summary, start, end, description?, location?, attendees?, timeZone?, reminders?, checkConflicts?, force? }
 */
async function createEvent(req, res) {
  try {
    const {
      summary, start, end, description, location, attendees, timeZone, reminders,
      checkConflicts, force
    } = req.body;

    debugStep('Validating createEvent payload', {
      hasSummary: Boolean(summary),
      hasStart: Boolean(start),
      hasEnd: Boolean(end),
      checkConflicts: Boolean(checkConflicts),
      forceOverride: Boolean(force)
    });

    if (!summary || !start || !end) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: summary, start, end'
      });
    }

    // Check for conflicts if requested
    if (checkConflicts) {
      console.log(`🔍 Checking for calendar conflicts...`);

      const conflicts = await calendarService.checkConflicts(
        req.user.googleSub,
        { start, end }
      );

      debugStep('Conflict check completed', {
        conflictCount: conflicts.length,
        forced: Boolean(force)
      });

      if (conflicts.length > 0 && !force) {
        // Conflicts found and force not set - do not create event
        return res.status(409).json({
          error: 'Conflict detected',
          message: 'Time slot conflicts with existing event(s)',
          blocked: true,
          checkedConflicts: true,
          conflictsCount: conflicts.length,
          conflicts: conflicts
        });
      }

      // If force=true, continue creating but still return conflicts
      if (conflicts.length > 0) {
        console.log(`⚠️  ${conflicts.length} conflict(s) found, but force=true - creating anyway`);
      }
    }

    console.log(`📅 Creating calendar event: ${summary}`);

    const eventData = {
      summary,
      start,
      end,
      description,
      location,
      attendees,
      timeZone: timeZone || 'UTC',
      reminders
    };

    debugStep('Sending create event request to Google API', {
      attendeeCount: Array.isArray(attendees) ? attendees.length : 0,
      hasLocation: Boolean(location)
    });

    const result = await calendarService.createCalendarEvent(req.user.googleSub, eventData);

    debugStep('Calendar API responded with event', {
      eventId: result?.id,
      hasHtmlLink: Boolean(result?.htmlLink)
    });

    const response = {
      success: true,
      eventId: result.id,
      htmlLink: result.htmlLink,
      message: 'Calendar event created successfully'
    };

    // Include conflict info if checked
    if (checkConflicts) {
      const conflicts = await calendarService.checkConflicts(
        req.user.googleSub,
        { start, end, excludeEventId: result.id }
      );

      debugStep('Post-create conflict audit', {
        conflictCount: conflicts.length,
        excludedEventId: result.id
      });

      response.checkedConflicts = true;
      response.conflictsCount = conflicts.length;

      if (conflicts.length > 0) {
        response.conflicts = conflicts;
        response.note = 'Event created despite conflicts (force=true)';
      }
    }

    res.json(response);

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'calendar.createEvent',
      defaultMessage: 'Event creation failed',
      defaultCode: 'CALENDAR_EVENT_CREATE_FAILED'
    });
  }
}

/**
 * Get a calendar event
 * GET /api/calendar/events/:eventId
 */
async function getEvent(req, res) {
  try {
    const { eventId } = req.params;

    console.log(`📖 Getting calendar event ${eventId}...`);
    debugStep('Fetching calendar event', { eventId });

    const result = await calendarService.getCalendarEvent(req.user.googleSub, eventId);
    debugStep('Calendar event retrieved', { hasEvent: Boolean(result) });

    // ETag support
    const etag = computeETag(result);
    debugStep('Computed event ETag', { etag });
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      debugStep('ETag matched client cache', { eventId });
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      event: result
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'calendar.getEvent',
      defaultMessage: 'Event retrieval failed',
      defaultCode: 'CALENDAR_EVENT_GET_FAILED'
    });
  }
}

/**
 * List calendar events
 * GET /api/calendar/events?timeMin=...&timeMax=...&maxResults=100&pageToken=...&aggregate=true&snapshotToken=...
 * 
 * Features:
 * - aggregate=true: paginate internally until AGGREGATE_CAP_CAL or exhaustion
 * - Pagination support with hasMore and nextPageToken
 * - ETag support for caching
 * - Snapshot tokens for stable iteration
 */
async function listEvents(req, res) {
  const runList = async (req, res) => {
    try {
      let {
        timeMin,
        timeMax, 
        maxResults, 
        pageToken,
        query,
        aggregate,
        snapshotToken
      } = req.query;

      // Handle snapshot token
      let snapshot = null;
      if (snapshotToken) {
        snapshot = getSnapshot(snapshotToken);
        if (!snapshot) {
          debugStep('Snapshot token invalid', { snapshotToken });
          return res.status(400).json({
            error: 'Invalid or expired snapshot token',
            message: 'Please start a new query'
          });
        }
        debugStep('Restored snapshot from token', {
          itemsRestored: snapshot.items?.length || 0,
          hasMore: Boolean(snapshot.hasMore)
        });
      }

      const aggregateMode = aggregate === 'true';

      console.log(`📋 Listing calendar events (aggregate: ${aggregateMode})`);
      debugStep('Preparing to list events', {
        aggregateMode,
        requestedPageToken: pageToken,
        requestedMaxResults: maxResults
      });

      if (aggregateMode) {
        // Aggregate mode: paginate internally
        let allItems = [];
        let currentPageToken = pageToken;
        let pagesConsumed = 0;
        let hasMore = false;
        let partial = false;

        while (true) {
          const result = await calendarService.listCalendarEvents(req.user.googleSub, {
            timeMin,
            timeMax,
            maxResults: PAGE_SIZE_DEFAULT,
            pageToken: currentPageToken,
            query
          });

          const items = result.items || [];
          allItems = allItems.concat(items);
          pagesConsumed++;
          debugStep('Fetched aggregate page', {
            pagesConsumed,
            itemsFetched: items.length,
            totalAccumulated: allItems.length,
            hasNextPage: Boolean(result.nextPageToken)
          });

          // Check if we hit the cap
          if (allItems.length >= AGGREGATE_CAP_CAL) {
            hasMore = true;
            partial = true;
            allItems = allItems.slice(0, AGGREGATE_CAP_CAL);
            debugStep('Aggregate cap reached', {
              cap: AGGREGATE_CAP_CAL,
              trimmedTo: allItems.length
            });
            break;
          }

          // Check if there are more pages
          if (result.nextPageToken) {
            currentPageToken = result.nextPageToken;
          } else {
            hasMore = false;
            debugStep('No additional pages available', { pagesConsumed });
            break;
          }
        }

        // Create snapshot token
        const newSnapshotToken = createSnapshot(
          JSON.stringify({ timeMin, timeMax, query }),
          { aggregate: true }
        );

        debugStep('Aggregate snapshot created', {
          totalItems: allItems.length,
          pagesConsumed,
          hasMore,
          partial
        });

        const response = {
          success: true,
          items: allItems,
          totalExact: allItems.length,
          pagesConsumed,
          hasMore,
          partial,
          snapshotToken: newSnapshotToken
        };

        // ETag support
        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);

      } else {
        // Normal mode: single page
        const pageSize = Math.min(
          parseInt(maxResults) || PAGE_SIZE_DEFAULT,
          PAGE_SIZE_MAX
        );

        const result = await calendarService.listCalendarEvents(req.user.googleSub, {
          timeMin,
          timeMax,
          maxResults: pageSize,
          pageToken,
          query
        });

        const items = result.items || [];
        const hasMore = !!result.nextPageToken;
        const nextPageToken = result.nextPageToken;

        debugStep('Fetched single page of events', {
          pageSize,
          itemsReturned: items.length,
          hasMore,
          nextPageToken
        });

        const response = {
          success: true,
          items,
          hasMore,
          nextPageToken
        };

        // ETag support
        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);
      }

    } catch (error) {
      return handleControllerError(res, error, {
        context: 'calendar.listEvents',
        defaultMessage: 'Event listing failed',
        defaultCode: 'CALENDAR_EVENT_LIST_FAILED'
      });
    }
  };

  // Apply heavy limiter if aggregate mode
  if (req.query.aggregate === 'true') {
    heavyLimiter(req, res, () => runList(req, res));
  } else {
    runList(req, res);
  }
}

/**
 * Update a calendar event
 * PATCH /api/calendar/events/:eventId
 * Body: { summary?, start?, end?, description?, location?, attendees?, checkConflicts?, force? }
 */
async function updateEvent(req, res) {
  try {
    const { eventId } = req.params;
    const { checkConflicts, force, ...updates } = req.body;

    debugStep('Received updateEvent request', {
      eventId,
      checkConflicts: Boolean(checkConflicts),
      forceOverride: Boolean(force),
      fieldsProvided: Object.keys(updates)
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No update fields provided'
      });
    }

    // Check for conflicts if requested and time is being updated
    if (checkConflicts && (updates.start || updates.end)) {
      console.log(`🔍 Checking for calendar conflicts...`);

      // Get current event to determine time range
      const currentEvent = await calendarService.getCalendarEvent(
        req.user.googleSub,
        eventId
      );

      debugStep('Loaded current event for conflict check', {
        hasStartUpdate: Boolean(updates.start),
        hasEndUpdate: Boolean(updates.end)
      });

      const start = updates.start || currentEvent.start.dateTime || currentEvent.start.date;
      const end = updates.end || currentEvent.end.dateTime || currentEvent.end.date;

      debugStep('Evaluating conflicts for updated time window', {
        start,
        end
      });

      const conflicts = await calendarService.checkConflicts(
        req.user.googleSub,
        { start, end, excludeEventId: eventId }
      );

      debugStep('Conflict check completed', {
        conflictCount: conflicts.length,
        forced: Boolean(force)
      });

      if (conflicts.length > 0 && !force) {
        // Conflicts found and force not set - do not update event
        return res.status(409).json({
          error: 'Conflict detected',
          message: 'Updated time slot conflicts with existing event(s)',
          blocked: true,
          checkedConflicts: true,
          conflictsCount: conflicts.length,
          conflicts: conflicts
        });
      }

      // If force=true, continue updating but still return conflicts
      if (conflicts.length > 0) {
        console.log(`⚠️  ${conflicts.length} conflict(s) found, but force=true - updating anyway`);
      }
    }

    console.log(`✏️  Updating calendar event ${eventId}...`);

    debugStep('Sending update to Google API', {
      eventId,
      updateKeys: Object.keys(updates)
    });

    const result = await calendarService.updateCalendarEvent(
      req.user.googleSub,
      eventId,
      updates
    );

    debugStep('Update applied', {
      eventId: result?.id,
      hasHtmlLink: Boolean(result?.htmlLink)
    });

    const response = {
      success: true,
      eventId: result.id,
      htmlLink: result.htmlLink,
      message: 'Calendar event updated successfully'
    };

    // Include conflict info if checked
    if (checkConflicts && (updates.start || updates.end)) {
      const start = updates.start || result.start.dateTime || result.start.date;
      const end = updates.end || result.end.dateTime || result.end.date;

      const conflicts = await calendarService.checkConflicts(
        req.user.googleSub,
        { start, end, excludeEventId: eventId }
      );

      debugStep('Post-update conflict audit', {
        conflictCount: conflicts.length
      });

      response.checkedConflicts = true;
      response.conflictsCount = conflicts.length;

      if (conflicts.length > 0) {
        response.conflicts = conflicts;
        response.note = 'Event updated despite conflicts (force=true)';
      }
    }

    res.json(response);

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'calendar.updateEvent',
      defaultMessage: 'Event update failed',
      defaultCode: 'CALENDAR_EVENT_UPDATE_FAILED'
    });
  }
}

/**
 * Delete a calendar event
 * DELETE /api/calendar/events/:eventId
 */
async function deleteEvent(req, res) {
  try {
    const { eventId } = req.params;

    console.log(`🗑️  Deleting calendar event ${eventId}...`);
    debugStep('Deleting calendar event', { eventId });

    const result = await calendarService.deleteCalendarEvent(req.user.googleSub, eventId);

    debugStep('Calendar event deleted', {
      eventId: result?.eventId,
      status: result?.status || 'unknown'
    });

    res.json({
      success: true,
      eventId: result.eventId,
      message: 'Calendar event deleted successfully'
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'calendar.deleteEvent',
      defaultMessage: 'Event deletion failed',
      defaultCode: 'CALENDAR_EVENT_DELETE_FAILED'
    });
  }
}

const traced = wrapModuleFunctions('controllers.calendarController', {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent
});

const {
  createEvent: tracedCreateEvent,
  getEvent: tracedGetEvent,
  listEvents: tracedListEvents,
  updateEvent: tracedUpdateEvent,
  deleteEvent: tracedDeleteEvent
} = traced;

export {
  tracedCreateEvent as createEvent,
  tracedGetEvent as getEvent,
  tracedListEvents as listEvents,
  tracedUpdateEvent as updateEvent,
  tracedDeleteEvent as deleteEvent
};
