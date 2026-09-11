export function formatPrice(value) {
  return value.toLocaleString('en-US')
}

export function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-SY', { day: 'numeric', month: 'long', year: 'numeric' })
}