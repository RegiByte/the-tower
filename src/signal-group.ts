/**
 * Signals a whole process group, `pgid` being its leader's pid. A group that has nothing left to signal is not an
 * error: gone (ESRCH), or only a leader that has exited and isn't reaped yet, for which macOS answers EPERM before Node
 * sees the exit, while the child's `exitCode` and `signalCode` are still null.
 */
export const signalGroup = (pgid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pgid, signal)
  } catch (err) {
    const { code } = err as NodeJS.ErrnoException
    if (code !== 'ESRCH' && code !== 'EPERM') throw err
  }
}
