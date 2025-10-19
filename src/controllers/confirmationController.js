/**
 * FILE: src/controllers/confirmationController.js
 * 
 * Handles confirmation workflows for:
 * - calendar.schedule enrichment
 * - contacts.safeAdd deduplication
 */

import * as facadeService from '../services/facadeService.js';
import {
  getPendingConfirmation,
  cancelPendingConfirmation
} from '../utils/confirmationStore.js';

/**
 * POST /api/macros/confirm
 * Complete pending confirmation
 */
export async function confirmMacroOperation(req, res) {
  try {
    const { confirmToken, action } = req.body;

    if (!confirmToken) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: confirmToken',
        code: 'INVALID_PARAM'
      });
    }

    if (!action) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: action',
        code: 'INVALID_PARAM'
      });
    }

    // Get pending confirmation to know its type
    const confirmation = await getPendingConfirmation(confirmToken);

    if (!confirmation) {
      return res.status(400).json({
        error: 'Invalid confirmation',
        message: 'Confirmation token expired or not found',
        code: 'CONFIRMATION_EXPIRED',
        hint: 'Please try the operation again from the beginning'
      });
    }

    // Dispatch based on confirmation type
    let result;

    if (confirmation.type === 'enrichment') {
      if (!['auto-fill', 'skip'].includes(action)) {
        return res.status(400).json({
          error: 'Invalid action',
          message: 'For enrichment, action must be: auto-fill or skip',
          code: 'INVALID_PARAM'
        });
      }

      result = await facadeService.completeCalendarScheduleEnrichment(
        req.user.googleSub,
        confirmToken,
        action
      );
    } else if (confirmation.type === 'deduplication') {
      if (!['merge', 'keepBoth', 'skip'].includes(action)) {
        return res.status(400).json({
          error: 'Invalid action',
          message:
            'For deduplication, action must be: merge, keepBoth, or skip',
          code: 'INVALID_PARAM'
        });
      }

      result = await facadeService.completeContactsDeduplication(
        req.user.googleSub,
        confirmToken,
        action
      );
    } else {
      return res.status(400).json({
        error: 'Unknown confirmation type',
        message: `Confirmation type not recognized: ${confirmation.type}`,
        code: 'INVALID_PARAM'
      });
    }

    res.json({
      ok: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Confirmation failed:', error.message);

    if (error.statusCode === 400) {
      return res.status(400).json({
        error: error.message || 'Invalid request',
        message: error.message,
        code: error.code || 'BAD_REQUEST'
      });
    }

    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }

    res.status(500).json({
      error: 'Confirmation failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

/**
 * GET /api/macros/confirm/:confirmToken
 * Preview pending confirmation
 */
export async function getPendingConfirmationPreview(req, res) {
  try {
    const { confirmToken } = req.params;

    const confirmation = await getPendingConfirmation(confirmToken);

    if (!confirmation) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Confirmation token not found or expired',
        code: 'CONFIRMATION_NOT_FOUND'
      });
    }

    // Return user-friendly preview
    let preview;

    if (confirmation.type === 'enrichment') {
      preview = {
        type: 'enrichment',
        operation: confirmation.data.operation,
        preview: {
          event: {
            title: confirmation.data.eventData.title,
            when: confirmation.data.eventData.when
          },
          suggestedEnrichment: confirmation.data.suggestedFields,
          availableActions: ['auto-fill', 'skip']
        }
      };
    } else if (confirmation.type === 'deduplication') {
      preview = {
        type: 'deduplication',
        operation: confirmation.data.operation,
        preview: {
          entriesToAdd: confirmation.data.entriesToAdd.map(e => ({
            name: e.name,
            email: e.email
          })),
          potentialDuplicates: confirmation.data.duplicateFindings
            .filter(f => f.candidates.length > 0)
            .map(f => ({
              entry: { name: f.entry.name, email: f.entry.email },
              candidates: f.candidates.slice(0, 3)
            })),
          availableActions: ['merge', 'keepBoth', 'skip']
        }
      };
    }

    res.json({
      ok: true,
      confirmToken,
      preview,
      expiresAt: confirmation.expiresAt
    });
  } catch (error) {
    console.error('❌ Failed to get confirmation preview:', error.message);

    res.status(500).json({
      error: 'Failed to retrieve confirmation',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

/**
 * POST /api/macros/confirm/:confirmToken/cancel
 * Cancel pending confirmation
 */
export async function cancelConfirmation(req, res) {
  try {
    const { confirmToken } = req.params;

    const confirmation = await getPendingConfirmation(confirmToken);

    if (!confirmation) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Confirmation token not found or expired',
        code: 'CONFIRMATION_NOT_FOUND'
      });
    }

    await cancelPendingConfirmation(confirmToken);

    res.json({
      ok: true,
      message: 'Confirmation cancelled',
      confirmToken
    });
  } catch (error) {
    console.error('❌ Failed to cancel confirmation:', error.message);

    res.status(500).json({
      error: 'Failed to cancel confirmation',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}
