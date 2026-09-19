export function createTokenBucket({ capacity, refillPerSecond, now = () => Date.now() }) {
  let tokens = capacity
  let last = now()

  function refill() {
    const t = now()
    const elapsedSeconds = (t - last) / 1000
    last = t
    tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond)
  }

  return {
    available() {
      refill()
      return tokens
    },
    tryTake(n = 1) {
      refill()
      if (tokens >= n) {
        tokens -= n
        return true
      }
      return false
    },
  }
}
