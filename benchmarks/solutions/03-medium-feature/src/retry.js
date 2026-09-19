export function retry(fn, options = {}) {
  const attempts = options.attempts ?? 3
  const delayMs = options.delayMs ?? 0
  if (attempts < 1) {
    return Promise.reject(new Error("attempts must be >= 1"))
  }
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      Promise.resolve()
        .then(fn)
        .then(resolve)
        .catch((err) => {
          if (n >= attempts) {
            reject(err)
            return
          }
          setTimeout(() => attempt(n + 1), delayMs)
        })
    }
    attempt(1)
  })
}
