export function convert(amount, rate) {
  return amount * rate
}

export function round(value) {
  return Math.round(value * 100) / 100
}
