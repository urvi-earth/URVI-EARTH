/* =====================================================
   URVI – profanity-filter.js | Intelligent Profanity & Reserved Handle Filter
   ===================================================== */

// Explicit Whitelist for legitimate names that contain profanity substrings
export const SAFE_NAME_EXCEPTIONS = [
    "varshitha", "varshith", "harshitha", "harshit", "harshita",
    "anshita", "anshit", "akshita", "rakshita", "pushita",
    "titus", "scunthorpe", "arsenal", "assisi", "pass",
    "bastrop", "dickson", "glass", "class", "grass"
];

// Reserved system handles that ordinary users cannot register
export const RESERVED_USERNAMES = [
    "urviearth", "urvi.earth", "urvi_earth", "urviofficial",
    "admin", "administrator", "root", "system", "moderator",
    "support", "urvi", "official", "helpdesk"
];

// Standalone Banned Profanity Words
export const BANNED_WORDS = [
    "shit", "fuck", "bitch", "asshole", "cunt", "dick",
    "pussy", "bastard", "slut", "whore", "nigger", "faggot",
    "chode", "dumbass", "jackass"
];

/**
 * Check if an input string contains actual standalone profanity or violates reserved rules.
 * @param {string} text 
 * @returns {boolean}
 */
export function isProfaneText(text) {
    if (!text || typeof text !== "string") return false;
    const lower = text.toLowerCase().trim();

    // 1. If text is in the safe whitelist, it is NOT profane
    for (const safeWord of SAFE_NAME_EXCEPTIONS) {
        if (lower === safeWord) return false;
    }

    // 2. Normalize repeated punctuation/separators e.g. "s_h_i_t" -> "shit"
    const cleanedText = lower.replace(/[-_.\s@#$%^&*]+/g, "");
    
    // Check cleaned text against exact safe exceptions
    for (const safeWord of SAFE_NAME_EXCEPTIONS) {
        if (cleanedText === safeWord) return false;
    }

    // 3. Check for standalone banned profanity using word boundaries
    for (const word of BANNED_WORDS) {
        const wordRegex = new RegExp(`\\b${word}\\b`, "i");
        if (wordRegex.test(lower)) {
            // Ensure it's not part of an explicit safe exception name
            let isSafeException = false;
            for (const safeWord of SAFE_NAME_EXCEPTIONS) {
                if (lower.includes(safeWord)) {
                    isSafeException = true;
                    break;
                }
            }
            if (!isSafeException) return true;
        }

        // Also check if cleaned string matches banned word exactly
        if (cleanedText === word) return true;
    }

    return false;
}

/**
 * Validate a User ID / Username for format, reserved words, and profanity.
 * @param {string} username 
 * @returns {{valid: boolean, reason: string|null}}
 */
export function validateUsername(username) {
    if (!username || typeof username !== "string") {
        return { valid: false, reason: "User ID is required." };
    }

    const trimmed = username.trim().toLowerCase();

    // Length check
    if (trimmed.length < 3 || trimmed.length > 24) {
        return { valid: false, reason: "User ID must be between 3 and 24 characters." };
    }

    // Character check: lowercase letters, numbers, dot, underscore, hyphen
    if (!/^[a-z0-9_.-]+$/.test(trimmed)) {
        return { valid: false, reason: "User ID can only contain letters, numbers, dots, hyphens, and underscores." };
    }

    // Check reserved list
    const cleanHandle = trimmed.replace(/[^a-z0-9]/g, "");
    for (const reserved of RESERVED_USERNAMES) {
        const cleanReserved = reserved.replace(/[^a-z0-9]/g, "");
        if (cleanHandle === cleanReserved) {
            return { valid: false, reason: `The User ID "@${trimmed}" is reserved for URVI system administration.` };
        }
    }

    // Check whitelist exceptions first
    for (const safeWord of SAFE_NAME_EXCEPTIONS) {
        if (cleanHandle === safeWord || cleanHandle.startsWith(safeWord)) {
            return { valid: true, reason: null };
        }
    }

    // Profanity check
    if (isProfaneText(trimmed)) {
        return { valid: false, reason: "This User ID contains prohibited or offensive terms. Please choose another." };
    }

    return { valid: true, reason: null };
}
