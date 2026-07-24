import { Lock, ShieldCheck, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

export default function Security() {
  return (
    <section id="security" className="py-20 px-6 bg-black text-white rounded-[3rem] max-w-7xl mx-auto my-20">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl font-extrabold tracking-tighter mb-8">Uncompromising Security</h2>
        <p className="text-xl text-gray-400 mb-16">Your VoiceID is protected by the most advanced security protocols on the internet.</p>
        <div className="grid md:grid-cols-3 gap-8">
            <motion.div whileHover={{ scale: 1.05 }} className="flex flex-col items-center p-8 bg-gray-900 rounded-3xl">
                <Lock className="text-blue-500 mb-6" size={48} />
                <span className="font-semibold text-lg">End-to-end Encrypted</span>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} className="flex flex-col items-center p-8 bg-gray-900 rounded-3xl">
                <ShieldCheck className="text-blue-500 mb-6" size={48} />
                <span className="font-semibold text-lg">Spam Protection</span>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} className="flex flex-col items-center p-8 bg-gray-900 rounded-3xl">
                <EyeOff className="text-blue-500 mb-6" size={48} />
                <span className="font-semibold text-lg">Privacy Controls</span>
            </motion.div>
        </div>
      </div>
    </section>
  );
}
