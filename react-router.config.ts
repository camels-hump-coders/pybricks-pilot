import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  // NOTE: we now use a custom domain of pybrickspilot.org, so no need for a basename
  // basename: process.env.GITHUB_PAGES === "true" ? "/pybricks-pilot" : "/",
  basename: "/",
} satisfies Config;
