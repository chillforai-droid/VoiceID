import React, { useState, useEffect } from 'react';
import { MediaCache } from '../../lib/MediaCache';
import { supabase } from '../../lib/supabase';

export function ImageMessage({ message }: { message: any }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMedia = async () => {
            const cached = await MediaCache.getMedia(message.id);
            if (cached) {
                setUrl(URL.createObjectURL(cached.blob));
                setLoading(false);
                return;
            }

            // Download
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;
            
            const res = await fetch("/api/media/download-auth", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` 
                },
                body: JSON.stringify({ messageId: message.id }),
            });
            
            if (!res.ok) {
                console.error("ImageMessage: Auth fetch failed", res.status);
                setLoading(false);
                return;
            }
            
            const { url: downloadUrl } = await res.json();
            if (!downloadUrl) {
                console.error("ImageMessage: Invalid download URL", downloadUrl);
                setLoading(false);
                return;
            }
            
            const blobRes = await fetch(downloadUrl);
            if (!blobRes.ok) {
                console.error("ImageMessage: Blob fetch failed", blobRes.status);
                setLoading(false);
                return;
            }
            const blob = await blobRes.blob();
            
            // Verify hash and size
            // ...
            await MediaCache.putMedia({ ...message, blob });
            
            setUrl(URL.createObjectURL(blob));
            setLoading(false);
            
            // ACK
            await fetch("/api/media/ack", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` 
                },
                body: JSON.stringify({ messageId: message.id }),
            });
        };
        loadMedia();
    }, [message]);

    if (loading) return <div className="p-4 text-xs text-gray-400">Loading...</div>;
    if (!url) return <div className="p-4 text-xs text-red-500">Failed to load image.</div>;
    return <img src={url!} alt="message" className="max-w-xs rounded" />;
}
