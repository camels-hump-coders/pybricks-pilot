import { index, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  { path: "filesystem", file: "routes/filesystem.tsx" },
] satisfies RouteConfig;
