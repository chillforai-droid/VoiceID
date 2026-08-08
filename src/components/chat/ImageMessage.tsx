import { memo, useState, useEffect, useRef } from 'react';
import { downloadMedia, fetchAndCacheMedia } from '../../lib/mediaDownload';
import { Download, Loader2 } from 'lucide-react';

function ImageMessageImpl({ message }: { message: any }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [downloading, setDownloading] = useState(false);
    // Tracks the object URL currently in use so it can be revoked, both
    // when a newer one replaces it and on unmount. Previously these were
    // never revoked, leaking a Blob URL per rendered image message.
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);

        fetchAndCacheMedia(message, 'image')
            .then((blob) => {
                if (cancelled) return;
                const objectUrl = URL.createObjectURL(blob);
                urlRef.current = objectUrl;
                setUrl(objectUrl);
            })
            .catch((err) => {
                console.error('ImageMessage: failed to load image', err);
                if (!cancelled) setFailed(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
                urlRef.current = null;
            }
        };
    }, [message.id]);

    if (loading) return <div className="p-4 text-xs text-gray-400">Loading...</div>;
    if (failed || !url) return <div className="p-4 text-xs text-red-500">Failed to load image.</div>;

    // Responsive sizing: never exceeds the bubble, preserves aspect ratio,
    // never stretches small images beyond their natural size, no cropping.
    const handleDownload = async () => {
        try {
            setDownloading(true);
            await downloadMedia(message, 'image');
        } catch (error) {
            console.error('ImageMessage: download failed', error);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="relative inline-block max-w-full">
            <img
                src={url}
                alt="message"
                loading="lazy"
                decoding="async"
                className="block rounded max-w-full sm:max-w-[280px] max-h-[320px] w-auto h-auto object-contain"
            />
            <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                aria-label="Download image"
                className="absolute right-2 bottom-2 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center backdrop-blur hover:bg-black/80 disabled:opacity-60"
            >
                {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            </button>
        </div>
    );
}

// Message list re-renders on every new message, selection change, or edit;
// memoizing keeps already-loaded images (and their in-flight fetches) from
// re-running when an unrelated message in the list changes.
export const ImageMessage = memo(ImageMessageImpl, (prev, next) => prev.message.id === next.message.id);
