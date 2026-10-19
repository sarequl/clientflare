/** Turn a D1 UNIQUE constraint failure into a readable error; rethrow anything else. */
export const uniqueAs = (message: string) => (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  if (/UNIQUE constraint failed/i.test(msg)) throw new Error(message)
  throw e
}
