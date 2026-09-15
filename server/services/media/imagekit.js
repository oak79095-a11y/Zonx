import ImageKit from 'imagekit'

let client = null

function getClient() {
  if (!client) {
    client = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    })
  }
  return client
}

export async function uploadImageKit(file, folder) {
  const result = await getClient().upload({
    file: file.buffer,
    fileName: file.originalname || 'upload',
    folder: `/zonx/${folder}`,
    useUniqueFileName: true,
    tags: ['zonx', folder],
  })

  return {
    provider: 'imagekit',
    url: result.url,
    publicId: result.fileId,
    resourceType: file.mimetype?.startsWith('video/') ? 'video' : 'image',
  }
}

export async function destroyImageKit(asset) {
  if (asset?.publicId) await getClient().deleteFile(asset.publicId)
}
