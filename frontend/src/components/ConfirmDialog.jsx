import { useEffect, useRef } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

const VARIANTS = {
  danger: { icon: AlertCircle, iconColor: 'text-sc-danger', confirmClass: 'btn-danger' },
  warning: { icon: AlertTriangle, iconColor: 'text-sc-warn', confirmClass: 'btn-primary' },
  info: { icon: Info, iconColor: 'text-sc-accent2', confirmClass: 'btn-primary' },
}

export default function ConfirmDialog({ open, onConfirm, onCancel, title, message, confirmLabel = 'Confirm', variant = 'danger' }) {
  const dialogRef = useRef(null)
  const cfg = VARIANTS[variant] || VARIANTS.danger
  const Icon = cfg.icon

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onCancel()
    }
  }

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={onCancel}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="bg-transparent p-0 m-auto backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="panel p-6 w-[400px] max-w-[90vw] animate-fade-in-up">
        <div className="flex items-start gap-3 mb-4">
          <Icon className={`w-5 h-5 ${cfg.iconColor} shrink-0 mt-0.5`} aria-hidden="true" />
          <div>
            <h3 id="confirm-dialog-title" className="font-display font-semibold text-white text-base">{title}</h3>
            <p id="confirm-dialog-message" className="text-sm text-gray-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost" autoFocus>Cancel</button>
          <button onClick={onConfirm} className={cfg.confirmClass}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
