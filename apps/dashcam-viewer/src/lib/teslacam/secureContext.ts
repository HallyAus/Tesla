/**
 * Pure decision logic for which folder-loading affordance to surface.
 *
 * The File System Access API (`window.showDirectoryPicker`) is only exposed by
 * the browser in a *secure context* (HTTPS or localhost). When the viewer is
 * embedded in Home Assistant and reached over plain HTTP (e.g. a LAN IP without
 * TLS), the picker is unavailable even on Chromium — so we must steer the user
 * toward drag-and-drop, which works in any context.
 *
 * This module is DOM-free apart from reading two booleans, so the decision is
 * extracted into a pure helper (`decidePickerMode`) that is unit-tested without
 * a browser.
 */

export type PickerMode = 'picker' | 'dragdrop';

export interface SecureContextEnv {
  /** `window.isSecureContext` — true on HTTPS / localhost. */
  isSecureContext: boolean;
  /** Whether `showDirectoryPicker` exists on `window`. */
  hasDirectoryPicker: boolean;
}

/**
 * Decide the primary folder-loading affordance.
 *
 * Returns `'picker'` only when the browser both exposes the directory picker
 * *and* is in a secure context (the picker silently no-ops / throws otherwise).
 * In every other case drag-and-drop is the primary path.
 */
export function decidePickerMode(env: SecureContextEnv): PickerMode {
  return env.isSecureContext && env.hasDirectoryPicker ? 'picker' : 'dragdrop';
}

/** Read the current browser environment (safe under SSR / jsdom). */
export function readSecureContextEnv(): SecureContextEnv {
  if (typeof window === 'undefined') {
    return { isSecureContext: false, hasDirectoryPicker: false };
  }
  return {
    isSecureContext: Boolean(window.isSecureContext),
    hasDirectoryPicker: 'showDirectoryPicker' in window,
  };
}

/** Convenience: the resolved picker mode for the live browser environment. */
export function currentPickerMode(): PickerMode {
  return decidePickerMode(readSecureContextEnv());
}
