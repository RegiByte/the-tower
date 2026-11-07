/**
 * Loaded before a daemon's script: each line it writes through `console` starts with the time, so its log can be read
 * against the session logs. An exception that ends the process prints past `console`, so its time is said just before;
 * a worker thread inherits this too, and one ending doesn't end the process.
 */
import { format } from 'node:util'
import { isMainThread } from 'node:worker_threads'

for (const method of ['log', 'info', 'warn', 'error'] as const) {
  const write = console[method].bind(console)
  console[method] = (...args: unknown[]) => write(`${new Date().toISOString()} ${format(...args)}`)
}

if (isMainThread) process.on('uncaughtExceptionMonitor', () => console.error('uncaught: the process ends on what follows'))
