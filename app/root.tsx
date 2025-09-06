import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useState } from "react";
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
import faviconUrl from "./assets/favicon.svg?url";
import socialShareUrl from "./assets/social-share.png?url";
import { ServiceEventSync } from "./components/ServiceEventSync";
import { ThemeProvider } from "./contexts/ThemeContext";
import { registerServiceWorker } from "./registerServiceWorker";

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
  { rel: "icon", href: faviconUrl, type: "image/svg+xml" },
  { rel: "manifest", href: "/manifest.json" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />

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
        <meta property="og:image" content={socialShareUrl} />

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
        <meta property="twitter:image" content={socialShareUrl} />

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
      }),
  );

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <ServiceEventSync>
          <ThemeProvider>
            <Outlet />
          </ThemeProvider>
        </ServiceEventSync>
      </QueryClientProvider>
    </JotaiProvider>
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
