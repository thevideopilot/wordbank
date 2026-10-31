// Pronunciation with the phone's built-in voices, preferring a British one.
const PREFERRED = ['Daniel', 'Serena', 'Kate', 'Arthur', 'Martha', 'Google UK English Female', 'Google UK English Male'];
let voice = null;

export const canSpeak = () => 'speechSynthesis' in window;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const british = voices.filter((v) => v.lang?.replace('_', '-').startsWith('en-GB'));
  voice = PREFERRED.map((n) => british.find((v) => v.name.includes(n))).find(Boolean) || british[0] || null;
}

if (canSpeak()) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function speak(text) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
