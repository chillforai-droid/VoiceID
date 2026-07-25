import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Story from '../components/Story';
import Features from '../components/Features';
import Demo from '../components/Demo';
import Security from '../components/Security';
import FutureVision from '../components/FutureVision';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';

export default function LandingPage() {
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
