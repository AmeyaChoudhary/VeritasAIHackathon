export function TeenTop({ onHelp, helpOpen }: { onHelp?: () => void; helpOpen?: boolean }) {
  return (
    <div className="phone-top">
      <span className="wordmark">
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
          <path d="M1 8 C 5 8, 6 3, 9 3 S 13 8, 17 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Steady
      </span>
      {onHelp && (
        <button className="btn btn-sm" onClick={onHelp} aria-pressed={helpOpen}>
          Help
        </button>
      )}
    </div>
  );
}
