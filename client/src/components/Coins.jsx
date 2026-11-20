export default function Coins({ value, className = '' }) {
  return <span className={`coin ${className}`}>{Number(value || 0).toLocaleString('en-IN')}</span>;
}
