// src/game/input/InputAdapter.ts — Multi-Touch & Keyboard unified input
// Bridges pointer events and keyboard into InputSnapshot for simulation

import type { InputSnapshot } from '../../core/types';

type Action = 'left' | 'right' | 'jump' | 'whip';

export class InputAdapter {
  private keys: Set<string> = new Set();
  private pointers: Map<number, Action> = new Map();

  private _jumpPressed = false;
  private _whipPressed = false;
  private _jumpHeld = false;

  private audioUnlockCallback: (() => void) | null = null;
  private firstInteraction = false;

  constructor() {
    // Keyboard handlers
    window.addEventListener('keydown', (e) => {
      this.handleFirstInteraction();
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        if (this.isJumpKey(e.code)) {
          this._jumpPressed = true;
          this._jumpHeld = true;
        }
        if (this.isWhipKey(e.code)) {
          this._whipPressed = true;
        }
      }
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (this.isJumpKey(e.code)) {
        this._jumpHeld = false;
      }
      e.preventDefault();
    });

    // Touch/pointer handlers for on-screen buttons
    this.setupTouchZone('touch-left', 'left');
    this.setupTouchZone('touch-right', 'right');
    this.setupTouchZone('touch-jump', 'jump');
    this.setupTouchZone('touch-whip', 'whip');

    // Prevent iOS Safari double-tap zoom & pinch-zoom on rapid button taps
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
    const touchRoot = document.getElementById('touch-controls');
    if (touchRoot) {
      touchRoot.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    }
  }

  setAudioUnlockCallback(cb: () => void): void {
    this.audioUnlockCallback = cb;
  }

  private handleFirstInteraction(): void {
    if (!this.firstInteraction) {
      this.firstInteraction = true;
      if (this.audioUnlockCallback) {
        this.audioUnlockCallback();
      }
    }
  }

  private setupTouchZone(elementId: string, action: Action): void {
    const el = document.getElementById(elementId);
    if (!el) return;

    const releasePointer = (e: PointerEvent) => {
      const a = this.pointers.get(e.pointerId);
      if (a) {
        this.pointers.delete(e.pointerId);
        if (a === 'jump') {
          this._jumpHeld = false;
        }
      }
      if (!this.isPointerActive(action)) {
        el.classList.remove('pressed');
      }
      e.preventDefault();
    };

    el.addEventListener('pointerdown', (e) => {
      this.handleFirstInteraction();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
      this.pointers.set(e.pointerId, action);
      el.classList.add('pressed');
      if (action === 'jump') {
        this._jumpPressed = true;
        this._jumpHeld = true;
      }
      if (action === 'whip') {
        this._whipPressed = true;
      }
      e.preventDefault();
    });

    el.addEventListener('pointerup', releasePointer);
    el.addEventListener('pointercancel', releasePointer);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isJumpKey(code: string): boolean {
    return code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ';
  }

  private isWhipKey(code: string): boolean {
    return code === 'KeyJ' || code === 'KeyX' || code === 'ShiftLeft' || code === 'KeyK';
  }

  consumeSnapshot(): InputSnapshot {
    const left =
      this.keys.has('ArrowLeft') ||
      this.keys.has('KeyA') ||
      this.isPointerActive('left');

    const right =
      this.keys.has('ArrowRight') ||
      this.keys.has('KeyD') ||
      this.isPointerActive('right');

    const jumpPressed = this._jumpPressed;
    const jumpHeld = this._jumpHeld;
    const whipPressed = this._whipPressed;

    // Clear edge-triggered flags
    this._jumpPressed = false;
    this._whipPressed = false;

    return { left, right, jumpPressed, jumpHeld, whipPressed };
  }

  private isPointerActive(action: Action): boolean {
    for (const a of this.pointers.values()) {
      if (a === action) return true;
    }
    return false;
  }

  enableTouchControls(): void {
    const el = document.getElementById('touch-controls');
    if (el) {
      // Show touch controls on devices with coarse pointer
      if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
        el.classList.add('active');
      }
    }
  }
}
