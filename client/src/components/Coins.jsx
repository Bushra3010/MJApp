// Coin amount with the coin icon. Accepts numbers, or already-shortened text like "4.75K".
export default function Coins({ value, className = '' }) {
  const n = Number(value ?? 0);
  return <span className={`coin ${className}`}>{Number.isFinite(n) ? n.toLocaleString('en-IN') : String(value)}</span>;
}
