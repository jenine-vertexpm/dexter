import { Link, Outlet } from 'react-router'

// The frame around every page: a header with a link home, then the current page in <main>.
// <Outlet /> is where React Router puts the page that matches the URL.
export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="site-title">
          Dexter
        </Link>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </>
  )
}
