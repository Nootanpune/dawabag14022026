'use client';
import { useEffect, useRef } from 'react';
import { User } from 'lucide-react';

/** The part of a local or remote Agora video track this tile needs */
interface PlayableTrack {
  play(element: HTMLElement): void;
  stop(): void;
}

interface Props {
  track: PlayableTrack | null;
  label: string;
  /** shown in place of the picture when there is no track */
  placeholder: string;
  className?: string;
  /** mirror the picture (own camera) */
  mirror?: boolean;
}

/** One video tile: plays the track into its box, stops it when the track changes or the tile goes away. */
export default function VideoTile({ track, label, placeholder, className = '', mirror }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!track || !el) return;
    track.play(el);
    return () => track.stop();
  }, [track]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-gray-900 ${className}`}>
      <div ref={box} className={`absolute inset-0 ${mirror ? '[transform:scaleX(-1)]' : ''}`} />
      {!track && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
          <User className="w-10 h-10" />
          <span className="text-xs text-center px-2">{placeholder}</span>
        </div>
      )}
      <span className="absolute left-2 bottom-2 text-[11px] text-white bg-black/50 rounded px-1.5 py-0.5">{label}</span>
    </div>
  );
}
