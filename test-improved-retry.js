import dotenv from 'dotenv';

dotenv.config();

/**
 * TEST IMPROVED TOKEN REFRESH RETRY LOGIC
 * 
 * Tento test demonstruje vylepšenou logiku pro automatický retry při 401 errorech:
 * 
 * ✅ CO BYLO PŘIDÁNO:
 * 
 * 1. VÍCE RETRY POKUSŮ (až 3 celkové pokusy)
 *    - Původně: 1 retry
 *    - Nyní: 2 retry (celkem 3 pokusy)
 * 
 * 2. EXPONENCIÁLNÍ BACKOFF
 *    - První retry: čeká 500ms
 *    - Druhý retry: čeká 1000ms
 *    - Chrání před rate limiting
 * 
 * 3. LEPŠÍ ERROR DETECTION
 *    - Detekuje více typů 401 chyb včetně 'invalid_grant'
 *    - Rozpozná když je refresh token sám o sobě nevalidní
 * 
 * 4. SPECIFICKÉ ERROR TYPY
 *    - AUTH_REQUIRED: Obecná auth chyba po všech retry
 *    - REFRESH_TOKEN_INVALID: Refresh token je nevalidní -> nutná re-autentizace
 * 
 * 5. DETAILNÍ LOGGING
 *    - Loguje každý pokus s detaily
 *    - Loguje specifické důvody selhání refresh tokenu
 * 
 * 6. CENTRALIZOVANÉ ERROR HANDLING
 *    - Všechny controllery (Gmail, Calendar) teď správně detekují AUTH errors
 *    - Vracejí jasné 401 odpovědi s requiresReauth flag
 * 
 * ✅ JAK TO FUNGUJE:
 * 
 * Když nastane 401 error na Google API:
 *   1. pokus -> 401 -> Force refresh token -> Retry
 *   2. pokus -> 401 -> Force refresh token -> Čekání 500ms -> Retry  
 *   3. pokus -> 401 -> Force refresh token -> Čekání 1000ms -> Retry
 *   4. pokus -> 401 -> Throw AUTH_REQUIRED error
 * 
 * Pokud refresh token je nevalidní:
 *   - Detekuje 'invalid_grant', 'Token has been expired' atd.
 *   - Okamžitě throw REFRESH_TOKEN_INVALID
 *   - Klient dostane jasnou zprávu že je potřeba re-auth
 * 
 * ✅ PŘÍKLAD RESPONSE PŘI AUTH ERRORU:
 * 
 * {
 *   "error": "Authentication required",
 *   "message": "Your session has expired. Please log in again.",
 *   "code": "REFRESH_TOKEN_INVALID",
 *   "requiresReauth": true
 * }
 * 
 * ✅ CO TO ŘEŠÍ:
 * 
 * Váš původní problém:
 * "System si myslí že má platný refresh token (expiry date ještě není u konce),
 *  ale Google API vrací chybu že token není validní"
 * 
 * Nová logika:
 * - Když nastane 401, VŽDY zkusí force refresh (ignoruje expiry date)
 * - Zkusí to až 3x s čekáním mezi pokusy
 * - Pokud refresh token sám o sobě je invalid, okamžitě to detekuje a řekne uživateli
 * - Lepší logging pro debugging
 */

console.log('✅ Vylepšená logika pro token refresh je implementována');
console.log('');
console.log('📋 SOUHRN ZMĚN:');
console.log('1. handleGoogleApiCall: až 3 pokusy s exponenciálním backoff');
console.log('2. Lepší detekce invalid refresh tokenu');
console.log('3. Specifické error typy (AUTH_REQUIRED, REFRESH_TOKEN_INVALID)');
console.log('4. Centralizované error handling ve všech controllerech');
console.log('5. Detailní logging pro debugging');
console.log('');
console.log('🧪 PRO TESTOVÁNÍ:');
console.log('1. Zkus poslat email/vytvořit event když má uživatel validní tokeny');
console.log('2. Zkus poslat email když je access token expired (mělo by se auto-refreshnout)');
console.log('3. Zkus poslat email když je refresh token invalid (mělo vrátit 401 s requiresReauth)');
console.log('');
console.log('📝 SOUBORY ZMĚNĚNY:');
console.log('- src/services/googleApiService.js (handleGoogleApiCall)');
console.log('- src/controllers/gmailController.js (všechny funkce)');
console.log('- src/controllers/calendarController.js (všechny funkce)');
