/**
 * Mobile device detection utilities.
 *
 * This module provides utilities for detecting mobile devices and
 * distinguishing between phones and tablets.
 */

import { Platform } from 'obsidian';
import { TABLET_BREAKPOINT } from './constants';

/**
 * Detect if the current device is a phone (not a tablet).
 *
 * A phone is defined as:
 * - Running on mobile platform (Platform.isMobile)
 * - Viewport width <= TABLET_BREAKPOINT (768px)
 *
 * This ensures tablets are excluded from phone-specific behavior.
 *
 * Device reference (viewport width in portrait):
 * - iPhone SE: 375px
 * - iPhone 12/13/14: 390px
 * - iPhone 12/13/14 Pro Max: 428px
 * - iPhone 15 Pro Max: 430px
 * - Android phones: 320-480px
 * - iPad Mini: 768px (smallest tablet)
 * - Android tablets: 600px+
 *
 * @returns true if the device is a phone, false otherwise
 */
export function isPhoneDevice(): boolean {
  return Platform.isMobile && window.innerWidth <= TABLET_BREAKPOINT;
}
