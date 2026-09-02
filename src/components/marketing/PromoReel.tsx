export function PromoReel({ className }: { className?: string }) {
  return (
    <div className={className}>
      <video
        className="w-full rounded-2xl border border-border shadow-lg"
        controls
        preload="metadata"
        poster="/videos/titanai-promo-poster.jpg"
        aria-label="Titan AI promotional video"
      >
        <source src="/videos/titanai-promo.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
