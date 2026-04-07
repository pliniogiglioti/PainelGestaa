import { supabase } from './supabase'

export const COMPANY_CARD_BACKGROUND_BUCKET = 'empresa-card-backgrounds'
export const COMPANY_CARD_BACKGROUND_ACCEPT = 'image/png,image/jpeg,image/webp'
export const COMPANY_CARD_BACKGROUND_MAX_SIZE = 5 * 1024 * 1024
const WEBP_QUALITY = 0.82

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const sanitizeFileName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

function getStoragePathFromPublicUrl(publicUrl: string) {
  try {
    const url = new URL(publicUrl)
    const marker = `/storage/v1/object/public/${COMPANY_CARD_BACKGROUND_BUCKET}/`
    const index = url.pathname.indexOf(marker)

    if (index === -1) return null

    const encodedPath = url.pathname.slice(index + marker.length)
    return decodeURIComponent(encodedPath)
  } catch {
    return null
  }
}

export function validateCompanyCardBackground(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Envie uma imagem JPG, PNG ou WEBP.')
  }

  if (file.size > COMPANY_CARD_BACKGROUND_MAX_SIZE) {
    throw new Error('A imagem deve ter no maximo 5MB.')
  }
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'))
    reader.readAsDataURL(file)
  })
}

async function loadImageElement(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Nao foi possivel processar a imagem selecionada.'))
    image.src = src
  })
}

async function convertImageToWebp(file: File) {
  if (file.type === 'image/webp') {
    return file
  }

  const dataUrl = await fileToDataUrl(file)
  const image = await loadImageElement(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Nao foi possivel preparar a conversao da imagem.')
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => {
      if (!result) {
        reject(new Error('Nao foi possivel converter a imagem para WEBP.'))
        return
      }
      resolve(result)
    }, 'image/webp', WEBP_QUALITY)
  })

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagem'
  return new File([blob], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  })
}

export async function uploadCompanyCardBackground(file: File) {
  validateCompanyCardBackground(file)
  const convertedFile = await convertImageToWebp(file)

  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user

  if (!user) {
    throw new Error('Sessao expirada. Faca login novamente.')
  }

  const extension = 'webp'
  const baseName = convertedFile.name.replace(/\.[^.]+$/, '')
  const safeName = sanitizeFileName(baseName) || 'imagem'
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${extension}`

  const { error } = await supabase.storage
    .from(COMPANY_CARD_BACKGROUND_BUCKET)
    .upload(path, convertedFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/webp',
    })

  if (error) {
    throw new Error(error.message ?? 'Nao foi possivel enviar a imagem de fundo.')
  }

  const { data } = supabase.storage
    .from(COMPANY_CARD_BACKGROUND_BUCKET)
    .getPublicUrl(path)

  return data.publicUrl
}

export async function deleteCompanyCardBackground(publicUrl: string | null | undefined) {
  if (!publicUrl) return

  const path = getStoragePathFromPublicUrl(publicUrl)
  if (!path) return

  const { error } = await supabase.storage
    .from(COMPANY_CARD_BACKGROUND_BUCKET)
    .remove([path])

  if (error) {
    throw new Error(error.message ?? 'Nao foi possivel excluir a imagem antiga do card.')
  }
}
