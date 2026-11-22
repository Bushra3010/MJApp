import { Link, useLocation } from 'react-router-dom';
import { BRAND, isPlaceholder } from '../brand.js';
import LegalFooter from '../components/LegalFooter.jsx';

const B = BRAND;
const PAGES = {
  terms: { title: 'Terms of Service', body: (<>
    <p>These terms are an agreement between you and {B.company} ("we"), which runs {B.app}. By creating an account you accept them.</p>
    <h2>1. Who can use {B.app}</h2>
    <p>You must be at least 18 years old and able to enter a binding contract under Indian law. One person, one account. Information you give us must be true.</p>
    <h2>2. What {B.app} is</h2>
    <p>{B.app} lets members chat, audio call and video call with hosts. Hosts are independent members approved by us who choose when they are available. {B.app} is for friendly conversation. It is not a dating agency, escort service, counselling or medical service.</p>
    <h2>3. Coins</h2>
    <ul>
      <li>Calls, messages and gifts are paid for with coins. The price of each is shown before you use it: per-minute rates on the host's profile, and the message cost in the chat box.</li>
      <li>Calls are charged per started minute, from when the host answers. If your balance cannot cover the next minute, the call ends.</li>
      <li>Coins are a licence to use features in the app. They have no cash value, cannot be transferred or sold, and are not refundable except as set out in the <Link className="link" to="/refunds">Refund Policy</Link>.</li>
      <li>We may change coin prices or rates in future. Changes never affect coins you have already bought.</li>
    </ul>
    <h2>4. Hosts</h2>
    <p>Hosts earn a share of the coins members spend with them, at the rate shown in their dashboard, and can request payouts to their own UPI ID. Hosts must follow the <Link className="link" to="/guidelines">Community Guidelines</Link>, may not ask members for money or contact details outside {B.app}, and are responsible for their own taxes. We may withhold payouts linked to fraud or rule-breaking.</p>
    <h2>5. Your behaviour</h2>
    <p>Follow the <Link className="link" to="/guidelines">Community Guidelines</Link>. We may warn, suspend or close accounts that break them, and report illegal activity to the authorities.</p>
    <h2>6. Your content</h2>
    <p>You own what you post. You let us store and show it inside {B.app} so the service works. We do not record calls.</p>
    <h2>7. Ending your account</h2>
    <p>You can delete your account at any time in Profile → Delete account. Unused coins are lost when you delete your account.</p>
    <h2>8. Liability</h2>
    <p>We provide {B.app} "as is". To the extent the law allows, we are not liable for indirect losses, or for what members or hosts say or do. Our total liability to you is limited to the amount you paid us in the 3 months before the claim.</p>
    <h2>9. Law and disputes</h2>
    <p>These terms are governed by the laws of India. Courts at the city of our registered office have jurisdiction. Contact our Grievance Officer first, details on the <Link className="link" to="/contact">Contact</Link> page.</p>
  </>) },
  privacy: { title: 'Privacy Policy', body: (<>
    <p>This policy explains what {B.app} collects, why, and your rights under the Digital Personal Data Protection Act, 2023.</p>
    <h2>What we collect</h2>
    <ul>
      <li><b>Account:</b> name, email, password (stored only as a secure hash), date of birth, gender, languages, city and bio if you add them, profile photo if you upload one.</li>
      <li><b>Activity:</b> messages, gifts, call times and durations, coin transactions, reports and blocks.</li>
      <li><b>Hosts only:</b> payout details (UPI ID or bank account holder, number and IFSC) and, if you choose to get verified, a photo of a government ID and a selfie. ID photos are seen only by our verification team and deleted once a decision is made.</li>
      <li><b>Payments:</b> order and payment IDs and amounts. Card, UPI and bank details are handled by Razorpay and never reach us.</li>
      <li><b>Device:</b> push-notification tokens if you turn notifications on, and basic logs (IP address, browser) kept for security.</li>
    </ul>
    <h2>What we don't collect</h2>
    <p>We do not record or store audio or video from calls. Calls travel directly between devices, or through an encrypted relay server when a direct connection isn't possible. We do not sell your data or show third-party ads.</p>
    <h2>Why we use it</h2>
    <p>To run your account, connect calls and chats, charge coins and pay hosts, keep members safe (moderating reports, stopping fraud), and meet legal duties.</p>
    <h2>Who we share it with</h2>
    <ul>
      <li>Razorpay, for payments.</li>
      <li>Google, if you choose "Continue with Google": we receive your name, email and a Google account ID, and nothing else from your Google account.</li>
      <li>Cloudflare, which hosts the app and database and relays calls when a direct connection isn't possible.</li>
      <li>Our email provider, for password-reset emails.</li>
      <li>Your browser's push service (Google, Apple or Mozilla) for notifications you turn on.</li>
      <li>Authorities, when Indian law requires it.</li>
    </ul>
    <h2>How long we keep it</h2>
    <p>Until you delete your account. When you do, we delete your profile, photo, messages and push tokens straight away. Payment records are kept without your name for 8 years, as tax law requires.</p>
    <h2>Your rights</h2>
    <p>You can see and correct your profile in the app, download a copy of your data by asking us, withdraw consent by deleting your account, and complain to our Grievance Officer or the Data Protection Board of India.</p>
    <h2>Children</h2>
    <p>{B.app} is only for adults. We delete accounts we find belong to anyone under 18.</p>
  </>) },
  refunds: { title: 'Refund & Cancellation Policy', body: (<>
    <p>Coins are digital goods, delivered to your wallet the moment payment succeeds.</p>
    <ul>
      <li><b>Payment taken but no coins:</b> coins are added automatically when Razorpay confirms the payment, usually within minutes. If they haven't arrived within 24 hours, email us with your payment ID and we'll add them or refund you in full.</li>
      <li><b>Charged twice for the same order:</b> refunded in full.</li>
      <li><b>Call dropped because of our fault:</b> tell us within 7 days and we'll return the coins for that call.</li>
      <li><b>Unused coins:</b> can be refunded within 7 days of purchase if you have not used any coins from that purchase.</li>
      <li>Coins already spent on calls, messages or gifts that worked as described are not refundable.</li>
    </ul>
    <p>Approved refunds go back to the original payment method within 5–7 working days.</p>
    <p>To ask for a refund, write to <b>{B.supportEmail}</b> with your account email and Razorpay payment ID. Your wallet history in the app lists every payment ID.</p>
  </>) },
  guidelines: { title: 'Community Guidelines', body: (<>
    <p>{B.app} works when everyone feels safe. These rules apply to members and hosts alike.</p>
    <h2>Do</h2>
    <ul><li>Be respectful, and take no for an answer.</li><li>Report anything that makes you uncomfortable. Every report is reviewed.</li><li>Keep personal details private.</li></ul>
    <h2>Don't</h2>
    <ul>
      <li>No nudity, sexual acts or sexual requests on video or in chat.</li>
      <li>No harassment, hate speech, threats or bullying.</li>
      <li>No asking for or sending money, gifts or payment outside {B.app}, and no sharing phone numbers, social handles or payment details.</li>
      <li>No minors, ever. No one under 18 may appear on camera.</li>
      <li>No impersonation, fake profiles or other people's photos.</li>
      <li>No recording or screenshotting calls without consent.</li>
      <li>No promoting illegal goods, gambling or scams.</li>
    </ul>
    <h2>What happens if rules are broken</h2>
    <p>Depending on how serious it is: a warning, removal of content, suspension, permanent ban, and withheld host earnings for violations during calls. Illegal content is reported to the police.</p>
  </>) },
  contact: { title: 'Contact us', body: (<>
    <p><b>{B.company}</b><br />{B.address}</p>
    <h2>Support</h2>
    <p>Email: <b>{B.supportEmail}</b>. We reply within 48 hours.</p>
    <h2>Grievance Officer</h2>
    <p>As required by the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021:<br />
      {B.grievanceOfficer}<br />Email: <b>{B.grievanceEmail}</b><br />Complaints are acknowledged within 24 hours and resolved within 15 days.</p>
  </>) },
};

export default function Legal() {
  const page = useLocation().pathname.slice(1);
  const p = PAGES[page] || PAGES.terms;
  const draft = isPlaceholder(B.company);
  return (
    <div className="legal">
      <Link to="/" className="row" style={{ marginBottom: 20 }}><img src="/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: 10 }} /><b>{B.app}</b></Link>
      <h1>{p.title}</h1>
      <p className="faint">Last updated {B.updated}</p>
      {draft && <p className="note">Draft: fill in your business details in client/src/brand.js and have a lawyer review this page before launch.</p>}
      {p.body}
      <LegalFooter />
    </div>
  );
}
