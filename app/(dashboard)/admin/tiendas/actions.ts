'use server'

import { parseCoordinatesOrUrl } from '@/lib/geolocation'

export interface GeocodingResult {
  id: string
  displayName: string
  latitude: number
  longitude: number
  source: 'coordinates' | 'url' | 'search'
}

/**
 * Resuelve una búsqueda de dirección, URL de Google Maps o coordenadas directas.
 * Se ejecuta del lado del servidor para evitar bloqueos de CORS y resolver enlaces cortos (goo.gl / maps.app.goo.gl).
 */
export async function searchAddressOrCoordinates(
  input: string
): Promise<{ success: boolean; results?: GeocodingResult[]; error?: string }> {
  if (!input || !input.trim()) {
    return { success: false, error: 'Ingresa una dirección o enlace para buscar.' }
  }

  const query = input.trim()

  // 1. Verificar si el texto ya contiene coordenadas directas o enlace estándar de Google Maps
  const parsedDirect = parseCoordinatesOrUrl(query)
  if (parsedDirect) {
    return {
      success: true,
      results: [
        {
          id: 'direct-coords',
          displayName: `Coordenadas detectadas: ${parsedDirect.latitude.toFixed(6)}, ${parsedDirect.longitude.toFixed(6)}`,
          latitude: parsedDirect.latitude,
          longitude: parsedDirect.longitude,
          source: query.startsWith('http') ? 'url' : 'coordinates',
        },
      ],
    }
  }

  // 2. Si es un enlace acortado de Google Maps (maps.app.goo.gl o goo.gl), resolver redirección en el servidor
  if (query.includes('maps.app.goo.gl') || query.includes('goo.gl/maps')) {
    try {
      const response = await fetch(query, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })

      const finalUrl = response.url
      const parsedFromRedirect = parseCoordinatesOrUrl(finalUrl)

      if (parsedFromRedirect) {
        return {
          success: true,
          results: [
            {
              id: 'short-url-coords',
              displayName: `Ubicación desde Google Maps (${parsedFromRedirect.latitude.toFixed(6)}, ${parsedFromRedirect.longitude.toFixed(6)})`,
              latitude: parsedFromRedirect.latitude,
              longitude: parsedFromRedirect.longitude,
              source: 'url',
            },
          ],
        }
      }
    } catch {
      // Continuar al buscador si la redirección falla
    }
  }

  // 3. Búsqueda por nombre de calle, colonia, ciudad o establecimiento vía Nominatim (OpenStreetMap)
  try {
    const encoded = encodeURIComponent(query)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=5&addressdetails=1`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Campiran-POS-App/1.0 (admin@campiran.com)',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return { success: false, error: 'No se pudo conectar al servicio de mapas. Intenta de nuevo.' }
    }

    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: 'No se encontraron resultados para esta dirección. Prueba agregando ciudad o estado.',
      }
    }

    const results: GeocodingResult[] = data.map((item: any, index: number) => ({
      id: item.place_id ? String(item.place_id) : `res-${index}`,
      displayName: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      source: 'search',
    }))

    return { success: true, results }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al buscar dirección'
    return { success: false, error: msg }
  }
}
