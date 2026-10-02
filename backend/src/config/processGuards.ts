// src/config/processGuards.ts — Sprint 32: a stray promise rejection must not stop the
// API for every buyer (Sprint 23: a notification delivery write failing after the
// notification was deleted brought the process down). Once the API is serving, an
// unhandled rejection is logged with its stack and the process carries on. Before
// that — while it starts (configuration, database, Redis, the port) — a failure
// still stops the process with exit code 1, so a broken deployment never looks healthy.
import { logger } from './logger';

export interface GuardState { started: boolean }

type Exit = (code: number) => void;

/** The handler, separate from process wiring so it can be unit-tested. */
export function unhandledRejectionHandler(state: GuardState, exit: Exit = (c) => process.exit(c)) {
  return (reason: unknown) => {
    if (!state.started) {
      logger.error('Unhandled promise rejection while starting — stopping:', reason);
      exit(1);
      return;
    }
    logger.error('Unhandled promise rejection (logged; the API keeps running):', reason);
  };
}

/** Installs the handler once; call markStarted() when the server is listening. */
export function installProcessGuards(): { markStarted: () => void } {
  const state: GuardState = { started: false };
  process.on('unhandledRejection', unhandledRejectionHandler(state));
  return { markStarted: () => { state.started = true; } };
}
