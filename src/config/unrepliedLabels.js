export const UNREPLIED_LABEL_NAME = 'nevyřízeno';
export const UNREPLIED_LABEL_COLOR = '#d93025';
export const UNREPLIED_LABEL_TEXT_COLOR = '#ffffff';

export const TRACKING_LABEL_NAME = 'meta_seen';
export const TRACKING_LABEL_COLOR = '#5f6368';
export const TRACKING_LABEL_TEXT_COLOR = '#ffffff';

export const FOLLOWUP_LABEL_NAME = 'followup';
export const FOLLOWUP_LABEL_COLOR = '#42a5f5';
export const FOLLOWUP_LABEL_TEXT_COLOR = '#ffffff';

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
