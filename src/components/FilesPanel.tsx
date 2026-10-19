import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { deleteFile, listFiles, setFileShared } from '#/features/files/server'
import { errorMessage, formatDayAt } from '#/lib/format'
import { IconButton, Button, Spinner, useSlowLoading } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { ConfirmDialog } from './Modal'
import { IconDownload, IconTrash, IconUpload, IconX } from './icons'
import { IconFile, IconLock, IconUnlock } from './icons2'
import { useApp } from './useApp'

export type FileRecordType = 'contact' | 'company' | 'deal' | 'invoice'
type FileRow = Awaited<ReturnType<typeof listFiles>>[number]
type Upload = { key: string; name: string; size: number; loaded: number; error?: string; xhr?: XMLHttpRequest }

const MAX_BYTES = 25 * 1024 * 1024

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

/** XHR because fetch has no upload progress. Resolves with the server's response text. */
function uploadFile(file: File, recordType: FileRecordType, recordId: string, onProgress: (loaded: number) => void, onXhr: (x: XMLHttpRequest) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onXhr(xhr)
    const form = new FormData()
    form.append('file', file)
    form.append('recordType', recordType)
    form.append('recordId', recordId)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(xhr.status === 413 ? 'File is over 25 MB.' : xhr.responseText || `Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))
    xhr.open('POST', '/api/files/upload')
    xhr.withCredentials = true
    xhr.send(form)
  })
}

/** Files attached to one record: list, drag-and-drop upload with progress, share to portal, delete. */
export function FilesPanel({ recordType, recordId }: { recordType: FileRecordType; recordId: string }) {
  const app = useApp()
  const [files, setFiles] = useState<FileRow[] | null>(null)
  const slow = useSlowLoading(files === null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<FileRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const depth = useRef(0)

  const load = useCallback(async () => {
    setFiles(await listFiles({ data: { recordType, recordId } }))
  }, [recordType, recordId])

  useEffect(() => {
    setFiles(null)
    load().catch((err) => setError(errorMessage(err, 'Could not load files.')))
  }, [load])

  const patch = (key: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...p } : u)))

  async function addFiles(list: FileList | File[]) {
    setError(null)
    const picked = Array.from(list)
    if (!picked.length) return
    const queued: { u: Upload; file: File }[] = picked.map((file) => ({
      file,
      u: { key: `${Date.now()}-${Math.random()}`, name: file.name, size: file.size, loaded: 0, error: file.size > MAX_BYTES ? 'File is over 25 MB.' : undefined },
    }))
    setUploads((u) => [...u, ...queued.map((q) => q.u)])
    await Promise.all(
      queued
        .filter((q) => !q.u.error)
        .map(async ({ u, file }) => {
          try {
            await uploadFile(file, recordType, recordId, (loaded) => patch(u.key, { loaded }), (xhr) => patch(u.key, { xhr }))
            setUploads((list) => list.filter((x) => x.key !== u.key))
          } catch (err) {
            patch(u.key, { error: errorMessage(err, 'Upload failed.'), xhr: undefined })
          }
        }),
    )
    await load().catch(() => {})
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
  }

  async function toggleShare(f: FileRow) {
    setError(null)
    setSharing(f.id)
    const next = !f.sharedToPortal
    setFiles((list) => list?.map((x) => (x.id === f.id ? { ...x, sharedToPortal: next } : x)) ?? list)
    try {
      await setFileShared({ data: { id: f.id, shared: next } })
    } catch (err) {
      setFiles((list) => list?.map((x) => (x.id === f.id ? { ...x, sharedToPortal: !next } : x)) ?? list)
      setError(errorMessage(err, 'Could not change sharing.'))
    } finally {
      setSharing(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteFile({ data: { id: deleting.id } })
      setFiles((list) => list?.filter((x) => x.id !== deleting.id) ?? list)
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }


  return (
    <Card>
      <CardHeader
        title="Files"
        description={files?.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : undefined}
        actions={
          <Button size="sm" icon={<IconUpload />} onClick={() => input.current?.click()}>
            Upload
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose files to upload"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          depth.current++
          setOver(true)
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setOver(false)
        }}
        onDrop={onDrop}
        className="p-3"
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-[13px] transition-colors ${
            over ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg'
          }`}
        >
          <IconUpload size={18} />
          <span>
            <span className="font-medium">Drop files here</span> or click to choose
          </span>
          <span className="text-[12px] text-fg-subtle">Up to 25 MB each</span>
        </button>
      </div>

      {error && (
        <div className="px-3 pb-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border px-4 py-3" aria-label="Uploads">
          {uploads.map((u) => {
            const pct = u.size ? Math.min(100, Math.round((u.loaded / u.size) * 100)) : 100
            return (
              <li key={u.key} className="flex items-center gap-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{u.name}</span>
                    <span className={`shrink-0 tnum ${u.error ? 'text-danger' : 'text-fg-muted'}`}>{u.error ?? `${pct}%`}</span>
                  </div>
                  {!u.error && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={`Uploading ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <IconButton
                  aria-label={u.error ? `Dismiss ${u.name}` : `Cancel upload of ${u.name}`}
                  icon={<IconX size={14} />}
                  onClick={() => {
                    if (u.xhr) u.xhr.abort()
                    setUploads((list) => list.filter((x) => x.key !== u.key))
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}

      {files === null ? (
        <p className="flex h-[53px] items-center gap-2 border-t border-border px-4 text-[13px] text-fg-muted" aria-busy>
          {slow && (
            <>
              <Spinner /> Loading
            </>
          )}
        </p>
      ) : files.length === 0 ? (
        uploads.length === 0 && <p className="border-t border-border px-4 py-4 text-[13px] text-fg-subtle">No files yet.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-start gap-2 py-2 pr-2 pl-4">
              <IconFile className="mt-1.5 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1 pt-0.5">
                {/* The name opens the file; download and delete sit on the right. */}
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 text-sm font-medium hover:underline" title={f.name}>
                  <FileName name={f.name} />
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
                  <span className="tnum" title={`Uploaded by ${f.uploadedBy?.name ?? 'someone'}`}>
                    {formatBytes(f.size)} · {formatDayAt(f.createdAt, app.workspace.timezone)}
                  </span>
                  <button
                    type="button"
                    aria-pressed={f.sharedToPortal}
                    disabled={sharing === f.id}
                    onClick={() => toggleShare(f)}
                    title={f.sharedToPortal ? 'Shared to portal. Click to make private.' : 'Private. Click to share to the client portal.'}
                    className={`inline-flex h-5 items-center gap-1 rounded px-1.5 text-[12px] font-medium transition-colors disabled:opacity-60 ${
                      f.sharedToPortal ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-2 text-fg-muted hover:text-fg'
                    }`}
                  >
                    {f.sharedToPortal ? <IconUnlock size={12} /> : <IconLock size={12} />}
                    {f.sharedToPortal ? 'Shared' : 'Private'}
                  </button>
                </div>
              </div>
              <a
                href={`/api/files/${f.id}?download=1`}
                download={f.name}
                aria-label={`Download ${f.name}`}
                title="Download"
                className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <IconDownload size={15} />
              </a>
              <IconButton
                aria-label={`Delete ${f.name}`}
                icon={<IconTrash />}
                onClick={() => {
                  setDeleteError(null)
                  setDeleting(f)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete ${deleting?.name ?? 'file'}?`}
        body={deleting?.sharedToPortal ? 'It is also removed from the client portal. This cannot be undone.' : 'This cannot be undone.'}
      />
    </Card>
  )
}

/** Truncates the middle of a file name so the extension stays visible: "scope-of-wo….pdf". */
function FileName({ name }: { name: string }) {
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && name.length - dot <= 8
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  return (
    <>
      <span className="min-w-0 truncate">{base}</span>
      {ext && <span className="shrink-0">{ext}</span>}
    </>
  )
}
