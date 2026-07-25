export default function Footer() {
  return (
    <footer className="py-20 px-6 border-t border-gray-100 bg-gray-50">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
        <div className="col-span-1">
          <div className="font-bold text-2xl tracking-tighter mb-4">VoiceID</div>
          <p className="text-sm text-gray-500">The world's first Voice Identity Platform.</p>
        </div>
        <div>
          <h4 className="font-bold mb-4">Product</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><a href="#features" className="hover:text-black">Features</a></li>
            <li><a href="#security" className="hover:text-black">Security</a></li>
            <li><a href="#" className="hover:text-black">Developers</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4">Company</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><a href="#about" className="hover:text-black">About</a></li>
            <li><a href="/careers" className="hover:text-black">Careers</a></li>
            <li><a href="/blog" className="hover:text-black">VoiceID Blog</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4">Resources</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><a href="/privacy-policy" className="hover:text-black">Privacy Policy</a></li>
            <li><a href="/terms-of-service" className="hover:text-black">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-sm text-gray-400">
        © 2026 VoiceID Inc. All rights reserved.
      </div>
    </footer>
  );
}
