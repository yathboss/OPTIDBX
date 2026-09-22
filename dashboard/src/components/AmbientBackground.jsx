import React, { useEffect, useRef, useState } from 'react';

/**
 * Fixed, decorative animated backdrop shown behind every page.
 *
 * A single instance lives in the app shell, so it covers all routes. It is
 * `position: fixed` (see `.app-backdrop` in index.css) so it never scrolls with
 * the content, and it sits below the content stacking context at a low opacity
 * behind a soft scrim — a subtle ambient effect that keeps cards and text crisp.
 *
 * Respects `prefers-reduced-motion`: when the viewer prefers reduced motion the
 * video is not played and the static poster frame is shown instead (the CSS
 * media query hides the <video> as a belt-and-suspenders fallback).
 */
export default function AmbientBackground() {
  const videoRef = useRef(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Some browsers block autoplay until a gesture; nudge play once mounted.
  useEffect(() => {
    if (reduceMotion) return;
    videoRef.current?.play?.().catch(() => {});
  }, [reduceMotion]);

  return (
    <div className="app-backdrop" aria-hidden="true">
      {!reduceMotion && (
        <video
          ref={videoRef}
          className="app-backdrop-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/optiDBX_Animation_poster.jpg"
          tabIndex={-1}
        >
          <source src="/optiDBX_Animation.mp4" type="video/mp4" />
        </video>
      )}
      <div className="app-backdrop-scrim" />
    </div>
  );
}
