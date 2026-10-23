/**
 * Fixed to the viewport bottom rather than a normal in-flow element —
 * every view sets its own `minHeight: '100vh'`, so an in-flow footer would
 * sit just past one viewport's height and never be visible without
 * scrolling. Kept deliberately thin/low-contrast so it reads as a status
 * bar, not an overlay competing with the page above it (including mid-game
 * screens, which this is shown on too).
 */
export function Footer() {
  return (
    <footer
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '4px 0',
        fontSize: 11,
        color: 'var(--muted)',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
      }}
    >
      Bugs and feedback to <a href="mailto:denimcat@ancepp-glos.com" style={{ color: 'inherit' }}>denimcat@ancepp-glos.com</a>
    </footer>
  );
}
