interface ImageViewerProps {
  src: string
  alt: string
}

export default function ImageViewer({ src, alt }: ImageViewerProps): React.JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
    </div>
  )
}
