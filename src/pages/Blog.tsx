import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Blog() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-28 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tighter mb-8">VoiceID Blog</h1>
        <div className="space-y-16">
          <article>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Why Your Phone Number is Not a Safe Identity</h2>
            <p className="text-gray-500 mb-6 italic">July 25, 2026</p>
            <p className="text-lg text-gray-700 leading-relaxed mb-4">Phone numbers were never designed for the internet age. They were built for basic circuit-switched telephone networks in the mid-20th century. Today, they are a massive security liability.</p>
            <p className="text-lg text-gray-700 leading-relaxed">SIM swapping attacks, SMS interception, and poor authentication practices mean your phone number is one of the easiest ways for hackers to gain access to your accounts. At VoiceID, we are pioneering a new approach: Identity based on cryptographic keys, not telecommunication infrastructure.</p>
          </article>
          <article>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Introducing Secure End-to-End Encryption</h2>
            <p className="text-gray-500 mb-6 italic">June 15, 2026</p>
            <p className="text-lg text-gray-700 leading-relaxed mb-4">Privacy is not just a feature at VoiceID; it is the core of our business model. We are thrilled to announce that all communications on our platform—text, voice, and calls—are now protected by fully audited, end-to-end encryption.</p>
            <p className="text-lg text-gray-700 leading-relaxed">This means that only the sender and the intended recipient can read or listen to the communication. Not even we, at VoiceID, can access the content of your messages or calls. We have built our architecture to be completely zero-knowledge, ensuring that you remain in total control of your data.</p>
          </article>
          <article>
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">The Future of Decentralized Communication</h2>
            <p className="text-gray-500 mb-6 italic">May 10, 2026</p>
            <p className="text-lg text-gray-700 leading-relaxed">We explore how decentralized identity systems can reduce our reliance on big tech, restore data sovereignty, and build a more resilient internet ecosystem.</p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
