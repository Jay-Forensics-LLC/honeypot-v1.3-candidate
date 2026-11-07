/**
 * Platform Detection Utility
 * Detects device capabilities and browser features
 */

export const PlatformDetection = {
  // Check if running on mobile device
  isMobile: () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },

  // Check if running on iOS
  isIOS: () => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  // Check if running on Android
  isAndroid: () => {
    if (typeof window === 'undefined') return false;
    return /Android/i.test(navigator.userAgent);
  },

  // Check if running in mobile Safari
  isSafari: () => {
    if (typeof window === 'undefined') return false;
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  },

  // Check if Web Bluetooth API is supported
  supportsWebBluetooth: () => {
    if (typeof navigator === 'undefined') return false;
    return 'bluetooth' in navigator;
  },

  // Check if getUserMedia (camera/mic) is supported
  supportsMediaDevices: () => {
    if (typeof navigator === 'undefined') return false;
    return 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  },

  // Check if WebAuthn/Passkeys are supported
  supportsWebAuthn: () => {
    if (typeof window === 'undefined') return false;
    return 'credentials' in navigator && 'create' in navigator.credentials;
  },

  // Check if File System Access API is supported
  supportsFileSystem: () => {
    if (typeof window === 'undefined') return false;
    return 'showOpenFilePicker' in window;
  },

  // Get platform-specific recommendations
  getPlatformLimitations: () => {
    const limitations = [];

    if (PlatformDetection.isMobile() && !PlatformDetection.supportsWebBluetooth()) {
      limitations.push({
        feature: 'BLE Scanning',
        message: 'Bluetooth scanning is not supported in mobile browsers. Please use the desktop app or native mobile app for BLE monitoring.',
        severity: 'warning'
      });
    }

    if (PlatformDetection.isIOS() && !PlatformDetection.supportsFileSystem()) {
      limitations.push({
        feature: 'Advanced File Operations',
        message: 'Some file operations may be limited on iOS Safari. For full functionality, consider using Chrome or the desktop app.',
        severity: 'info'
      });
    }

    return limitations;
  },

  // Get optimal viewport settings for current platform
  getViewportMeta: () => {
    if (PlatformDetection.isIOS()) {
      return {
        'viewport-fit': 'cover',
        'user-scalable': 'no',
        'width': 'device-width',
        'initial-scale': '1',
        'maximum-scale': '1'
      };
    }

    return {
      'width': 'device-width',
      'initial-scale': '1',
      'maximum-scale': '5'
    };
  }
};

/**
 * React Hook for platform detection
 */
import { useState, useEffect } from 'react';

export function usePlatformDetection() {
  const [platform, setPlatform] = useState({
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    limitations: []
  });

  useEffect(() => {
    setPlatform({
      isMobile: PlatformDetection.isMobile(),
      isIOS: PlatformDetection.isIOS(),
      isAndroid: PlatformDetection.isAndroid(),
      isSafari: PlatformDetection.isSafari(),
      limitations: PlatformDetection.getPlatformLimitations()
    });
  }, []);

  return platform;
}