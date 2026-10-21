/** The modifier the host's shortcuts use, as the reader's keyboard labels it. */
export const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** The Alt key, as the reader's keyboard labels it. */
export const altKey = modKey === '⌘' ? '⌥' : 'Alt';

/** The Shift key, as the reader's keyboard labels it. */
export const shiftKey = modKey === '⌘' ? '⇧' : 'Shift';
