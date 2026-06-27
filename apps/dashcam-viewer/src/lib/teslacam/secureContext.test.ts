import { describe, expect, it } from 'vitest';
import { decidePickerMode } from './secureContext';

describe('decidePickerMode', () => {
  it('uses the picker only on a secure context with the API present', () => {
    expect(
      decidePickerMode({ isSecureContext: true, hasDirectoryPicker: true }),
    ).toBe('picker');
  });

  it('falls back to drag-and-drop on an insecure context even if the API exists', () => {
    // e.g. HA reached over plain HTTP on a LAN IP: showDirectoryPicker is
    // present on Chromium but unusable outside a secure context.
    expect(
      decidePickerMode({ isSecureContext: false, hasDirectoryPicker: true }),
    ).toBe('dragdrop');
  });

  it('falls back to drag-and-drop when the API is missing (e.g. Firefox/Safari)', () => {
    expect(
      decidePickerMode({ isSecureContext: true, hasDirectoryPicker: false }),
    ).toBe('dragdrop');
  });

  it('falls back to drag-and-drop when neither is available', () => {
    expect(
      decidePickerMode({ isSecureContext: false, hasDirectoryPicker: false }),
    ).toBe('dragdrop');
  });
});
