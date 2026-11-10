import { Link, NavLink, Outlet } from 'react-router'
import { getAppConfig } from '../config.ts'

// The frame around every page: a header with a link home and the main links, then the
// current page in <main>, then a footer naming the environment.
// <Outlet /> is where React Router puts the page that matches the URL.
export function Layout() {
  // The environment name comes from the runtime configuration (/config.js, src/config.ts), set when the
  // container starts (brief §3.4). main.tsx only shows the app once the configuration is valid.
  const { environment } = getAppConfig()

  return (
    <>
      <header className="site-header">
        <Link to="/" className="site-title">
          Dexter
        </Link>
        {/* NavLink is a Link that adds aria-current="page" when its page is the one showing */}
        <nav aria-label="Main" className="site-nav">
          <NavLink to="/teams">Teams</NavLink>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      {/* <footer> at the top level is the page's "contentinfo" landmark for screen readers */}
      <footer className="site-footer">
        <p>Environment: {environment}</p>
      </footer>
    </>
  )
}
