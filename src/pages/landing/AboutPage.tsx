import { UserX, Globe2, Heart, Layers, Users, Sparkles } from 'lucide-react';
import MarketingLanding from '../../components/seo/MarketingLanding';
import { faqCategories } from '../../data/seoContent';

const faqs = faqCategories.find((c) => c.page === '/about')!.items;

export default function AboutPage() {
  return (
    <MarketingLanding
      path="/about"
      breadcrumbLabel="About"
      seoTitle="About VoiceID — Secure Messaging Without a Phone Number"
      metaDescription="VoiceID is a secure messaging platform built around username-based identity instead of phone numbers. Learn what we're building and why."
      keywords="about voiceid, voiceid messaging app, secure messaging company, username based messenger"
      h1="Stop Sharing Your Phone Number."
      intro="VoiceID exists because your phone number was never meant to be your identity online. We built a messaging platform where a username — not a number — is how people reach you."
      benefits={[
        { icon: UserX, title: 'Identity, Not a Phone Number', description: 'Your VoiceID username replaces your phone number as the thing you share to be reachable — nothing tied to your carrier or SIM.' },
        { icon: Layers, title: 'One Platform, Every Format', description: 'Text, voice notes, and calls live in one place, so you don\u2019t need a separate app for each way you communicate.' },
        { icon: Globe2, title: 'Runs Anywhere', description: 'VoiceID is a web app first — no app store, no install, works on any modern browser or device.' },
        { icon: Heart, title: 'Privacy as the Default', description: 'End-to-end encryption and zero-knowledge architecture aren\u2019t optional add-ons — they\u2019re how VoiceID is built from the ground up.' },
        { icon: Users, title: 'Built for Real Conversations', description: 'From one-on-one chats to remote teams, VoiceID is designed for the way people actually talk to each other.' },
        { icon: Sparkles, title: 'Always Improving', description: 'We keep shipping — new features, better security, and a faster experience across every part of the app.' },
      ]}
      howItWorks={[
        { title: 'We started with a problem', description: 'Phone numbers link your real identity to spam, SIM-swap attacks, and tracking — just to let people reach you.' },
        { title: 'We built a better identity layer', description: 'A VoiceID username does the same job as a phone number, without the exposure.' },
        { title: 'We kept building from there', description: 'Encrypted voice notes, calls, and a full messaging experience, all on top of that same private identity.' },
      ]}
      faqs={faqs}
      ctaLabel="Create Your VoiceID"
      relatedLinks={[
        { label: 'Security', path: '/security' },
        { label: 'Features', path: '/features' },
        { label: 'Careers', path: '/careers' },
      ]}
    />
  );
}
