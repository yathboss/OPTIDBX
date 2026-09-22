import React, { useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Full-screen landing / splash shown before entering the app. The brand
 * animation plays clearly here (unlike the subtle in-app backdrop); a single
 * "Dive in" button drops the visitor into the dashboard exactly as it is.
 */
export default function Welcome({ onEnter }) {
  const videoRef = useRef(null);

  useEffect(() => {
    videoRef.current?.play?.().catch(() => {});
  }, []);

  return (
    <div className="landing" role="dialog" aria-label="Welcome to OptiDBX">
      <video
        ref={videoRef}
        className="landing-video"
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
      <div className="landing-scrim" aria-hidden="true" />

      <div className="landing-content">
        <div className="landing-mark" aria-hidden="true">O</div>
        <h1 className="landing-title">OptiDBX</h1>
        <p className="landing-tagline">Understand. Tune. Verify.</p>
        <p className="landing-lede">
          A safe auto-tuner for PostgreSQL — it watches the database, acts only on
          real, sustained contention, and keeps a change only when the measurements
          prove it helped.
        </p>
        <button className="btn-primary lg landing-cta" onClick={onEnter} autoFocus>
          Dive in <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
