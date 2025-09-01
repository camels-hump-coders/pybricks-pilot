import type { Config } from "@react-router/dev/config";

const basename = process.env.BASE_PATH ?? "/";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  basename,
} satisfies Config;
