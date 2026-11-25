// Contact-sharing protection: spot phone numbers, WhatsApp and other ways to move a chat off Milo Julo.
// Returns a short reason when the text looks like contact details, or null when it's fine.

const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, shunya: 0,
};
const DEVANAGARI = '०१२३४५६७८९';

const KEYWORDS = [
  [/wh?a+t+s+\s*a+p+|watsap|wtsp|whtsp|\bw\.?a\.?\b(?=\s*(no|num|number|pe|par|me|on|:))|wa\.me/i, 'WhatsApp'],
  [/telegram|\bt\.me\b|\btg\s*(id|no|pe|par)/i, 'Telegram'],
  [/insta(gram)?\s*(id|pe|par|handle|account)?\b|\big\s*(id|handle)\b/i, 'Instagram'],
  [/snap\s*chat|\bsnap\s*(id|pe)\b|facebook|\bfb\s*(id|pe|par)\b|signal\s*app|\bimo\b|\bskype\b|\bline\s*id\b/i, 'social media'],
  [/\b(my|mera|meri|apna)\s*(mobile|phone|contact|cell)?\s*(no|num|number|nmbr|nambar)\b/i, 'phone number'],
  [/\b(call|text|msg|message)\s*(me|kro|karo|kar)\s*(on|pe|par)\s*\d/i, 'phone number'],
  [/[\w.+-]+@(gmail|yahoo|outlook|hotmail|icloud|rediff|proton)\b|[\w.+-]+@[\w-]+\.(com|in|co|net|org|me)\b/i, 'email'],
  [/(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|in|me|io|ly|link)\/\S*/i, 'link'],
];

/** Digits written out ("nine eight seven…", "नौ…", "९८७…") are turned into digits before checking. */
function normalise(text) {
  let t = String(text || '').toLowerCase();
  t = t.replace(/[०-९]/g, (d) => String(DEVANAGARI.indexOf(d)));
  t = t.replace(/[a-z]+/g, (w) => (w in NUM_WORDS ? String(NUM_WORDS[w]) : w));
  // common letter-for-digit swaps inside number runs: o→0, l/i→1
  t = t.replace(/(?<=\d[\s.-]*)[o](?=[\s.-]*\d)/g, '0').replace(/(?<=\d[\s.-]*)[li](?=[\s.-]*\d)/g, '1');
  return t;
}

export function findContact(text) {
  const raw = String(text || '');
  for (const [re, why] of KEYWORDS) if (re.test(raw)) return why;
  const t = normalise(raw);
  // 8+ digits, allowing spaces, dots, dashes, brackets or a + between them (phone numbers, +91…)
  if (/(?:\d[\s.\-()+_/]*){8,}/.test(t)) return 'phone number';
  // numbers split over several short chunks ("98 76 54 32 10" is caught above; "9876 then 543210" here)
  const digits = (t.match(/\d/g) || []).length;
  if (digits >= 10 && /\d{3,}/.test(t)) return 'phone number';
  return null;
}

export const CONTACT_ERROR = 'Sharing phone numbers, WhatsApp or other contact details is not allowed on Milo Julo. Please keep talking here — use an audio or video call.';
