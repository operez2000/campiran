import { type Store } from './types'

export interface Coordinates {
  latitude: number
  longitude: number
  accuracy?: number
}

export interface StoreDistanceMatch {
  store: Store
  distanceMeters: number
  isInsideGeofence: boolean
}

/**
 * Calcula la distancia en metros entre dos coordenadas geográficas utilizando la fórmula de Haversine.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Formatea una distancia en metros a texto legible en español (ej. "85 m", "1.4 km").
 */
export function formatDistance(meters: number): string {
  if (isNaN(meters) || meters < 0) return '0 m'
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Obtiene las coordenadas GPS actuales del dispositivo a través de la API nativa de geolocalización.
 */
export function getDeviceCoordinates(options?: {
  timeoutMs?: number
  enableHighAccuracy?: boolean
}): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('La geolocalización no está soportada en este dispositivo o navegador.'))
      return
    }

    const { timeoutMs = 12000, enableHighAccuracy = true } = options || {}

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        let msg = 'Error al obtener ubicación GPS'
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permiso de ubicación denegado por el usuario.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Ubicación no disponible en este dispositivo.'
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tiempo de espera agotado al consultar GPS.'
        }
        reject(new Error(msg))
      },
      {
        enableHighAccuracy,
        timeout: timeoutMs,
        maximumAge: 15000,
      }
    )
  })
}

/**
 * Evalúa las sucursales con coordenadas registradas y determina si el usuario está físicamente
 * dentro de la geocerca de alguna de ellas o cuál es la más cercana.
 */
export function findNearbyStore(
  userCoords: Coordinates,
  stores: Store[]
): StoreDistanceMatch | null {
  // Solo sucursales activas con latitud y longitud configuradas
  const configuredStores = stores.filter(
    (s) =>
      s.status === 'A' &&
      typeof s.latitude === 'number' &&
      !isNaN(s.latitude) &&
      typeof s.longitude === 'number' &&
      !isNaN(s.longitude)
  )

  if (configuredStores.length === 0) return null

  let nearestMatch: StoreDistanceMatch | null = null

  for (const store of configuredStores) {
    const distanceMeters = calculateHaversineDistance(
      userCoords.latitude,
      userCoords.longitude,
      Number(store.latitude),
      Number(store.longitude)
    )

    const radius = Number(store.geofence_radius) || 150
    const isInsideGeofence = distanceMeters <= radius

    const currentCandidate: StoreDistanceMatch = {
      store,
      distanceMeters,
      isInsideGeofence,
    }

    if (!nearestMatch) {
      nearestMatch = currentCandidate
    } else {
      // Priorizar si está dentro de la geocerca; de lo contrario la más cercana
      if (currentCandidate.isInsideGeofence && !nearestMatch.isInsideGeofence) {
        nearestMatch = currentCandidate
      } else if (
        currentCandidate.isInsideGeofence === nearestMatch.isInsideGeofence &&
        currentCandidate.distanceMeters < nearestMatch.distanceMeters
      ) {
        nearestMatch = currentCandidate
      }
    }
  }

  return nearestMatch
}

/**
 * Extrae latitud y longitud a partir de texto libre, enlaces de Google Maps o coordenadas directas.
 */
export function parseCoordinatesOrUrl(
  input: string
): { latitude: number; longitude: number } | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()

  // 1. Enlace de Google Maps con @lat,lng
  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lng = parseFloat(atMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng }
    }
  }

  // 2. Parámetros de datos internos de Google Maps: !3dlat!4dlng
  const placeDataMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (placeDataMatch) {
    const lat = parseFloat(placeDataMatch[1])
    const lng = parseFloat(placeDataMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng }
    }
  }

  // 3. Parámetro query en URL: ?q=lat,lng o ?query=lat,lng o &daddr=lat,lng o ll=lat,lng
  const queryMatch = trimmed.match(
    /[?&](?:q|query|daddr|ll|sll)=(-?\d+\.\d+)[, ]+(-?\d+\.\d+)/
  )
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1])
    const lng = parseFloat(queryMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng }
    }
  }

  // 4. Coordenadas directas en formato decimal: "19.4326077, -99.133208" o "19.4326077 -99.133208"
  const directMatch = trimmed.match(
    /^([+-]?\d+(?:\.\d+)?)\s*[, \t/|]+\s*([+-]?\d+(?:\.\d+)?)$/
  )
  if (directMatch) {
    const lat = parseFloat(directMatch[1])
    const lng = parseFloat(directMatch[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng }
    }
  }

  // 5. Formato Grados, Minutos, Segundos (DMS): ej. 19°25'57.4"N 99°07'59.5"W
  const dmsMatch = trimmed.match(
    /(\d+)°\s*(\d+)['′]?\s*(\d+(?:\.\d+)?)["]?[″]?\s*([NSEWnsew])\s*[, ]+\s*(\d+)°\s*(\d+)['′]?\s*(\d+(?:\.\d+)?)["]?[″]?\s*([NSEWnsew])/
  )
  if (dmsMatch) {
    let lat =
      parseInt(dmsMatch[1], 10) +
      parseInt(dmsMatch[2], 10) / 60 +
      parseFloat(dmsMatch[3]) / 3600
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat

    let lng =
      parseInt(dmsMatch[5], 10) +
      parseInt(dmsMatch[6], 10) / 60 +
      parseFloat(dmsMatch[7]) / 3600
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng }
    }
  }

  return null
}
