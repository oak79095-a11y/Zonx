import { deleteFile, saveFile } from '../storage.js'

export async function uploadLocal(file, folder) {
  return {
    provider: 'local',
    url: saveFile(file, folder),
    publicId: null,
    resourceType: file.mimetype?.startsWith('video/') ? 'video' : 'image',
  }
}

export async function destroyLocal(asset) {
  if (asset?.url) deleteFile(asset.url)
}
