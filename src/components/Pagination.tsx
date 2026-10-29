import { Link, type To } from 'react-router'

interface PaginationProps {
  page: number
  totalPages: number
  // The link target for a page. Following a link adds a browser history entry,
  // so Back returns to the previous page (plan decision D6).
  linkTo: (page: number) => To
}

export function Pagination({ page, totalPages, linkTo }: PaginationProps) {
  return (
    <nav aria-label="Pages" className="pagination">
      {page > 1 ? <Link to={linkTo(page - 1)}>Previous page</Link> : <span aria-hidden="true" />}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? <Link to={linkTo(page + 1)}>Next page</Link> : <span aria-hidden="true" />}
    </nav>
  )
}
