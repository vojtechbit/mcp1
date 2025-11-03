# Error Code Catalog

| Code | HTTP Status | Description |
| --- | --- | --- |
| ACCESS_TOKEN_CACHE_PARAMS_MISSING | 400 | Required cache parameters (`accessToken`, `googleSub`) were missing when caching token identity. |
| TOKEN_ENCRYPTION_FAILED | 500 | Internal failure while encrypting an OAuth token. |
| TOKEN_DECRYPTION_FAILED | 500 | Internal failure while decrypting an OAuth token (possible data corruption). |
| TASKS_USER_NOT_FOUND | 401 | No Google-linked user record exists for the provided `googleSub`; reauthentication is required. |
| GOOGLE_USER_NOT_FOUND | 401 | Google token lookup failed because the user record is missing; callers must reauthenticate. |
| GOOGLE_UNAUTHORIZED | 401 | Google rejected the request or refresh token; session must be refreshed via OAuth login. |
| TASKS_RATE_LIMIT | 429 | Google Tasks API rejected the request due to rate limiting or quota exhaustion. |
| TASK_LISTS_NOT_FOUND | 404 | No Google Tasks list is available for the account (create one before proceeding). |
| EMAIL_QUICK_READ_FORMAT_INVALID | 400 | Requested email quick-read format is unsupported. |
| EMAIL_MESSAGE_IDS_MISSING | 400 | No Gmail message IDs were supplied or resolved for the request. |
| INVALID_FOLLOWUP_WINDOW | 400 | Follow-up candidate window is invalid (max age earlier than min age). |
| CONFIRMATION_NOT_FOUND | 400 | Confirmation token was missing or expired. |
| CONFIRMATION_TYPE_INVALID | 400 | Confirmation token type does not match the expected workflow. |
| CALENDAR_PROPOSALS_CONFLICT | 409 | All proposed calendar time slots conflict with existing events. |
| CALENDAR_EVENT_TIME_REQUIRED | 400 | Calendar event `start`/`end` payload is missing. |
| CALENDAR_EVENT_TIME_UNSUPPORTED | 400 | Calendar event time payload is malformed (neither `dateTime` nor `date`). |
| DRAFT_SUBJECT_REQUIRED | 400 | Gmail draft subject is missing. |
| DRAFT_RECIPIENT_REQUIRED | 400 | Gmail draft recipient is missing. |
| DRAFT_ID_REQUIRED | 400 | Gmail draft identifier is missing in the request. |
| GMAIL_DRAFT_INVALID | 502 | Gmail returned an invalid draft payload (missing or malformed ID/body). |
| ATTACHMENT_NOT_FOUND | 404 | Requested Gmail attachment could not be located. |
| ATTACHMENT_BLOCKED | 451 | Attachment download blocked by security policy. |
| LABEL_NAME_REQUIRED | 400 | Gmail label creation attempted without a name. |
| LABEL_RESOLUTION_FAILED | 400 | Requested Gmail labels could not be resolved or matched. |
| LABEL_MUTATION_VERIFICATION_FAILED | 502 | Gmail failed to confirm label mutations after execution. |
| DEDUPE_STRATEGY_UNSUPPORTED | 400 | Provided contacts deduplication strategy is not supported. |
