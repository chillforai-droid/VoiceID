import { Mic, Users, MessageCircle, Headphones, Zap, ShieldCheck } from 'lucide-react';
import MarketingLanding from '../../components/seo/MarketingLanding';

const faqs = [
  { q: 'What is VoiceID voice chat?', a: 'VoiceID voice chat lets you connect with people through voice conversations alongside messaging and other social features.' },
  { q: 'Can I use voice chat on mobile?', a: 'Yes. VoiceID is designed to work in modern mobile and desktop browsers, subject to browser microphone permissions and device support.' },
  { q: 'Do I need to install an app?', a: 'You can start from the VoiceID website. An optional home-screen installation may be available on supported browsers.' },
  { q: 'Can I control microphone access?', a: 'Your browser asks for microphone permission. You can manage or revoke that permission from your browser settings.' },
];

export default function VoiceChatPage() {
  return <MarketingLanding path="/voice-chat" breadcrumbLabel="Voice Chat" seoTitle="Voice Chat Online — Talk and Connect on VoiceID" metaDescription="Explore VoiceID voice chat for quick conversations, voice connections and messaging on mobile or desktop." keywords="voice chat online, voice chat app, talk online, voice conversation app, browser voice chat" h1="Talk More Naturally With Voice Chat" intro="Move beyond typing with voice conversations designed for quick, human connections on VoiceID." benefits={[
    { icon: Mic, title: 'Voice Conversations', description: 'Use voice features when typing is not enough and you want a more natural way to connect.' },
    { icon: MessageCircle, title: 'Chat and Voice Together', description: 'Keep text messages and voice interactions in one connected social experience.' },
    { icon: Users, title: 'Connect With People', description: 'Discover people and continue conversations through the features available in your account.' },
    { icon: Headphones, title: 'Mobile Friendly', description: 'Use supported mobile browsers and headphones for a more comfortable experience.' },
    { icon: Zap, title: 'Quick to Start', description: 'Open VoiceID, sign in and use the available voice features without a complicated setup.' },
    { icon: ShieldCheck, title: 'Permission-Aware', description: 'Microphone access is controlled through your browser and device permissions.' },
  ]} howItWorks={[{ title: 'Open VoiceID', description: 'Visit VoiceID from a supported browser.' }, { title: 'Sign in or create an account', description: 'Use the available account flow to access voice features.' }, { title: 'Start a conversation', description: 'Choose a contact or supported voice experience and allow microphone access when prompted.' }]} faqs={faqs} relatedLinks={[{ label: 'Video Calls', path: '/video-calls' }, { label: 'Voice Messaging', path: '/voice-messaging' }, { label: 'Online Chat', path: '/online-chat' }]} />;
}
