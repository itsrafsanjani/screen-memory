import { useCallback, useState } from 'react'
import { screenshotSrc } from '../lib/screenshot-src'

interface Props {
  src: string
  alt: string
}

export function CrossfadeImage({ src, alt }: Props): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [displaySrc, setDisplaySrc] = useState(src)
  const [nextSrc, setNextSrc] = useState<string | null>(null)

  // When src changes, start loading the new image behind the current one
  if (src !== displaySrc && src !== nextSrc) {
    setNextSrc(src)
    setLoaded(false)
  }

  const handleLoad = useCallback(() => {
    setLoaded(true)
    // After transition, promote next to display
    setDisplaySrc(nextSrc!)
    setNextSrc(null)
  }, [nextSrc])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Current (visible) image */}
      <img
        src={screenshotSrc(displaySrc)}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg shadow-sm border border-border/40 absolute"
        style={{ willChange: 'opacity' }}
        draggable={false}
      />
      {/* Next (loading/fading in) image */}
      {nextSrc ? (
        <img
          src={screenshotSrc(nextSrc)}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded-lg shadow-sm border border-border/40 absolute"
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 150ms ease',
            willChange: 'opacity'
          }}
          draggable={false}
          onLoad={handleLoad}
        />
      ) : null}
    </div>
  )
}
