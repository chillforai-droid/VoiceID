import { motion } from 'motion/react';
import { Mic, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      aria-label="Primary"
      className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 flex items-center justify-between backdrop-blur-xl bg-white/80 dark:bg-slate-950/85 border-b border-gray-100/50 dark:border-slate-800/70 text-gray-900 dark:text-white transition-colors"
    >
      <a href="/" className="flex items-center gap-2" aria-label="VoiceID home">
        <Mic className="text-black dark:text-white" size={24} aria-hidden="true" />
        <span className="font-bold text-xl tracking-tighter">VoiceID</span>
      </a>
      <div className="hidden md:flex gap-8 text-sm font-medium text-gray-600 dark:text-slate-300">
        <a href="/features" className="hover:text-black dark:hover:text-white">Features</a>
        <a href="/security" className="hover:text-black dark:hover:text-white">Security</a>
        <a href="/blog" className="hover:text-black dark:hover:text-white">Blog</a>
        <a href="/help" className="hover:text-black dark:hover:text-white">Help</a>
      </div>
      <div className="flex gap-4">
        <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`} className="p-2 rounded-full text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition">{resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button onClick={() => navigate('/auth/login')} aria-label="Log in to VoiceID" className="text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white">Login</button>
        <button onClick={() => navigate('/auth/welcome')} aria-label="Create a VoiceID account" className="px-4 py-2 text-sm font-semibold text-white bg-black dark:bg-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-slate-200 transition">Create VoiceID</button>
      </div>
    </motion.nav>
  );
}
