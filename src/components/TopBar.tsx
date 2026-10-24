import { Icon } from './Icon';
import { Logo } from './Logo';

/** The slim bar at the very top: the app's logo and name, and the settings button. */
export function TopBar({ onSettings }: { onSettings: () => void }) {
  return (
    <div className="top-bar">
      <div className="top-bar-inner">
        <a className="top-bar-brand" href="#/">
          <Logo />
          <span className="top-bar-name">Gift-List</span>
        </a>
        <button type="button" className="icon-btn top-bar-btn" onClick={onSettings} aria-label="Settings">
          <Icon name="settings" size={22} />
        </button>
      </div>
    </div>
  );
}
