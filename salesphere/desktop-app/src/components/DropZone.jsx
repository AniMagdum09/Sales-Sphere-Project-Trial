import { useRef, useState } from 'react'
import { IconFileText, IconUploadCloud } from './icons'

// Hero drag-and-drop file picker for the Import page.
export default function DropZone({ file, onFile, accept = '.csv,.xlsx', disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const pick = (list) => {
    const f = list && list.length > 0 ? list[0] : null
    if (f) onFile(f)
  }

  const formatSize = (bytes) => {
    if (bytes == null) return ''
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
  }

  return (
    <>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}${
          disabled ? ' disabled' : ''
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload data file"
        onClick={() => !disabled && inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current && inputRef.current.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) pick(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="dropzone-icon">
          <IconUploadCloud size={30} />
        </span>
        {file ? (
          <div className="dropzone-file">
            <IconFileText size={18} />
            <div className="dropzone-file-text">
              <strong title={file.name}>{file.name}</strong>
              <span>{formatSize(file.size)} — click or drop another file to replace</span>
            </div>
          </div>
        ) : (
          <div className="dropzone-text">
            <strong>Drag and drop your data file here</strong>
            <span>
              or <em>browse files</em> — accepts .csv and .xlsx
            </span>
          </div>
        )}
      </div>
    </>
  )
}
