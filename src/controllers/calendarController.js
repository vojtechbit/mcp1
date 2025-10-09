import * as calendarService from '../services/googleApiService.js';

/**
 * Create a calendar event
 * POST /api/calendar/events
 * Body: { summary, start, end, description?, location?, attendees?, timeZone?, reminders? }
 */
async function createEvent(req, res) {
  try {
    const { summary, start, end, description, location, attendees, timeZone, reminders } = req.body;

    // Validate required fields
    if (!summary || !start || !end) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: summary, start, end'
      });
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

    res.json({
      success: true,
      eventId: result.id,
      htmlLink: result.htmlLink,
      message: 'Calendar event created successfully'
    });

  } catch (error) {
    console.error('❌ Failed to create calendar event');
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

    res.json({
      success: true,
      event: result
    });

  } catch (error) {
    console.error('❌ Failed to get calendar event');
    res.status(500).json({
      error: 'Event retrieval failed',
      message: error.message
    });
  }
}

/**
 * List calendar events
 * GET /api/calendar/events?timeMin=...&timeMax=...&maxResults=10&query=...
 */
async function listEvents(req, res) {
  try {
    const { timeMin, timeMax, maxResults, query } = req.query;

    console.log(`📋 Listing calendar events...`);

    const result = await calendarService.listCalendarEvents(req.user.googleSub, {
      timeMin,
      timeMax,
      maxResults: parseInt(maxResults) || 10,
      query
    });

    res.json({
      success: true,
      events: result.items || [],
      nextPageToken: result.nextPageToken,
      summary: result.summary
    });

  } catch (error) {
    console.error('❌ Failed to list calendar events');
    res.status(500).json({
      error: 'Event listing failed',
      message: error.message
    });
  }
}

/**
 * Update a calendar event
 * PATCH /api/calendar/events/:eventId
 * Body: { summary?, start?, end?, description?, location?, attendees? }
 */
async function updateEvent(req, res) {
  try {
    const { eventId } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No update fields provided'
      });
    }

    console.log(`✏️  Updating calendar event ${eventId}...`);

    const result = await calendarService.updateCalendarEvent(
      req.user.googleSub,
      eventId,
      updates
    );

    res.json({
      success: true,
      eventId: result.id,
      htmlLink: result.htmlLink,
      message: 'Calendar event updated successfully'
    });

  } catch (error) {
    console.error('❌ Failed to update calendar event');
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
