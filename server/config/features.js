export const CLASSIFIEDS_ENABLED = process.env.CLASSIFIEDS_ENABLED !== 'false'
export const POSTGRES_ENABLED = Boolean(process.env.DATABASE_URL)
export const CLOUD_MEDIA_ENABLED = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)
export const IMAGEKIT_MEDIA_ENABLED = Boolean(
  process.env.IMAGEKIT_PUBLIC_KEY &&
  process.env.IMAGEKIT_PRIVATE_KEY &&
  process.env.IMAGEKIT_URL_ENDPOINT
)
