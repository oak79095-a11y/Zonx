import { v2 as cloudinary } from 'cloudinary'

let configured = false

function getClient() {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    })
    configured = true
  }
  return cloudinary
}

export async function uploadCloudinary(file, folder) {
  const client = getClient()
  const resourceType = file.mimetype?.startsWith('video/') ? 'video' : 'image'

  const result = await new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: `zonx/${folder}`,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: true,
      },
      (error, value) => error ? reject(error) : resolve(value)
    )
    stream.end(file.buffer)
  })

  return {
    provider: 'cloudinary',
    url: result.secure_url,
    publicId: result.public_id,
    resourceType,
  }
}

export async function destroyCloudinary(asset) {
  if (!asset?.publicId) return
  await getClient().uploader.destroy(asset.publicId, {
    resource_type: asset.resourceType || 'image',
    invalidate: true,
  })
}
