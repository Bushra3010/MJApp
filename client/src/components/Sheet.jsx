export default function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
