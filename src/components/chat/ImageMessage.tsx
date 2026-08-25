import { memo, useState, useEffect, useRef } from 'react';
import { downloadMedia, fetchAndCacheMedia } from '../../lib/mediaDownload';
import { Download, Loader2 } from 'lucide-react';

function ImageMessageImpl({ message }: { message: any }) {
    // While a just-picked image is still uploading, ChatPage attaches the
    // object URL it already has in memory (the file the user selected) as
    // message._previewUrl. We can render that immediately — no need to wait
    // for the upload to finish and a network fetch to round-trip back.
    // ChatPage owns that URL's lifecycle (it revokes it once the real
    // message is confirmed), so we never touch urlRef for it.
    const localPreviewUrl: string | undefined = message._previewUrl;

    const [url, setUrl] = useState<string | null>(localPreviewUrl ?? null);
    const [loading, setLoading] = useState(!localPreviewUrl);
    const [failed, setFailed] = useState(false);
    const [downloading, setDownloading] = useState(false);
    // Tracks the object URL currently in use so it can be revoked, both
    // when a newer one replaces it and on unmount. Previously these were
    // never revoked, leaking a Blob URL per rendered image message.
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        if (localPreviewUrl) {
            setUrl(localPreviewUrl);
            setLoading(false);
            setFailed(false);
            return;
        }

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
    }, [message.id, localPreviewUrl]);

    if (message.local_failed) {
        return <div className="p-4 text-xs text-red-500 flex items-center gap-1.5">Image failed to send.</div>;
    }
    if (loading) return <div className="p-4 text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Loading...</div>;
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
            {message.local_pending ? (
                <div className="absolute inset-0 rounded bg-black/25 flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur">
                        <Loader2 size={17} className="animate-spin" />
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    aria-label="Download image"
                    className="absolute right-2 bottom-2 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center backdrop-blur hover:bg-black/80 disabled:opacity-60"
                >
                    {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                </button>
            )}
        </div>
    );
}

// Message list re-renders on every new message, selection change, or edit;
// memoizing keeps already-loaded images (and their in-flight fetches) from
// re-running when an unrelated message in the list changes.
// Same message id can still transition through states (optimistic preview
// -> uploaded -> failed), so the comparator has to look at those fields too,
// not just id, or the bubble would get stuck showing the stale state.
export const ImageMessage = memo(ImageMessageImpl, (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.local_pending === next.message.local_pending &&
    prev.message.local_failed === next.message.local_failed &&
    prev.message._previewUrl === next.message._previewUrl &&
    prev.message.b2_object_key === next.message.b2_object_key
);
