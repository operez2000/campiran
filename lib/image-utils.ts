/**
 * Image processing utilities for client-side resizing and optimization.
 */

export interface ProcessedImage {
  blob: Blob
  dataUrl: string
  width: number
  height: number
  originalSize: number
  optimizedSize: number
  fileName: string
}

/**
 * Resizes an image file proportionally so that neither width nor height exceeds maxDimension (720px by default).
 * Compresses the result as WebP (or JPEG fallback) with high visual fidelity.
 */
export async function resizeAndCompressImage(
  file: File | Blob,
  maxDimension = 720,
  quality = 0.85,
  originalName = 'image.webp'
): Promise<ProcessedImage> {
  const originalSize = file.size

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'))
    reader.onload = (e) => {
      const img = new Image()

      img.onerror = () => reject(new Error('Error al cargar la imagen en memoria'))
      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        // Calculate proportional scale if dimensions exceed maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo obtener el contexto 2D del canvas'))
          return
        }

        // Apply high-quality image smoothing
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // Try WebP first, fallback to JPEG if unsupported
        const mimeType = 'image/webp'

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              // Fallback to jpeg
              canvas.toBlob(
                (jpegBlob) => {
                  if (!jpegBlob) {
                    reject(new Error('No se pudo comprimir la imagen'))
                    return
                  }
                  const dataUrl = canvas.toDataURL('image/jpeg', quality)
                  resolve({
                    blob: jpegBlob,
                    dataUrl,
                    width,
                    height,
                    originalSize,
                    optimizedSize: jpegBlob.size,
                    fileName: originalName.replace(/\.[^/.]+$/, '') + '.jpg',
                  })
                },
                'image/jpeg',
                quality
              )
              return
            }

            const dataUrl = canvas.toDataURL(mimeType, quality)
            resolve({
              blob,
              dataUrl,
              width,
              height,
              originalSize,
              optimizedSize: blob.size,
              fileName: originalName.replace(/\.[^/.]+$/, '') + '.webp',
            })
          },
          mimeType,
          quality
        )
      }

      img.src = e.target?.result as string
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Format bytes to readable string (e.g. 150 KB, 1.2 MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
