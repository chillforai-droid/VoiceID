import { useState, useEffect } from 'react';
import { fetchAndCacheMedia } from '../../lib/mediaDownload';

export function ImageMessage({ message }: { message: any }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);

        fetchAndCacheMedia(message, 'image')
            .then((blob) => {
                if (cancelled) return;
                setUrl(URL.createObjectURL(blob));
            })
            .catch((err) => {
                console.error('ImageMessage: failed to load image', err);
                if (!cancelled) setFailed(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [message.id]);

    if (loading) return <div className="p-4 text-xs text-gray-400">Loading...</div>;
    if (failed || !url) return <div className="p-4 text-xs text-red-500">Failed to load image.</div>;

    // Responsive sizing: never exceeds the bubble, preserves aspect ratio,
    // never stretches small images beyond their natural size, no cropping.
    return (
        <img
            src={url}
            alt="message"
            className="block rounded max-w-full sm:max-w-[280px] max-h-[320px] w-auto h-auto object-contain"
        />
    );
}
