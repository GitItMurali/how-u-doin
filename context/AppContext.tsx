// Phase 0 stub — Global app state via React Context + useReducer
// Implemented in Phase 2
// Manages: snooze status, active timer task ID, settings (reset time, etc.)
import React, { createContext, useContext, useReducer } from 'react';

type AppState = {
  snoozeActive: boolean;
  activeTimerTaskId: string | null;
  resetTime: string; // "HH:MM"
};

type AppAction =
  | { type: 'SET_SNOOZE'; payload: boolean }
  | { type: 'SET_ACTIVE_TIMER'; payload: string | null }
  | { type: 'SET_RESET_TIME'; payload: string };

const initialState: AppState = {
  snoozeActive: false,
  activeTimerTaskId: null,
  resetTime: '00:00',
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SNOOZE':
      return { ...state, snoozeActive: action.payload };
    case 'SET_ACTIVE_TIMER':
      return { ...state, activeTimerTaskId: action.payload };
    case 'SET_RESET_TIME':
      return { ...state, resetTime: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
