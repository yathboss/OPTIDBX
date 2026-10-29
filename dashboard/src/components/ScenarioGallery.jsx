import React from 'react';
import { Cpu, Database, Server, ArrowRight, ShieldCheck } from 'lucide-react';
import { SCENARIOS, VERDICTS } from '../scenarios.mjs';
import {routeHref} from '../navigation.mjs';

const CATEGORY_ICON = { CPU: Cpu, DB: Database, OS: Server };

export default function ScenarioGallery() {
  return (
    <div className="studio-gallery">
      <p className="section-eyebrow">Demo scenarios</p>
      <h2 className="section-heading">Choose a scenario to demonstrate</h2>
      <p className="section-sub">
        Each scenario walks the full decision pipeline — baseline, detection, apply,
        observation, decision — and ends with a verified report.
      </p>

      <div className="scenario-grid">
        {SCENARIOS.map((s) => {
          const Icon = CATEGORY_ICON[s.category] || Cpu;
          const verdict = VERDICTS[s.expected];
          return (
            <a key={s.id} className="scenario-card" href={routeHref('scenario',s.id)}>
              <div className="scenario-card-head">
                <span className="scenario-icon"><Icon size={20} /></span>
                <span className={`kind-badge ${s.kind === 'live' ? 'kind-live' : 'kind-sim'}`}>
                  {s.kind === 'live' ? 'Live' : 'Simulated'}
                </span>
              </div>
              <h3 className="scenario-title">{s.title}</h3>
              <p className="scenario-subtitle">{s.subtitle}</p>
              <p className="scenario-summary">{s.summary}</p>
              <div className="scenario-card-foot">
                <span className={`verdict-pill tone-${verdict.tone}`}>{verdict.label}</span>
                <span className="scenario-run">Run <ArrowRight size={15} /></span>
              </div>
            </a>
          );
        })}
      </div>

      <footer className="studio-integrity">
        <ShieldCheck size={16} />
        <span>
          Simulated scenarios are illustrative walkthroughs with values seeded from measured
          runs. Real measurements are produced by a Live Session.
        </span>
      </footer>
    </div>
  );
}
