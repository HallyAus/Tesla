import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A single master clock that drives every camera tile (video or procedural).
 *
 * It advances `time` (seconds from event start) using `requestAnimationFrame`
 * and the real wall clock, scaled by `playbackRate`. Video tiles subscribe and
 * continuously correct their `<video>.currentTime` toward this clock so all
 * cameras stay in sync across segment boundaries; procedural tiles just render
 * the requested time. This keeps a single source of truth instead of trusting
 * any one `<video>` element's drifting clock.
 */
export interface MasterClock {
  readonly time: number;
  readonly isPlaying: boolean;
  readonly playbackRate: number;
  readonly durationSec: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  /** Read the live time without triggering a re-render (for rAF loops). */
  readTime: () => number;
}

export function useMasterClock(durationSec: number): MasterClock {
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const timeRef = useRef(0);
  const rateRef = useRef(1);
  const playingRef = useRef(false);
  const durationRef = useRef(durationSec);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  durationRef.current = durationSec;

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const tick = useCallback(
    (ts: number) => {
      if (!playingRef.current) {
        stopRaf();
        return;
      }
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      let next = timeRef.current + dt * rateRef.current;
      if (next >= durationRef.current) {
        next = durationRef.current;
        timeRef.current = next;
        setTime(next);
        playingRef.current = false;
        setIsPlaying(false);
        stopRaf();
        return;
      }
      timeRef.current = next;
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopRaf],
  );

  const startRaf = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const play = useCallback(() => {
    if (timeRef.current >= durationRef.current) {
      timeRef.current = 0;
      setTime(0);
    }
    playingRef.current = true;
    setIsPlaying(true);
    startRaf();
  }, [startRaf]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    stopRaf();
  }, [stopRaf]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current, t));
    timeRef.current = clamped;
    setTime(clamped);
    lastTsRef.current = null; // avoid a big dt jump on resume
  }, []);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setPlaybackRate(r);
  }, []);

  const readTime = useCallback(() => timeRef.current, []);

  // Reset when the event (duration) changes.
  useEffect(() => {
    seek(0);
    pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec]);

  useEffect(() => stopRaf, [stopRaf]);

  return {
    time,
    isPlaying,
    playbackRate,
    durationSec,
    play,
    pause,
    toggle,
    seek,
    setRate,
    readTime,
  };
}
