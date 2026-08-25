import { Lock, ShieldCheck, EyeOff, KeyRound, Ban, Trash2 } from 'lucide-react';
import MarketingLanding from '../../components/seo/MarketingLanding';
import { faqCategories } from '../../data/seoContent';

const faqs = faqCategories.find((c) => c.page === '/security')!.items;

export default function SecurityPage() {
  return (
    <MarketingLanding
      path="/security"
      breadcrumbLabel="Security"
      seoTitle="Security — How VoiceID Protects Your Messages | VoiceID"
      metaDescription="See how VoiceID protects your conversations: end-to-end encryption, zero-knowledge architecture, spam and block controls, and full account deletion."
      keywords="voiceid security, end to end encryption messaging, zero knowledge messaging app, secure messaging privacy controls"
      h1="Uncompromising Security, By Design"
      intro="VoiceID is built around a simple idea: your conversations belong to you. Every message, voice note, and call is protected end-to-end, and your identity never depends on a phone number."
      benefits={[
        { icon: Lock, title: 'End-to-End Encrypted', description: 'Text, voice notes, and calls are encrypted end-to-end, so only you and the person you\u2019re talking to can access the content.' },
        { icon: EyeOff, title: 'Zero-Knowledge Architecture', description: 'VoiceID is built so message content is never accessible to VoiceID staff or infrastructure.' },
        { icon: KeyRound, title: 'No Phone Number Required', description: 'Your identity is a username, not a phone number, removing SIM-swap-based account takeover as an attack vector.' },
        { icon: Ban, title: 'Spam & Contact Controls', description: 'Choose who can send you contact requests — everyone, contacts of contacts, or nobody — and block anyone instantly.' },
        { icon: ShieldCheck, title: 'Encrypted in Transit & at Rest', description: 'Messages and media are encrypted in transit and held in access-controlled storage.' },
        { icon: Trash2, title: 'Full Account Deletion', description: 'Delete your account at any time from Settings — your profile, messages, and conversations are permanently removed.' },
      ]}
      howItWorks={[
        { title: 'Create your VoiceID', description: 'Sign up with just an email and a username — no phone number, ever.' },
        { title: 'Message with encryption on by default', description: 'Every conversation is end-to-end encrypted automatically, with nothing to configure.' },
        { title: 'Stay in control', description: 'Adjust who can contact you, block anyone, or delete your account and data whenever you choose.' },
      ]}
      faqs={faqs}
      relatedLinks={[
        { label: 'Secure Messaging', path: '/secure-messaging' },
        { label: 'Private Chat', path: '/private-chat' },
        { label: 'About VoiceID', path: '/about' },
      ]}
    />
  );
}
