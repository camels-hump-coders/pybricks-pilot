import { NavLink } from "react-router";

export function Navigation() {
  return (
    <nav className="bg-gray-800 text-white">
      <div className="container mx-auto flex gap-4 p-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `hover:underline ${isActive ? "font-semibold" : ""}`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/filesystem"
          className={({ isActive }) =>
            `hover:underline ${isActive ? "font-semibold" : ""}`
          }
        >
          Filesystem
        </NavLink>
      </div>
    </nav>
  );
}
