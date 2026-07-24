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
            <li>Features</li>
            <li>Security</li>
            <li>Developers</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4">Company</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li>About</li>
            <li>Careers</li>
            <li>Blog</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4">Resources</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li>Privacy</li>
            <li>Terms</li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-100 text-sm text-gray-400">
        © 2026 VoiceID Inc. All rights reserved.
      </div>
    </footer>
  );
}
