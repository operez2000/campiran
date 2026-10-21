/**
 * Utility to process and compress images client-side before uploading.
 * Ensures the image doesn't exceed maxDimension (default 720px) on either axis.
 * Preserves transparency for PNGs / WebP.
 */

export interface ProcessedImageResult {
  file: File
  width: number
  height: number
  previewUrl: string
  originalSize: number
  compressedSize: number
  wasResized: boolean
}

export async function processLogoImage(
  file: File,
  maxDimension = 720,
  quality = 0.9
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    // 1. Validate file type
    if (!file.type.startsWith('image/')) {
      return reject(new Error('El archivo seleccionado no es una imagen válida.'))
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'))

    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))

      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        const originalWidth = width
        const originalHeight = height
        const originalSize = file.size

        const needsResize = width > maxDimension || height > maxDimension

        if (needsResize) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        // Draw onto canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          return reject(new Error('No se pudo inicializar el contexto 2D para compresión.'))
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // Determine output MIME type
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/webp'
        const ext = outputMime === 'image/png' ? '.png' : '.webp'
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
        const outputFileName = `${baseName}_720px${ext}`

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Error al generar el archivo comprimido.'))
            }

            const processedFile = new File([blob], outputFileName, {
              type: outputMime,
              lastModified: Date.now(),
            })

            const previewUrl = URL.createObjectURL(blob)

            resolve({
              file: processedFile,
              width,
              height,
              previewUrl,
              originalSize,
              compressedSize: processedFile.size,
              wasResized: needsResize || processedFile.size < originalSize,
            })
          },
          outputMime,
          quality
        )
      }

      img.src = e.target?.result as string
    }

    reader.readAsDataURL(file)
  })
}
