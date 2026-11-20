import { Link } from 'react-router-dom';
export default function LegalFooter() {
  return (
    <nav className="footer-links" aria-label="Legal">
      <Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refunds">Refunds</Link>
      <Link to="/guidelines">Community Guidelines</Link><Link to="/contact">Contact</Link>
    </nav>
  );
}
