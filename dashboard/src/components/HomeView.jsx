import React from 'react';
import { ArrowRight, Eye, Search, Wrench, CheckCircle2, Sparkles, ShieldCheck, Scale, Radio } from 'lucide-react';

const STEPS = [
  { icon: Eye, title: 'Monitor', text: 'Sample OS and PostgreSQL telemetry every five seconds.' },
  { icon: Search, title: 'Detect', text: 'Confirm a real bottleneck over three consecutive readings.' },
  { icon: Wrench, title: 'Act safely', text: 'Apply one approved change — journaled and fully reversible.' },
  { icon: CheckCircle2, title: 'Verify', text: 'Measure the effect and keep it only if it genuinely helped.' },
];

const PILLARS = [
  { icon: Sparkles, title: 'Smart', text: 'Acts only on sustained, measured CPU and parallelism contention — never on noise.' },
  { icon: ShieldCheck, title: 'Safe', text: 'Verified apply and rollback, with fail-closed recovery whenever anything is uncertain.' },
  { icon: Scale, title: 'Honest', text: 'Judges every change on real owned-workload measurements, and does nothing when there is nothing to gain.' },
];

export default function HomeView({ onExploreScenarios, onStartLive }) {

  return (
    <div className="home">
      {/* Welcome */}
      <section className="welcome">
        <div className="welcome-mark" aria-hidden="true">O</div>
        <h1 className="welcome-title">OptiDBX</h1>
        <p className="welcome-tagline">Understand. Tune. Verify.</p>
        <p className="welcome-lede">
          A safe auto-tuner for PostgreSQL. It watches the database, applies one approved
          change when there is genuine contention, and keeps that change only when the
          measurements prove it helped.
        </p>

        <div className="welcome-stat">
          <span className="ws-from">0</span>
          <ArrowRight size={22} />
          <span className="ws-to">50%</span>
          <span className="ws-label">of applied changes kept — up from never keeping one</span>
        </div>

        <div className="welcome-actions">
          <button className="btn-primary lg" onClick={onExploreScenarios}>
            Explore demo scenarios
          </button>
          <button className="btn-secondary lg" onClick={onStartLive}>
            <Radio size={16} /> Run a live session
          </button>
        </div>
      </section>

      <section className="home-section systems-explainer" aria-labelledby="systems-title">
        <p className="section-eyebrow">OS + DBMS + performance</p>
        <h2 className="section-heading" id="systems-title">Understand the signals behind each decision</h2>
        <figure className="systems-illustration">
          <img src="/images/optidbx-systems-concept.png" width="1672" height="941" decoding="async" alt="Concept illustration connecting CPU, RAM and disk I/O to PostgreSQL, with illustrative throughput and latency curves." />
          <figcaption>Concept illustration, not live measurements. Real outcomes depend on the workload and are recorded in session reports.</figcaption>
        </figure>
        <dl className="systems-terms">
          <div><dt>OS resources</dt><dd>CPU, memory, and disk activity describe pressure on the host.</dd></div>
          <div><dt>DBMS</dt><dd>PostgreSQL executes the queries and manages database workers.</dd></div>
          <div><dt>Throughput · QPS</dt><dd>How many owned queries complete per second.</dd></div>
          <div><dt>Latency · ms</dt><dd>How long a query takes; p95 describes the slower end of responses.</dd></div>
        </dl>
      </section>

      {/* How it works */}
      <section className="home-section">
        <p className="section-eyebrow">How it works</p>
        <h2 className="section-heading">Four steps, every time</h2>
        <div className="howitworks">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.title}>
              <div className="how-step">
                <span className="how-icon"><s.icon size={20} /></span>
                <div><h4>{s.title}</h4><p>{s.text}</p></div>
              </div>
              {i < STEPS.length - 1 && <ArrowRight className="how-arrow" size={18} />}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section className="home-section">
        <p className="section-eyebrow">Why it is different</p>
        <h2 className="section-heading">Built to be trusted, not just clever</h2>
        <div className="pillars">
          {PILLARS.map((p) => (
            <div key={p.title} className="pillar">
              <span className="pillar-icon"><p.icon size={20} /></span>
              <h4>{p.title}</h4>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
