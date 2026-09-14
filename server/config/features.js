export const CLASSIFIEDS_ENABLED = process.env.CLASSIFIEDS_ENABLED !== 'false'
export const POSTGRES_ENABLED = Boolean(process.env.DATABASE_URL)
export const CLOUD_MEDIA_ENABLED = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)
