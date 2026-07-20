import type { ReactNode } from "react";

export function AppShell({
  rail,
  sidebar,
  main,
  aside,
  voiceBar,
}: {
  rail: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  aside?: ReactNode | null;
  voiceBar?: ReactNode | null;
}) {
  return (
    <div className={`nc-shell ${aside ? "nc-shell--aside" : ""}`}>
      <aside className="nc-shell__rail">{rail}</aside>
      <aside className="nc-shell__sidebar">{sidebar}</aside>
      <div className="nc-shell__center">
        {voiceBar}
        <main className="nc-shell__main">{main}</main>
      </div>
      {aside ? <aside className="nc-shell__aside">{aside}</aside> : null}
    </div>
  );
}

export function SettingsShell({
  nav,
  children,
  title,
  onClose,
}: {
  nav: ReactNode;
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="nc-settings app-fade">
      <div className="nc-settings__frame">
        <nav className="nc-settings__nav" aria-label="Settings">
          {nav}
        </nav>
        <div className="nc-settings__content">
          <header className="nc-settings__head">
            <h1>{title}</h1>
            <button type="button" className="nc-btn nc-btn--ghost nc-btn--sm" onClick={onClose}>
              Esc
            </button>
          </header>
          <div className="nc-settings__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
