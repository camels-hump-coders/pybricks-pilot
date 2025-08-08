import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { ThemeProvider } from "./contexts/ThemeContext";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Primary meta tags */}
        <title>
          PyBricks Pilot - Web-based LEGO Robot Programming & Control
        </title>
        <meta
          name="title"
          content="PyBricks Pilot - Web-based LEGO Robot Programming & Control"
        />
        <meta
          name="description"
          content="Control your LEGO Spike Prime robots with PyBricks firmware through your web browser. Real-time telemetry, remote control, competition mat visualization, and more for FLL teams."
        />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content="https://camels-hump-coders.github.io/pybricks-pilot/"
        />
        <meta
          property="og:title"
          content="PyBricks Pilot - Web-based LEGO Robot Programming & Control"
        />
        <meta
          property="og:description"
          content="Control your LEGO Spike Prime robots with PyBricks firmware through your web browser. Real-time telemetry, remote control, competition mat visualization, and more for FLL teams."
        />
        <meta
          property="og:image"
          content="https://camels-hump-coders.github.io/pybricks-pilot/social-share.svg"
        />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          property="twitter:url"
          content="https://camels-hump-coders.github.io/pybricks-pilot/"
        />
        <meta
          property="twitter:title"
          content="PyBricks Pilot - Web-based LEGO Robot Programming & Control"
        />
        <meta
          property="twitter:description"
          content="Control your LEGO Spike Prime robots with PyBricks firmware through your web browser. Real-time telemetry, remote control, competition mat visualization, and more for FLL teams."
        />
        <meta
          property="twitter:image"
          content="https://camels-hump-coders.github.io/pybricks-pilot/social-share.svg"
        />

        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 10, // 10 minutes
            retry: (failureCount, error) => {
              if (error instanceof Error && error.name === "BluetoothError") {
                return false;
              }
              return failureCount < 3;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
