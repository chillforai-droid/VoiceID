import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Story from '../components/Story';
import Features from '../components/Features';
import Demo from '../components/Demo';
import Security from '../components/Security';
import FutureVision from '../components/FutureVision';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';
import { useSEO } from '../hooks/useSEO';

export default function LandingPage() {
  useSEO({
      title: 'VoiceID — Secure Voice & Messaging Without Sharing Your Phone Number',
      description: 'VoiceID lets you connect, message and make voice calls using your digital identity without sharing your phone number.',
      canonical: 'https://voiceid.online/'
  });

  useEffect(() => {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "VoiceID",
      "url": "https://voiceid.online/"
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <Navbar />
      <Hero />
      <Story />
      <Features />
      <Security />
      <FutureVision />
      <FAQ />
      <Footer />
    </div>
  );
}
