/** The bound on a file a page hands the tower (`upload`): checked by the page before it reads the file, and by the tower. */

/** In decimal megabytes, as Finder counts a file's size. */
export const UPLOAD_LIMIT = 20_000_000

/** Megabytes, as Finder shows them: one decimal under ten. */
export const megabytes = (bytes: number): string => {
  const mb = bytes / 1_000_000
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`
}

/** Why a file of `size` bytes can't be uploaded, or `undefined` when it can. */
export const uploadRefusal = (name: string, size: number): string | undefined =>
  size > UPLOAD_LIMIT ? `${name} is ${megabytes(size)}: the tower takes files up to ${megabytes(UPLOAD_LIMIT)}` : undefined

/** A file's bytes, base64, as `upload` takes them. */
export const base64Of = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).slice((reader.result as string).indexOf(',') + 1))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
