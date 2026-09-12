export function PassButton({ onPass }: { onPass: () => void }) {
  return (
    <button className="btn" onClick={onPass} style={{ width: '100%' }}>
      Pass
    </button>
  );
}
