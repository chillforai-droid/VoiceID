import { useEffect } from 'react';

export const useSEO = ({ title, description, canonical, ogImage }: { title: string; description: string; canonical: string; ogImage?: string }) => {
    useEffect(() => {
        const prevTitle = document.title;
        document.title = title;
        
        // Description
        let descriptionMeta = document.querySelector('meta[name="description"]');
        if (!descriptionMeta) {
            descriptionMeta = document.createElement('meta');
            descriptionMeta.setAttribute('name', 'description');
            document.head.appendChild(descriptionMeta);
        }
        descriptionMeta.setAttribute('content', description);
        
        // Canonical
        let canonicalLink = document.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
            canonicalLink = document.createElement('link');
            canonicalLink.setAttribute('rel', 'canonical');
            document.head.appendChild(canonicalLink);
        }
        canonicalLink.setAttribute('href', canonical);
        
        // OG
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute('content', title);
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute('content', description);
        
        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.setAttribute('content', canonical);

        // Twitter
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute('content', title);

        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.setAttribute('content', description);

        if (ogImage) {
            let ogImg = document.querySelector('meta[property="og:image"]');
            if (!ogImg) {
                ogImg = document.createElement('meta');
                ogImg.setAttribute('property', 'og:image');
                document.head.appendChild(ogImg);
            }
            ogImg.setAttribute('content', ogImage);
            
            let twitterImg = document.querySelector('meta[name="twitter:image"]');
            if (!twitterImg) {
                twitterImg = document.createElement('meta');
                twitterImg.setAttribute('name', 'twitter:image');
                document.head.appendChild(twitterImg);
            }
            twitterImg.setAttribute('content', ogImage);
        }
        
        return () => {
            document.title = prevTitle;
        };
    }, [title, description, canonical, ogImage]);
};
