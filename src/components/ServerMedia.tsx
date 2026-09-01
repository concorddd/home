export function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function ServerMedia({
  url,
  alt,
  className,
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={url}
        aria-label={alt}
        autoPlay
        muted
        loop
        playsInline
        className={className}
      />
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
