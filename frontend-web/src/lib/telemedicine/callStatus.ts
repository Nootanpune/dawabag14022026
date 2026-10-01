// Call-state wording for the in-browser consultation call (Sprint 14, C-23).
// Pure helpers: no SDK import, so they are safe on the server too.
import type { JoinInfo } from './types';

export type CallStatus = 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'ended' | 'error';

/** A real call can start only for audio/video with an app id and a server-issued token */
export function canStartCall(info: JoinInfo): boolean {
  return info.mode !== 'text' && !!info.app_id && !!info.token && !!info.uid;
}

export function statusText(status: CallStatus, role: JoinInfo['role']): string {
  const other = role === 'doctor' ? 'the patient' : 'the doctor';
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'waiting':
      return `Waiting for ${other} to join…`;
    case 'connected':
      return `Connected with ${other}`;
    case 'reconnecting':
      return 'Connection lost — reconnecting…';
    case 'ended':
      return 'Call ended';
    case 'error':
      return 'The call could not continue';
  }
}

/** Turns an Agora / browser error into a line the person can act on */
export function callErrorText(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  const name = (err as { name?: string } | null)?.name;
  if (code === 'PERMISSION_DENIED' || name === 'NotAllowedError') {
    return 'Camera or microphone access was blocked. Allow it in your browser\'s site settings and join again.';
  }
  if (code === 'DEVICE_NOT_FOUND' || name === 'NotFoundError') return 'No camera or microphone was found on this device.';
  if (code === 'NOT_READABLE' || name === 'NotReadableError') return 'Your camera or microphone is in use by another app. Close it and join again.';
  if (code === 'WEB_SECURITY_RESTRICT' || code === 'NOT_SUPPORTED') return 'This browser cannot make calls here. Use a recent Chrome, Edge, Firefox or Safari over https.';
  if (code === 'CAN_NOT_GET_GATEWAY_SERVER' || code === 'INVALID_PARAMS') return 'The call service refused the connection. Close and join again from your consultations.';
  return 'The call could not be connected. Check your connection and join again.';
}
