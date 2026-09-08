const AD_VIDEO_URL = '/__l5e/assets-v1/5327c31e-d5a9-4d61-a649-7c524bbe9613/titanai-ad-15s.mp4';
const AD_POSTER_URL = '/__l5e/assets-v1/9f2b2a19-e69b-44cb-a312-8ab7a851a4e6/titanai-ad-poster.jpg';

export function PromoReel({ className }: { className?: string }) {
  return (
    <div className={className}>
      <video
        className="w-full aspect-video rounded-2xl border border-border shadow-lg bg-muted"
        controls
        playsInline
        preload="metadata"
        poster={AD_POSTER_URL}
        aria-label="Titan AI Trader 15 second overview video"
      >
        <source src={AD_VIDEO_URL} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
