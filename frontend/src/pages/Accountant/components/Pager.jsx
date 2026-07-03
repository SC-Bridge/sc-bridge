// Shared Prev/Next + "Page X of Y" pager for the Accountant list pages. The
// backend pages every list at PER_PAGE (50) and returns the total, so each page
// derives its own totalPages and drives a `page` search param. Renders nothing
// when everything fits on one page.
export default function Pager({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="px-2 py-1 rounded border border-sc-border text-gray-300 hover:bg-sc-darker disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Prev
      </button>
      <span className="text-gray-400 tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        aria-label="Next page"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="px-2 py-1 rounded border border-sc-border text-gray-300 hover:bg-sc-darker disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  )
}
