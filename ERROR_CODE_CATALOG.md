# Error Code Catalog

| Code | HTTP Status | Description |
| --- | --- | --- |
| ACCESS_TOKEN_CACHE_PARAMS_MISSING | 400 | Required cache parameters (accessToken, googleSub) were missing when caching token identity. |
| AMBIGUOUS_DELETE | 409 | Multiple contacts matched the delete request; caller must disambiguate the intended target. |
| ATTACHMENT_BLOCKED | 451 | Attachment download blocked by data loss prevention or workspace policy. |
| ATTACHMENT_DOWNLOAD_FAILED | 502 | Failed to download attachment contents from Gmail. |
| ATTACHMENT_META_FAILED | 502 | Failed to load attachment metadata from Gmail. |
| ATTACHMENT_NOT_FOUND | 404 | Requested Gmail attachment could not be located. |
| ATTACHMENT_TABLE_PREVIEW_FAILED | 502 | Failed to render a table preview for the requested attachment. |
| ATTACHMENT_TEXT_PREVIEW_FAILED | 502 | Failed to render a text preview for the requested attachment. |
| AUTH_REQUIRED | 401 | User session is missing or expired and must be refreshed. |
| AUTH_STATUS_FAILED | 500 | Server failed to determine current authentication status. |
| BATCH_PREVIEW_FAILED | 502 | Failed to prepare Gmail batch preview payload. |
| BATCH_READ_FAILED | 502 | Failed to fetch the requested set of Gmail messages. |
| CALENDAR_EVENT_CREATE_FAILED | 502 | Google Calendar refused or failed to create the requested event. |
| CALENDAR_EVENT_DELETE_FAILED | 502 | Google Calendar refused or failed to delete the requested event. |
| CALENDAR_EVENT_GET_FAILED | 502 | Google Calendar refused or failed to return the requested event. |
| CALENDAR_EVENT_LIST_FAILED | 502 | Google Calendar refused or failed to list events for the requested range. |
| CALENDAR_EVENT_TIME_REQUIRED | 400 | Calendar event payload is missing start or end time information. |
| CALENDAR_EVENT_TIME_UNSUPPORTED | 400 | Calendar event payload supplied an unsupported time representation. |
| CALENDAR_EVENT_UPDATE_FAILED | 502 | Google Calendar refused or failed to update the requested event. |
| CALENDAR_PROPOSALS_CONFLICT | 409 | All proposed calendar time slots conflict with existing events. |
| CONFIRM_SELF_SEND_REQUIRED | 400 | Self-send operations require the confirmSelfSend flag. |
| CONFIRMATION_CANCEL_FAILED | 500 | Server failed to cancel the requested confirmation flow. |
| CONFIRMATION_EXPIRED | 400 | Confirmation token has expired or is no longer valid. |
| CONFIRMATION_FAILED | 500 | Server failed to complete the requested confirmation action. |
| CONFIRMATION_NOT_FOUND | 404 | Requested confirmation token does not exist. |
| CONFIRMATION_PREVIEW_FAILED | 500 | Server failed to build a confirmation preview. |
| CONFIRMATION_TYPE_INVALID | 400 | Provided confirmation type is not supported. |
| CONFLICT | 409 | Request conflicts with the current resource state. |
| CONTACT_ADD_FAILED | 502 | Failed to add a contact to Google Workspace storage. |
| CONTACT_ADDRESS_SUGGEST_FAILED | 502 | Failed to suggest addresses for the provided contact payload. |
| CONTACT_BULK_DELETE_FAILED | 502 | Failed to delete one or more contacts in bulk. |
| CONTACT_BULK_TARGET_REQUIRED | 400 | Bulk contact operations require at least one target identifier. |
| CONTACT_BULK_UPSERT_FAILED | 502 | Failed to upsert the provided set of contacts. |
| CONTACT_DELETE_FAILED | 502 | Failed to delete the requested contact. |
| CONTACT_IDENTIFIER_REQUIRED | 400 | Contact operations require an email address or name. |
| CONTACT_LIST_FAILED | 502 | Failed to retrieve the contact list. |
| CONTACT_MODIFY_FAILED | 502 | Failed to modify the requested contact. |
| CONTACT_NAME_AND_EMAIL_REQUIRED | 400 | Both name and email are required to create a contact. |
| CONTACT_NOT_FOUND | 404 | Requested contact could not be located. |
| CONTACT_SEARCH_FAILED | 502 | Failed to search contacts. |
| CONTACT_UPDATE_FAILED | 502 | Failed to update the requested contact. |
| CONTACTS_RPC_MUTATION_DISABLED | 410 | Legacy contacts RPC mutation has been removed; clients must call dedicated endpoints. |
| CONTACTS_SHEET_MISMATCH | 409 | Contacts spreadsheet is missing or does not match the expected schema. |
| DEDUPE_STRATEGY_UNSUPPORTED | 400 | Provided deduplication strategy is not supported. |
| DRAFT_CREATE_FAILED | 502 | Failed to create the requested Gmail draft. |
| DRAFT_ID_REQUIRED | 400 | Draft identifier must be supplied. |
| DRAFT_RECIPIENT_REQUIRED | 400 | Draft recipient must be supplied. |
| DRAFT_SUBJECT_REQUIRED | 400 | Draft subject must be supplied. |
| E401 | 401 | Upstream service responded with HTTP 401 (unauthorized). |
| EMAIL_DELETE_FAILED | 502 | Failed to delete the requested Gmail message. |
| EMAIL_MESSAGE_IDS_MISSING | 400 | Request is missing Gmail message identifiers. |
| EMAIL_QUICK_READ_FORMAT_INVALID | 400 | Requested quick-read format is not supported. |
| EMAIL_READ_FAILED | 502 | Failed to retrieve the requested Gmail message. |
| EMAIL_REPLY_FAILED | 502 | Failed to send the requested Gmail reply. |
| EMAIL_SEARCH_FAILED | 502 | Failed to execute the Gmail search request. |
| EMAIL_SEND_FAILED | 502 | Failed to send the requested Gmail message. |
| EMAIL_SNIPPET_FAILED | 502 | Failed to fetch Gmail message snippet preview. |
| ERR_MODULE_NOT_FOUND | 500 | The runtime could not locate a required module. |
| FOLLOWUP_LIST_FAILED | 502 | Failed to list follow-up candidates from Gmail. |
| GMAIL_DRAFT_INVALID | 502 | Gmail returned an invalid draft payload (missing or malformed data). |
| GOOGLE_UNAUTHORIZED | 401 | Google rejected the request or refresh token; caller must reauthenticate. |
| GOOGLE_USER_NOT_FOUND | 401 | Google account mapping was not found; caller must reauthenticate. |
| IDEMPOTENCY_KEY_REUSE_MISMATCH | 409 | Idempotency key has already been used for a different request payload. |
| INVALID_FOLLOWUP_WINDOW | 400 | Requested follow-up window is invalid or contradictory. |
| INVALID_IDENTIFIER | 400 | Provided contact identifier is invalid. |
| INVALID_PARAM | 400 | Request payload is missing or contains invalid parameters. |
| INVALID_SIGNATURE | 403 | Signed URL signature verification failed. |
| INVALID_TIME_FORMAT | 400 | Provided time format does not match the expected RFC3339 representation. |
| LABEL_LIST_FAILED | 502 | Failed to list Gmail labels. |
| LABEL_MODIFY_FAILED | 502 | Failed to modify Gmail labels. |
| LABEL_MUTATION_VERIFICATION_FAILED | 502 | Gmail failed to verify label mutations after execution. |
| LABEL_NAME_REQUIRED | 400 | Request to create or rename a label must include a name. |
| LABEL_RESOLUTION_FAILED | 400 | Requested Gmail labels could not be resolved or matched. |
| MARK_READ_FAILED | 502 | Failed to mark Gmail messages as read/unread. |
| NOT_IMPLEMENTED | 501 | Endpoint or operation has not been implemented yet. |
| OAUTH_INIT_FAILED | 500 | OAuth flow could not be initiated. |
| REAUTH_REQUIRED | 401 | User must reauthenticate to continue. |
| SERVER_ERROR | 500 | Generic internal server error. |
| STAR_TOGGLE_FAILED | 502 | Failed to toggle Gmail star/flag state. |
| TASK_CREATE_FAILED | 502 | Failed to create the requested task. |
| TASK_DELETE_FAILED | 502 | Failed to delete the requested task. |
| TASK_IDENTIFIERS_REQUIRED | 400 | Task identifier parameters are required for this operation. |
| TASK_LISTS_NOT_FOUND | 404 | No Google Tasks list is available for the account. |
| TASK_MODIFY_FAILED | 502 | Failed to modify the requested task. |
| TASK_TITLE_REQUIRED | 400 | Task title must be supplied. |
| TASK_UPDATE_FAILED | 502 | Failed to update the requested task. |
| TASK_UPDATE_FIELDS_REQUIRED | 400 | Task update requires at least one updatable field. |
| TASKS_LIST_FAILED | 502 | Failed to list tasks for the requested task list. |
| TASKS_RATE_LIMIT | 429 | Google Tasks API rejected the request due to rate limiting or quota exhaustion. |
| TASKS_RPC_MUTATION_DISABLED | 410 | Legacy tasks RPC mutation has been removed; clients must call dedicated endpoints. |
| TASKS_USER_NOT_FOUND | 401 | No Google Tasks user record exists for the provided googleSub. |
| THREAD_GET_FAILED | 502 | Failed to retrieve the requested Gmail thread. |
| THREAD_LABEL_MODIFY_FAILED | 502 | Failed to modify labels on the requested Gmail thread. |
| THREAD_READ_STATUS_FAILED | 502 | Failed to toggle Gmail thread read status. |
| THREAD_REPLY_FAILED | 502 | Failed to send the requested Gmail thread reply. |
| TOKEN_DECRYPTION_FAILED | 500 | Internal failure while decrypting an OAuth token. |
| TOKEN_ENCRYPTION_FAILED | 500 | Internal failure while encrypting an OAuth token. |
| URL_EXPIRED | 410 | Signed URL has expired and must be regenerated. |
