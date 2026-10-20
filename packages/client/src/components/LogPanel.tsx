/** A running record of what's happened in the game so far, newest first. */
export function LogPanel({ entries }: { entries: string[] }) {
  return (
    <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Log</h3>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing has happened yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>
          {[...entries].reverse().map((entry, i) => (
            <li key={entries.length - i}>{entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
