import { Icon } from "../ui/icons";

export function Wordmark({ children }: { children: React.ReactNode }) {
  return (
    <span className="wordmark">
      <svg width="20" height="12" viewBox="0 0 18 12" aria-hidden="true">
        <path d="M1 8 C 5 8, 6 3, 9 3 S 13 8, 17 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {children}
    </span>
  );
}

export function TeenTop({ onHelp, helpOpen }: { onHelp?: () => void; helpOpen?: boolean }) {
  return (
    <div className="phone-top">
      <Wordmark>Steady</Wordmark>
      {onHelp && (
        <button className="btn btn-sm btn-top" onClick={onHelp} aria-pressed={helpOpen}>
          <Icon name={helpOpen ? "x" : "life"} size={16} />
          Help
        </button>
      )}
    </div>
  );
}
