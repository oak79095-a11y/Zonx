import { CLOUD_MEDIA_ENABLED, IMAGEKIT_MEDIA_ENABLED } from '../../config/features.js'
import { uploadCloudinary, destroyCloudinary } from './cloudinary.js'
import { uploadLocal, destroyLocal } from './local.js'
import { uploadImageKit, destroyImageKit } from './imagekit.js'

export const mediaProviderName = IMAGEKIT_MEDIA_ENABLED
  ? 'imagekit'
  : CLOUD_MEDIA_ENABLED ? 'cloudinary' : 'local'

export function uploadMedia(file, folder) {
  return IMAGEKIT_MEDIA_ENABLED
    ? uploadImageKit(file, folder)
    : CLOUD_MEDIA_ENABLED
    ? uploadCloudinary(file, folder)
    : uploadLocal(file, folder)
}

export function destroyMedia(asset) {
  if (!asset) return Promise.resolve()
  return asset.provider === 'imagekit'
    ? destroyImageKit(asset)
    : asset.provider === 'cloudinary'
      ? destroyCloudinary(asset)
    : destroyLocal(asset)
}
