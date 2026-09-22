import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Catches render/runtime errors in the routed page so a crash shows a readable
 * message (with the header/nav still usable) instead of a blank screen.
 * Resets automatically when `resetKey` changes (i.e. on navigation).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[OptiDBX] page error:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="studio">
          <div className="error-boundary" role="alert">
            <AlertTriangle size={28} />
            <h3>This page hit an error</h3>
            <p className="error-msg">{String(this.state.error?.message || this.state.error)}</p>
            <p className="muted">
              The rest of the app still works — switch tabs, or reload the page. If it persists,
              copy this message so it can be fixed.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
