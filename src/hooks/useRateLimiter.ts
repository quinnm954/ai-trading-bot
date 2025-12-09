import { useState, useCallback } from 'react';

interface RateLimitState {
  attempts: number;
  lockoutUntil: number | null;
  lastAttempt: number;
}

const STORAGE_KEY = 'auth_rate_limit';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_RESET_MS = 60 * 60 * 1000; // Reset attempts after 1 hour of no activity

function getStoredState(): RateLimitState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as RateLimitState;
      // Reset attempts if last attempt was over an hour ago
      if (Date.now() - state.lastAttempt > ATTEMPT_RESET_MS) {
        return { attempts: 0, lockoutUntil: null, lastAttempt: Date.now() };
      }
      return state;
    }
  } catch {
    // Ignore parse errors
  }
  return { attempts: 0, lockoutUntil: null, lastAttempt: Date.now() };
}

function saveState(state: RateLimitState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function useRateLimiter() {
  const [state, setState] = useState<RateLimitState>(getStoredState);

  const isLocked = useCallback(() => {
    if (state.lockoutUntil && Date.now() < state.lockoutUntil) {
      return true;
    }
    // Clear lockout if expired
    if (state.lockoutUntil && Date.now() >= state.lockoutUntil) {
      const newState = { attempts: 0, lockoutUntil: null, lastAttempt: Date.now() };
      setState(newState);
      saveState(newState);
    }
    return false;
  }, [state.lockoutUntil]);

  const getLockoutRemaining = useCallback(() => {
    if (state.lockoutUntil && Date.now() < state.lockoutUntil) {
      return Math.ceil((state.lockoutUntil - Date.now()) / 1000 / 60); // minutes
    }
    return 0;
  }, [state.lockoutUntil]);

  const getAttemptsRemaining = useCallback(() => {
    return Math.max(0, MAX_ATTEMPTS - state.attempts);
  }, [state.attempts]);

  const recordFailedAttempt = useCallback(() => {
    const newAttempts = state.attempts + 1;
    const newState: RateLimitState = {
      attempts: newAttempts,
      lockoutUntil: newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null,
      lastAttempt: Date.now(),
    };
    setState(newState);
    saveState(newState);
    return newAttempts >= MAX_ATTEMPTS;
  }, [state.attempts]);

  const resetAttempts = useCallback(() => {
    const newState = { attempts: 0, lockoutUntil: null, lastAttempt: Date.now() };
    setState(newState);
    saveState(newState);
  }, []);

  return {
    isLocked,
    getLockoutRemaining,
    getAttemptsRemaining,
    recordFailedAttempt,
    resetAttempts,
    attempts: state.attempts,
  };
}
