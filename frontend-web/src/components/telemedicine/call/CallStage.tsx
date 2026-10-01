'use client';
import type { ICameraVideoTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import type { JoinInfo } from '@/lib/telemedicine/types';
import VideoTile from './VideoTile';

interface Props {
  role: JoinInfo['role'];
  withVideo: boolean;
  localVideo: ICameraVideoTrack | null;
  remoteVideo: IRemoteVideoTrack | null;
  camOn: boolean;
}

/** The other person large, own preview small in the corner (audio calls show placeholders only). */
export default function CallStage({ role, withVideo, localVideo, remoteVideo, camOn }: Props) {
  const other = role === 'doctor' ? 'Patient' : 'Doctor';
  return (
    <div className="relative flex-1 min-h-0">
      <VideoTile
        track={remoteVideo}
        label={other}
        placeholder={withVideo ? `${other}'s camera is off or not connected yet` : `Audio call with the ${other.toLowerCase()}`}
        className="absolute inset-0"
      />
      {withVideo && (
        <VideoTile
          track={camOn ? localVideo : null}
          label="You"
          placeholder="Camera off"
          mirror
          className="absolute right-3 bottom-3 w-28 h-40 sm:w-44 sm:h-32 border border-white/20 shadow-lg"
        />
      )}
    </div>
  );
}
