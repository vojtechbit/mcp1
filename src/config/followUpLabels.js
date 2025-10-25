export const FOLLOW_UP_LABEL_NAME = 'nevyřízeno';
export const FOLLOW_UP_LABEL_COLOR = '#d93025';
export const FOLLOW_UP_LABEL_TEXT_COLOR = '#ffffff';

export const TRACKING_LABEL_NAME = 'meta_seen';
export const TRACKING_LABEL_COLOR = '#5f6368';
export const TRACKING_LABEL_TEXT_COLOR = '#ffffff';

export const FOLLOW_UP_LABEL_DEFAULTS = {
  name: FOLLOW_UP_LABEL_NAME,
  color: {
    backgroundColor: FOLLOW_UP_LABEL_COLOR,
    textColor: FOLLOW_UP_LABEL_TEXT_COLOR
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
