import { defineConfig } from "astro/config";

const repositoryFromActions = process.env.GITHUB_REPOSITORY?.split("/");
const owner = process.env.PUBLIC_REPO_OWNER ?? repositoryFromActions?.[0];
const repository = process.env.PUBLIC_REPO_NAME ?? repositoryFromActions?.[1];
const isOwnerSite = owner && repository === `${owner}.github.io`;

export default defineConfig({
  output: "static",
  site: owner ? `https://${owner}.github.io` : undefined,
  base: process.env.GITHUB_ACTIONS === "true" && repository && !isOwnerSite
    ? `/${repository}`
    : "/",
  vite: {
    define: {
      __REPO_APPS_VERSION__: JSON.stringify(
        process.env.PUBLIC_APP_VERSION ?? "development",
      ),
    },
  },
});
