export interface AuthorizedGitHubCredentialSource {
  get(): Promise<{ readonly token: string } | null>;
}

export type AuthorizedGitHubRoute =
  | "GET /user"
  | "GET /user/repos"
  | "GET /user/orgs"
  | "GET /repos/{owner}/{repo}"
  | "GET /repos/{owner}/{repo}/pulls"
  | "GET /repos/{owner}/{repo}/actions/runs"
  | "GET /search/issues"
  | "PUT /repos/{owner}/{repo}/topics"
  | "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge";

export interface AuthorizedGitHubResponse<T = unknown> {
  readonly data: T;
}

export interface AuthorizedGitHubClient {
  request<T = unknown>(
    route: AuthorizedGitHubRoute,
    parameters?: Readonly<Record<string, string | number | boolean | readonly string[]>>,
  ): Promise<AuthorizedGitHubResponse<T>>;
}

export class AuthorizedGitHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = status === 401 ? "AuthenticationError" : status === 403 ? "PermissionError" : "GitHubApiError";
    this.status = status;
  }
}

const API_VERSION = "2022-11-28";
const BODY_ROUTES = new Set<AuthorizedGitHubRoute>([
  "PUT /repos/{owner}/{repo}/topics",
  "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
]);

/** GitHub API access bounded by the connected PAT's grants, for explicit dashboard-style apps. */
export function createAuthorizedGitHubClient(options: {
  readonly credentials: AuthorizedGitHubCredentialSource;
  readonly fetch?: typeof fetch;
  readonly apiBaseUrl?: string;
}): AuthorizedGitHubClient {
  const fetcher = options.fetch ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");

  return {
    async request<T>(route: AuthorizedGitHubRoute, parameters = {}): Promise<AuthorizedGitHubResponse<T>> {
      const credential = await options.credentials.get();
      if (!credential?.token) throw new AuthorizedGitHubError(401, "Connect a GitHub credential first.");

      const [method, template] = route.split(" ") as [string, string];
      const values = { ...parameters } as Record<string, string | number | boolean | readonly string[]>;
      const path = template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
        const value = values[key];
        if (value === undefined) throw new Error(`Missing GitHub route parameter: ${key}`);
        delete values[key];
        return encodeURIComponent(String(value));
      });
      const url = new URL(`${apiBaseUrl}${path}`);
      const bodyValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) {
        if (BODY_ROUTES.has(route)) bodyValues[key] = value;
        else if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
        else url.searchParams.set(key, String(value));
      }

      const response = await fetcher(url, {
        method,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${credential.token}`,
          "X-GitHub-Api-Version": API_VERSION,
          ...(BODY_ROUTES.has(route) ? { "Content-Type": "application/json" } : {}),
        },
        ...(BODY_ROUTES.has(route) ? { body: JSON.stringify(bodyValues) } : {}),
      });

      if (!response.ok) {
        throw new AuthorizedGitHubError(response.status, `GitHub request failed with status ${response.status}.`);
      }
      return { data: await response.json() as T };
    },
  };
}
