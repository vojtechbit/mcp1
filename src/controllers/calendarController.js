import * as calendarService from '../services/googleApiService.js';
import { heavyLimiter } from '../server.js';
import { computeETag, checkETagMatch } from '../utils/helpers.js';
import { createSnapshot, getSnapshot } from '../utils/snapshotStore.js';
import { 
  PAGE_SIZE_DEFAULT, 
  PAGE_SIZE_MAX,
  AGGREGATE_CAP_CAL
} from '../config/limits.js';

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

    const result = await calendarService.createCalendarEvent(req.user.googleSub, eventData);

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
      
      response.checkedConflicts = true;
      response.conflictsCount = conflicts.length;
      
      if (conflicts.length > 0) {
        response.conflicts = conflicts;
        response.note = 'Event created despite conflicts (force=true)';
      }
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to create calendar event');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Event creation failed',
      message: error.message
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

    const result = await calendarService.getCalendarEvent(req.user.googleSub, eventId);

    // ETag support
    const etag = computeETag(result);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      event: result
    });

  } catch (error) {
    console.error('❌ Failed to get calendar event');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Event retrieval failed',
      message: error.message
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
          return res.status(400).json({
            error: 'Invalid or expired snapshot token',
            message: 'Please start a new query'
          });
        }
      }

      const aggregateMode = aggregate === 'true';

      console.log(`📋 Listing calendar events (aggregate: ${aggregateMode})`);

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

          // Check if we hit the cap
          if (allItems.length >= AGGREGATE_CAP_CAL) {
            hasMore = true;
            partial = true;
            allItems = allItems.slice(0, AGGREGATE_CAP_CAL);
            break;
          }

          // Check if there are more pages
          if (result.nextPageToken) {
            currentPageToken = result.nextPageToken;
          } else {
            hasMore = false;
            break;
          }
        }

        // Create snapshot token
        const newSnapshotToken = createSnapshot(
          JSON.stringify({ timeMin, timeMax, query }), 
          { aggregate: true }
        );

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
      console.error('❌ Failed to list calendar events');
      
      if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
        return res.status(401).json({
          error: 'Authentication required',
          message: error.message || 'Your session has expired. Please log in again.',
          code: error.code || 'AUTH_REQUIRED',
          requiresReauth: true
        });
      }
      
      res.status(500).json({
        error: 'Event listing failed',
        message: error.message
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

      const start = updates.start || currentEvent.start.dateTime || currentEvent.start.date;
      const end = updates.end || currentEvent.end.dateTime || currentEvent.end.date;

      const conflicts = await calendarService.checkConflicts(
        req.user.googleSub,
        { start, end, excludeEventId: eventId }
      );

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

    const result = await calendarService.updateCalendarEvent(
      req.user.googleSub,
      eventId,
      updates
    );

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
      
      response.checkedConflicts = true;
      response.conflictsCount = conflicts.length;
      
      if (conflicts.length > 0) {
        response.conflicts = conflicts;
        response.note = 'Event updated despite conflicts (force=true)';
      }
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to update calendar event');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Event update failed',
      message: error.message
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

    const result = await calendarService.deleteCalendarEvent(req.user.googleSub, eventId);

    res.json({
      success: true,
      eventId: result.eventId,
      message: 'Calendar event deleted successfully'
    });

  } catch (error) {
    console.error('❌ Failed to delete calendar event');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Event deletion failed',
      message: error.message
    });
  }
}

export {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  deleteEvent
};
