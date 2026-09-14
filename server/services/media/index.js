import { CLOUD_MEDIA_ENABLED } from '../../config/features.js'
import { uploadCloudinary, destroyCloudinary } from './cloudinary.js'
import { uploadLocal, destroyLocal } from './local.js'

export const mediaProviderName = CLOUD_MEDIA_ENABLED ? 'cloudinary' : 'local'

export function uploadMedia(file, folder) {
  return CLOUD_MEDIA_ENABLED
    ? uploadCloudinary(file, folder)
    : uploadLocal(file, folder)
}

export function destroyMedia(asset) {
  if (!asset) return Promise.resolve()
  return asset.provider === 'cloudinary'
    ? destroyCloudinary(asset)
    : destroyLocal(asset)
}
