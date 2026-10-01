'use client';
// In-browser consultation call over the Agora Web SDK (Sprint 14).
// C-23 (teleconsultation privacy): the call is only between the patient and the
// consultation's doctor — the server issues a token bound to this channel and
// this one user account, and never a token anyone else can use. Nothing is
// recorded: no recording, no cloud recording, no local capture.
// Standing rule: nothing is stored on the device (no localStorage, no device ids).
// The SDK touches `window`, so it is imported only inside the effect (browser only).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IAgoraRTCClient, ICameraVideoTrack, ILocalTrack, IMicrophoneAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import { joinConsultation } from './api';
import { callErrorText, type CallStatus } from './callStatus';
import type { JoinInfo } from './types';

export interface AgoraCall {
  status: CallStatus;
  /** an error or a passing notice (the other person left, token renewal failed) */
  message: string | null;
  micOn: boolean;
  camOn: boolean;
  localVideo: ICameraVideoTrack | null;
  remoteVideo: IRemoteVideoTrack | null;
  toggleMic: () => void;
  toggleCam: () => void;
  leave: () => Promise<void>;
}

export function useAgoraCall(consultationId: string, info: JoinInfo): AgoraCall {
  const withVideo = info.mode === 'video';
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(withVideo);
  const [localVideo, setLocalVideo] = useState<ICameraVideoTrack | null>(null);
  const [remoteVideo, setRemoteVideo] = useState<IRemoteVideoTrack | null>(null);

  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camRef = useRef<ICameraVideoTrack | null>(null);
  /** releases the current run's tracks and leaves its channel (set by the effect) */
  const releaseRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const { app_id: appId, channel, token, uid } = info;
    if (!appId || !token || !uid) return;
    // Per-run state, so a fast unmount/remount (React strict mode, route change)
    // never leaves an earlier run's camera open or its client in the channel
    let closed = false;
    let client: IAgoraRTCClient | null = null;
    let mic: IMicrophoneAudioTrack | null = null;
    let cam: ICameraVideoTrack | null = null;

    const release = async () => {
      closed = true;
      for (const t of [mic, cam] as (ILocalTrack | null)[]) {
        t?.stop();
        t?.close();
      }
      mic = cam = null;
      micRef.current = camRef.current = null;
      const c = client;
      client = null;
      if (c) {
        c.removeAllListeners();
        await c.leave().catch(() => undefined);
      }
      setLocalVideo(null);
      setRemoteVideo(null);
    };
    releaseRef.current = release;

    (async () => {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
      if (closed) return;
      AgoraRTC.disableLogUpload();
      AgoraRTC.setLogLevel(3); // errors only

      const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      client = rtc;

      rtc.on('user-joined', () => {
        setStatus('connected');
        setMessage(null);
      });
      rtc.on('user-published', async (user, mediaType) => {
        await rtc.subscribe(user, mediaType);
        if (mediaType === 'video') setRemoteVideo(user.videoTrack ?? null);
        if (mediaType === 'audio') user.audioTrack?.play();
        setStatus('connected');
      });
      rtc.on('user-unpublished', (_user, mediaType) => {
        if (mediaType === 'video') setRemoteVideo(null);
      });
      rtc.on('user-left', () => {
        setRemoteVideo(null);
        setStatus('waiting');
        setMessage(`${info.role === 'doctor' ? 'The patient' : 'The doctor'} left the call.`);
      });
      rtc.on('connection-state-change', (cur, prev) => {
        if (cur === 'RECONNECTING') setStatus('reconnecting');
        if (prev === 'RECONNECTING' && cur === 'CONNECTED') setStatus(rtc.remoteUsers.length ? 'connected' : 'waiting');
      });
      // The token lives until an hour after the slot ends; before it lapses, ask the
      // server for a fresh one (same channel, same account) — never built here.
      rtc.on('token-privilege-will-expire', async () => {
        try {
          const fresh = await joinConsultation(consultationId);
          if (!fresh.token) throw new Error('no token');
          await rtc.renewToken(fresh.token);
        } catch {
          setMessage("This consultation's time is nearly over; the call will end shortly.");
        }
      });
      rtc.on('token-privilege-did-expire', () => {
        setStatus('ended');
        setMessage("The consultation's call time is over.");
        void release();
      });

      // Camera / microphone first, so a refused permission is reported before joining
      if (withVideo) {
        [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      } else {
        mic = await AgoraRTC.createMicrophoneAudioTrack();
      }
      if (closed) return void release();
      micRef.current = mic;
      camRef.current = cam;
      setLocalVideo(cam);

      // A string uid is the user account the server built the token for
      await rtc.join(appId, channel, token, uid);
      if (closed) return void release();
      await rtc.publish([mic, cam].filter(Boolean) as ILocalTrack[]);
      setStatus(rtc.remoteUsers.length ? 'connected' : 'waiting');
    })().catch((err) => {
      if (closed) return;
      setStatus('error');
      setMessage(callErrorText(err));
      void release();
    });

    // Unmount or route change: always release the camera/microphone and leave
    return () => void release();
  }, [consultationId, info, withVideo]);

  const toggleMic = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    const next = !micOn;
    void mic.setMuted(!next).then(() => setMicOn(next));
  }, [micOn]);

  // setEnabled(false) releases the camera itself (its light goes off), not just the picture
  const toggleCam = useCallback(() => {
    const cam = camRef.current;
    if (!cam) return;
    const next = !camOn;
    void cam.setEnabled(next).then(() => setCamOn(next));
  }, [camOn]);

  const leave = useCallback(async () => {
    await releaseRef.current();
    setStatus('ended');
  }, []);

  return { status, message, micOn, camOn, localVideo, remoteVideo, toggleMic, toggleCam, leave };
}
