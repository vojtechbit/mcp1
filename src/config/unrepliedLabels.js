import { GMAIL_LABEL_PRESETS } from './gmailColorPalette.js';

export const UNREPLIED_LABEL_NAME = 'nevyřízeno';
// Gmail API supported color - dark red (closest to original #d93025)
export const UNREPLIED_LABEL_COLOR = GMAIL_LABEL_PRESETS.RED_DARK; // #cc3a21
export const UNREPLIED_LABEL_TEXT_COLOR = GMAIL_LABEL_PRESETS.WHITE; // #ffffff

export const TRACKING_LABEL_NAME = 'meta_seen';
// Gmail API supported color - gray (closest to original #5f6368)
export const TRACKING_LABEL_COLOR = GMAIL_LABEL_PRESETS.GRAY_DARK; // #666666
export const TRACKING_LABEL_TEXT_COLOR = GMAIL_LABEL_PRESETS.WHITE; // #ffffff

export const FOLLOWUP_LABEL_NAME = 'Follow-up';
// Gmail API supported color - yellow (closest to original #fbbc05)
export const FOLLOWUP_LABEL_COLOR = GMAIL_LABEL_PRESETS.YELLOW; // #fad165
// Gmail API supported color - black text for better contrast on yellow
export const FOLLOWUP_LABEL_TEXT_COLOR = GMAIL_LABEL_PRESETS.BLACK; // #000000

export const UNREPLIED_LABEL_DEFAULTS = {
  name: UNREPLIED_LABEL_NAME,
  color: {
    backgroundColor: UNREPLIED_LABEL_COLOR,
    textColor: UNREPLIED_LABEL_TEXT_COLOR
  }
};

export const TRACKING_LABEL_DEFAULTS = {
  name: TRACKING_LABEL_NAME,
  color: {
    backgroundColor: TRACKING_LABEL_COLOR,
    textColor: TRACKING_LABEL_TEXT_COLOR
  },
  purpose: 'watchlist_tracking'
};

export const FOLLOWUP_LABEL_DEFAULTS = {
  name: FOLLOWUP_LABEL_NAME,
  color: {
    backgroundColor: FOLLOWUP_LABEL_COLOR,
    textColor: FOLLOWUP_LABEL_TEXT_COLOR
  }
};
