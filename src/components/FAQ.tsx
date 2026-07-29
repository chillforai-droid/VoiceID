import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
    { q: "Do I need a phone number?", a: "No, VoiceID replaces the need for a phone number for communication." },
    { q: "Is it secure?", a: "Yes, all communications are end-to-end encrypted." },
    { q: "Is it free?", a: "Personal accounts are free." },
];

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section className="py-20 px-6 max-w-3xl mx-auto">
            <h2 className="text-4xl font-extrabold tracking-tighter text-center mb-16">FAQ</h2>
            <div className="space-y-4">
                {faqs.map((faq, i) => (
                    <div key={i} className="border-b border-gray-100">
                        <button 
                            onClick={() => setOpen(open === i ? null : i)}
                            className="flex justify-between items-center gap-4 w-full py-4 text-left font-bold"
                        >
                            <span>{faq.q}</span>
                            <ChevronDown className={`shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence>
                            {open === i && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }} 
                                    animate={{ height: 'auto', opacity: 1 }} 
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <p className="pb-4 text-gray-600">{faq.a}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </section>
    );
}
